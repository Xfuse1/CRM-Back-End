export interface WhatsAppSession {
  sessionId: string;
  isConnected: boolean;
  qrCode: string | null;
  phoneNumber?: string;
  createdAt: Date;
  lastActivity?: Date;
}

export interface WhatsAppMessage {
  id: string;
  sessionId: string;
  from: string;
  to: string;
  body: string;
  timestamp: Date;
  isFromMe: boolean;
  hasMedia: boolean;
}

export interface WhatsAppChat {
  id: string;
  sessionId: string;
  chatId: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage?: WhatsAppMessage;
  lastMessageTimestamp?: Date;
}

export interface SendMessageRequest {
  to: string;
  message: string;
}

export interface SessionStatus {
  sessionId: string;
  isConnected: boolean;
  phoneNumber?: string;
}
