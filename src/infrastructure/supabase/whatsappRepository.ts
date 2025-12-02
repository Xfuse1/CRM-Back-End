/**
 * WhatsApp Repository - Re-exports from Prisma repository
 * This file maintains backward compatibility while using Prisma under the hood
 */

// Re-export everything from the Prisma repository
export * from '../prisma/whatsappRepository';

// Type definitions matching Prisma camelCase output
export interface WhatsAppSessionRow {
  id: string;
  ownerId: string;
  sessionKey: string;
  phoneNumber: string | null;
  status: string;
  lastQr: string | null;
  lastConnectedAt: Date | null;
  meta: unknown;
  sessionData?: any;
  authCredentials?: string | null;
  expiresAt?: Date | null;
  isActive?: boolean;
  reconnectAttempts?: number;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactRow {
  id: string;
  ownerId: string;
  waId: string | null;
  phone: string | null;
  displayName: string | null;
  tags: string[];
  createdAt: Date;
}

export interface ChatRow {
  id: string;
  ownerId: string;
  sessionId: string;
  contactId: string | null;
  type: string;
  title: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  contactJid?: string | null; // WhatsApp JID from contact.waId
  contact?: {
    displayName: string | null;
    waId: string | null;
  };
}

export interface MessageRow {
  id: string;
  ownerId: string;
  sessionId: string;
  chatId: string;
  direction: string;
  waMessageId: string | null;
  fromJid: string | null;
  toJid: string | null;
  body: string | null;
  status: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  raw: unknown;
  createdAt: Date;
}

export interface AIAgentSettingsRow {
  id: string;
  ownerId: string;
  isEnabled: boolean;
  systemPrompt: string | null;
  autoReplyDelaySeconds: number;
  maxTokens: number;
  temperature: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIConversationRow {
  id: string;
  ownerId: string;
  chatId: string;
  contactId: string;
  userMessage: string;
  aiResponse: string | null;
  responseTimeMs: number | null;
  modelUsed: string;
  tokensUsed: number | null;
  createdAt: Date;
}
