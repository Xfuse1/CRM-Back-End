import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../../config/env';
import { IRealtimeEmitter } from '../../domain/whatsapp/interfaces';

export class RealtimeServer implements IRealtimeEmitter {
  private io: SocketIOServer;

  constructor(httpServer: HttpServer) {
    // Configure allowed origins for Socket.io
    const allowedOrigins = [
      config.clientOrigin,
      'http://localhost:3000',
      'http://localhost:3001',
      'https://whatsapp-crm-frontend.vercel.app',
    ].filter(Boolean);

    console.log('[Socket.io] Allowed origins:', allowedOrigins);

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps)
          if (!origin) {
            return callback(null, true);
          }
          // Check if origin is allowed
          if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed.includes(origin))) {
            return callback(null, true);
          }
          console.warn(`[Socket.io] Blocked connection from: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        },
        methods: ['GET', 'POST'],
        credentials: true,
      },
      // Important for Render/Vercel deployment
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowUpgrades: true,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      // TODO: Add authentication middleware for Socket.io
      // TODO: Associate socket with user session

      socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
      });

      // TODO: Handle client-side events for requesting QR, sending messages, etc.
    });
  }

  emitToAll(event: string, payload: unknown): void {
    this.io.emit(event, payload);
  }

  // TODO: Add method to emit to specific user/session
  // emitToUser(userId: string, event: string, payload: unknown): void

  getServer(): SocketIOServer {
    return this.io;
  }
}

export function createSocketServer(httpServer: HttpServer): RealtimeServer {
  return new RealtimeServer(httpServer);
}
