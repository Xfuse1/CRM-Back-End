/**
 * WhatsApp Repository using Prisma
 * Direct database access without Supabase client
 */

import prisma from './client';
import logger from '../../utils/logger';

// ============================================
// Owner ID Context
// ============================================

// Current owner ID - set per-request from authenticated user
let currentOwnerId: string | null = null;

// System owner ID for background tasks (like session initialization)
const SYSTEM_OWNER_ID = 'system';

/**
 * Set the current owner ID for all subsequent repository operations
 * Should be called at the beginning of each request with the authenticated user's ID
 */
export function setCurrentOwnerId(ownerId: string): void {
  currentOwnerId = ownerId;
}

/**
 * Get the current owner ID
 * Returns system owner if not set (for background operations)
 */
export function getOwnerId(): string {
  return currentOwnerId || SYSTEM_OWNER_ID;
}

/**
 * Check if we have an authenticated user context
 */
export function hasAuthenticatedOwner(): boolean {
  return currentOwnerId !== null && currentOwnerId !== SYSTEM_OWNER_ID;
}

// ============================================
// Session Management
// ============================================

export async function ensureSessionForKey(sessionKey: string, ownerId?: string, retries = 3): Promise<any> {
  const ownerIdToUse = ownerId || getOwnerId();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Try to find existing session
      let session = await prisma.whatsappWebSession.findFirst({
        where: {
          ownerId: ownerIdToUse,
          sessionKey: sessionKey,
        },
      });

      if (session) {
        return session;
      }

      // Create new session
      session = await prisma.whatsappWebSession.create({
        data: {
          ownerId: ownerIdToUse,
          sessionKey: sessionKey,
          status: 'disconnected',
        },
      });

      return session;
    } catch (error: any) {
      if (attempt < retries) {
        logger.warn(`[Prisma] Connection attempt ${attempt} failed, retrying in ${attempt * 2}s...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      } else {
        throw new Error(`Failed to ensure session after ${retries} attempts: ${error.message}`);
      }
    }
  }
}

export async function updateSessionStatus(
  sessionKey: string,
  status: string,
  lastQr?: string | null
): Promise<void> {
  const updateData: any = {
    status,
    updatedAt: new Date(),
  };

  if (lastQr !== undefined) {
    updateData.lastQr = lastQr;
  }

  if (status === 'connected') {
    updateData.lastConnectedAt = new Date();
  }

  await prisma.whatsappWebSession.updateMany({
    where: {
      ownerId: getOwnerId(),
      sessionKey: sessionKey,
    },
    data: updateData,
  });
}

export async function getSessionData(sessionKey: string): Promise<any | null> {
  return prisma.whatsappWebSession.findFirst({
    where: { sessionKey },
  });
}

export async function updateSessionData(sessionKey: string, updates: any): Promise<void> {
  await prisma.whatsappWebSession.updateMany({
    where: { sessionKey },
    data: updates,
  });
}

// ============================================
// Contacts
// ============================================

export async function upsertContactFromMessage(
  jid: string,
  displayName?: string | null
): Promise<any> {
  // Try to find existing contact
  let contact = await prisma.contact.findFirst({
    where: {
      ownerId: getOwnerId(),
      waId: jid,
    },
  });

  if (contact) {
    // Update display name if provided
    if (displayName && displayName !== contact.displayName) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { displayName },
      });
    }
    return contact;
  }

  // Create new contact
  contact = await prisma.contact.create({
    data: {
      ownerId: getOwnerId(),
      waId: jid,
      displayName: displayName || null,
    },
  });

  return contact;
}

// ============================================
// Chats
// ============================================

export async function ensureChatForContact(
  sessionId: string,
  contactId: string
): Promise<any> {
  const waChatId = `${contactId}_${sessionId}`;

  // Try to find existing chat
  let chat = await prisma.chat.findFirst({
    where: {
      ownerId: getOwnerId(),
      sessionId: sessionId,
      contactId: contactId,
    },
  });

  if (chat) {
    return chat;
  }

  // Create new chat
  chat = await prisma.chat.create({
    data: {
      ownerId: getOwnerId(),
      sessionId: sessionId,
      contactId: contactId,
      waChatId: waChatId,
      type: 'single',
    },
  });

  return chat;
}

export async function updateChatLastMessage(chatId: string): Promise<void> {
  await prisma.chat.update({
    where: { id: chatId },
    data: { lastMessageAt: new Date() },
  });
}

export async function listChatsWithLastMessage(): Promise<any[]> {
  const chats = await prisma.chat.findMany({
    where: { ownerId: getOwnerId() },
    include: {
      contact: {
        select: {
          displayName: true,
          waId: true,
        },
      },
    },
    orderBy: { lastMessageAt: 'desc' },
    take: 50,
  });

  return chats.map((chat: any) => {
    // Format phone number for display (remove WhatsApp suffixes)
    let phoneNumber = chat.contact?.waId || null;
    if (phoneNumber) {
      phoneNumber = phoneNumber.replace(/@(s\.whatsapp\.net|c\.us)$/, '');
    }
    
    return {
      ...chat,
      // Priority: displayName > chat.title > phone number
      title: chat.contact?.displayName || chat.title || phoneNumber || 'محادثة',
      contactJid: chat.contact?.waId || null, // Include contact JID for sending messages
    };
  });
}

// ============================================
// Messages
// ============================================

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
}): Promise<any> {
  // Check if message already exists
  const existing = await prisma.message.findFirst({
    where: { waMessageId: params.waMessageId },
  });

  if (existing) {
    return existing;
  }

  // Insert new message
  const message = await prisma.message.create({
    data: {
      ownerId: getOwnerId(),
      sessionId: params.sessionId,
      chatId: params.chatId,
      direction: params.direction,
      waMessageId: params.waMessageId,
      fromJid: params.fromJid,
      toJid: params.toJid,
      body: params.body,
      sentAt: params.sentAt,
      raw: params.raw as any,
      status: params.direction === 'out' ? 'sent' : null,
    },
  });

  return message;
}

export async function listMessagesForChat(
  chatId: string,
  options?: {
    limit?: number;
    offset?: number;
    beforeTimestamp?: string;
  }
): Promise<any[]> {
  const limit = options?.limit || 100; // Increase default limit
  const offset = options?.offset || 0;

  const where: any = {
    ownerId: getOwnerId(),
    chatId: chatId,
  };

  if (options?.beforeTimestamp) {
    where.createdAt = { lt: new Date(options.beforeTimestamp) };
  }

  // Get messages ordered by date ascending (oldest first)
  return prisma.message.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    skip: offset,
    take: limit,
  });
}

export async function getMessageCount(chatId: string): Promise<number> {
  return prisma.message.count({
    where: {
      ownerId: getOwnerId(),
      chatId: chatId,
    },
  });
}

// ============================================
// AI Agent
// ============================================

export async function getAISettings(ownerId: string): Promise<any | null> {
  return prisma.aiAgentSettings.findUnique({
    where: { ownerId },
  });
}

export async function updateAISettings(
  ownerId: string,
  settings: any
): Promise<any> {
  return prisma.aiAgentSettings.upsert({
    where: { ownerId },
    update: { ...settings, updatedAt: new Date() },
    create: { ownerId, ...settings },
  });
}

export async function saveAIConversation(params: {
  chatId: string;
  userMessage: string;
  aiResponse: string;
  responseTimeMs: number;
  modelUsed: string;
  tokensUsed?: number;
}): Promise<any> {
  return prisma.aiConversation.create({
    data: {
      chatId: params.chatId,
      userMessage: params.userMessage,
      aiResponse: params.aiResponse,
      responseTimeMs: params.responseTimeMs,
      modelUsed: params.modelUsed,
      tokensUsed: params.tokensUsed || null,
    },
  });
}

export async function getConversationContext(
  chatId: string,
  limit: number = 5
): Promise<Array<{ role: string; content: string }>> {
  const messages = await prisma.message.findMany({
    where: { chatId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      direction: true,
      body: true,
    },
  });

  return messages.reverse().map((m: any) => ({
    role: m.direction === 'in' ? 'user' : 'assistant',
    content: m.body || '',
  }));
}

// ============================================
// Session Cleanup
// ============================================

export async function cleanupExpiredSessions(): Promise<number> {
  const result = await prisma.whatsappWebSession.updateMany({
    where: {
      expiresAt: { lt: new Date() },
      isActive: true,
    },
    data: { isActive: false },
  });

  return result.count;
}

export async function getActiveSessionsForOwner(ownerId: string): Promise<any[]> {
  return prisma.whatsappWebSession.findMany({
    where: {
      ownerId,
      isActive: true,
    },
    orderBy: { lastConnectedAt: 'desc' },
  });
}

// ============================================
// AI Stats
// ============================================

export async function getAIStats(ownerId: string): Promise<{
  totalConversations: number;
  successfulResponses: number;
  avgResponseTimeMs: number;
} | null> {
  try {
    // Count total conversations
    const totalConversations = await prisma.aiConversation.count({
      where: { ownerId },
    });

    // Count successful responses (where aiResponse is not null)
    const successfulResponses = await prisma.aiConversation.count({
      where: { 
        ownerId,
        aiResponse: { not: null },
      },
    });

    // Calculate average response time
    const avgResult = await prisma.aiConversation.aggregate({
      where: { 
        ownerId,
        responseTimeMs: { not: null },
      },
      _avg: {
        responseTimeMs: true,
      },
    });

    return {
      totalConversations,
      successfulResponses,
      avgResponseTimeMs: Math.round(avgResult._avg.responseTimeMs || 0),
    };
  } catch (error) {
    return null;
  }
}
