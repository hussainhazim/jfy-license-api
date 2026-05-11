const express              = require('express');
const jwt                  = require('jsonwebtoken');
const { supabase }         = require('./supabase');        // ← shared, validated client
const { activeTokens, requireAdmin } = require('./adminMiddleware');

const router = express.Router();

// ─── Admin credentials ──────────────────────────────────────────────────────
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';
const JWT_SECRET =
  process.env.ADMIN_JWT_SECRET || 'jfy-admin-secret-key-change-in-prod';

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { role: 'admin', iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { expiresIn: '8h' }
  );

  activeTokens.add(token);
  setTimeout(() => activeTokens.delete(token), 8 * 60 * 60 * 1000);

  return res.json({ success: true, token });
});

// ─────────────────────────────────────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const { data: licenses, error } = await supabase
      .from('licenses')
      .select('status, device_id, activated_at');

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    const total    = licenses.length;
    const active   = licenses.filter(l => l.status === 'active').length;
    const expired  = licenses.filter(l => l.status === 'expired').length;
    const inactive = licenses.filter(l => l.status === 'inactive').length;
    const totalDevices = licenses.filter(l => l.device_id).length;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const activationsToday = licenses.filter(l => {
      if (!l.activated_at) return false;
      return new Date(l.activated_at) >= todayStart;
    }).length;

    return res.json({
      success: true,
      stats: {
        totalLicenses: total,
        activeLicenses: active,
        expiredLicenses: expired,
        inactiveLicenses: inactive,
        totalDevices,
        activationsToday
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET LICENSES
// ─────────────────────────────────────────────────────────────────────────────
router.get('/licenses', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, licenses: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DISABLE LICENSE
// ─────────────────────────────────────────────────────────────────────────────
router.post('/licenses/disable', requireAdmin, async (req, res) => {
  try {
    const { license_key } = req.body || {};

    if (!license_key) {
      return res.status(400).json({ success: false, error: 'license_key is required' });
    }

    const { data, error } = await supabase
      .from('licenses')
      .update({ status: 'inactive' })
      .eq('license_key', license_key)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({ success: true, license: data });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESET DEVICE
// ─────────────────────────────────────────────────────────────────────────────
router.post('/licenses/reset-device', requireAdmin, async (req, res) => {
  try {
    const { license_key } = req.body || {};

    if (!license_key) {
      return res.status(400).json({ success: false, error: 'license_key is required' });
    }

    const { data, error } = await supabase
      .from('licenses')
      .update({ device_id: null, status: 'inactive' })
      .eq('license_key', license_key)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.json({
      success: true,
      message: 'Device reset successfully',
      license: data
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;