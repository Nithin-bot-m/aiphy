// User / profile / mapping repository — all SQL for identity & relationships.

const { db } = require('../config/db');

// ---------- Users ----------
async function findUserById(id) {
  return await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function findUserByIdentifier(identifier) {
  return await db.prepare('SELECT * FROM users WHERE email = ? OR phone = ?').get(identifier, identifier);
}

async function findUserByEmail(email) {
  return await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

async function findUserByPhone(phone) {
  return await db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

async function createUser({ email, phone, role, passwordHash, isDemo = 0 }) {
  const info = await db.prepare(
    'INSERT INTO users (email, phone, role, password_hash, is_active, is_demo) VALUES (?, ?, ?, ?, 1, ?)'
  ).run(email || null, phone || null, role, passwordHash, isDemo);
  return Number(info.lastInsertRowid);
}

async function touchLogin(userId) {
  await db.prepare("UPDATE users SET last_login_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(userId);
}

async function setOtp({ userId, otpHash, expiresAtIso }) {
  await db.prepare(`
    UPDATE users
    SET otp_code_hash = ?, otp_expires_at = ?, otp_attempts = 0, otp_locked_until = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(otpHash, expiresAtIso, userId);
}

async function getOtpState(userId) {
  return await db.prepare('SELECT otp_code_hash, otp_expires_at, otp_attempts, otp_locked_until FROM users WHERE id = ?').get(userId);
}

async function registerOtpFailure(userId, { maxAttempts }) {
  const state = await getOtpState(userId);
  const attempts = (state?.otp_attempts || 0) + 1;
  const lockedUntil = attempts >= maxAttempts
    ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
    : null;
  await db.prepare('UPDATE users SET otp_attempts = ?, otp_locked_until = ? WHERE id = ?').run(attempts, lockedUntil, userId);
  return { attempts, lockedUntil };
}

async function clearOtp(userId) {
  await db.prepare("UPDATE users SET otp_code_hash = NULL, otp_expires_at = NULL, otp_attempts = 0, otp_locked_until = NULL WHERE id = ?").run(userId);
}

// ---------- Students ----------
async function findStudentByUserId(userId) {
  return await db.prepare('SELECT * FROM students WHERE user_id = ?').get(userId);
}

async function findStudentById(id) {
  return await db.prepare('SELECT * FROM students WHERE id = ?').get(id);
}

async function findStudentByCode(code) {
  return await db.prepare('SELECT * FROM students WHERE UPPER(student_code) = UPPER(?)').get(code);
}

async function createStudent({ userId, fullName, grade, schoolName, board, studentCode, dob = null, isDemo = 0, profileCompleted = 0 }) {
  const info = await db.prepare(`
    INSERT INTO students (user_id, full_name, dob, grade, school_name, board, student_code, profile_completed, is_demo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, fullName, dob, grade, schoolName || '', board, studentCode, profileCompleted, isDemo);
  return Number(info.lastInsertRowid);
}

async function updateStudentProfile(studentId, fields) {
  const allowed = ['full_name', 'dob', 'grade', 'school_name', 'board'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(fields[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')", 'profile_completed = 1');
  params.push(studentId);
  await db.prepare(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

// ---------- Parents ----------
async function findParentByUserId(userId) {
  return await db.prepare('SELECT * FROM parents WHERE user_id = ?').get(userId);
}

async function createParent({ userId, fullName, phone, relationship, isDemo = 0 }) {
  const info = await db.prepare(
    'INSERT INTO parents (user_id, full_name, phone, relationship, is_demo) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, fullName, phone || '', relationship || 'Parent', isDemo);
  return Number(info.lastInsertRowid);
}

// ---------- Student ↔ Parent mapping (consent lifecycle) ----------
async function findMapping(studentId, parentId) {
  return await db.prepare('SELECT * FROM student_parent_mapping WHERE student_id = ? AND parent_id = ?').get(studentId, parentId);
}

async function findMappingById(id) {
  return await db.prepare('SELECT * FROM student_parent_mapping WHERE id = ?').get(id);
}

async function createMapping({ studentId, parentId, requestedBy }) {
  const status = requestedBy === 'student' ? 'linked' : 'pending_student_approval';
  const info = await db.prepare(`
    INSERT INTO student_parent_mapping (student_id, parent_id, status, requested_by, student_consented_at, linked_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(studentId, parentId, status, requestedBy, status === 'linked' ? new Date().toISOString() : null, status === 'linked' ? new Date().toISOString() : null);
  return Number(info.lastInsertRowid);
}

async function approveMapping(mappingId) {
  await db.prepare(`
    UPDATE student_parent_mapping
    SET status = 'linked', student_consented_at = datetime('now'), linked_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(mappingId);
}

async function revokeMapping(mappingId) {
  await db.prepare("UPDATE student_parent_mapping SET status = 'revoked', updated_at = datetime('now') WHERE id = ?").run(mappingId);
}

/** Is this parent authorized to view this student (server-side consent gate)? */
async function isParentLinked(parentId, studentId) {
  const row = await db.prepare(`
    SELECT 1 FROM student_parent_mapping
    WHERE parent_id = ? AND student_id = ? AND status = 'linked' AND student_consented_at IS NOT NULL
  `).get(parentId, studentId);
  return !!row;
}

async function listChildrenForParent(parentId) {
  return await db.prepare(`
    SELECT s.id AS student_id, s.full_name, s.grade, s.school_name, s.board, s.student_code, s.is_demo,
           m.id AS mapping_id, m.status AS link_status, m.requested_by, m.linked_at,
           COALESCE(
             (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1),
             (SELECT a.id FROM assessments a WHERE a.student_id = s.id ORDER BY a.id DESC LIMIT 1)
           ) AS latest_assessment_id,
           COALESCE(
             (SELECT a.status FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1),
             (SELECT a.status FROM assessments a WHERE a.student_id = s.id ORDER BY a.id DESC LIMIT 1)
           ) AS assessment_status,
           (SELECT a.completed_at FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1) AS completed_at,
           COALESCE(
             (SELECT av.version_code FROM assessments a JOIN assessment_versions av ON a.version_id = av.id WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1),
             (SELECT av.version_code FROM assessments a JOIN assessment_versions av ON a.version_id = av.id WHERE a.student_id = s.id ORDER BY a.id DESC LIMIT 1)
           ) AS version_code,
           (SELECT ps.status FROM v2_parent_sessions ps
            WHERE ps.assessment_id = COALESCE(
              (SELECT a.id FROM assessments a WHERE a.student_id = s.id AND a.status = 'completed' ORDER BY a.id DESC LIMIT 1),
              (SELECT a.id FROM assessments a WHERE a.student_id = s.id ORDER BY a.id DESC LIMIT 1)
            ) AND ps.parent_id = m.parent_id) AS m8_status
    FROM student_parent_mapping m
    JOIN students s ON m.student_id = s.id
    WHERE m.parent_id = ?
    ORDER BY s.id ASC
  `).all(parentId);
}

async function listPendingRequestsForStudent(studentId) {
  return await db.prepare(`
    SELECT m.id AS mapping_id, m.requested_by, m.created_at, p.full_name AS parent_name, p.relationship
    FROM student_parent_mapping m
    JOIN parents p ON m.parent_id = p.id
    WHERE m.student_id = ? AND m.status = 'pending_student_approval'
    ORDER BY m.id DESC
  `).all(studentId);
}

async function listMappingsForStudent(studentId) {
  return await db.prepare(`
    SELECT m.*, p.full_name AS parent_name, p.relationship
    FROM student_parent_mapping m
    JOIN parents p ON m.parent_id = p.id
    WHERE m.student_id = ?
    ORDER BY m.id DESC
  `).all(studentId);
}

module.exports = {
  findUserById, findUserByIdentifier, findUserByEmail, findUserByPhone,
  createUser, touchLogin, setOtp, getOtpState, registerOtpFailure, clearOtp,
  findStudentByUserId, findStudentById, findStudentByCode, createStudent, updateStudentProfile,
  findParentByUserId, createParent,
  findMapping, findMappingById, createMapping, approveMapping, revokeMapping,
  isParentLinked, listChildrenForParent, listPendingRequestsForStudent, listMappingsForStudent
};
