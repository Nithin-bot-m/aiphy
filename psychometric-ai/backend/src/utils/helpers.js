// Shared utilities: async error funnel, validation helpers, crypto helpers.

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERROR';
  }
}

const badRequest = (msg, code) => new HttpError(400, msg, code || 'BAD_REQUEST');
const unauthorized = (msg) => new HttpError(401, msg || 'Authentication required', 'UNAUTHORIZED');
const forbidden = (msg) => new HttpError(403, msg || 'Access denied', 'FORBIDDEN');
const notFound = (msg) => new HttpError(404, msg || 'Not found', 'NOT_FOUND');
const conflict = (msg) => new HttpError(409, msg || 'Conflict', 'CONFLICT');

/** Wrap async route handlers so rejections hit the central error handler. */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// ---------- Validation helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9]{8,15}$/;
const STUDENT_CODE_RE = /^PC-[A-Z0-9]{8}$/;

function assert(condition, err) {
  if (!condition) throw err;
}

function cleanString(value, { max = 255, min = 0 } = {}) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (str.length < min) return null;
  return str.slice(0, max);
}

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_RE.test(email) && email.length <= 254;
}

function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_RE.test(phone);
}

function isValidStudentCode(code) {
  return typeof code === 'string' && STUDENT_CODE_RE.test(code.trim().toUpperCase());
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLikert1to5(value) {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 1 && value <= 5;
}

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  'qwerty12', 'qwerty123', 'qwertyui', '12345678', '123456789', '1234567890',
  'abc12345', 'letmein1', 'welcome1', 'admin123', 'admin1234', 'iloveyou1',
  'changeme1', 'student1', 'student123', 'school123', 'demo1234', '00000000',
  '11111111', 'asdfgh12', 'zxcvbn12'
]);

function assertStrongPassword(password, options = {}) {
  const minLength = Number(options.minLength) || 8;
  assert(typeof password === 'string' && password.length >= minLength, badRequest(`Password must be at least ${minLength} characters long.`));
  assert(password.length <= 128, badRequest('Password must be at most 128 characters long.'));
  assert(/[a-zA-Z]/.test(password) && /[0-9]/.test(password), badRequest('Password must contain letters and numbers.'));
  const lower = password.trim().toLowerCase();
  assert(
    !COMMON_PASSWORDS.has(lower) && !/(.)\1{4,}/.test(lower),
    badRequest('Choose a stronger password that does not use common words or repeated characters.')
  );
  if (options.email) {
    const local = String(options.email).trim().toLowerCase().split('@')[0];
    assert(!(local && local.length >= 4 && lower.includes(local)), badRequest('Password must not contain your email username.'));
  }
}

function assertSafePlainText(value, fieldName, options = {}) {
  if (value === undefined || value === null || value === '') {
    if (options.required) throw badRequest(`${fieldName} is required.`);
    return value;
  }
  const str = String(value).trim();
  if (options.required && !str) throw badRequest(`${fieldName} is required.`);
  const maxLength = Number(options.maxLength) || 150;
  assert(str.length <= maxLength, badRequest(`${fieldName} must be ${maxLength} characters or fewer.`));
  const hasControl = [...str].some((ch) => {
    const code = ch.charCodeAt(0);
    return code < 32 || code === 127;
  });
  assert(!/[<>]/.test(str) && !hasControl, badRequest(`${fieldName} contains unsupported characters (<, >, or control characters).`));
  return str;
}

// ---------- Crypto helpers ----------
const crypto = require('crypto');

/** URL-safe random token, default 8 chars (student link codes). */
function randomCode(length = 8, alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789') {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  HttpError, badRequest, unauthorized, forbidden, notFound, conflict,
  asyncHandler, assert,
  cleanString, isValidEmail, isValidPhone, isValidStudentCode,
  isFiniteNumber, isLikert1to5, assertStrongPassword, assertSafePlainText,
  randomCode, sha256Hex, timingSafeEqualStr
};
