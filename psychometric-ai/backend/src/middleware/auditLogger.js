// Audit logging — real client IP (fixes audited bug D20), never throws.
const { db } = require('../config/db');

function clientIp(req) {
  // Behind a trusted proxy (deployment), set app.set('trust proxy', 1).
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

async function logAudit(req, action, resourceType, resourceId, details = {}) {
  try {
    await db.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req?.user?.id ?? null,
      action,
      resourceType,
      resourceId === undefined || resourceId === null ? null : String(resourceId),
      req ? clientIp(req) : 'system',
      JSON.stringify(details)
    );
  } catch (err) {
    console.error('[audit] write failed:', err.message);
  }
}

module.exports = { logAudit, clientIp };
