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

if (!process.env.ADMIN_JWT_SECRET) {
  console.warn('⚠️  ADMIN_JWT_SECRET is not set — using insecure default. Set this env var in production!');
}

// ─────────────────────────────────────────────
// DEPENDENCIES
// ─────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const adminRouter = require('./adminRoutes');
const { supabase } = require('./supabase');

// ─────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────
const app = express();

// ─────────────────────────────────────────────
// CORS — allow Electron apps (file:// / app://)
// and local dev servers. Render itself is the
// public endpoint, so no web origin needed.
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  // Electron renderers use file:// or app:// — these come through as null or the scheme below
  'app://.',
  'http://localhost:5173',
  'http://localhost:5174',
  'https://jfy-license-api.onrender.com',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Electron file://, curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`🚫 CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy: origin not allowed — ${origin}`), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

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

    if (!isOfflineMode) {
      const { data: license, error: fetchError } = await supabase
        .from('licenses')
        .select('*')
        .eq('license_key', cleanKey)
        .single();

      if (license) {
        if (license.device_id) {
          if (license.device_id !== fingerprint) {
            return res.json({
              success: false,
              activated: false,
              error: 'DEVICE_MISMATCH'
            });
          }
        } else {
          // First activation, store fingerprint
          await supabase
            .from('licenses')
            .update({
              device_id: fingerprint,
              status: 'active',
              activated_at: new Date().toISOString()
            })
            .eq('license_key', cleanKey);
            
          console.log('✅ LICENSE ACTIVATED AND LINKED TO DEVICE');
          return res.json({
            success: true,
            activated: true,
            firstActivation: true,
            fingerprintMatched: true
          });
        }
      }
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