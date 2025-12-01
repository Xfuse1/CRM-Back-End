-- Update whatsapp_sessions table to store session data
-- Run this in Supabase SQL Editor

-- Add session_data column to store serialized session
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS session_data JSONB,
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS reconnect_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Create index for faster session lookups
CREATE INDEX IF NOT EXISTS whatsapp_sessions_owner_active_idx 
ON whatsapp_sessions(owner_id, is_active);

CREATE INDEX IF NOT EXISTS whatsapp_sessions_expires_idx 
ON whatsapp_sessions(expires_at);

-- Add comments for documentation
COMMENT ON COLUMN whatsapp_sessions.session_data IS 'Serialized WhatsApp session data for persistence';
COMMENT ON COLUMN whatsapp_sessions.expires_at IS 'Session expiration timestamp';
COMMENT ON COLUMN whatsapp_sessions.is_active IS 'Whether the session is currently active';
COMMENT ON COLUMN whatsapp_sessions.reconnect_attempts IS 'Number of reconnection attempts';
COMMENT ON COLUMN whatsapp_sessions.last_error IS 'Last error message if any';
