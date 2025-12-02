/**
 * Baileys WhatsApp Client Manager
 * 
 * This client uses @whiskeysockets/baileys instead of whatsapp-web.js
 * with database-backed session storage for persistence on ephemeral filesystems.
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  AuthenticationState,
  initAuthCreds,
  proto,
  BufferJSON,
  SignalDataTypeMap,
  fetchLatestBaileysVersion,
  WAMessageContent,
  WAMessageKey,
  Chat,
  Contact,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode-terminal';
import { IWhatsAppClient, IRealtimeEmitter } from '../../domain/whatsapp/interfaces';
import { WhatsAppPersistenceService } from '../../application/whatsapp/WhatsAppPersistenceService';
import { SessionManager } from '../../application/whatsapp/SessionManager';
import { AIAgentService } from '../../application/ai/AIAgentService';
import { getAISettings, getConversationContext, saveAIConversation } from '../supabase/whatsappRepository';
import { setCurrentOwnerId } from '../prisma/whatsappRepository';
import { loadSession, saveSession, deleteSession } from '../../services/whatsappSessionStore';
import logger from '../../utils/logger';
import pino from 'pino';

interface SessionData {
  socket: WASocket;
  qrCode: string | null;
  isConnected: boolean;
  phoneNumber?: string;
  dbSessionId: string;
  sessionKey: string;
  authState: AuthenticationState;
}

/**
 * Create database-backed auth state for Baileys
 * This replaces file-based auth with PostgreSQL storage
 */
async function createDbAuthState(ownerId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const loaded = await loadSession(ownerId);

  let creds: any;
  let keys: any = {};

  if (loaded) {
    logger.info(`[Baileys] Restored session from database for: ${ownerId}`);
    creds = loaded.creds;
    keys = loaded.keys || {};
  } else {
    logger.info(`[Baileys] Creating new session for: ${ownerId}`);
    creds = initAuthCreds();
  }

  // Create key store with get/set methods
  const keyStore: SignalDataTypeMap = {} as any;
  
  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
        const data: { [id: string]: any } = {};
        for (const id of ids) {
          const key = `${type}-${id}`;
          if (keys[key]) {
            data[id] = keys[key];
          }
        }
        return data;
      },
      set: async (data: any) => {
        for (const category in data) {
          for (const id in data[category]) {
            const key = `${category}-${id}`;
            keys[key] = data[category][id];
          }
        }
        // Save keys to database when they change
        await saveSession(ownerId, { creds, keys });
      },
    },
  };

  const saveCreds = async () => {
    await saveSession(ownerId, { creds, keys });
  };

  return { state, saveCreds };
}

/**
 * Extract user ID from session ID
 * Session ID format: user_{uuid}
 */
function extractUserIdFromSessionId(sessionId: string): string {
  if (sessionId.startsWith('user_')) {
    return sessionId.replace('user_', '');
  }
  return sessionId;
}

export class BaileysWhatsAppClientManager implements IWhatsAppClient {
  private sessions: Map<string, SessionData> = new Map();
  private realtimeEmitter: IRealtimeEmitter;
  private persistenceService: WhatsAppPersistenceService;
  private sessionManager: SessionManager;
  private aiAgent: AIAgentService;

  constructor(realtimeEmitter: IRealtimeEmitter, persistenceService: WhatsAppPersistenceService) {
    this.realtimeEmitter = realtimeEmitter;
    this.persistenceService = persistenceService;
    this.sessionManager = new SessionManager();
    this.aiAgent = new AIAgentService();
  }
  
  /**
   * Set the owner context for database operations
   */
  private setOwnerContext(sessionId: string): void {
    const userId = extractUserIdFromSessionId(sessionId);
    setCurrentOwnerId(userId);
  }

  async initSession(sessionId: string): Promise<void> {
    if (this.sessions.has(sessionId)) {
      logger.info(`[Baileys] Session ${sessionId} already exists`);
      return;
    }

    logger.info(`[Baileys] Initializing session: ${sessionId}`);

    // Ensure session exists in database
    const dbSession = await this.persistenceService.ensureDefaultSession(sessionId);

    // Create database-backed auth state
    const { state, saveCreds } = await createDbAuthState(sessionId);

    // Create Baileys socket with history sync enabled
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll handle QR ourselves
      logger: pino({ level: 'silent' }),
      browser: ['Awfar CRM', 'Desktop', '3.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true,
      syncFullHistory: true, // Enable full history sync like WhatsApp Web
    });

    const sessionData: SessionData = {
      socket,
      qrCode: null,
      isConnected: false,
      dbSessionId: dbSession.id,
      sessionKey: sessionId,
      authState: state,
    };

    this.sessions.set(sessionId, sessionData);
    this.attachEventHandlers(sessionId, socket, saveCreds);
  }

  private attachEventHandlers(
    sessionId: string,
    socket: WASocket,
    saveCreds: () => Promise<void>
  ): void {
    // Connection updates (QR code, connected, disconnected)
    socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received
      if (qr) {
        logger.info(`[Baileys] QR Code generated for session: ${sessionId}`);
        QRCode.generate(qr, { small: true });

        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
          sessionData.qrCode = qr;

          // Persist QR to database
          this.persistenceService
            .updateSessionStatus(sessionData.sessionKey, 'qr', qr)
            .catch((err) => logger.error('[Baileys] Failed to update QR in DB:', err));
        }

        this.realtimeEmitter.emitToAll('whatsapp:qr', {
          sessionId,
          qr,
        });
      }

      // Connection opened
      if (connection === 'open') {
        logger.info(`[Baileys] Session ${sessionId} is connected`);

        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
          sessionData.isConnected = true;
          sessionData.qrCode = null;

          // Get phone number from socket
          const phoneNumber = socket.user?.id?.split(':')[0] || socket.user?.id?.split('@')[0];
          if (phoneNumber) {
            sessionData.phoneNumber = phoneNumber;
          }

          // Save session data for persistence
          const sessionInfo = {
            phoneNumber,
            platform: 'baileys',
            connectedAt: new Date().toISOString(),
          };
          await this.sessionManager.saveSessionData(sessionData.sessionKey, sessionInfo);
          await this.sessionManager.resetReconnectAttempts(sessionData.sessionKey);

          // Update session status in database
          await this.persistenceService.updateSessionStatus(
            sessionData.sessionKey,
            'connected',
            null
          );

          this.realtimeEmitter.emitToAll('whatsapp:ready', {
            sessionId,
            phoneNumber,
          });

          // Load existing chats like WhatsApp Web
          logger.info(`[Baileys] Loading existing chats for session ${sessionId}...`);
          await this.loadExistingChats(sessionId, socket);
        }
      }

      // Connection closed
      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.info(
          `[Baileys] Session ${sessionId} closed. Status: ${statusCode}. Reconnect: ${shouldReconnect}`
        );

        const sessionData = this.sessions.get(sessionId);
        if (sessionData) {
          sessionData.isConnected = false;
          sessionData.phoneNumber = undefined;

          // Mark session as disconnected
          await this.sessionManager.markSessionDisconnected(
            sessionData.sessionKey,
            `Status code: ${statusCode}`
          );

          if (shouldReconnect) {
            const canReconnect = await this.sessionManager.shouldReconnect(sessionData.sessionKey);

            if (canReconnect) {
              logger.info(`[Baileys] Attempting to reconnect session ${sessionId}...`);
              await this.sessionManager.incrementReconnectAttempts(sessionData.sessionKey);

              // Auto-reconnect after 5 seconds
              setTimeout(async () => {
                try {
                  this.sessions.delete(sessionId);
                  await this.initSession(sessionId);
                } catch (error) {
                  logger.error(`[Baileys] Auto-reconnect failed for ${sessionId}:`, error);
                }
              }, 5000);
            }
          } else {
            // User logged out from phone - clear session from database completely
            logger.info(`[Baileys] User logged out from phone. Clearing session ${sessionId} from database...`);
            await deleteSession(sessionId);
            await this.persistenceService
              .updateSessionStatus(sessionData.sessionKey, 'logged_out', null)
              .catch((err) => logger.error('[Baileys] Failed to update logout status:', err));
            
            // Emit logged out event
            this.realtimeEmitter.emitToAll('whatsapp:logged_out', {
              sessionId,
              reason: 'Logged out from phone',
            });

            // Re-initialize session to generate new QR code
            this.sessions.delete(sessionId);
            setTimeout(async () => {
              try {
                logger.info(`[Baileys] Re-initializing session ${sessionId} for new QR after phone logout...`);
                await this.initSession(sessionId);
              } catch (error) {
                logger.error(`[Baileys] Failed to re-init session after phone logout:`, error);
              }
            }, 3000);
          }
        }

        this.realtimeEmitter.emitToAll('whatsapp:disconnected', {
          sessionId,
          reason: `Status code: ${statusCode}`,
        });
      }
    });

    // Credentials updated - save to database
    socket.ev.on('creds.update', saveCreds);

    // Incoming messages
    socket.ev.on('messages.upsert', async (m) => {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) {
        logger.error(`[Baileys] Session data not found for ${sessionId}`);
        return;
      }

      // Set owner context for database operations
      this.setOwnerContext(sessionId);

      for (const message of m.messages) {
        // Skip non-text messages for now
        if (!message.message?.conversation && !message.message?.extendedTextMessage?.text) {
          continue;
        }

        // Skip messages from self
        if (message.key.fromMe) {
          continue;
        }

        const body =
          message.message?.conversation ||
          message.message?.extendedTextMessage?.text ||
          '';

        const from = message.key.remoteJid || '';
        const timestamp = message.messageTimestamp
          ? new Date(Number(message.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString();

        logger.info(`[Baileys] Message received in session ${sessionId}: ${body.substring(0, 50)}...`);
        logger.info(`[Baileys] Message pushName: ${message.pushName || 'NOT SET'}`);

        try {
          // Create a compatible message object for persistence service
          const messageForPersistence = {
            id: { _serialized: message.key.id || '' },
            from,
            to: socket.user?.id || '',
            body,
            timestamp: Number(message.messageTimestamp) || Date.now() / 1000,
            fromMe: false,
            getContact: async () => ({
              name: message.pushName || null,
              pushname: message.pushName || null,
              number: from.split('@')[0],
            }),
          };

          // Persist message to database
          const result = await this.persistenceService.handleIncomingMessage(
            sessionData.sessionKey,
            messageForPersistence as any
          );

          // Emit to Socket.io with enriched data
          this.realtimeEmitter.emitToAll('message:incoming', {
            sessionId,
            chatId: result.chatRow.id,
            message: {
              id: result.messageRow.id,
              waMessageId: result.messageRow.waMessageId,
              from: result.messageRow.fromJid,
              to: result.messageRow.toJid,
              body: result.messageRow.body,
              direction: result.messageRow.direction,
              timestamp: result.messageRow.createdAt,
            },
            contact: {
              id: result.contactRow.id,
              waId: result.contactRow.waId,
              displayName: result.contactRow.displayName,
            },
          });

          // AI Agent auto-reply
          await this.handleAIAutoReply(socket, message, result.chatRow.id, sessionData.sessionKey);
        } catch (error) {
          logger.error('[Baileys] Failed to persist message:', error);
        }
      }
    });

    // Handle chat history sync (like WhatsApp Web)
    socket.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) return;

      // Set owner context for database operations
      this.setOwnerContext(sessionId);

      logger.info(`[Baileys] History sync received for session ${sessionId}:`);
      logger.info(`[Baileys]   - Chats: ${chats.length}`);
      logger.info(`[Baileys]   - Contacts: ${contacts.length}`);
      logger.info(`[Baileys]   - Messages: ${messages.length}`);
      logger.info(`[Baileys]   - Is Latest: ${isLatest}`);

      // Process and save chats
      for (const chat of chats) {
        try {
          const jid = chat.id;
          if (!jid || jid.includes('@g.us')) continue; // Skip groups for now

          const phoneNumber = jid.split('@')[0];
          const contactName = (chat as any).name || (chat as any).notify || phoneNumber;

          // Get or create contact and chat in database
          await this.persistenceService.getOrCreateContact(
            sessionData.sessionKey,
            jid,
            contactName
          );

          logger.debug(`[Baileys] Synced chat: ${contactName} (${phoneNumber})`);
        } catch (error) {
          logger.error(`[Baileys] Failed to sync chat ${chat.id}:`, error);
        }
      }

      // Process and save messages (messages is array of WAMessage)
      let totalMessages = 0;
      for (const msg of messages) {
        try {
          // Check if it's a text message
          if (!msg.message?.conversation && !msg.message?.extendedTextMessage?.text) continue;

          const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
          const from = msg.key?.remoteJid || '';
          const fromMe = msg.key?.fromMe || false;

          if (!from || from.includes('@g.us')) continue; // Skip groups

          // Create message for persistence
          const messageForPersistence = {
            id: { _serialized: msg.key?.id || '' },
            from: fromMe ? socket.user?.id || '' : from,
            to: fromMe ? from : socket.user?.id || '',
            body,
            timestamp: Number(msg.messageTimestamp) || Date.now() / 1000,
            fromMe,
            getContact: async () => ({
              name: msg.pushName || null,
              pushname: msg.pushName || null,
              number: from.split('@')[0],
            }),
          };

          if (fromMe) {
            await this.persistenceService.handleOutgoingMessage(
              sessionData.sessionKey,
              from.replace('@s.whatsapp.net', '@c.us'),
              body,
              msg.key?.id || ''
            );
          } else {
            await this.persistenceService.handleIncomingMessage(
              sessionData.sessionKey,
              messageForPersistence as any
            );
          }
          totalMessages++;
        } catch (error) {
          // Silent fail for history messages
        }
      }

      // Emit chats loaded event to frontend
      this.realtimeEmitter.emitToAll('whatsapp:chats_synced', {
        sessionId,
        chatsCount: chats.length,
        messagesCount: totalMessages,
        isLatest,
      });

      logger.info(`[Baileys] History sync completed for session ${sessionId}`);
    });

    // Handle new chats
    socket.ev.on('chats.upsert', async (newChats) => {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) return;

      logger.info(`[Baileys] New chats received: ${newChats.length}`);

      for (const chat of newChats) {
        try {
          const jid = chat.id;
          if (!jid || jid.includes('@g.us')) continue;

          const phoneNumber = jid.split('@')[0];
          const contactName = chat.name || phoneNumber;

          await this.persistenceService.getOrCreateContact(
            sessionData.sessionKey,
            jid,
            contactName
          );
        } catch (error) {
          logger.error(`[Baileys] Failed to process new chat:`, error);
        }
      }
    });

    // Handle contacts update
    socket.ev.on('contacts.upsert', async (newContacts) => {
      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) return;

      logger.info(`[Baileys] Contacts received: ${newContacts.length}`);

      for (const contact of newContacts) {
        try {
          const jid = contact.id;
          if (!jid || jid.includes('@g.us')) continue;

          const contactName = contact.name || contact.notify || jid.split('@')[0];

          await this.persistenceService.getOrCreateContact(
            sessionData.sessionKey,
            jid,
            contactName
          );
        } catch (error) {
          logger.error(`[Baileys] Failed to save contact:`, error);
        }
      }
    });
  }

  getQrCode(sessionId: string): string | null {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.qrCode ?? null;
  }

  async sendMessage(
    sessionId: string,
    to: string,
    message: string
  ): Promise<{ messageId: string; chatId: string }> {
    const sessionData = this.sessions.get(sessionId);

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!sessionData.isConnected) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    // Set owner context for database operations
    this.setOwnerContext(sessionId);

    try {
      // Ensure the 'to' number is in the correct format for Baileys
      const formattedNumber = to.includes('@s.whatsapp.net')
        ? to
        : to.includes('@c.us')
        ? to.replace('@c.us', '@s.whatsapp.net')
        : `${to}@s.whatsapp.net`;

      const sentMessage = await sessionData.socket.sendMessage(formattedNumber, {
        text: message,
      });

      logger.info(`[Baileys] Message sent from session ${sessionId} to ${to}`);

      // Save sent message to database
      // Note: Repository normalizes JID to @s.whatsapp.net format, so pass as-is
      const result = await this.persistenceService.handleOutgoingMessage(
        sessionData.sessionKey,
        formattedNumber, // Repository handles JID normalization
        message,
        sentMessage?.key?.id || ''
      );

      // Emit message sent event
      this.realtimeEmitter.emitToAll('message:sent', {
        sessionId,
        chatId: result.chatRow.id,
        message: {
          id: result.messageRow.id,
          waMessageId: result.messageRow.waMessageId,
          to: result.messageRow.toJid,
          body: result.messageRow.body,
          direction: result.messageRow.direction,
          status: 'sent',
          createdAt: result.messageRow.createdAt,
        },
      });

      return { messageId: result.messageRow.id, chatId: result.chatRow.id };
    } catch (error) {
      logger.error(`[Baileys] Failed to send message:`, error);
      throw error;
    }
  }

  isSessionConnected(sessionId: string): boolean {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.isConnected ?? false;
  }

  getSessionPhoneNumber(sessionId: string): string | undefined {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.phoneNumber;
  }

  /**
   * Logout and destroy a WhatsApp session
   * This will disconnect from WhatsApp and clear all session data
   */
  async logout(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId);
    
    logger.info(`[Baileys] Logging out session ${sessionId}...`);

    try {
      // Logout from WhatsApp if socket exists
      if (sessionData?.socket) {
        try {
          await sessionData.socket.logout();
        } catch (e) {
          logger.warn(`[Baileys] Socket logout error (may already be disconnected):`, e);
        }
      }

      // Clear session from database - THIS IS CRITICAL!
      await deleteSession(sessionId);
      logger.info(`[Baileys] Deleted session from database: ${sessionId}`);

      // Update status in whatsapp_web_sessions table
      if (sessionData) {
        await this.persistenceService
          .updateSessionStatus(sessionData.sessionKey, 'logged_out', null)
          .catch((err) => logger.error('[Baileys] Failed to update logout status:', err));
      }

      // Remove from sessions map
      this.sessions.delete(sessionId);

      // Emit logout event
      this.realtimeEmitter.emitToAll('whatsapp:logged_out', {
        sessionId,
      });

      logger.info(`[Baileys] Session ${sessionId} logged out successfully`);

      // Re-initialize session to generate new QR code after 2 seconds
      logger.info(`[Baileys] Re-initializing session ${sessionId} for new QR...`);
      setTimeout(async () => {
        try {
          await this.initSession(sessionId);
          logger.info(`[Baileys] Session ${sessionId} re-initialized, new QR should be available`);
        } catch (error) {
          logger.error(`[Baileys] Failed to re-init session after logout:`, error);
        }
      }, 2000);

    } catch (error) {
      logger.error(`[Baileys] Error during logout:`, error);
      // Even if logout fails, clean up the session
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Restart session - force disconnect and reconnect with new QR
   */
  async restartSession(sessionId: string): Promise<void> {
    logger.info(`[Baileys] Restarting session ${sessionId}...`);
    
    // Logout first (this deletes session and re-initializes)
    await this.logout(sessionId);
  }

  /**
   * Load existing chats when connected (like WhatsApp Web)
   */
  private async loadExistingChats(sessionId: string, socket: WASocket): Promise<void> {
    try {
      logger.info(`[Baileys] Fetching chat list for session ${sessionId}...`);
      
      // Emit chats loaded event to frontend
      this.realtimeEmitter.emitToAll('whatsapp:chats_loaded', {
        sessionId,
        message: 'Connected! Chats will sync as messages arrive.',
      });

      logger.info(`[Baileys] Chat sync initiated for session ${sessionId}`);
    } catch (error) {
      logger.error(`[Baileys] Failed to load chats for session ${sessionId}:`, error);
    }
  }

  /**
   * Handle AI auto-reply for incoming messages
   */
  private async handleAIAutoReply(
    socket: WASocket,
    message: proto.IWebMessageInfo,
    chatId: string,
    sessionKey: string
  ): Promise<void> {
    try {
      const body =
        message.message?.conversation ||
        message.message?.extendedTextMessage?.text ||
        '';

      // Don't reply if no text content
      if (!body || body.trim() === '') {
        return;
      }

      // Extract owner ID from session key (format: "owner_{ownerId}")
      const ownerIdMatch = sessionKey.match(/owner_([a-f0-9-]+)/);
      if (!ownerIdMatch) {
        logger.warn(`[AI Agent] Could not extract owner ID from session key: ${sessionKey}`);
        return;
      }
      const ownerId = ownerIdMatch[1];

      // Check if AI is enabled for this owner
      const aiSettings = await getAISettings(ownerId);
      if (!aiSettings || !aiSettings.is_enabled) {
        return;
      }

      logger.info(`[AI Agent] Processing message for auto-reply in chat ${chatId}`);

      // Get conversation context (last 5 messages)
      const context = await getConversationContext(chatId, 5);

      // Show typing indicator
      const from = message.key?.remoteJid || '';
      if (!from) {
        logger.warn('[AI Agent] No remoteJid found in message');
        return;
      }
      await socket.sendPresenceUpdate('composing', from);

      // Add delay for natural feel (configured in settings)
      if (aiSettings.auto_reply_delay_seconds > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, aiSettings.auto_reply_delay_seconds * 1000)
        );
      }

      // Generate AI response
      const startTime = Date.now();
      const aiResponse = await this.aiAgent.generateResponseWithRetry(
        body,
        context.length > 0 ? { previousMessages: context } : undefined
      );

      if (!aiResponse) {
        logger.warn(`[AI Agent] No response generated for message in chat ${chatId}`);
        return;
      }

      const responseTime = Date.now() - startTime;

      // Send AI response
      await socket.sendMessage(from, { text: aiResponse });

      logger.info(`[AI Agent] Sent auto-reply to ${from} (${responseTime}ms)`);

      // Save conversation to database
      await saveAIConversation({
        chatId,
        userMessage: body,
        aiResponse,
        responseTimeMs: responseTime,
        modelUsed: 'gemini-2.0-flash-exp',
        tokensUsed: undefined,
      });

      // Clear typing indicator
      await socket.sendPresenceUpdate('paused', from);
    } catch (error) {
      logger.error(`[AI Agent] Failed to handle auto-reply: ${error}`);
      // Don't throw - we don't want to break message processing if AI fails
    }
  }
}
