import { Message } from 'whatsapp-web.js';
import * as whatsappRepo from '../../infrastructure/supabase/whatsappRepository';

export interface IncomingMessageResult {
  messageRow: whatsappRepo.MessageRow;
  chatRow: whatsappRepo.ChatRow;
  contactRow: whatsappRepo.ContactRow;
}

export interface OutgoingMessageResult {
  messageRow: whatsappRepo.MessageRow;
  chatRow: whatsappRepo.ChatRow;
  contactRow: whatsappRepo.ContactRow;
}

export class WhatsAppPersistenceService {
  /**
   * Ensure the default session exists in the database
   */
  async ensureDefaultSession(sessionKey: string): Promise<whatsappRepo.WhatsAppSessionRow> {
    return await whatsappRepo.ensureSessionForKey(sessionKey);
  }

  /**
   * Update session status in the database
   */
  async updateSessionStatus(
    sessionKey: string,
    status: string,
    lastQr?: string | null
  ): Promise<void> {
    await whatsappRepo.updateSessionStatus(sessionKey, status, lastQr);
  }

  /**
   * Handle an incoming WhatsApp message and persist it to the database
   */
  async handleIncomingMessage(
    sessionKey: string,
    msg: Message
  ): Promise<IncomingMessageResult> {
    // Get the session from DB
    const session = await whatsappRepo.ensureSessionForKey(sessionKey);

    // Determine direction and JIDs
    const direction = msg.fromMe ? 'out' : 'in';
    const fromJid = msg.from;
    const toJid = msg.to;
    const body = msg.body || '';

    // The remote contact is the one we're chatting with
    // If fromMe, the remote is 'to', otherwise it's 'from'
    const remoteJid = msg.fromMe ? toJid : fromJid;

    // Extract display name if available
    let displayName: string | null = null;
    try {
      // First try getContact if available
      if (typeof msg.getContact === 'function') {
        const contact = await msg.getContact();
        displayName = contact?.name || contact?.pushname || null;
        console.log('[Persistence] Got contact info:', { name: contact?.name, pushname: contact?.pushname });
      }
    } catch (err) {
      console.warn('[Persistence] Failed to get contact name:', err);
    }

    // Don't fallback to phone number for displayName - let the DB keep null if no real name
    // The frontend/API will handle showing phone number when displayName is null

    // Upsert contact - only pass displayName if we have a real name, not a phone number
    const contactRow = await whatsappRepo.upsertContactFromMessage(remoteJid, displayName);

    // Ensure chat exists
    const chatRow = await whatsappRepo.ensureChatForContact(session.id, contactRow.id);

    // Insert message
    // Sanitize raw data - remove functions that can't be serialized
    let rawData: any = null;
    try {
      rawData = {
        id: msg.id,
        from: msg.from,
        to: msg.to,
        body: msg.body,
        timestamp: msg.timestamp,
        fromMe: msg.fromMe,
      };
    } catch (e) {
      // If serialization fails, just save null
      rawData = null;
    }

    const messageRow = await whatsappRepo.insertMessage({
      sessionId: session.id,
      chatId: chatRow.id,
      direction,
      waMessageId: msg.id._serialized,
      fromJid,
      toJid,
      body,
      sentAt: new Date(msg.timestamp * 1000),
      raw: rawData,
    });

    // Update chat's last message timestamp
    await whatsappRepo.updateChatLastMessage(chatRow.id);

    return {
      messageRow,
      chatRow,
      contactRow,
    };
  }

  /**
   * Handle an outgoing WhatsApp message (sent by us) and persist it to the database
   */
  async handleOutgoingMessage(
    sessionKey: string,
    toJid: string,
    body: string,
    waMessageId: string
  ): Promise<OutgoingMessageResult> {
    // Get the session from DB
    const session = await whatsappRepo.ensureSessionForKey(sessionKey);

    // Extract phone number from JID for contact name
    let displayName: string | null = null;
    const phoneMatch = toJid.match(/^(\d+)@/);
    if (phoneMatch) {
      displayName = `+${phoneMatch[1]}`;
    } else {
      displayName = toJid;
    }

    // Upsert contact
    const contactRow = await whatsappRepo.upsertContactFromMessage(toJid, displayName);

    // Ensure chat exists
    const chatRow = await whatsappRepo.ensureChatForContact(session.id, contactRow.id);

    // Insert message
    const messageRow = await whatsappRepo.insertMessage({
      sessionId: session.id,
      chatId: chatRow.id,
      direction: 'out',
      waMessageId,
      fromJid: null,
      toJid,
      body,
      sentAt: new Date(),
      raw: null,
    });

    // Update chat's last message timestamp
    await whatsappRepo.updateChatLastMessage(chatRow.id);

    return {
      messageRow,
      chatRow,
      contactRow,
    };
  }

  /**
   * Get all chats for the current owner
   */
  async getChats(): Promise<whatsappRepo.ChatRow[]> {
    return await whatsappRepo.listChatsWithLastMessage();
  }

  /**
   * Get or create a contact and associated chat
   * Used for syncing chats from WhatsApp history
   */
  async getOrCreateContact(
    sessionKey: string,
    jid: string,
    displayName: string
  ): Promise<{ contact: whatsappRepo.ContactRow; chat: whatsappRepo.ChatRow }> {
    // Get the session from DB
    const session = await whatsappRepo.ensureSessionForKey(sessionKey);

    // Convert Baileys JID format (@s.whatsapp.net) to standard format (@c.us)
    const normalizedJid = jid.replace('@s.whatsapp.net', '@c.us');

    // Upsert contact
    const contactRow = await whatsappRepo.upsertContactFromMessage(normalizedJid, displayName);

    // Ensure chat exists
    const chatRow = await whatsappRepo.ensureChatForContact(session.id, contactRow.id);

    return {
      contact: contactRow,
      chat: chatRow,
    };
  }

  /**
   * Get all messages for a specific chat with pagination
   */
  async getMessages(
    chatId: string,
    options?: {
      limit?: number;
      offset?: number;
      beforeTimestamp?: string;
    }
  ): Promise<whatsappRepo.MessageRow[]> {
    return await whatsappRepo.listMessagesForChat(chatId, options);
  }

  /**
   * Get total message count for a chat
   */
  async getMessageCount(chatId: string): Promise<number> {
    return await whatsappRepo.getMessageCount(chatId);
  }
}
