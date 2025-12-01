import { WhatsAppClientManager } from '../../infrastructure/whatsapp/WhatsAppClient';
import { SessionStatus } from '../../domain/whatsapp/types';
import { MessageMedia } from 'whatsapp-web.js';
import fs from 'fs/promises';

export class WhatsAppService {
  private whatsAppManager: WhatsAppClientManager;
  private defaultSessionId = 'default';

  constructor(whatsAppManager: WhatsAppClientManager) {
    this.whatsAppManager = whatsAppManager;
  }

  async initializeDefaultSession(): Promise<void> {
    await this.whatsAppManager.initSession(this.defaultSessionId);
  }

  getStatus(): SessionStatus {
    return {
      sessionId: this.defaultSessionId,
      isConnected: this.whatsAppManager.isSessionConnected(this.defaultSessionId),
      phoneNumber: this.whatsAppManager.getSessionPhoneNumber(this.defaultSessionId),
    };
  }

  getQrCode(): string | null {
    return this.whatsAppManager.getQrCode(this.defaultSessionId);
  }

  async sendMessage(to: string, message: string): Promise<void> {
    await this.whatsAppManager.sendMessage(this.defaultSessionId, to, message);
  }

  /**
   * Send media message (image, video, document, audio)
   * @param to - Phone number
   * @param mediaPath - Local file path or URL
   * @param caption - Optional caption
   */
  async sendMediaMessage(to: string, mediaPath: string, caption?: string): Promise<void> {
    await this.whatsAppManager.sendMediaMessage(this.defaultSessionId, to, mediaPath, caption);
  }

  // TODO: Add methods for multi-session support
  // TODO: Add methods to fetch chats from Supabase
  // TODO: Add methods to fetch messages from Supabase
  // TODO: Add AI agent integration for auto-reply
}
