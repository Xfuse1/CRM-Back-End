-- Migration 005: AI Agent Configuration
-- Adds tables for AI agent management and conversation history

-- ============================================
-- 1. AI Agent Settings Table
-- ============================================

CREATE TABLE IF NOT EXISTS ai_agent_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  system_prompt TEXT,
  auto_reply_delay_seconds INTEGER DEFAULT 2,
  max_tokens INTEGER DEFAULT 200,
  temperature DECIMAL(3,2) DEFAULT 0.7,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT ai_agent_settings_owner_unique UNIQUE (owner_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_settings_owner 
ON ai_agent_settings(owner_id);

COMMENT ON TABLE ai_agent_settings IS 
'AI agent configuration per owner. Controls auto-reply behavior.';

COMMENT ON COLUMN ai_agent_settings.is_enabled IS 
'Whether AI auto-reply is enabled for this owner';

COMMENT ON COLUMN ai_agent_settings.auto_reply_delay_seconds IS 
'Delay before sending auto-reply (to seem more natural)';

-- ============================================
-- 2. AI Conversations Table
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL,
  ai_response TEXT,
  response_time_ms INTEGER,
  model_used VARCHAR(100) DEFAULT 'gemini-2.0-flash-exp',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_chat 
ON ai_conversations(chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_owner 
ON ai_conversations(owner_id, created_at DESC);

COMMENT ON TABLE ai_conversations IS 
'Stores AI conversation history for analytics and context';

COMMENT ON COLUMN ai_conversations.response_time_ms IS 
'Time taken to generate AI response (milliseconds)';

-- ============================================
-- 3. AI Agent Statistics View
-- ============================================

CREATE OR REPLACE VIEW ai_agent_stats AS
SELECT 
  owner_id,
  COUNT(*) as total_conversations,
  COUNT(CASE WHEN ai_response IS NOT NULL THEN 1 END) as successful_responses,
  COUNT(CASE WHEN ai_response IS NULL THEN 1 END) as failed_responses,
  AVG(response_time_ms) as avg_response_time_ms,
  SUM(tokens_used) as total_tokens_used,
  MAX(created_at) as last_conversation_at
FROM ai_conversations
GROUP BY owner_id;

COMMENT ON VIEW ai_agent_stats IS 
'AI agent performance statistics per owner';

-- ============================================
-- 4. Function to Get Recent Conversation Context
-- ============================================

CREATE OR REPLACE FUNCTION get_conversation_context(
  p_chat_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  role TEXT,
  content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN user_message IS NOT NULL THEN 'user'::TEXT
      ELSE 'model'::TEXT
    END as role,
    COALESCE(user_message, ai_response) as content,
    ac.created_at
  FROM ai_conversations ac
  WHERE ac.chat_id = p_chat_id
  ORDER BY ac.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_conversation_context IS 
'Get recent conversation history for AI context (last N messages)';

-- ============================================
-- 5. Insert Default AI Agent Settings
-- ============================================

-- This will be created when owner registers
-- For now, we'll add a trigger to auto-create settings on profile creation

CREATE OR REPLACE FUNCTION create_default_ai_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ai_agent_settings (owner_id, is_enabled, system_prompt)
  VALUES (
    NEW.id,
    false,
    'أنت مساعد ذكي لخدمة العملاء. أجب بطريقة مهذبة ومفيدة.'
  )
  ON CONFLICT (owner_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_ai_settings
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION create_default_ai_settings();

COMMENT ON FUNCTION create_default_ai_settings IS 
'Auto-creates AI agent settings when new profile is created';
