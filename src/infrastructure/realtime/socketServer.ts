import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../../config/env';
import { IRealtimeEmitter } from '../../domain/whatsapp/interfaces';
import jwt from 'jsonwebtoken';

export class RealtimeServer implements IRealtimeEmitter {
  private io: SocketIOServer;
  // Map of userId to socket IDs (one user can have multiple connections)
  private userSockets: Map<string, Set<string>> = new Map();

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
    this.io.on('connection', (socket: Socket) => {
      console.log(`[Socket.io] Client connected: ${socket.id}`);

      let userId: string | null = null;

      // Handle authentication - client sends token after connecting
      socket.on('auth', (data: { token: string }) => {
        try {
          const decoded = jwt.verify(data.token, config.jwtSecret) as { id: string };
          userId = decoded.id;
          
          // Add socket to user's socket set
          if (!this.userSockets.has(userId)) {
            this.userSockets.set(userId, new Set());
          }
          this.userSockets.get(userId)!.add(socket.id);
          
          // Join user-specific room
          socket.join(`user:${userId}`);
          
          console.log(`[Socket.io] User ${userId} authenticated (socket: ${socket.id})`);
          socket.emit('auth:success', { userId });
        } catch (error) {
          console.error(`[Socket.io] Auth failed for socket ${socket.id}:`, error);
          socket.emit('auth:error', { message: 'Invalid token' });
        }
      });

      socket.on('disconnect', () => {
        console.log(`[Socket.io] Client disconnected: ${socket.id}`);
        
        // Remove socket from user's socket set
        if (userId) {
          const userSocketSet = this.userSockets.get(userId);
          if (userSocketSet) {
            userSocketSet.delete(socket.id);
            if (userSocketSet.size === 0) {
              this.userSockets.delete(userId);
            }
          }
        }
      });
    });
  }

  emitToAll(event: string, payload: unknown): void {
    this.io.emit(event, payload);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    // Emit to user-specific room
    this.io.to(`user:${userId}`).emit(event, payload);
    console.log(`[Socket.io] Emitted ${event} to user ${userId}`);
  }

  getServer(): SocketIOServer {
    return this.io;
  }
}

export function createSocketServer(httpServer: HttpServer): RealtimeServer {
  return new RealtimeServer(httpServer);
}
