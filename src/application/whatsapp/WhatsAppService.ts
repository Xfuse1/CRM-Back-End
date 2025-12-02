import { IWhatsAppClient } from '../../domain/whatsapp/interfaces';
import { SessionStatus } from '../../domain/whatsapp/types';

export class WhatsAppService {
  private whatsAppManager: IWhatsAppClient;

  constructor(whatsAppManager: IWhatsAppClient) {
    this.whatsAppManager = whatsAppManager;
  }

  /**
   * Get session ID for a user (uses owner ID as session ID)
   */
  private getSessionId(ownerId: string): string {
    return `user_${ownerId}`;
  }

  /**
   * Initialize session for a specific user
   */
  async initializeUserSession(ownerId: string): Promise<void> {
    const sessionId = this.getSessionId(ownerId);
    await this.whatsAppManager.initSession(sessionId);
  }

  /**
   * Get status for a specific user's session
   */
  getStatus(ownerId: string): SessionStatus {
    const sessionId = this.getSessionId(ownerId);
    return {
      sessionId,
      isConnected: this.whatsAppManager.isSessionConnected(sessionId),
      phoneNumber: this.whatsAppManager.getSessionPhoneNumber(sessionId),
    };
  }

  /**
   * Get QR code for a specific user's session
   * Automatically initializes session if not exists
   */
  async getQrCode(ownerId: string): Promise<string | null> {
    const sessionId = this.getSessionId(ownerId);
    
    // Check if session exists, if not initialize it
    if (!this.whatsAppManager.isSessionConnected(sessionId) && !this.whatsAppManager.getQrCode(sessionId)) {
      console.log(`[WhatsApp Service] Initializing session for user: ${ownerId}`);
      await this.whatsAppManager.initSession(sessionId);
      // Wait a bit for QR to be generated
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return this.whatsAppManager.getQrCode(sessionId);
  }

  /**
   * Send message from a specific user's session
   */
  async sendMessage(ownerId: string, to: string, message: string): Promise<{ messageId: string; chatId: string }> {
    const sessionId = this.getSessionId(ownerId);
    return await this.whatsAppManager.sendMessage(sessionId, to, message);
  }

  /**
   * Send media message (image, video, document, audio)
   */
  async sendMediaMessage(ownerId: string, to: string, mediaPath: string, caption?: string): Promise<void> {
    const sessionId = this.getSessionId(ownerId);
    if (this.whatsAppManager.sendMediaMessage) {
      await this.whatsAppManager.sendMediaMessage(sessionId, to, mediaPath, caption);
    } else {
      throw new Error('Media messages not supported with current WhatsApp client');
    }
  }

  /**
   * Logout from a user's WhatsApp session
   */
  async logout(ownerId: string): Promise<void> {
    const sessionId = this.getSessionId(ownerId);
    if (this.whatsAppManager.logout) {
      await this.whatsAppManager.logout(sessionId);
    } else {
      throw new Error('Logout not supported with current WhatsApp client');
    }
  }

  /**
   * Restart a user's WhatsApp session to generate a new QR code
   */
  async restartSession(ownerId: string): Promise<void> {
    const sessionId = this.getSessionId(ownerId);
    if (this.whatsAppManager.logout) {
      try {
        await this.whatsAppManager.logout(sessionId);
      } catch (error) {
        console.log('[WhatsApp Service] Logout failed, forcing reinit:', error);
      }
    }
    // Wait a bit then reinitialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.whatsAppManager.initSession(sessionId);
  }
}
