import { Response } from 'express';
import { WhatsAppService } from '../../../application/whatsapp/WhatsAppService';
import { SendMessageRequest } from '../../../domain/whatsapp/types';
import { AuthRequest } from '../../../middleware/auth';

export class WhatsAppController {
  private whatsAppService: WhatsAppService;

  constructor(whatsAppService: WhatsAppService) {
    this.whatsAppService = whatsAppService;
  }

  /**
   * Get owner ID from authenticated request
   */
  private getOwnerId(req: AuthRequest): string {
    const ownerId = req.user?.id;
    if (!ownerId) {
      throw new Error('User not authenticated');
    }
    return ownerId;
  }

  getStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ownerId = this.getOwnerId(req);
      const status = this.whatsAppService.getStatus(ownerId);
      res.json(status);
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error getting status:', error);
      res.status(error.message === 'User not authenticated' ? 401 : 500).json({ 
        error: error.message || 'Failed to get WhatsApp status' 
      });
    }
  };

  getQrCode = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ownerId = this.getOwnerId(req);
      console.log(`[WhatsApp Controller] Getting QR code for user: ${ownerId}`);
      const qr = await this.whatsAppService.getQrCode(ownerId);
      res.json({ qr });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error getting QR code:', error);
      res.status(error.message === 'User not authenticated' ? 401 : 500).json({ 
        error: error.message || 'Failed to get QR code' 
      });
    }
  };

  sendMessage = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ownerId = this.getOwnerId(req);
      const { to, message } = req.body as SendMessageRequest;

      console.log(`[WhatsApp Controller] Send message request from user ${ownerId} - to: ${to}, message length: ${message?.length || 0}`);

      if (!to || !message) {
        res.status(400).json({ error: 'Missing required fields: to, message' });
        return;
      }

      // Check connection status first
      const status = this.whatsAppService.getStatus(ownerId);
      if (!status.isConnected) {
        console.error('[WhatsApp Controller] Cannot send - WhatsApp not connected');
        res.status(503).json({ 
          error: 'WhatsApp is not connected. Please scan the QR code first.',
          code: 'NOT_CONNECTED'
        });
        return;
      }

      const result = await this.whatsAppService.sendMessage(ownerId, to, message);
      console.log(`[WhatsApp Controller] Message sent successfully - messageId: ${result.messageId}, chatId: ${result.chatId}`);
      
      res.json({ 
        success: true, 
        message: 'Message sent successfully',
        data: {
          messageId: result.messageId,
          chatId: result.chatId
        }
      });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error sending message:', error);
      
      let errorMessage = 'Failed to send message';
      let statusCode = 500;

      if (error.message === 'User not authenticated') {
        errorMessage = error.message;
        statusCode = 401;
      } else if (error.message?.includes('not found')) {
        errorMessage = 'Session not found. Please reconnect WhatsApp.';
        statusCode = 404;
      } else if (error.message?.includes('not connected')) {
        errorMessage = 'WhatsApp is not connected. Please scan the QR code.';
        statusCode = 503;
      } else if (error.message) {
        errorMessage = error.message;
      }

      res.status(statusCode).json({ error: errorMessage });
    }
  };

  /**
   * Logout from WhatsApp session
   * POST /api/whatsapp/logout
   */
  logout = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ownerId = this.getOwnerId(req);
      console.log(`[WhatsApp Controller] Logout request from user: ${ownerId}`);
      await this.whatsAppService.logout(ownerId);
      res.json({ 
        success: true, 
        message: 'Logged out successfully. A new QR code will be generated.' 
      });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error during logout:', error);
      res.status(error.message === 'User not authenticated' ? 401 : 500).json({ 
        error: error.message || 'Failed to logout from WhatsApp' 
      });
    }
  };

  /**
   * Restart WhatsApp session to get a new QR code
   * POST /api/whatsapp/restart
   */
  restartSession = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const ownerId = this.getOwnerId(req);
      console.log(`[WhatsApp Controller] Restart session request from user: ${ownerId}`);
      await this.whatsAppService.restartSession(ownerId);
      res.json({ 
        success: true, 
        message: 'Session restarted. A new QR code will be generated.' 
      });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error restarting session:', error);
      res.status(error.message === 'User not authenticated' ? 401 : 500).json({ 
        error: error.message || 'Failed to restart WhatsApp session' 
      });
    }
  };
}
