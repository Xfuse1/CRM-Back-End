-- Create WhatsApp sessions table for Baileys
CREATE TABLE IF NOT EXISTS whatsapp_baileys_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT UNIQUE NOT NULL,
  data BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create WhatsApp sessions table for whatsapp-web.js
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  session_key TEXT NOT NULL,
  phone_number TEXT,
  status TEXT DEFAULT 'disconnected',
  last_qr TEXT,
  last_connected_at TIMESTAMPTZ,
  meta JSONB,
  session_data JSONB,
  auth_credentials TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  reconnect_attempts INT DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, session_key)
);

-- Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  wa_id TEXT,
  phone TEXT,
  display_name TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, wa_id)
);

-- Create chats table
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id),
  wa_chat_id TEXT,
  type TEXT DEFAULT 'single',
  title TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_id, wa_chat_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chat_id UUID NOT NULL REFERENCES chats(id),
  direction TEXT NOT NULL,
  wa_message_id TEXT,
  from_jid TEXT,
  to_jid TEXT,
  body TEXT,
  status TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI agent settings table
CREATE TABLE IF NOT EXISTS ai_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT UNIQUE NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  system_prompt TEXT,
  auto_reply_delay_seconds INT DEFAULT 2,
  max_tokens INT DEFAULT 500,
  temperature FLOAT DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create AI conversations table
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT,
  chat_id TEXT NOT NULL,
  contact_id TEXT,
  user_message TEXT NOT NULL,
  ai_response TEXT,
  response_time_ms INT,
  model_used TEXT NOT NULL,
  tokens_used INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_owner ON whatsapp_sessions(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_chats_owner ON chats(owner_id);
CREATE INDEX IF NOT EXISTS idx_chats_session ON chats(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
