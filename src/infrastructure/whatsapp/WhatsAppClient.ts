import { Client, RemoteAuth, Message, MessageMedia } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { IWhatsAppClient, IRealtimeEmitter } from '../../domain/whatsapp/interfaces';
import { WhatsAppPersistenceService } from '../../application/whatsapp/WhatsAppPersistenceService';
import { SessionManager } from '../../application/whatsapp/SessionManager';
import { AIAgentService } from '../../application/ai/AIAgentService';
import { getAISettings, getConversationContext, saveAIConversation } from '../supabase/whatsappRepository';
import { SupabaseSessionStore } from './SupabaseSessionStore';
import logger from '../../utils/logger';
import fs from 'fs/promises';

interface SessionData {
  client: Client;
  qrCode: string | null;
  isConnected: boolean;
  phoneNumber?: string;
  dbSessionId: string;
  sessionKey: string;
}

export class WhatsAppClientManager implements IWhatsAppClient {
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
      console.log(`[WhatsApp] Session ${sessionId} already exists`);
      return;
    }

    console.log(`[WhatsApp] Initializing session: ${sessionId}`);

    // Ensure session exists in database
    const dbSession = await this.persistenceService.ensureDefaultSession(sessionId);

    // Use RemoteAuth with Supabase store for persistent sessions
    // This allows sessions to survive server restarts and deploys
    const store = new SupabaseSessionStore();
    
    const client = new Client({
      authStrategy: new RemoteAuth({
        clientId: sessionId,
        store: store,
        backupSyncIntervalMs: 300000, // Backup every 5 minutes
      }),
      puppeteer: {
        headless: true,
        // Use system Chromium in production (Docker), Puppeteer's Chromium locally
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process', // Required for Railway/Docker
        ],
      },
    });

    const sessionData: SessionData = {
      client,
      qrCode: null,
      isConnected: false,
      dbSessionId: dbSession.id,
      sessionKey: sessionId,
    };

    this.sessions.set(sessionId, sessionData);
    this.attachEventHandlers(sessionId, client);

    await client.initialize();
  }

  private attachEventHandlers(sessionId: string, client: Client): void {
    // RemoteAuth event: Session saved to remote store
    client.on('remote_session_saved', () => {
      console.log(`[WhatsApp] Session ${sessionId} saved to Supabase (RemoteAuth)`);
    });

    client.on('qr', (qr: string) => {
      console.log(`[WhatsApp] QR Code generated for session: ${sessionId}`);
      qrcode.generate(qr, { small: true });

      const sessionData = this.sessions.get(sessionId);
      if (sessionData) {
        sessionData.qrCode = qr;

        // Persist QR to database
        this.persistenceService
          .updateSessionStatus(sessionData.sessionKey, 'qr', qr)
          .catch((err) => console.error('[WhatsApp] Failed to update QR in DB:', err));
      }

      this.realtimeEmitter.emitToAll('whatsapp:qr', {
        sessionId,
        qr,
      });
    });

    client.on('ready', async () => {
      console.log(`[WhatsApp] Session ${sessionId} is ready`);

      const sessionData = this.sessions.get(sessionId);
      if (sessionData) {
        sessionData.isConnected = true;
        sessionData.qrCode = null;

        // Get phone number
        try {
          const info = await client.info;
          if (sessionData) {
            sessionData.phoneNumber = info.wid.user;
          }

          // Save session data for persistence
          const sessionInfo = {
            phoneNumber: info.wid.user,
            platform: info.platform,
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
            phoneNumber: info.wid.user,
          });

          // Load all existing chats after connection
          console.log(`[WhatsApp] Loading existing chats for session ${sessionId}...`);
          await this.loadExistingChats(sessionId, client, sessionData);
        } catch (error) {
          console.error(`[WhatsApp] Failed to get client info:`, error);
        }
      }
    });

    client.on('message', async (message: Message) => {
      console.log(`[WhatsApp] Message received in session ${sessionId}: ${message.body}`);

      const sessionData = this.sessions.get(sessionId);
      if (!sessionData) {
        console.error(`[WhatsApp] Session data not found for ${sessionId}`);
        return;
      }

      try {
        // Persist message to database
        const result = await this.persistenceService.handleIncomingMessage(
          sessionData.sessionKey,
          message
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
        await this.handleAIAutoReply(client, message, result.chatRow.id, sessionData.sessionKey);
      } catch (error) {
        console.error('[WhatsApp] Failed to persist message:', error);
      }
    });

    client.on('disconnected', async (reason: string) => {
      console.log(`[WhatsApp] Session ${sessionId} disconnected: ${reason}`);

      const sessionData = this.sessions.get(sessionId);
      if (sessionData) {
        sessionData.isConnected = false;
        sessionData.phoneNumber = undefined;
        sessionData.qrCode = null;

        // Mark session as disconnected
        await this.sessionManager.markSessionDisconnected(sessionData.sessionKey, reason);
        
        // Update status in database
        await this.persistenceService
          .updateSessionStatus(sessionData.sessionKey, 'disconnected', null)
          .catch((err) => console.error('[WhatsApp] Failed to update disconnect status:', err));
      }

      // Emit disconnect event to frontend
      this.realtimeEmitter.emitToAll('whatsapp:disconnected', {
        sessionId,
        reason,
      });

      // Auto-restart session to generate new QR code after 3 seconds
      console.log(`[WhatsApp] Will restart session ${sessionId} in 3 seconds to generate new QR...`);
      setTimeout(async () => {
        try {
          console.log(`[WhatsApp] Restarting session ${sessionId}...`);
          this.sessions.delete(sessionId);
          await this.initSession(sessionId);
        } catch (error) {
          console.error(`[WhatsApp] Failed to restart session ${sessionId}:`, error);
        }
      }, 3000);
    });

    client.on('auth_failure', (message: string) => {
      console.error(`[WhatsApp] Auth failure for session ${sessionId}: ${message}`);

      this.realtimeEmitter.emitToAll('whatsapp:auth_failure', {
        sessionId,
        message,
      });
    });
  }

  /**
   * Load all existing chats from WhatsApp after connection
   */
  private async loadExistingChats(
    sessionId: string,
    client: Client,
    sessionData: SessionData
  ): Promise<void> {
    try {
      const chats = await client.getChats();
      console.log(`[WhatsApp] Found ${chats.length} existing chats`);

      let processedCount = 0;

      for (const chat of chats) {
        try {
          // Get the last message from the chat
          const messages = await chat.fetchMessages({ limit: 1 });
          
          if (messages.length === 0) {
            console.log(`[WhatsApp] Skipping chat ${chat.id._serialized} - no messages`);
            continue; // Skip chats with no messages
          }

          const lastMessage = messages[0];

          // Get contact info to ensure we have the name
          try {
            const contact = await lastMessage.getContact();
            const contactName = contact.name || contact.pushname || null;
            console.log(`[WhatsApp] Loading chat: ${contactName || chat.id._serialized}`);
          } catch (e) {
            console.log(`[WhatsApp] Loading chat: ${chat.id._serialized} (no contact name)`);
          }

          // Persist the chat and last message to database
          await this.persistenceService.handleIncomingMessage(
            sessionData.sessionKey,
            lastMessage
          );

          processedCount++;
        } catch (err) {
          console.error(`[WhatsApp] Failed to load chat ${chat.id._serialized}:`, err);
        }
      }

      console.log(`[WhatsApp] Successfully loaded ${processedCount}/${chats.length} chats`);

      // Emit event to notify frontend
      this.realtimeEmitter.emitToAll('whatsapp:chats_loaded', {
        sessionId,
        count: processedCount,
      });
    } catch (error) {
      console.error('[WhatsApp] Failed to load existing chats:', error);
    }
  }

  getQrCode(sessionId: string): string | null {
    const sessionData = this.sessions.get(sessionId);
    return sessionData?.qrCode ?? null;
  }

  async sendMessage(sessionId: string, to: string, message: string): Promise<{ messageId: string; chatId: string }> {
    const sessionData = this.sessions.get(sessionId);

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!sessionData.isConnected) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    try {
      // Ensure the 'to' number is in the correct format
      const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`;
      
      const sentMessage = await sessionData.client.sendMessage(formattedNumber, message);
      console.log(`[WhatsApp] Message sent from session ${sessionId} to ${to}`);

      // Save sent message to database
      const result = await this.persistenceService.handleOutgoingMessage(
        sessionData.sessionKey,
        formattedNumber,
        message,
        sentMessage.id._serialized
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
      console.error(`[WhatsApp] Failed to send message:`, error);
      throw error;
    }
  }

  async sendMediaMessage(
    sessionId: string,
    to: string,
    mediaPath: string,
    caption?: string
  ): Promise<void> {
    const sessionData = this.sessions.get(sessionId);

    if (!sessionData) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!sessionData.isConnected) {
      throw new Error(`Session ${sessionId} is not connected`);
    }

    try {
      // Ensure the 'to' number is in the correct format
      const formattedNumber = to.includes('@c.us') ? to : `${to}@c.us`;

      // Read file and create MessageMedia
      const fileBuffer = await fs.readFile(mediaPath);
      const base64Data = fileBuffer.toString('base64');
      
      // Determine mimetype from file extension
      const mimetype = this.getMimeTypeFromPath(mediaPath);
      
      const media = new MessageMedia(mimetype, base64Data);

      // Send media message
      await sessionData.client.sendMessage(formattedNumber, media, {
        caption: caption || '',
      });

      console.log(`[WhatsApp] Media message sent from session ${sessionId} to ${to}`);

      // TODO: Save sent message to Supabase
    } catch (error) {
      console.error(`[WhatsApp] Failed to send media message:`, error);
      throw error;
    }
  }

  private getMimeTypeFromPath(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      mp4: 'video/mp4',
      mpeg: 'video/mpeg',
      mov: 'video/quicktime',
      webm: 'video/webm',
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      mp3: 'audio/mpeg',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
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
   * Only replies if:
   * 1. AI is enabled for this owner
   * 2. Message is not from the bot itself (fromMe = false)
   * 3. Message has text content
   */
  private async handleAIAutoReply(
    client: Client,
    message: Message,
    chatId: string,
    sessionKey: string
  ): Promise<void> {
    try {
      // Don't reply to our own messages
      if (message.fromMe) {
        return;
      }

      // Don't reply if no text content
      if (!message.body || message.body.trim() === '') {
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
      const chat = await message.getChat();
      await chat.sendStateTyping();

      // Add delay for natural feel (configured in settings)
      if (aiSettings.auto_reply_delay_seconds > 0) {
        await new Promise(resolve => setTimeout(resolve, aiSettings.auto_reply_delay_seconds * 1000));
      }

      // Generate AI response
      const startTime = Date.now();
      const aiResponse = await this.aiAgent.generateResponseWithRetry(
        message.body,
        context.length > 0 ? { previousMessages: context } : undefined
      );

      if (!aiResponse) {
        logger.warn(`[AI Agent] No response generated for message in chat ${chatId}`);
        return;
      }

      const responseTime = Date.now() - startTime;

      // Send AI response
      await client.sendMessage(message.from, aiResponse);

      logger.info(`[AI Agent] Sent auto-reply to ${message.from} (${responseTime}ms)`);

      // Save conversation to database
      await saveAIConversation({
        chatId,
        userMessage: message.body,
        aiResponse,
        responseTimeMs: responseTime,
        modelUsed: 'gemini-2.0-flash-exp',
        tokensUsed: undefined // Gemini API doesn't return token count in response
      });

      // Clear typing indicator
      await chat.clearState();

    } catch (error) {
      logger.error(`[AI Agent] Failed to handle auto-reply: ${error}`);
      // Don't throw - we don't want to break message processing if AI fails
    }
  }

  /**
   * Logout and destroy a WhatsApp session
   * This will disconnect from WhatsApp and clear all session data
   */
  async logout(sessionId: string): Promise<void> {
    const sessionData = this.sessions.get(sessionId);
    
    if (!sessionData) {
      console.log(`[WhatsApp] Session ${sessionId} not found for logout`);
      return;
    }

    try {
      console.log(`[WhatsApp] Logging out session ${sessionId}...`);
      
      // Logout from WhatsApp (this clears the authentication)
      if (sessionData.client) {
        await sessionData.client.logout();
        await sessionData.client.destroy();
      }

      // Clear session data
      sessionData.isConnected = false;
      sessionData.phoneNumber = undefined;
      sessionData.qrCode = null;

      // Update database
      await this.persistenceService
        .updateSessionStatus(sessionData.sessionKey, 'logged_out', null)
        .catch((err) => console.error('[WhatsApp] Failed to update logout status:', err));

      // Remove from sessions map
      this.sessions.delete(sessionId);

      // Emit logout event
      this.realtimeEmitter.emitToAll('whatsapp:logged_out', {
        sessionId,
      });

      console.log(`[WhatsApp] Session ${sessionId} logged out successfully`);

      // Re-initialize session to generate new QR code
      console.log(`[WhatsApp] Re-initializing session ${sessionId} for new QR...`);
      setTimeout(async () => {
        try {
          await this.initSession(sessionId);
        } catch (error) {
          console.error(`[WhatsApp] Failed to re-init session after logout:`, error);
        }
      }, 2000);

    } catch (error) {
      console.error(`[WhatsApp] Error during logout:`, error);
      // Even if logout fails, clean up the session
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  /**
   * Get all active sessions info
   */
  getAllSessions(): Array<{ sessionId: string; isConnected: boolean; phoneNumber?: string }> {
    const sessions: Array<{ sessionId: string; isConnected: boolean; phoneNumber?: string }> = [];
    
    this.sessions.forEach((data, id) => {
      sessions.push({
        sessionId: id,
        isConnected: data.isConnected,
        phoneNumber: data.phoneNumber,
      });
    });
    
    return sessions;
  }
}
