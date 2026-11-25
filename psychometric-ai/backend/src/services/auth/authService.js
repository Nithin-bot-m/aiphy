// authService — registration, login, OTP, logout.
//
// Security fixes applied (audit F2/F3/F8/F15/F16):
//   - OTP '123456' backdoor REMOVED: 6-digit crypto-random OTP, stored as SHA-256
//     hash, 10-minute expiry, max 5 attempts then 15-minute lockout.
//   - OTP auto-registration with attacker-chosen role REMOVED: OTP only
//     authenticates EXISTING accounts; role is never taken from the request.
//   - Admin accounts cannot be created via public endpoints (seed/bootstrap only).
//   - Production requires a real OTP delivery provider; without one the OTP
//     endpoints return 501 (dev keeps a server-side console log only).

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const userRepository = require('../../repositories/userRepository');
const otpDelivery = require('../notifications/otpDelivery');
const { logAudit } = require('../../middleware/auditLogger');
const {
  HttpError, badRequest, unauthorized, conflict, notFound, isValidEmail, isValidPhone,
  assertStrongPassword, assertSafePlainText, sha256Hex, timingSafeEqualStr, randomCode
} = require('../../utils/helpers');

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const VERIFY_TTL_HOURS = 24;
const RESET_TTL_MINUTES = 30;
const BCRYPT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isDemo: Boolean(user.is_demo),
    emailVerified: Boolean(user.email_verified),
    deletionRequestedAt: user.deletion_requested_at || null
  };
}

async function register(req) {
  const { role, email, phone, password, full_name, board, school_name, relationship } = req.body;

  if (!['candidate', 'parent'].includes(role)) {
    throw badRequest('Role must be "candidate" or "parent". Admin accounts are provisioned internally.');
  }
  assertStrongPassword(password, { minLength: 8, email });
  if (!email && !phone) throw badRequest('Email or phone number is required.');
  if (email && !isValidEmail(email)) throw badRequest('Invalid email address.');
  if (phone && !isValidPhone(phone)) throw badRequest('Invalid phone number.');
  const name = assertSafePlainText(full_name, 'Full name', { required: true, maxLength: 120 });
  if (name.length < 2) throw badRequest('Full name is required (2-120 characters).');
  const cleanSchool = assertSafePlainText(school_name || '', 'School name', { maxLength: 150 }) || '';
  const cleanBoard = assertSafePlainText(board || 'CBSE', 'Board', { maxLength: 80 }) || 'CBSE';
  const cleanRelationship = assertSafePlainText(relationship || '', 'Relationship', { maxLength: 60 }) || undefined;

  if (email && (await userRepository.findUserByEmail(email))) throw conflict('An account with this email already exists.');
  if (phone && (await userRepository.findUserByPhone(phone))) throw conflict('An account with this phone already exists.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = await userRepository.createUser({ email: email || null, phone: phone || null, role, passwordHash });

  let profile;
  if (role === 'candidate') {
    const code = await allocateStudentCode();
    const studentId = await userRepository.createStudent({
      userId, fullName: name, grade: 10, schoolName: cleanSchool, board: cleanBoard, studentCode: code
    });
    profile = { student_id: studentId, student_code: code };
  } else {
    const parentId = await userRepository.createParent({ userId, fullName: name, phone, relationship: cleanRelationship });
    profile = { parent_id: parentId };
  }

  if (email) {
    const verifyToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString();
    await userRepository.setEmailVerificationToken(userId, sha256Hex(verifyToken), expiresAt);
    await otpDelivery.sendEmailNotice({
      userId,
      to: email.trim().toLowerCase(),
      subject: 'Verify your Psychometric AI email address',
      message: `Welcome to Psychometric AI.\n\nVerify your email using this token: ${verifyToken}\nOr open: #/login?verify=${verifyToken}\n\nThis link expires in ${VERIFY_TTL_HOURS} hours.`
    });
  }

  const user = await userRepository.findUserById(userId);
  await logAudit(req, 'REGISTER', 'USER', userId, { role });
  return { token: signToken(user), user: publicUser(user), profile };
}

async function allocateStudentCode() {
  for (let i = 0; i < 20; i += 1) {
    const code = `PC-${randomCode(8)}`;
    if (!(await userRepository.findStudentByCode(code))) return code;
  }
  throw new Error('Unable to allocate a unique student code.');
}

// Pre-hash of a random password — used to equalize timing when user doesn't exist.
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpFqzZCqUQ1pGVcYQ9FqFcqT3vivG';

const MAX_FAILED_LOGINS = 5;

function lockMinutesForFailures(attempts) {
  if (attempts >= 10) return 60;
  if (attempts >= 7) return 30;
  return 15;
}

async function login(req) {
  const { identifier, password } = req.body;
  if (!identifier || !password) throw badRequest('Identifier and password are required.');

  const user = await userRepository.findUserByIdentifier(String(identifier).trim());
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // constant-shape rejection: no user enumeration
    throw unauthorized('Invalid credentials.');
  }
  if (!user.is_active) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw unauthorized('Invalid credentials.');
  }

  // Enforce per-account lockout before password verification (F-01)
  if (user.login_locked_until && new Date(user.login_locked_until).getTime() > Date.now()) {
    await logAudit(req, 'LOGIN_BLOCKED_LOCKED', 'USER', user.id, { locked_until: user.login_locked_until });
    throw new HttpError(429, 'Account temporarily locked due to repeated failed sign-in attempts. Try again later or reset your password.', {
      code: 'ACCOUNT_LOCKED',
      lockedUntil: user.login_locked_until
    });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
    let lockedUntil = null;
    if (nextAttempts >= MAX_FAILED_LOGINS) {
      const mins = lockMinutesForFailures(nextAttempts);
      lockedUntil = new Date(Date.now() + mins * 60 * 1000).toISOString();
      await userRepository.recordFailedLogin(user.id, nextAttempts, lockedUntil);
      await logAudit(req, 'LOGIN_FAILED', 'USER', user.id, { method: 'password', attempts: nextAttempts });
      await logAudit(req, 'ACCOUNT_LOCKED', 'USER', user.id, { attempts: nextAttempts, lock_minutes: mins, locked_until: lockedUntil });
      throw new HttpError(429, `Account temporarily locked for ${mins} minutes after ${nextAttempts} failed sign-in attempts. Try again later or reset your password.`, {
        code: 'ACCOUNT_LOCKED',
        lockedUntil
      });
    }
    await userRepository.recordFailedLogin(user.id, nextAttempts, null);
    await logAudit(req, 'LOGIN_FAILED', 'USER', user.id, { method: 'password', attempts: nextAttempts });
    throw unauthorized('Invalid credentials.');
  }

  await userRepository.clearLoginFailures(user.id);
  await userRepository.touchLogin(user.id);
  await logAudit(req, 'LOGIN', 'USER', user.id, { method: 'password' });
  return { token: signToken(user), user: publicUser(user) };
}

async function sendOtp(req) {
  if (env.IS_PROD && !env.OTP_DELIVERY_READY) {
    // Fail closed: without a real SMS/email provider we never pretend an OTP
    // was sent (audited F8). Password login remains fully available.
    throw notFound('OTP delivery is not configured for this deployment. Use password login.', 'OTP_UNAVAILABLE');
  }
  const { phone } = req.body;
  if (!isValidPhone(phone)) throw badRequest('Valid phone number is required.');

  const user = await userRepository.findUserByPhone(phone);
  if (!user) {
    // Do not reveal whether the number is registered.
    return { message: 'If this number is registered, an OTP has been sent.', expires_in_minutes: OTP_TTL_MINUTES };
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
  await userRepository.setOtp({ userId: user.id, otpHash: sha256Hex(otp), expiresAtIso: expiresAt });

  try {
    await otpDelivery.deliverOtp({ user, recipient: phone, otp, channel: 'sms' });
  } catch (err) {
    console.error('[otp] delivery failed:', err.message);
    throw notFound('OTP could not be delivered right now. Please try again later.', 'OTP_DELIVERY_FAILED');
  }
  await logAudit(req, 'OTP_SEND', 'USER', user.id, { provider: env.OTP_PROVIDER });
  return { message: 'If this number is registered, an OTP has been sent.', expires_in_minutes: OTP_TTL_MINUTES };
}

async function verifyOtp(req) {
  const { phone, otp } = req.body;
  if (!isValidPhone(phone)) throw badRequest('Valid phone number is required.');
  if (!/^\d{6}$/.test(String(otp || ''))) throw unauthorized('Invalid credentials.');

  const user = await userRepository.findUserByPhone(phone);
  if (!user) throw unauthorized('Invalid credentials.');

  const state = await userRepository.getOtpState(user.id);
  if (!state?.otp_code_hash || !state?.otp_expires_at) throw unauthorized('Invalid credentials.');
  if (state.otp_locked_until && new Date(state.otp_locked_until) > new Date()) {
    throw unauthorized('Too many incorrect attempts. Try again later.');
  }
  if (new Date(state.otp_expires_at) < new Date()) {
    await userRepository.registerOtpFailure(user.id, { maxAttempts: OTP_MAX_ATTEMPTS });
    throw unauthorized('Invalid credentials.');
  }

  if (!timingSafeEqualStr(sha256Hex(String(otp)), state.otp_code_hash)) {
    const { attempts } = await userRepository.registerOtpFailure(user.id, { maxAttempts: OTP_MAX_ATTEMPTS });
    await logAudit(req, 'OTP_FAILED', 'USER', user.id, { attempts });
    throw unauthorized('Invalid credentials.');
  }

  await userRepository.clearOtp(user.id);
  await userRepository.touchLogin(user.id);
  await logAudit(req, 'LOGIN', 'USER', user.id, { method: 'otp' });
  return { token: signToken(user), user: publicUser(user) };
}

async function logout(req) {
  if (req.user) await logAudit(req, 'LOGOUT', 'USER', req.user.id);
  return { message: 'Logged out. Discard the token client-side.' };
}

async function getMe(req) {
  const user = await userRepository.findUserById(req.user.id);
  let profile = null;
  if (user.role === 'candidate') {
    const student = await userRepository.findStudentByUserId(user.id);
    profile = student ? { ...student, pending_parent_requests: await userRepository.listPendingRequestsForStudent(student.id) } : null;
  } else if (user.role === 'parent') {
    profile = await userRepository.findParentByUserId(user.id);
  }
  return { user: publicUser(user), profile };
}

function getCapabilities() {
  return {
    otpAvailable: Boolean(env.SMS_OTP_READY),
    emailDeliveryAvailable: Boolean(env.EMAIL_DELIVERY_READY),
    otpProvider: env.OTP_DELIVERY_READY ? env.OTP_PROVIDER : null
  };
}

async function sendVerificationEmail(req) {
  const user = await userRepository.findUserById(req.user.id ?? req.user.userId);
  if (!user) throw notFound('User not found.');
  if (!user.email) throw badRequest('No email address is registered on this account.');
  if (user.email_verified) {
    return { alreadyVerified: true, message: 'Email is already verified.' };
  }
  const verifyToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + VERIFY_TTL_HOURS * 60 * 60 * 1000).toISOString();
  await userRepository.setEmailVerificationToken(user.id, sha256Hex(verifyToken), expiresAt);
  const delivery = await otpDelivery.sendEmailNotice({
    userId: user.id,
    to: user.email,
    subject: 'Verify your Psychometric AI email address',
    message: `Verify your Psychometric AI account email using this token: ${verifyToken}\nOr open: #/login?verify=${verifyToken}\n\nThis link expires in ${VERIFY_TTL_HOURS} hours.`
  });
  await logAudit(req, 'EMAIL_VERIFICATION_SENT', 'USER', user.id, { delivered: delivery.delivered });
  return {
    sent: true,
    delivered: delivery.delivered,
    message: delivery.delivered
      ? `Verification instructions sent to ${otpDelivery.maskRecipient(user.email)}.`
      : 'Verification request queued. If email delivery is not enabled in this environment, contact an administrator to verify your account.'
  };
}

async function verifyEmail(req) {
  const rawToken = (req.body && req.body.token) || (req.query && req.query.token);
  if (!rawToken || typeof rawToken !== 'string') {
    throw badRequest('Verification token is required.');
  }
  const token = rawToken.trim();
  if (token.length < 16) throw badRequest('Verification token is invalid.');
  const user = await userRepository.findUserByVerificationTokenHash(sha256Hex(token));
  if (!user || !user.verification_expires_at) {
    throw badRequest('Verification link is invalid or has already been used.');
  }
  if (new Date(user.verification_expires_at).getTime() < Date.now()) {
    throw badRequest('Verification link has expired. Please request a new verification email.');
  }
  await userRepository.markEmailVerified(user.id);
  await logAudit(req, 'EMAIL_VERIFIED', 'USER', user.id, {});
  const updated = await userRepository.findUserById(user.id);
  return { verified: true, user: publicUser(updated) };
}

async function forgotPassword(req) {
  const raw = req.body && (req.body.email || req.body.identifier);
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    throw badRequest('Email address is required.');
  }
  const identifier = raw.trim();
  const user = await userRepository.findUserByIdentifier(identifier);
  // Uniform response prevents account enumeration
  if (user && user.is_active && user.email) {
    const resetToken = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();
    await userRepository.setPasswordResetToken(user.id, sha256Hex(resetToken), expiresAt);
    const delivery = await otpDelivery.sendEmailNotice({
      userId: user.id,
      to: user.email,
      subject: 'Reset your Psychometric AI password',
      message: `A password reset was requested for your Psychometric AI account.\n\nReset token: ${resetToken}\nOr open: #/login?reset=${resetToken}\n\nThis link expires in ${RESET_TTL_MINUTES} minutes. If you did not request this, ignore this message.`
    });
    await logAudit(req, 'PASSWORD_RESET_REQUESTED', 'USER', user.id, { delivered: delivery.delivered });
  }
  return {
    sent: true,
    emailDeliveryAvailable: Boolean(env.EMAIL_DELIVERY_READY),
    message: env.EMAIL_DELIVERY_READY
      ? 'If an account matches that email, password reset instructions have been sent.'
      : 'If an account matches that email, a password reset token was generated. If email delivery is disabled in this environment, contact an administrator to reset your password.'
  };
}

async function resetPassword(req) {
  const token = req.body && req.body.token;
  const newPassword = req.body && (req.body.new_password || req.body.password);
  if (!token || typeof token !== 'string' || token.trim().length < 16) {
    throw badRequest('A valid reset token is required.');
  }
  const user = await userRepository.findUserByResetTokenHash(sha256Hex(token.trim()));
  if (!user || !user.is_active || !user.reset_expires_at) {
    throw badRequest('Password reset link is invalid or has already been used.');
  }
  if (new Date(user.reset_expires_at).getTime() < Date.now()) {
    throw badRequest('Password reset link has expired. Please request a new one.');
  }
  const minLength = user.role === 'admin' ? 12 : 8;
  assertStrongPassword(newPassword, { minLength, email: user.email });
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await userRepository.updateUserPasswordAndUnlock(user.id, hash);
  await logAudit(req, 'PASSWORD_RESET_COMPLETED', 'USER', user.id, { method: 'token' });
  return { reset: true, message: 'Your password has been updated. You can now sign in.' };
}

async function requestAccountDeletion(req) {
  const user = await userRepository.findUserById(req.user.id ?? req.user.userId);
  if (!user) throw notFound('User not found.');
  if (!req.body || req.body.confirm !== true) {
    throw badRequest('Explicit confirmation is required to request account deletion.');
  }
  const reason = assertSafePlainText(req.body.reason || '', 'Deletion reason', { maxLength: 300 }) || '';
  await userRepository.requestDeletion(user.id);
  await logAudit(req, 'DELETION_REQUESTED', 'USER', user.id, { reason: reason || undefined });
  const updated = await userRepository.findUserById(user.id);
  return {
    requested: true,
    deletionRequestedAt: updated.deletion_requested_at,
    message: 'Your DPDP erasure request has been recorded. An administrator will process it shortly.'
  };
}

module.exports = {
  register,
  login,
  sendOtp,
  verifyOtp,
  logout,
  getMe,
  getCapabilities,
  sendVerificationEmail,
  verifyEmail,
  forgotPassword,
  resetPassword,
  requestAccountDeletion
};
