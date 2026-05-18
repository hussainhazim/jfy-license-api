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
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

// ─────────────────────────────────────────────
// ENV VARIABLES
// ─────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET MISSING');
}

const JWT_SECRET = process.env.JWT_SECRET;

console.log('─────────────────────────────────────');
console.log('📋 ENV STATUS CHECK');
console.log(`SUPABASE_URL               : ${SUPABASE_URL ? 'OK' : 'MISSING'}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY : ${SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING'}`);
console.log(`JWT_SECRET                : ${JWT_SECRET ? 'OK' : 'MISSING'}`);
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
  : createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY
    );

// ─────────────────────────────────────────────
// APP INIT
// ─────────────────────────────────────────────
const app = express();

app.use(express.json());

// ─────────────────────────────────────────────
// RATE LIMITERS
// ─────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS'
  }
});

const verifyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    activated: false,
    error: 'TOO_MANY_REQUESTS'
  }
});

const createLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    error: 'TOO_MANY_REQUESTS'
  }
});

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
    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

// ─────────────────────────────────────────────
// AUTH MIDDLEWARE
// ─────────────────────────────────────────────
function verifyAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN'
      });
    }

    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.admin = decoded;

    next();

  } catch (err) {
    console.error('❌ AUTH ERROR:', err);

    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED'
    });
  }
}

// ─────────────────────────────────────────────
// AUDIT LOGGER
// ─────────────────────────────────────────────
async function logAudit(
  action,
  username,
  req,
  metadata = {}
) {
  try {
    if (isOfflineMode || !supabase) return;

    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress;

    await supabase
      .from('activity_logs')
      .insert([
        {
          action,
          metadata: {
            username,
            ip,
            ...metadata
          },
          created_at:
            new Date().toISOString()
        }
      ]);

  } catch (e) {
    console.error('❌ AUDIT LOG ERROR:', e);
  }
}

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
app.post(
  '/admin/login',
  loginLimiter,
  async (req, res) => {
    try {
      const {
        username,
        password
      } = req.body;

      if (
        username === process.env.ADMIN_EMAIL &&
        password === process.env.ADMIN_PASSWORD
      ) {

        await logAudit(
          'LOGIN_SUCCESS',
          username,
          req
        );

        const token = jwt.sign(
          {
            username,
            role: 'admin'
          },
          JWT_SECRET,
          {
            expiresIn: '7d'
          }
        );

        return res.json({
          success: true,
          token
        });
      }

      await logAudit(
        'LOGIN_FAILED',
        username || 'unknown',
        req
      );

      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS'
      });

    } catch (err) {
      console.error('❌ LOGIN ERROR:', err);

      return res.status(500).json({
        success: false
      });
    }
  }
);

// ─────────────────────────────────────────────
// ACTIVITY LOGS
// ─────────────────────────────────────────────
app.post(
  '/admin/activity-logs',
  verifyAdmin,
  async (req, res) => {
    try {
      if (isOfflineMode) {
        return res.json({
          success: true
        });
      }

      const {
        action,
        license_id,
        metadata
      } = req.body;

      const ip =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress;

      const { error } = await supabase
        .from('activity_logs')
        .insert([
          {
            action,
            license_id: license_id || null,
            metadata: {
              ip,
              ...metadata
            },
            created_at:
              new Date().toISOString()
          }
        ]);

      if (error) {
        console.error('❌ ACTIVITY INSERT ERROR:', error);
      }

      return res.json({
        success: true
      });

    } catch (err) {
      console.error('❌ ACTIVITY LOG ERROR:', err);

      return res.status(500).json({
        success: false
      });
    }
  }
);

// ─────────────────────────────────────────────
// ADMIN STATS
// ─────────────────────────────────────────────
app.get(
  '/admin/stats',
  verifyAdmin,
  async (req, res) => {
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

      const { data, error } =
        await supabase
          .from('licenses')
          .select('*');

      if (error) {
        console.error('❌ STATS QUERY ERROR:', error);

        return res.status(500).json({
          success: false,
          error: error.message
        });
      }

      const total = data.length;

      const active =
        data.filter(
          x => x.status === 'active'
        ).length;

      const inactive =
        data.filter(
          x => x.status !== 'active'
        ).length;

      return res.json({
        success: true,
        stats: {
          total,
          active,
          inactive
        }
      });

    } catch (err) {
      console.error('❌ STATS ERROR:', err);

      return res.status(500).json({
        success: false
      });
    }
  }
);

// ─────────────────────────────────────────────
// GET LICENSES
// ─────────────────────────────────────────────
app.get(
  '/admin/licenses',
  verifyAdmin,
  async (req, res) => {
    try {
      if (isOfflineMode) {
        return res.json({
          success: true,
          licenses: []
        });
      }

      const { data, error } =
        await supabase
          .from('licenses')
          .select('*')
          .order('created_at', {
            ascending: false
          });

      if (error) {
        console.error('❌ LICENSE FETCH ERROR:', error);

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

      return res.status(500).json({
        success: false
      });
    }
  }
);

// ─────────────────────────────────────────────
// BACKWARD COMPATIBILITY ROUTE
// ─────────────────────────────────────────────
app.post(
  '/admin/create-license',
  verifyAdmin,
  createLimiter,
  async (req, res) => {

    req.url = '/admin/licenses/generate';

    return app._router.handle(req, res);
  }
);

// ─────────────────────────────────────────────
// GENERATE LICENSE
// ─────────────────────────────────────────────
app.post(
  '/admin/licenses/generate',
  verifyAdmin,
  createLimiter,
  async (req, res) => {

    try {

      console.log('─────────────────────────────────────');
      console.log('📥 CREATE LICENSE REQUEST');
      console.log('BODY:', req.body);
      console.log('─────────────────────────────────────');

      if (isOfflineMode) {
        return res.json({
          success: true,
          license: {
            license_key: 'OFFLINE-MODE',
            status: 'inactive'
          }
        });
      }

      function generateLicenseKey() {

        const chars =
          'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

        const part = (length) => {

          let result = '';

          for (let i = 0; i < length; i++) {

            result += chars.charAt(
              Math.floor(
                Math.random() * chars.length
              )
            );
          }

          return result;
        };

        return `JFY-${part(4)}-${part(4)}-${part(4)}`;
      }

      // FRONTEND SUPPORT
      const plan =
        req.body.plan ||
        req.body.duration ||
        '1m';

      let expires_at = null;

      if (plan !== 'lifetime') {

        const now = new Date();

        if (
          plan === 'monthly' ||
          plan === '1m'
        ) {
          now.setMonth(now.getMonth() + 1);
        }

        else if (
          plan === 'yearly' ||
          plan === '1y'
        ) {
          now.setFullYear(now.getFullYear() + 1);
        }

        else if (
          plan === '1d'
        ) {
          now.setDate(now.getDate() + 1);
        }

        expires_at = now.toISOString();
      }

      const generatedKey =
        generateLicenseKey();

      console.log('🔑 GENERATED:', generatedKey);
      console.log('📅 PLAN:', plan);
      console.log('📅 EXPIRES:', expires_at);

      const insertPayload = {
        license_key: generatedKey,
        plan_type: plan,
        status: 'inactive',
        device_id: null,
        created_at: new Date().toISOString(),
        expires_at: expires_at
      };

      console.log('📦 INSERT PAYLOAD:');
      console.log(insertPayload);

      const { data, error } =
        await supabase
          .from('licenses')
          .insert([
            insertPayload
          ])
          .select();

      // ─────────────────────────
      // FULL ERROR LOGGING
      // ─────────────────────────
      if (error) {

        console.error('❌ FULL SUPABASE INSERT ERROR');

        console.error({
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });

        return res.status(500).json({
          success: false,
          error: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
      }

      if (!data || data.length === 0) {

        console.error(
          '❌ INSERT RETURNED EMPTY DATA'
        );

        return res.status(500).json({
          success: false,
          error:
            'INSERT_RETURNED_NO_DATA'
        });
      }

      console.log('✅ LICENSE CREATED SUCCESSFULLY');
      console.log(data[0]);

      await logAudit(
        'CREATE_LICENSE',
        'admin',
        req,
        {
          license_key: generatedKey,
          plan_type: plan
        }
      );

      return res.json({
        success: true,
        licenseKey: data[0].license_key,
        license: data[0]
      });

    } catch (err) {

      console.error(
        '❌ GENERATE LICENSE CRASH'
      );

      console.error({
        message: err?.message,
        stack: err?.stack,
        cause: err?.cause
      });

      return res.status(500).json({
        success: false,
        error: err?.message || 'INTERNAL_SERVER_ERROR'
      });
    }
  }
);

// ─────────────────────────────────────────────
// VERIFY LICENSE
// ─────────────────────────────────────────────
app.post(
  '/verify-license',
  verifyLimiter,
  async (req, res) => {

    try {

      const {
        licenseKey,
        fingerprint
      } = req.body;

      if (isOfflineMode) {

        return res.json({
          success: false,
          activated: false,
          error: 'OFFLINE_MODE'
        });
      }

      if (
        !licenseKey ||
        typeof licenseKey !== 'string'
      ) {

        await logAudit(
          'VERIFY_FAILED',
          'system',
          req,
          {
            error: 'INVALID_LICENSE'
          }
        );

        return res.json({
          success: false,
          activated: false,
          error: 'INVALID_LICENSE'
        });
      }

      const cleanKey =
        licenseKey.trim();

      const { data, error } =
        await supabase
          .from('licenses')
          .select('*')
          .eq(
            'license_key',
            cleanKey
          )
          .limit(1);

      if (error) {

        console.error(
          '❌ VERIFY QUERY ERROR:',
          error
        );

        return res.json({
          success: false,
          activated: false,
          error: 'NETWORK_ERROR'
        });
      }

      const license = data?.[0];

      if (!license) {

        await logAudit(
          'VERIFY_FAILED',
          'system',
          req,
          {
            error: 'INVALID_LICENSE'
          }
        );

        return res.json({
          success: false,
          activated: false,
          error: 'INVALID_LICENSE'
        });
      }

      // ─────────────────────────
      // EXPIRED LICENSE CHECK
      // ─────────────────────────
      if (
        license.expires_at &&
        new Date(license.expires_at) < new Date()
      ) {

        return res.json({
          success: false,
          activated: false,
          error: 'LICENSE_EXPIRED'
        });
      }

      // ─────────────────────────
      // DEVICE CHECK
      // ─────────────────────────
      if (
        license.device_id &&
        fingerprint
      ) {

        if (
          license.device_id !==
          fingerprint
        ) {

          return res.json({
            success: false,
            activated: false,
            error: 'DEVICE_MISMATCH'
          });
        }
      }

      // ─────────────────────────
      // FIRST ACTIVATION
      // ─────────────────────────
      if (
        !license.device_id &&
        fingerprint
      ) {

        const {
          error: updateError
        } = await supabase
          .from('licenses')
          .update({
            device_id: fingerprint,
            status: 'active',
            activated_at:
              new Date().toISOString()
          })
          .eq(
            'license_key',
            cleanKey
          );

        if (updateError) {

          console.error(
            '❌ ACTIVATION UPDATE ERROR:',
            updateError
          );

          return res.json({
            success: false,
            activated: false,
            error: 'UPDATE_FAILED'
          });
        }

        await logAudit(
          'ACTIVATE',
          'system',
          req,
          {
            license_id: cleanKey,
            device_id: fingerprint
          }
        );

        return res.json({
          success: true,
          activated: true,
          firstActivation: true
        });
      }

      // ─────────────────────────
      // ALREADY ACTIVATED
      // ─────────────────────────
      return res.json({
        success: true,
        activated: true,
        firstActivation: false
      });

    } catch (err) {

      console.error(
        '❌ VERIFY ERROR:',
        err
      );

      return res.status(500).json({
        success: false,
        activated: false,
        error: 'NETWORK_ERROR'
      });
    }
  }
);

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT =
  process.env.PORT || 3000;

app.listen(PORT, () => {

  console.log(
    `🚀 SERVER RUNNING ON PORT ${PORT}`
  );
});