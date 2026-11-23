const db = require('../config/db');

async function recordAudit({ userId = null, action, resourceType, resourceId = null, details = null, ipAddress = null }) {
  if (!action || !resourceType) return;
  try {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        userId,
        action,
        resourceType,
        resourceId === null || resourceId === undefined ? null : String(resourceId),
        details === null || details === undefined ? null : JSON.stringify(details),
        ipAddress || null
      ]
    );
  } catch (error) {
    console.error('Audit log failure:', error.message);
  }
}

module.exports = { recordAudit };
