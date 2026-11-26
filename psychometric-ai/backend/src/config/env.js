require('dotenv').config();
const path = require('path');

function required(name, { allowDefault } = {}) {
  const value = process.env[name];
  if (value && value.length > 0) return value;
  // In development/test we tolerate missing secrets by generating an ephemeral one,
  // so a forgotten .env can never silently reuse a committed secret.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  if (allowDefault) return allowDefault;
  return require('crypto').randomBytes(48).toString('hex');
}

const env = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  IS_PROD: process.env.NODE_ENV === 'production',
  IS_TEST: process.env.NODE_ENV === 'test',

  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5000',
  BACKEND_URL: process.env.BACKEND_URL || 'http://localhost:5000',

  DATABASE_URL: process.env.DATABASE_URL || '',
  DB_PATH: process.env.DB_PATH || path.resolve(process.cwd(), 'data/psychometric.db'),
  // Managed-Postgres TLS switch (Render / Railway / Heroku / Neon / Supabase):
  // DB_SSL=true forces a TLS connection; `sslmode=require` inside DATABASE_URL
  // is honoured too (both are handled in config/db.js).
  DB_SSL: ['true', '1', 'yes'].includes((process.env.DB_SSL || '').toLowerCase()),

  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  LLM_PROVIDER: (process.env.LLM_PROVIDER || '').toLowerCase(),
  // gemini-2.0-flash was retired and gemini-3.8-flash does not exist in the
  // Gemini API; normalize both so stale Render env vars never fail with 404.
  LLM_MODEL: (() => {
    const raw = (process.env.LLM_MODEL || '').trim();
    if (!raw || raw === 'gemini-3.8-flash' || raw === 'gemini-2.0-flash') {
      if (raw && process.env.NODE_ENV !== 'test') {
        console.warn(`[env] replacing invalid/retired LLM_MODEL="${raw}" with "gemini-2.5-flash"`);
      }
      return 'gemini-2.5-flash';
    }
    return raw;
  })(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  // Optional relay/proxy base URL (e.g. https://my-relay.example.com).
  // Servers in regions where the Gemini API is geo-restricted can point this
  // at their own reverse proxy; path shape stays /v1beta/models/{model}:generateContent.
  GEMINI_BASE_URL: (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  LLM_TIMEOUT_MS: parseInt(process.env.LLM_TIMEOUT_MS || '30000', 10),
  LLM_MAX_OUTPUT_TOKENS: parseInt(process.env.LLM_MAX_OUTPUT_TOKENS || '4000', 10),

  SEED_DEMO_DATA: process.env.SEED_DEMO_DATA !== 'false',
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),

  // ----- Database selection (spec: PostgreSQL in production; SQLite for local dev/tests) -----
  DB_DRIVER: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
  DB_SCHEMA: process.env.DB_SCHEMA || '',

  // ----- OTP delivery (production REQUIRES a real provider — without one the
  // send-otp endpoint fails closed with 501; dev logs to console + outbox) -----
  OTP_PROVIDER: (process.env.OTP_PROVIDER || 'auto').toLowerCase(),
  OTP_MESSAGE_TEMPLATE: process.env.OTP_MESSAGE_TEMPLATE
    || 'Your Psychometric AI verification code is {{code}}. It expires within 10 minutes.',
  OTP_WEBHOOK_URL: process.env.OTP_WEBHOOK_URL || '',
  OTP_WEBHOOK_SECRET: process.env.OTP_WEBHOOK_SECRET || '',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587', 10),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'Psychometric AI <no-reply@psychometric-ai.local>',
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID || '',
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN || '',
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER || '',

  // ----- LLM spend control (0 = unlimited; enforcement is fail-soft → offline narrative) -----
  LLM_DAILY_MAX_REQUESTS: parseInt(process.env.LLM_DAILY_MAX_REQUESTS || '0', 10),
  LLM_MONTHLY_TOKEN_BUDGET: parseInt(process.env.LLM_MONTHLY_TOKEN_BUDGET || '0', 10),
  // {"gemini-2.0-flash":{"input_per_1k":0.01,"output_per_1k":0.04}} — USD; overrides built-ins
  LLM_PRICE_JSON: process.env.LLM_PRICE_JSON || '',

  // ----- Observability & multi-instance ops -----
  SENTRY_DSN: process.env.SENTRY_DSN || '',
  REDIS_URL: process.env.REDIS_URL || '',

  // ----- Data-retention schedule in days (0 = keep forever) -----
  RETENTION_LLM_DAYS: parseInt(process.env.RETENTION_LLM_DAYS || '180', 10),
  RETENTION_AUDIT_DAYS: parseInt(process.env.RETENTION_AUDIT_DAYS || '365', 10),
  RETENTION_OUTBOX_DAYS: parseInt(process.env.RETENTION_OUTBOX_DAYS || '90', 10),
  RETENTION_INCOMPLETE_DAYS: parseInt(process.env.RETENTION_INCOMPLETE_DAYS || '0', 10)
};

// Resolve effective LLM provider: explicit config > available keys > offline.
if (!env.LLM_PROVIDER || env.LLM_PROVIDER === 'auto') {
  if (env.GEMINI_API_KEY) env.LLM_PROVIDER = 'gemini';
  else if (env.OPENAI_API_KEY) env.LLM_PROVIDER = 'openai';
  else env.LLM_PROVIDER = 'offline';
}
if (env.LLM_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) env.LLM_PROVIDER = 'offline';
if (env.LLM_PROVIDER === 'openai' && !env.OPENAI_API_KEY) env.LLM_PROVIDER = 'offline';

// Resolve effective OTP provider: explicit config > available credentials > console.
// 'console' is acceptable ONLY outside production — send-otp fails closed (501) in
// production until a real provider (twilio/smtp/webhook) is configured.
if (!env.OTP_PROVIDER || env.OTP_PROVIDER === 'auto') {
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) env.OTP_PROVIDER = 'twilio';
  else if (env.SMTP_HOST) env.OTP_PROVIDER = 'smtp';
  else if (env.OTP_WEBHOOK_URL) env.OTP_PROVIDER = 'webhook';
  else env.OTP_PROVIDER = 'console';
}
env.OTP_DELIVERY_READY = ['twilio', 'smtp', 'webhook'].includes(env.OTP_PROVIDER);
env.SMS_OTP_READY = Boolean(
  (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) ||
  env.OTP_PROVIDER === 'webhook'
);
env.EMAIL_DELIVERY_READY = Boolean(env.SMTP_HOST || env.OTP_PROVIDER === 'webhook');

module.exports = env;
