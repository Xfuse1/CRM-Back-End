import { Router, Request, Response } from 'express';
import { WhatsAppController } from '../controllers/WhatsAppController';
import { WhatsAppPersistenceService } from '../../../application/whatsapp/WhatsAppPersistenceService';
import { authenticateToken } from '../../../middleware/auth';
import { validate, schemas } from '../../../middleware/validation';
import { messageLimiter } from '../../../middleware/rateLimiter';
import { asyncHandler } from '../../../middleware/errorHandler';
import { idempotencyMiddleware, cacheIdempotentResponse } from '../../../middleware/idempotency';

// This will be injected by the server setup
let whatsAppController: WhatsAppController;
let persistenceService: WhatsAppPersistenceService;

export function setWhatsAppController(controller: WhatsAppController): void {
  whatsAppController = controller;
}

export function setWhatsAppPersistenceService(service: WhatsAppPersistenceService): void {
  persistenceService = service;
}

export const whatsappRouter = Router();

// Apply authentication to all WhatsApp routes
// TODO: Uncomment when authentication is fully implemented
// whatsappRouter.use(authenticateToken);

/**
 * GET /api/whatsapp/status
 * Returns the connection status of the default WhatsApp session
 */
whatsappRouter.get('/status', (req, res) => {
  whatsAppController.getStatus(req, res);
});

/**
 * GET /api/whatsapp/qr
 * Returns the QR code for scanning (if not yet connected)
 */
whatsappRouter.get('/qr', (req, res) => {
  whatsAppController.getQrCode(req, res);
});

/**
 * POST /api/whatsapp/send
 * Send a message to a WhatsApp number
 * Body: { to: string, message: string }
 * Header: X-Idempotency-Key (optional) - prevents duplicate sends
 */
whatsappRouter.post(
  '/send',
  messageLimiter,
  idempotencyMiddleware, // Prevent duplicate message sends
  validate(schemas.sendMessage),
  asyncHandler(async (req: Request, res: Response) => {
    await whatsAppController.sendMessage(req, res);
    
    // Cache response for idempotency
    await cacheIdempotentResponse(req, 200, res.locals.responseData || {});
  })
);

/**
 * GET /api/whatsapp/chats
 * Get all chats for the current owner
 */
whatsappRouter.get(
  '/chats',
  asyncHandler(async (req: Request, res: Response) => {
    const chats = await persistenceService.getChats();

    // Map to DTOs
    const chatDTOs = chats.map((chat) => ({
      id: chat.id,
      sessionId: chat.session_id,
      contactId: chat.contact_id,
      type: chat.type,
      title: chat.title,
      lastMessageAt: chat.last_message_at,
      unreadCount: chat.unread_count || 0,
      createdAt: chat.created_at,
    }));

    res.json({ chats: chatDTOs });
  })
);

/**
 * GET /api/whatsapp/chats/:chatId/messages
 * Get messages for a specific chat with pagination
 * Query params:
 *  - limit: number (default 50, max 100)
 *  - offset: number (default 0)
 *  - before: ISO timestamp (for cursor-based pagination)
 */
whatsappRouter.get(
  '/chats/:chatId/messages',
  asyncHandler(async (req: Request, res: Response) => {
    const { chatId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const before = req.query.before as string | undefined;

    const messages = await persistenceService.getMessages(chatId, {
      limit,
      offset,
      beforeTimestamp: before,
    });

    // Get total count for pagination
    const total = await persistenceService.getMessageCount(chatId);

    // Map to DTOs
    const messageDTOs = messages.map((msg) => ({
      id: msg.id,
      direction: msg.direction,
      body: msg.body,
      fromJid: msg.from_jid,
      toJid: msg.to_jid,
      status: msg.status,
      sentAt: msg.sent_at,
      createdAt: msg.created_at,
    }));

    res.json({
      messages: messageDTOs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });
  })
);

// TODO: Add routes for:
// GET /api/whatsapp/contacts - Get all contacts
// POST /api/whatsapp/chats/:chatId/read - Mark chat as read
