import { Router, Request, Response, NextFunction } from 'express';
import { WhatsAppController } from '../controllers/WhatsAppController';
import { WhatsAppPersistenceService } from '../../../application/whatsapp/WhatsAppPersistenceService';
import { authenticateToken, AuthRequest } from '../../../middleware/auth';
import { validate, schemas } from '../../../middleware/validation';
import { messageLimiter, whatsappPollingLimiter } from '../../../middleware/rateLimiter';
import { asyncHandler } from '../../../middleware/errorHandler';
import { idempotencyMiddleware, cacheIdempotentResponse } from '../../../middleware/idempotency';
import { setCurrentOwnerId } from '../../../infrastructure/prisma/whatsappRepository';

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

/**
 * Middleware to set the current owner ID from authenticated user
 * Authentication is REQUIRED - no fallback
 */
const setOwnerContext = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  setCurrentOwnerId(userId);
  next();
};

// Apply authentication to all WhatsApp routes - REQUIRED
whatsappRouter.use(authenticateToken, setOwnerContext);

/**
 * GET /api/whatsapp/status
 * Returns the connection status of the default WhatsApp session
 */
whatsappRouter.get('/status', whatsappPollingLimiter, (req, res) => {
  whatsAppController.getStatus(req, res);
});

/**
 * GET /api/whatsapp/qr
 * Returns the QR code for scanning (if not yet connected)
 */
whatsappRouter.get('/qr', whatsappPollingLimiter, (req, res) => {
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

    // Map to DTOs - Prisma returns camelCase
    // Include contactJid for sending messages and title for display
    const chatDTOs = chats.map((chat) => ({
      id: chat.id,
      sessionId: chat.sessionId,
      contactId: chat.contactId,
      type: chat.type,
      title: chat.title, // Already processed in repository with displayName fallback
      lastMessageAt: chat.lastMessageAt,
      unreadCount: chat.unreadCount || 0,
      createdAt: chat.createdAt,
      contactJid: chat.contactJid || null, // Include WhatsApp JID for sending messages
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

    // Map to DTOs - Prisma returns camelCase
    const messageDTOs = messages.map((msg) => ({
      id: msg.id,
      direction: msg.direction,
      body: msg.body,
      fromJid: msg.fromJid,
      toJid: msg.toJid,
      status: msg.status,
      sentAt: msg.sentAt,
      createdAt: msg.createdAt,
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

/**
 * POST /api/whatsapp/logout
 * Logout from WhatsApp and generate a new QR code
 */
whatsappRouter.post(
  '/logout',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await whatsAppController.logout(req, res);
    } catch (error) {
      console.error('[WhatsApp] Logout error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to logout from WhatsApp' 
      });
    }
  })
);

/**
 * POST /api/whatsapp/restart
 * Restart the WhatsApp session (useful for getting a new QR code)
 */
whatsappRouter.post(
  '/restart',
  asyncHandler(async (req: Request, res: Response) => {
    try {
      await whatsAppController.restartSession(req, res);
    } catch (error) {
      console.error('[WhatsApp] Restart error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to restart WhatsApp session' 
      });
    }
  })
);
