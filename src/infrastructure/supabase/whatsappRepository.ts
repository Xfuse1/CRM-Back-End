/**
 * WhatsApp Repository - Re-exports from Prisma repository
 * This file maintains backward compatibility while using Prisma under the hood
 */

// Re-export everything from the Prisma repository
export * from '../prisma/whatsappRepository';

// Keep type definitions for backward compatibility
export interface WhatsAppSessionRow {
  id: string;
  owner_id: string;
  session_key: string;
  phone_number: string | null;
  status: string;
  last_qr: string | null;
  last_connected_at: string | null;
  meta: unknown;
  session_data?: any;
  auth_credentials?: string | null;
  expires_at?: string | null;
  is_active?: boolean;
  reconnect_attempts?: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContactRow {
  id: string;
  owner_id: string;
  wa_id: string | null;
  phone: string | null;
  display_name: string | null;
  tags: string[];
  created_at: string;
}

export interface ChatRow {
  id: string;
  owner_id: string;
  session_id: string;
  contact_id: string | null;
  type: string;
  title: string | null;
  last_message_at: string | null;
  unread_count: number;
  created_at: string;
}

export interface MessageRow {
  id: string;
  owner_id: string;
  session_id: string;
  chat_id: string;
  direction: string;
  wa_message_id: string | null;
  from_jid: string | null;
  to_jid: string | null;
  body: string | null;
  status: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  raw: unknown;
  created_at: string;
}

export interface AIAgentSettingsRow {
  id: string;
  owner_id: string;
  is_enabled: boolean;
  system_prompt: string | null;
  auto_reply_delay_seconds: number;
  max_tokens: number;
  temperature: number;
  created_at: string;
  updated_at: string;
}

export interface AIConversationRow {
  id: string;
  owner_id: string;
  chat_id: string;
  contact_id: string;
  user_message: string;
  ai_response: string | null;
  response_time_ms: number | null;
  model_used: string;
  tokens_used: number | null;
  created_at: string;
}
