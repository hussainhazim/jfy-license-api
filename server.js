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
  console.warn('⚠️ ADMIN_JWT_SECRET is not set — using insecure default');
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
// CORS
// ─────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`🚫 CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy blocked: ${origin}`), false);
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
// LICENSE VERIFICATION ENDPOINT
// ─────────────────────────────────────────────
app.post('/verify-license', async (req, res) => {
  try {
    console.log('🔥 VERIFY-LICENSE HIT');
    console.log('BODY:', req.body);

    const { licenseKey, fingerprint } = req.body;

    // ─────────────────────────────────────
    // BASIC VALIDATION
    // ─────────────────────────────────────
    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.status(400).json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    const cleanKey = licenseKey.trim();

    // ─────────────────────────────────────
    // STRICT PREFIX CHECK
    // ─────────────────────────────────────
    if (!cleanKey.startsWith('JFY-')) {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    // ─────────────────────────────────────
    // OFFLINE MODE BLOCK
    // ─────────────────────────────────────
    if (isOfflineMode) {
      console.warn('❌ OFFLINE MODE ACTIVE');

      return res.status(503).json({
        success: false,
        activated: false,
        error: 'NETWORK_ERROR'
      });
    }

    // ─────────────────────────────────────
    // FETCH LICENSE FROM SUPABASE
    // ─────────────────────────────────────
    const { data: license, error: fetchError } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', cleanKey)
      .single();

    if (fetchError) {
      console.error('❌ SUPABASE FETCH ERROR:', fetchError);

      return res.status(500).json({
        success: false,
        activated: false,
        error: 'NETWORK_ERROR'
      });
    }

    // ─────────────────────────────────────
    // LICENSE NOT FOUND
    // ─────────────────────────────────────
    if (!license) {
      console.log('❌ LICENSE NOT FOUND');

      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    // ─────────────────────────────────────
    // LICENSE STATUS CHECK
    // ─────────────────────────────────────
    if (license.status !== 'active') {
      console.log('❌ LICENSE IS NOT ACTIVE');

      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    // ─────────────────────────────────────
    // OPTIONAL FINGERPRINT LOGGING
    // ─────────────────────────────────────
    if (fingerprint) {
      try {
        await supabase
          .from('activation_logs')
          .upsert(
            {
              license_key: cleanKey,
              fingerprint: fingerprint,
              activated_at: new Date().toISOString(),
              device_metadata: req.body.deviceMetadata || null
            },
            {
              onConflict: 'license_key,fingerprint',
              ignoreDuplicates: false
            }
          );

        console.log('📝 activation_logs updated');
      } catch (logErr) {
        console.error('⚠️ activation_logs failed:', logErr);
      }
    }

    // ─────────────────────────────────────
    // FIRST ACTIVATION
    // ─────────────────────────────────────
    if (!license.device_id && fingerprint) {
      await supabase
        .from('licenses')
        .update({
          device_id: fingerprint,
          activated_at: new Date().toISOString(),
          status: 'active'
        })
        .eq('license_key', cleanKey);

      console.log('✅ FIRST ACTIVATION COMPLETE');

      return res.json({
        success: true,
        activated: true,
        firstActivation: true,
        fingerprintMatched: true
      });
    }

    // ─────────────────────────────────────
    // DEVICE MISMATCH
    // ─────────────────────────────────────
    if (
      fingerprint &&
      license.device_id &&
      license.device_id !== fingerprint
    ) {
      console.log('❌ DEVICE MISMATCH');

      return res.json({
        success: false,
        activated: false,
        error: 'DEVICE_MISMATCH'
      });
    }

    // ─────────────────────────────────────
    // SUCCESS
    // ─────────────────────────────────────
    console.log('✅ LICENSE VERIFIED');

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
      activated: false,
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