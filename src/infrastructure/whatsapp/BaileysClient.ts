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
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as QRCode from 'qrcode-terminal';
import { IWhatsAppClient, IRealtimeEmitter } from '../../domain/whatsapp/interfaces';
import { WhatsAppPersistenceService } from '../../application/whatsapp/WhatsAppPersistenceService';
import { SessionManager } from '../../application/whatsapp/SessionManager';
import { AIAgentService } from '../../application/ai/AIAgentService';
import { getAISettings, getConversationContext, saveAIConversation } from '../supabase/whatsappRepository';
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

    // Create Baileys socket with silent logger
    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false, // We'll handle QR ourselves
      logger: pino({ level: 'silent' }),
      browser: ['Awfar CRM', 'Chrome', '121.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: undefined,
      keepAliveIntervalMs: 30000,
      markOnlineOnConnect: true,
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

          // Load existing chats
          logger.info(`[Baileys] Loading existing chats for session ${sessionId}...`);
          // Note: Baileys handles this differently than whatsapp-web.js
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
            // User logged out - clear session from database
            await deleteSession(sessionId);
            await this.persistenceService
              .updateSessionStatus(sessionData.sessionKey, 'disconnected', null)
              .catch((err) => logger.error('[Baileys] Failed to update disconnect status:', err));
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
      const result = await this.persistenceService.handleOutgoingMessage(
        sessionData.sessionKey,
        formattedNumber.replace('@s.whatsapp.net', '@c.us'), // Convert back for DB consistency
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
