// adminMiddleware.js
// Shared in-memory token store — populated by /admin/login
const activeTokens = new Set();

/**
 * requireAdmin middleware
 * Expects: Authorization: Bearer <token>
 */
function requireAdmin(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ success: false, error: 'Missing or malformed Authorization header' });
  }

  const token = parts[1];

  if (!activeTokens.has(token)) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  next();
}

module.exports = { activeTokens, requireAdmin };
