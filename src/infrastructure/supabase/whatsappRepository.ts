import { supabaseAdmin } from './client';
import { config } from '../../config/env';

// Database row types
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
  auth_credentials?: string | null;  // WhatsApp session credentials (ZIP base64)
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

// AI Agent types
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

/**
 * Ensure a WhatsApp session exists for the given session key
 */
export async function ensureSessionForKey(sessionKey: string): Promise<WhatsAppSessionRow> {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('*')
    .eq('owner_id', config.demoOwnerId)
    .eq('session_key', sessionKey)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    // PGRST116 = not found, which is expected
    throw new Error(`Failed to check session: ${selectError.message}`);
  }

  if (existing) {
    return existing as WhatsAppSessionRow;
  }

  // Insert new session
  const { data: newSession, error: insertError } = await supabaseAdmin
    .from('whatsapp_sessions')
    .insert({
      owner_id: config.demoOwnerId,
      session_key: sessionKey,
      status: 'disconnected',
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create session: ${insertError.message}`);
  }

  return newSession as WhatsAppSessionRow;
}

/**
 * Update session status and optionally QR code
 */
export async function updateSessionStatus(
  sessionKey: string,
  status: string,
  lastQr?: string | null
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (lastQr !== undefined) {
    updateData.last_qr = lastQr;
  }

  if (status === 'connected') {
    updateData.last_connected_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .update(updateData)
    .eq('owner_id', config.demoOwnerId)
    .eq('session_key', sessionKey);

  if (error) {
    throw new Error(`Failed to update session status: ${error.message}`);
  }
}

/**
 * Upsert a contact from a WhatsApp message
 */
export async function upsertContactFromMessage(
  jid: string,
  displayName?: string | null
): Promise<ContactRow> {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('owner_id', config.demoOwnerId)
    .eq('wa_id', jid)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(`Failed to check contact: ${selectError.message}`);
  }

  if (existing) {
    // Always update display name if provided (to sync with WhatsApp changes)
    if (displayName) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('contacts')
        .update({ display_name: displayName })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        throw new Error(`Failed to update contact: ${updateError.message}`);
      }

      return updated as ContactRow;
    }

    return existing as ContactRow;
  }

  // Insert new contact with conflict handling (upsert)
  const { data: newContact, error: insertError } = await supabaseAdmin
    .from('contacts')
    .upsert(
      {
        owner_id: config.demoOwnerId,
        wa_id: jid,
        display_name: displayName || null,
      },
      {
        onConflict: 'owner_id,wa_id',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create contact: ${insertError.message}`);
  }

  return newContact as ContactRow;
}

/**
 * Ensure a chat exists for a given session and contact
 */
export async function ensureChatForContact(
  sessionId: string,
  contactId: string
): Promise<ChatRow> {
  const { data: existing, error: selectError } = await supabaseAdmin
    .from('chats')
    .select('*')
    .eq('owner_id', config.demoOwnerId)
    .eq('session_id', sessionId)
    .eq('contact_id', contactId)
    .single();

  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(`Failed to check chat: ${selectError.message}`);
  }

  if (existing) {
    return existing as ChatRow;
  }

  // Insert new chat with upsert to handle duplicates
  const { data: newChat, error: insertError } = await supabaseAdmin
    .from('chats')
    .upsert(
      {
        owner_id: config.demoOwnerId,
        session_id: sessionId,
        contact_id: contactId,
        wa_chat_id: `${contactId}_${sessionId}`,
        type: 'single',
      },
      {
        onConflict: 'owner_id,wa_chat_id',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single();

  if (insertError) {
    throw new Error(`Failed to create chat: ${insertError.message}`);
  }

  return newChat as ChatRow;
}

/**
 * Insert a new message
 */
export async function insertMessage(params: {
  sessionId: string;
  chatId: string;
  direction: string;
  waMessageId: string;
  fromJid: string | null;
  toJid: string | null;
  body: string;
  sentAt: Date;
  raw: unknown;
}): Promise<MessageRow> {
  // First check if message already exists
  const { data: existing } = await supabaseAdmin
    .from('messages')
    .select('*')
    .eq('wa_message_id', params.waMessageId)
    .single();

  if (existing) {
    return existing as MessageRow;
  }

  // Insert new message
  const { data: message, error } = await supabaseAdmin
    .from('messages')
    .insert({
      owner_id: config.demoOwnerId,
      session_id: params.sessionId,
      chat_id: params.chatId,
      direction: params.direction,
      wa_message_id: params.waMessageId,
      from_jid: params.fromJid,
      to_jid: params.toJid,
      body: params.body,
      sent_at: params.sentAt.toISOString(),
      raw: params.raw,
      status: params.direction === 'out' ? 'sent' : null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to insert message: ${error.message}`);
  }

  return message as MessageRow;
}

/**
 * Update chat's last message timestamp
 */
export async function updateChatLastMessage(chatId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('chats')
    .update({
      last_message_at: new Date().toISOString(),
    })
    .eq('id', chatId)
    .eq('owner_id', config.demoOwnerId);

  if (error) {
    throw new Error(`Failed to update chat last message: ${error.message}`);
  }
}

/**
 * List chats with their last message timestamp and contact info
 */
export async function listChatsWithLastMessage(): Promise<ChatRow[]> {
  const { data, error } = await supabaseAdmin
    .from('chats')
    .select(`
      *,
      contacts:contact_id (
        display_name,
        wa_id
      )
    `)
    .eq('owner_id', config.demoOwnerId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(50);

  if (error) {
    throw new Error(`Failed to list chats: ${error.message}`);
  }

  // Map the joined data to include title from contact
  return (data || []).map((chat: any) => ({
    ...chat,
    title: chat.contacts?.display_name || chat.title || null,
  })) as ChatRow[];
}

/**
 * List messages for a specific chat with pagination
 */
export async function listMessagesForChat(
  chatId: string,
  options?: {
    limit?: number;
    offset?: number;
    beforeTimestamp?: string; // For cursor-based pagination
  }
): Promise<MessageRow[]> {
  const limit = options?.limit || 50; // Default 50 messages per page
  const offset = options?.offset || 0;

  let query = supabaseAdmin
    .from('messages')
    .select('*')
    .eq('owner_id', config.demoOwnerId)
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false }); // Most recent first

  // Cursor-based pagination (for infinite scroll)
  if (options?.beforeTimestamp) {
    query = query.lt('created_at', options.beforeTimestamp);
  }

  // Offset-based pagination (for traditional pagination)
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list messages: ${error.message}`);
  }

  return (data || []) as MessageRow[];
}

/**
 * Get total message count for a chat
 */
export async function getMessageCount(chatId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', config.demoOwnerId)
    .eq('chat_id', chatId);

  if (error) {
    throw new Error(`Failed to count messages: ${error.message}`);
  }

  return count || 0;
}

// ============================================
// Session Management Functions
// ============================================

/**
 * Update session data and metadata
 */
export async function updateSessionData(
  sessionKey: string,
  updates: Partial<WhatsAppSessionRow>
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .update(updates)
    .eq('session_key', sessionKey);

  if (error) {
    throw new Error(`Failed to update session data: ${error.message}`);
  }
}

/**
 * Get session data including session_data JSONB field
 */
export async function getSessionData(
  sessionKey: string
): Promise<WhatsAppSessionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('*')
    .eq('session_key', sessionKey)
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // Not found
      return null;
    }
    throw new Error(`Failed to get session data: ${error.message}`);
  }

  return data as WhatsAppSessionRow;
}

/**
 * Get all active sessions for a specific owner
 */
export async function getActiveSessionsForOwner(
  ownerId: string
): Promise<WhatsAppSessionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('is_active', true)
    .order('last_connected_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get active sessions: ${error.message}`);
  }

  return (data || []) as WhatsAppSessionRow[];
}

/**
 * Cleanup expired sessions (delete or mark inactive)
 * Returns the number of sessions cleaned up
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabaseAdmin
    .from('whatsapp_sessions')
    .update({ is_active: false })
    .lt('expires_at', now)
    .eq('is_active', true)
    .select('id');

  if (error) {
    throw new Error(`Failed to cleanup expired sessions: ${error.message}`);
  }

  return data?.length || 0;
}

// ==================== AI AGENT FUNCTIONS ====================

/**
 * Get AI agent settings for an owner
 */
export async function getAISettings(ownerId: string): Promise<AIAgentSettingsRow | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_agent_settings')
    .select('*')
    .eq('owner_id', ownerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No settings found, return null
      return null;
    }
    throw new Error(`Failed to get AI settings: ${error.message}`);
  }

  return data as AIAgentSettingsRow;
}

/**
 * Update AI agent settings for an owner
 * Creates settings if they don't exist (upsert)
 */
export async function updateAISettings(
  ownerId: string,
  settings: Partial<Omit<AIAgentSettingsRow, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>
): Promise<AIAgentSettingsRow> {
  const { data, error } = await supabaseAdmin
    .from('ai_agent_settings')
    .upsert(
      {
        owner_id: ownerId,
        ...settings,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: 'owner_id',
        ignoreDuplicates: false
      }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update AI settings: ${error.message}`);
  }

  return data as AIAgentSettingsRow;
}

/**
 * Save AI conversation to database
 */
export async function saveAIConversation(params: {
  chatId: string;
  userMessage: string;
  aiResponse: string;
  responseTimeMs: number;
  modelUsed: string;
  tokensUsed?: number;
}): Promise<AIConversationRow> {
  const { data, error } = await supabaseAdmin
    .from('ai_conversations')
    .insert({
      chat_id: params.chatId,
      user_message: params.userMessage,
      ai_response: params.aiResponse,
      response_time_ms: params.responseTimeMs,
      model_used: params.modelUsed,
      tokens_used: params.tokensUsed || null
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to save AI conversation: ${error.message}`);
  }

  return data as AIConversationRow;
}

/**
 * Get conversation context for AI (last N messages)
 */
export async function getConversationContext(
  chatId: string,
  limit: number = 5
): Promise<Array<{ role: string; content: string }>> {
  const { data, error } = await supabaseAdmin.rpc('get_conversation_context', {
    p_chat_id: chatId,
    p_limit: limit
  });

  if (error) {
    throw new Error(`Failed to get conversation context: ${error.message}`);
  }

  return data || [];
}

/**
 * Get AI agent statistics for an owner
 */
export async function getAIStats(ownerId: string): Promise<{
  totalConversations: number;
  successfulResponses: number;
  avgResponseTimeMs: number;
} | null> {
  const { data, error } = await supabaseAdmin
    .from('ai_agent_stats')
    .select('*')
    .eq('owner_id', ownerId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get AI stats: ${error.message}`);
  }

  return {
    totalConversations: data.total_conversations || 0,
    successfulResponses: data.successful_responses || 0,
    avgResponseTimeMs: Math.round(data.avg_response_time_ms || 0)
  };
}
