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

      if (!to || !message) {
        res.status(400).json({ error: 'Missing required fields: to, message' });
        return;
      }

      const result = await this.whatsAppService.sendMessage(to, message);
      res.json({ 
        success: true, 
        message: 'Message sent successfully',
        data: {
          messageId: result.messageId,
          chatId: result.chatId
        }
      });
    } catch (error) {
      console.error('[WhatsApp Controller] Error sending message:', error);
      res.status(500).json({ error: 'Failed to send message' });
    }
  };

  // TODO: Add controller methods for:
  // - getChats()
  // - getMessages(chatId)
  // - getContacts()
  // - markAsRead(chatId)
}
