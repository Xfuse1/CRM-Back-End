import { IWhatsAppClient } from '../../domain/whatsapp/interfaces';
import { SessionStatus } from '../../domain/whatsapp/types';

export class WhatsAppService {
  private whatsAppManager: IWhatsAppClient;
  private defaultSessionId = 'default';

  constructor(whatsAppManager: IWhatsAppClient) {
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

  async sendMessage(to: string, message: string): Promise<{ messageId: string; chatId: string }> {
    return await this.whatsAppManager.sendMessage(this.defaultSessionId, to, message);
  }

  /**
   * Send media message (image, video, document, audio)
   * @param to - Phone number
   * @param mediaPath - Local file path or URL
   * @param caption - Optional caption
   */
  async sendMediaMessage(to: string, mediaPath: string, caption?: string): Promise<void> {
    if (this.whatsAppManager.sendMediaMessage) {
      await this.whatsAppManager.sendMediaMessage(this.defaultSessionId, to, mediaPath, caption);
    } else {
      throw new Error('Media messages not supported with current WhatsApp client');
    }
  }

  /**
   * Logout from WhatsApp session
   * This will disconnect and clear the session, then generate a new QR code
   */
  async logout(): Promise<void> {
    if (this.whatsAppManager.logout) {
      await this.whatsAppManager.logout(this.defaultSessionId);
    } else {
      throw new Error('Logout not supported with current WhatsApp client');
    }
  }

  /**
   * Restart the WhatsApp session to generate a new QR code
   */
  async restartSession(): Promise<void> {
    // Delete the current session and reinitialize
    if (this.whatsAppManager.logout) {
      try {
        await this.whatsAppManager.logout(this.defaultSessionId);
      } catch (error) {
        console.log('[WhatsApp Service] Logout failed, forcing reinit:', error);
      }
    }
    // Wait a bit then reinitialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.whatsAppManager.initSession(this.defaultSessionId);
  }

  // TODO: Add methods for multi-session support
  // TODO: Add methods to fetch chats from Supabase
  // TODO: Add methods to fetch messages from Supabase
  // TODO: Add AI agent integration for auto-reply
}
