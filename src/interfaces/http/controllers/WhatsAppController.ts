import { Request, Response } from 'express';
import { WhatsAppService } from '../../../application/whatsapp/WhatsAppService';
import { SendMessageRequest } from '../../../domain/whatsapp/types';

export class WhatsAppController {
  private whatsAppService: WhatsAppService;

  constructor(whatsAppService: WhatsAppService) {
    this.whatsAppService = whatsAppService;
  }

  getStatus = async (_req: Request, res: Response): Promise<void> => {
    try {
      const status = this.whatsAppService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('[WhatsApp Controller] Error getting status:', error);
      res.status(500).json({ error: 'Failed to get WhatsApp status' });
    }
  };

  getQrCode = async (_req: Request, res: Response): Promise<void> => {
    try {
      const qr = this.whatsAppService.getQrCode();
      res.json({ qr });
    } catch (error) {
      console.error('[WhatsApp Controller] Error getting QR code:', error);
      res.status(500).json({ error: 'Failed to get QR code' });
    }
  };

  sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { to, message } = req.body as SendMessageRequest;

      console.log(`[WhatsApp Controller] Send message request - to: ${to}, message length: ${message?.length || 0}`);

      if (!to || !message) {
        res.status(400).json({ error: 'Missing required fields: to, message' });
        return;
      }

      // Check connection status first
      const status = this.whatsAppService.getStatus();
      if (!status.isConnected) {
        console.error('[WhatsApp Controller] Cannot send - WhatsApp not connected');
        res.status(503).json({ 
          error: 'WhatsApp is not connected. Please scan the QR code first.',
          code: 'NOT_CONNECTED'
        });
        return;
      }

      const result = await this.whatsAppService.sendMessage(to, message);
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
      
      // Return more descriptive error messages
      let errorMessage = 'Failed to send message';
      let statusCode = 500;

      if (error.message?.includes('not found')) {
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

  // TODO: Add controller methods for:
  // - getChats()
  // - getMessages(chatId)
  // - getContacts()
  // - markAsRead(chatId)

  /**
   * Logout from WhatsApp session
   * POST /api/whatsapp/logout
   */
  logout = async (_req: Request, res: Response): Promise<void> => {
    try {
      console.log('[WhatsApp Controller] Logout request received');
      await this.whatsAppService.logout();
      res.json({ 
        success: true, 
        message: 'Logged out successfully. A new QR code will be generated.' 
      });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error during logout:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to logout from WhatsApp' 
      });
    }
  };

  /**
   * Restart WhatsApp session to get a new QR code
   * POST /api/whatsapp/restart
   */
  restartSession = async (_req: Request, res: Response): Promise<void> => {
    try {
      console.log('[WhatsApp Controller] Restart session request received');
      await this.whatsAppService.restartSession();
      res.json({ 
        success: true, 
        message: 'Session restarted. A new QR code will be generated.' 
      });
    } catch (error: any) {
      console.error('[WhatsApp Controller] Error restarting session:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to restart WhatsApp session' 
      });
    }
  };
}
