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
console.log(`   SUPABASE_URL          : ${SUPABASE_URL ? 'OK' : 'MISSING'}`);
console.log(`   SUPABASE_SERVICE_ROLE : ${SUPABASE_SERVICE_ROLE ? 'OK' : 'MISSING'}`);
console.log('─────────────────────────────────────');

let isOfflineMode = false;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.warn('🚨 OFFLINE MODE ENABLED');
  isOfflineMode = true;
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
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);

    const allowed = [
      'http://localhost:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5175'
    ];

    if (allowed.includes(origin)) return cb(null, true);

    return cb(new Error('CORS BLOCKED'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────
app.use('/admin', adminRouter);

app.get('/', (req, res) => {
  res.json({ status: 'JFY API RUNNING' });
});

// ─────────────────────────────────────────────
// 🔥 VERIFY LICENSE (FIXED CORE)
// ─────────────────────────────────────────────
app.post('/verify-license', async (req, res) => {
  try {
    const { licenseKey, fingerprint } = req.body;

    console.log('🔥 VERIFY:', licenseKey);

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    const cleanKey = licenseKey.trim();

    // ─────────────────────────────────────────────
    // FIX #1: AVOID .single() CRASH (MAIN BUG FIX)
    // ─────────────────────────────────────────────
    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', cleanKey)
      .limit(1);

    if (error) {
      console.error('❌ SUPABASE ERROR:', error);
      return res.json({
        success: false,
        activated: false,
        error: 'NETWORK_ERROR'
      });
    }

    const license = data?.[0];

    // ─────────────────────────────────────────────
    // LICENSE NOT FOUND
    // ─────────────────────────────────────────────
    if (!license) {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    // ─────────────────────────────────────────────
    // OPTIONAL: DEVICE CHECK
    // ─────────────────────────────────────────────
    if (license.device_id && fingerprint) {
      if (license.device_id !== fingerprint) {
        return res.json({
          success: false,
          activated: false,
          error: 'DEVICE_MISMATCH'
        });
      }
    }

    // ─────────────────────────────────────────────
    // FIRST ACTIVATION
    // ─────────────────────────────────────────────
    if (!license.device_id && fingerprint) {
      await supabase
        .from('licenses')
        .update({
          device_id: fingerprint,
          status: 'active',
          activated_at: new Date().toISOString()
        })
        .eq('license_key', cleanKey);

      console.log('✅ FIRST ACTIVATION');

      return res.json({
        success: true,
        activated: true,
        firstActivation: true,
        fingerprintMatched: true
      });
    }

    // ─────────────────────────────────────────────
    // SUCCESS
    // ─────────────────────────────────────────────
    return res.json({
      success: true,
      activated: true,
      firstActivation: false,
      fingerprintMatched: true
    });

  } catch (err) {
    console.error('❌ SERVER ERROR:', err);

    return res.json({
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

app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON ${PORT}`);
});