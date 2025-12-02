import { WhatsAppMessage } from './types';

export interface IWhatsAppClient {
  initSession(sessionId: string): Promise<void>;
  getQrCode(sessionId: string): string | null;
  sendMessage(sessionId: string, to: string, message: string): Promise<{ messageId: string; chatId: string }>;
  sendMediaMessage?(sessionId: string, to: string, mediaPath: string, caption?: string): Promise<void>;
  logout?(sessionId: string): Promise<void>;
  isSessionConnected(sessionId: string): boolean;
  getSessionPhoneNumber(sessionId: string): string | undefined;
}

export interface IRealtimeEmitter {
  emitToAll(event: string, payload: unknown): void;
  emitToUser(userId: string, event: string, payload: unknown): void;
}

export interface IWhatsAppEventHandler {
  onQrCode(sessionId: string, qr: string): void;
  onReady(sessionId: string, phoneNumber: string): void;
  onMessage(sessionId: string, message: WhatsAppMessage): void;
  onDisconnected(sessionId: string): void;
}
