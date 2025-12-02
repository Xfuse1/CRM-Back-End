-- Migration: Add WhatsApp Baileys Sessions Table
-- This table stores Baileys auth state as binary data for persistence across server restarts

-- Create the table for Baileys session storage
CREATE TABLE IF NOT EXISTS whatsapp_baileys_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id TEXT UNIQUE NOT NULL,
    data BYTEA,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_whatsapp_baileys_sessions_owner_id ON whatsapp_baileys_sessions(owner_id);

-- Add comment
COMMENT ON TABLE whatsapp_baileys_sessions IS 'Stores Baileys WhatsApp auth state for session persistence';
COMMENT ON COLUMN whatsapp_baileys_sessions.owner_id IS 'Unique identifier for the session owner';
COMMENT ON COLUMN whatsapp_baileys_sessions.data IS 'Serialized auth state as binary (JSON with BufferJSON)';

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_whatsapp_baileys_sessions_updated_at ON whatsapp_baileys_sessions;
CREATE TRIGGER update_whatsapp_baileys_sessions_updated_at
    BEFORE UPDATE ON whatsapp_baileys_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
