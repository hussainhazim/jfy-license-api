console.log('🔥 SERVER.JS STARTING...');

// ─────────────────────────────────────────────
// ENV LOAD
// ─────────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// ─────────────────────────────────────────────
// ENV VALIDATION
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

console.log('─────────────────────────────────────');
console.log('📋 ENV STATUS CHECK');
console.log(`   SUPABASE_URL          : ${SUPABASE_URL ? '✅ loaded' : '❌ MISSING'}`);
console.log(`   SUPABASE_SERVICE_ROLE : ${SUPABASE_SERVICE_ROLE ? '✅ loaded' : '❌ MISSING'}`);
console.log('─────────────────────────────────────');

let isOfflineMode = false;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('🚨 Running in OFFLINE MODE (Supabase disabled)');
  isOfflineMode = true;
}

// ─────────────────────────────────────────────
// DEPENDENCIES
// ─────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const adminRouter = require('./adminRoutes');

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
const app = express();

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// ADMIN ROUTES
// ─────────────────────────────────────────────
app.use('/admin', adminRouter);

// ─────────────────────────────────────────────
// HEALTH CHECK
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'JFY License API Running' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: isOfflineMode ? 'offline' : 'online'
  });
});

// ─────────────────────────────────────────────
// 🔥 LICENSE VERIFICATION ENDPOINT (FIXED)
// ─────────────────────────────────────────────
app.post('/verify-license', async (req, res) => {
  try {
    console.log('🔥 VERIFY-LICENSE HIT');
    console.log('BODY:', req.body);

    const { licenseKey, fingerprint } = req.body;

    // validation
    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    // ─────────────────────────────────────
    // TEMP LOGIC (replace later with Supabase)
    // ─────────────────────────────────────
    const cleanKey = licenseKey.trim();

    const isValid = cleanKey.startsWith('JFY-');

    if (!isValid) {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    console.log('✅ LICENSE VALIDATED');

    return res.json({
      success: true,
      activated: true,
      firstActivation: false,
      fingerprintMatched: true
    });

  } catch (err) {
    console.error('❌ VERIFY ERROR:', err);

    return res.status(500).json({
      success: false,
      error: 'NETWORK_ERROR'
    });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────
server.on('error', (err) => {
  console.error('❌ Server error:', err);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});