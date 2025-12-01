import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from '../../config/env';
import { IRealtimeEmitter } from '../../domain/whatsapp/interfaces';

export class RealtimeServer implements IRealtimeEmitter {
  private io: SocketIOServer;

  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.clientOrigin,
        methods: ['GET', 'POST'],
        credentials: true,
      },
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
