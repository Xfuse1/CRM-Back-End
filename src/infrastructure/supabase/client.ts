import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

// Log Supabase connection info (without sensitive data)
console.log(`[Supabase] Initializing client for: ${config.supabaseUrl}`);
console.log(`[Supabase] Service role key present: ${config.supabaseServiceRoleKey ? 'Yes' : 'No'}`);

export const supabaseAdmin: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
  }
);

// Test connection on startup
(async () => {
  try {
    const { error } = await supabaseAdmin.from('whatsapp_sessions').select('id').limit(1);
    if (error) {
      console.error(`[Supabase] Connection test failed: ${error.message}`);
    } else {
      console.log('[Supabase] Connection test successful');
    }
  } catch (e) {
    console.error('[Supabase] Connection test error:', e);
  }
})();
