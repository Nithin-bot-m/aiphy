// OTP delivery — provider abstraction for real SMS/email delivery.
//
// Providers (selected by env.OTP_PROVIDER, resolved in config/env):
//   twilio   — SMS via Twilio REST API (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER)
//   smtp     — email via nodemailer (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM)
//   webhook  — generic HTTP POST to OTP_WEBHOOK_URL with X-Webhook-Secret header.
//              Covers regional gateways (MSG91, SNS-via-Lambda, corporate SMS relays).
//   console  — DEV ONLY: logs to server console + notification_outbox audit row.
//
// SECURITY INVARIANTS:
//   - The OTP code itself is NEVER logged, never persisted, never returned.
//   - notification_outbox stores a MASKED recipient + provider + outcome only.
//   - Production with provider='console' → authService fails closed (501).
//   - Delivery failures throw so the caller can return a provider-unavailable
//     error: the OTP row exists but the user was never told the code.

const env = require('../../config/env');
const { db } = require('../../config/db');

function maskRecipient(recipient) {
  const s = String(recipient || '');
  if (s.includes('@')) {
    const [local, domain] = s.split('@');
    const maskedLocal = local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '***';
    return `${maskedLocal}@${domain}`;
  }
  return s.length <= 4 ? '***' : `***${s.slice(-4)}`;
}

async function recordOutbox({ channel, recipient, provider, status, error, userId }) {
  try {
    await db.prepare(`
      INSERT INTO notification_outbox (channel, recipient_masked, provider, status, error_message, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(channel, maskRecipient(recipient), provider, status, error || null, userId ?? null);
  } catch (err) {
    console.error('[otpDelivery] outbox write failed:', err.message);
  }
}

function renderMessage(otp) {
  return String(env.OTP_MESSAGE_TEMPLATE).replace(/\{\{\s*code\s*\}\}/g, otp);
}

// ---------- Providers ----------
async function sendViaTwilio({ recipient, message }) {
  const auth = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const body = new URLSearchParams({
    From: env.TWILIO_FROM_NUMBER,
    To: recipient,
    Body: message,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,
      { method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body, signal: controller.signal }
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Twilio HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function sendViaSmtp({ recipient, subject, message }) {
  // Lazy require: nodemailer is only needed when the SMTP provider is selected.
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('SMTP provider selected but nodemailer is not installed.');
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  await transporter.sendMail({ from: env.SMTP_FROM, to: recipient, subject, text: message });
}

async function sendViaWebhook({ recipient, channel, message }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(env.OTP_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(env.OTP_WEBHOOK_SECRET ? { 'X-Webhook-Secret': env.OTP_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ recipient, channel, message, template_version: 1 }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Webhook HTTP ${res.status}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Deliver an OTP through the configured provider.
 * @returns {{ provider: string, channel: 'sms'|'email'|'webhook' }}
 */
async function deliverOtp({ user, recipient, otp, channel }) {
  const provider = env.OTP_PROVIDER;
  const message = renderMessage(otp);

  if (provider === 'console') {
    // DEV ONLY. Never reached in production (authService fails closed first).
    console.log(`[otp] dev code for user ${user.id} (${maskRecipient(recipient)}): ${otp}`);
    await recordOutbox({ channel, recipient, provider, status: 'sent', userId: user.id });
    return { provider, channel };
  }

  try {
    if (provider === 'twilio') {
      await sendViaTwilio({ recipient, message });
    } else if (provider === 'smtp') {
      await sendViaSmtp({ recipient, subject: 'Your Psychometric AI verification code', message });
    } else if (provider === 'webhook') {
      await sendViaWebhook({ recipient, channel, message });
    } else {
      throw new Error(`Unknown OTP provider "${provider}".`);
    }
    await recordOutbox({ channel, recipient, provider, status: 'sent', userId: user.id });
    return { provider, channel };
  } catch (err) {
    await recordOutbox({ channel, recipient, provider, status: 'failed', error: err.message, userId: user.id });
    throw err;
  }
}

module.exports = { deliverOtp, maskRecipient, recordOutbox };
