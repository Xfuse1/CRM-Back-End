-- Migration 004: Prevent Duplicate Messages and Optimize Performance
-- Run this migration to add unique constraints, indexes, and deduplication

-- ============================================
-- 1. Add Unique Constraint on Messages (Prevent Duplicate Messages)
-- ============================================

-- Add unique constraint on wa_message_id to prevent duplicate messages
ALTER TABLE messages
ADD CONSTRAINT messages_wa_message_id_unique UNIQUE (wa_message_id);

COMMENT ON CONSTRAINT messages_wa_message_id_unique ON messages IS 
'Ensures no duplicate WhatsApp messages are stored';

-- ============================================
-- 2. Add Unique Constraint on Chats (Prevent Duplicate Chats)
-- ============================================

-- Add unique constraint on owner_id + wa_chat_id to prevent duplicate chats
ALTER TABLE chats
ADD CONSTRAINT chats_owner_wa_chat_unique UNIQUE (owner_id, wa_chat_id);

COMMENT ON CONSTRAINT chats_owner_wa_chat_unique ON chats IS 
'Ensures no duplicate chats per owner';

-- ============================================
-- 3. Add Unique Constraint on Contacts (Prevent Duplicate Contacts)
-- ============================================

-- Add unique constraint on owner_id + wa_id to prevent duplicate contacts
ALTER TABLE contacts
ADD CONSTRAINT contacts_owner_wa_id_unique UNIQUE (owner_id, wa_id);

COMMENT ON CONSTRAINT contacts_owner_wa_id_unique ON contacts IS 
'Ensures no duplicate contacts per owner';

-- ============================================
-- 4. Performance Indexes
-- ============================================

-- Index on profiles.email for faster login/registration lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Index on chats for faster chat listing (sorted by last message)
CREATE INDEX IF NOT EXISTS idx_chats_owner_last_message 
ON chats(owner_id, last_message_at DESC NULLS LAST);

-- Index on messages for faster message retrieval per chat
CREATE INDEX IF NOT EXISTS idx_messages_chat_created 
ON messages(chat_id, created_at DESC);

-- Index on contacts for faster contact lookups
CREATE INDEX IF NOT EXISTS idx_contacts_owner_wa_id 
ON contacts(owner_id, wa_id);

-- Index on contacts for phone number search
CREATE INDEX IF NOT EXISTS idx_contacts_phone 
ON contacts(phone);

-- Index on messages for full-text search (optional - if needed later)
-- CREATE INDEX IF NOT EXISTS idx_messages_body_fts 
-- ON messages USING gin(to_tsvector('english', body));

-- ============================================
-- 5. Add API Request Deduplication Table
-- ============================================

CREATE TABLE IF NOT EXISTS api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  response_status INTEGER,
  response_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

-- Index for faster idempotency key lookups
CREATE INDEX IF NOT EXISTS idx_api_requests_idempotency 
ON api_requests(idempotency_key);

-- Index for cleanup of expired requests
CREATE INDEX IF NOT EXISTS idx_api_requests_expires 
ON api_requests(expires_at);

COMMENT ON TABLE api_requests IS 
'Stores API request idempotency keys to prevent duplicate requests (24-hour retention)';

COMMENT ON COLUMN api_requests.idempotency_key IS 
'Unique key provided by client to prevent duplicate requests';

COMMENT ON COLUMN api_requests.expires_at IS 
'Requests older than 24 hours are automatically cleaned up';

-- ============================================
-- 6. Add Function to Clean Expired Requests
-- ============================================

CREATE OR REPLACE FUNCTION cleanup_expired_api_requests()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_requests
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_api_requests() IS 
'Deletes expired API requests (older than 24 hours). Run daily via cron job.';
