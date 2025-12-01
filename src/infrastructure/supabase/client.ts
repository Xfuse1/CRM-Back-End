import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../../config/env';

// TODO: Define database types based on Supabase schema
// TODO: Create tables for:
//   - whatsapp_sessions (id, session_id, phone_number, is_connected, created_at, updated_at)
//   - whatsapp_chats (id, session_id, chat_id, name, is_group, unread_count, last_message_at)
//   - whatsapp_messages (id, session_id, chat_id, from, to, body, timestamp, is_from_me, has_media)
//   - users (for multi-user support)
//   - ai_agent_configs (for auto-reply configuration)

export const supabaseAdmin: SupabaseClient = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
