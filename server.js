console.log('🔥 SERVER.JS STARTING...');

// ─────────────────────────────────────────────
// ENV LOAD
// ─────────────────────────────────────────────
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '.env')
});

// ─────────────────────────────────────────────
// DEPENDENCIES
// ─────────────────────────────────────────────
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────
// ENV VARIABLES
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('─────────────────────────────────────');
console.log('📋 ENV STATUS CHECK');
console.log(`   SUPABASE_URL               : ${SUPABASE_URL ? 'OK' : 'MISSING'}`);
console.log(`   SUPABASE_SERVICE_ROLE_KEY : ${SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING'}`);
console.log('─────────────────────────────────────');

let isOfflineMode = false;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('🚨 OFFLINE MODE ENABLED');
  isOfflineMode = true;
}

// ─────────────────────────────────────────────
// SUPABASE CLIENT
// ─────────────────────────────────────────────
const supabase = isOfflineMode
  ? null
  : createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────
const app = express();

app.use(express.json());

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);

      const allowed = [
        'http://localhost:5174',
        'http://localhost:5175',
        'http://127.0.0.1:5175'
      ];

      if (allowed.includes(origin)) {
        return cb(null, true);
      }

      return cb(new Error('CORS BLOCKED'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    success: true,
    status: 'JFY API RUNNING',
    offline: isOfflineMode
  });
});

// ─────────────────────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────────────────────
app.post('/admin/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (username === 'admin' && password === '123456') {
      return res.json({
        success: true,
        token: 'admin-token'
      });
    }

    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS'
    });
  } catch (err) {
    console.error('❌ LOGIN ERROR:', err);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────────
app.get('/admin/stats', async (req, res) => {
  try {
    if (isOfflineMode) {
      return res.json({
        success: true,
        stats: {
          total: 0,
          active: 0,
          inactive: 0
        }
      });
    }

    const { data, error } = await supabase
      .from('licenses')
      .select('*');

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    const total = data.length;
    const active = data.filter(x => x.status === 'active').length;
    const inactive = data.filter(x => x.status !== 'active').length;

    return res.json({
      success: true,
      stats: { total, active, inactive }
    });

  } catch (err) {
    console.error('❌ STATS ERROR:', err);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// GET ALL LICENSES (FIX FOR ADMIN PANEL ERROR)
// ─────────────────────────────────────────────
app.get('/admin/licenses', async (req, res) => {
  try {
    if (isOfflineMode) {
      return res.json({
        success: true,
        licenses: []
      });
    }

    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      licenses: data
    });

  } catch (err) {
    console.error('❌ LICENSES ERROR:', err);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// CREATE LICENSE
// ─────────────────────────────────────────────
app.post('/admin/create-license', async (req, res) => {
  try {
    if (isOfflineMode) {
      return res.json({
        success: true,
        license: {
          license_key: 'OFFLINE-MODE',
          status: 'inactive'
        }
      });
    }

    const generatedKey = crypto
      .randomBytes(16)
      .toString('hex')
      .toUpperCase();

    const { data, error } = await supabase
      .from('licenses')
      .insert([
        {
          license_key: generatedKey,
          status: 'inactive',
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    return res.json({
      success: true,
      license: data[0]
    });

  } catch (err) {
    console.error('❌ CREATE ERROR:', err);
    return res.status(500).json({ success: false });
  }
});

// ─────────────────────────────────────────────
// VERIFY LICENSE
// ─────────────────────────────────────────────
app.post('/verify-license', async (req, res) => {
  try {
    const { licenseKey, fingerprint } = req.body;

    if (isOfflineMode) {
      return res.json({
        success: false,
        activated: false,
        error: 'OFFLINE_MODE'
      });
    }

    if (!licenseKey || typeof licenseKey !== 'string') {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    const cleanKey = licenseKey.trim();

    const { data, error } = await supabase
      .from('licenses')
      .select('*')
      .eq('license_key', cleanKey)
      .limit(1);

    if (error) {
      return res.json({
        success: false,
        activated: false,
        error: 'NETWORK_ERROR'
      });
    }

    const license = data?.[0];

    if (!license) {
      return res.json({
        success: false,
        activated: false,
        error: 'INVALID_LICENSE'
      });
    }

    if (license.device_id && fingerprint) {
      if (license.device_id !== fingerprint) {
        return res.json({
          success: false,
          activated: false,
          error: 'DEVICE_MISMATCH'
        });
      }
    }

    if (!license.device_id && fingerprint) {
      const { error: updateError } = await supabase
        .from('licenses')
        .update({
          device_id: fingerprint,
          status: 'active',
          activated_at: new Date().toISOString()
        })
        .eq('license_key', cleanKey);

      if (updateError) {
        return res.json({
          success: false,
          activated: false,
          error: 'UPDATE_FAILED'
        });
      }

      return res.json({
        success: true,
        activated: true,
        firstActivation: true
      });
    }

    return res.json({
      success: true,
      activated: true,
      firstActivation: false
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

app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});