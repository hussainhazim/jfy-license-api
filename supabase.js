// supabase.js — single source of truth for the Supabase client.
// This module is imported by server.js and any route file that needs DB access.

const { createClient } = require('@supabase/supabase-js');

let supabase;

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );
} else {
  console.warn('⚠️ Running Supabase in offline mock mode.');
  supabase = {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: null, error: { message: 'Offline mode active' } })
        }),
        order: () => ({
          limit: () => Promise.resolve({ data: [], error: { message: 'Offline mode active' } })
        })
      }),
      insert: () => Promise.resolve({ data: null, error: { message: 'Offline mode active' } }),
      update: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: 'Offline mode active' } })
      }),
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: { message: 'Offline mode active' } })
      })
    })
  };
}

module.exports = { supabase };
