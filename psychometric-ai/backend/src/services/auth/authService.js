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
  badRequest, unauthorized, conflict, notFound, isValidEmail, isValidPhone,
  assertStrongPassword, sha256Hex, timingSafeEqualStr, randomCode
} = require('../../utils/helpers');

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function publicUser(user) {
  return { id: user.id, email: user.email, phone: user.phone, role: user.role };
}

async function register(req) {
  const { role, email, phone, password, full_name, board, school_name, relationship } = req.body;

  if (!['candidate', 'parent'].includes(role)) {
    throw badRequest('Role must be "candidate" or "parent". Admin accounts are provisioned internally.');
  }
  assertStrongPassword(password);
  if (!email && !phone) throw badRequest('Email or phone number is required.');
  if (email && !isValidEmail(email)) throw badRequest('Invalid email address.');
  if (phone && !isValidPhone(phone)) throw badRequest('Invalid phone number.');
  const name = (full_name || '').trim();
  if (name.length < 2 || name.length > 120) throw badRequest('Full name is required (2-120 characters).');

  if (email && (await userRepository.findUserByEmail(email))) throw conflict('An account with this email already exists.');
  if (phone && (await userRepository.findUserByPhone(phone))) throw conflict('An account with this phone already exists.');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const userId = await userRepository.createUser({ email: email || null, phone: phone || null, role, passwordHash });

  let profile;
  if (role === 'candidate') {
    const code = await allocateStudentCode();
    const studentId = await userRepository.createStudent({
      userId, fullName: name, grade: 10, schoolName: (school_name || '').trim(), board: board || 'CBSE', studentCode: code
    });
    profile = { student_id: studentId, student_code: code };
  } else {
    const parentId = await userRepository.createParent({ userId, fullName: name, phone, relationship });
    profile = { parent_id: parentId };
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

async function login(req) {
  const { identifier, password } = req.body;
  if (!identifier || !password) throw badRequest('Identifier and password are required.');

  const user = await userRepository.findUserByIdentifier(String(identifier).trim());
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH); // constant-shape rejection: no user enumeration
    throw unauthorized('Invalid credentials.');
  }
  if (!user.is_active) throw unauthorized('Invalid credentials.');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await logAudit(req, 'LOGIN_FAILED', 'USER', user.id, { method: 'password' });
    throw unauthorized('Invalid credentials.');
  }

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

module.exports = { register, login, sendOtp, verifyOtp, logout, getMe };
