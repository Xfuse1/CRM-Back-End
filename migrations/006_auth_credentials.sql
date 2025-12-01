-- Add auth_credentials column for RemoteAuth session persistence
-- Run this in Supabase SQL Editor

-- Add auth_credentials column to store the WhatsApp session ZIP (base64 encoded)
-- This allows sessions to persist across server restarts and deploys
ALTER TABLE whatsapp_sessions
ADD COLUMN IF NOT EXISTS auth_credentials TEXT;

-- Add comment for documentation
COMMENT ON COLUMN whatsapp_sessions.auth_credentials IS 'WhatsApp session credentials (ZIP file as base64 string) for RemoteAuth persistence';

-- Note: This column stores a base64-encoded ZIP file containing the WhatsApp Web session data
-- The ZIP file is created by whatsapp-web.js RemoteAuth and contains browser session files
-- This allows the WhatsApp connection to persist without requiring QR code re-scan
