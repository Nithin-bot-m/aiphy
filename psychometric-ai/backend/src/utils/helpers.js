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

function assertStrongPassword(password) {
  assert(typeof password === 'string' && password.length >= 8, badRequest('Password must be at least 8 characters long.'));
  assert(password.length <= 128, badRequest('Password must be at most 128 characters long.'));
  assert(/[a-zA-Z]/.test(password) && /[0-9]/.test(password), badRequest('Password must contain letters and numbers.'));
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
  isFiniteNumber, isLikert1to5, assertStrongPassword,
  randomCode, sha256Hex, timingSafeEqualStr
};
