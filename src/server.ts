import { createServer } from 'http';
import { config } from './config/env';
import { createApp } from './interfaces/http/app';
import { createSocketServer } from './infrastructure/realtime/socketServer';
import { WhatsAppClientManager } from './infrastructure/whatsapp/WhatsAppClient';
import { WhatsAppService } from './application/whatsapp/WhatsAppService';
import { WhatsAppPersistenceService } from './application/whatsapp/WhatsAppPersistenceService';
import { SessionCleanupService } from './application/whatsapp/SessionCleanupService';
import { ApiRequestCleanupService } from './application/cleanup/ApiRequestCleanupService';
import { StorageService } from './application/storage/StorageService';
import { WhatsAppController } from './interfaces/http/controllers/WhatsAppController';
import {
  setWhatsAppController,
  setWhatsAppPersistenceService,
} from './interfaces/http/routes/whatsappRoutes';

async function bootstrap() {
  try {
    console.log('[Server] Starting WhatsApp CRM Backend...');

    // Create Express app
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize Socket.io server
    console.log('[Server] Initializing Socket.io server...');
    const realtimeServer = createSocketServer(httpServer);

    // Initialize persistence service
    console.log('[Server] Initializing persistence service...');
    const persistenceService = new WhatsAppPersistenceService();

    // Initialize WhatsApp client manager
    console.log('[Server] Initializing WhatsApp client manager...');
    const whatsAppManager = new WhatsAppClientManager(realtimeServer, persistenceService);

    // Create application services
    const whatsAppService = new WhatsAppService(whatsAppManager);

    // Create controllers
    const whatsAppController = new WhatsAppController(whatsAppService);

    // Inject dependencies into routes
    setWhatsAppController(whatsAppController);
    setWhatsAppPersistenceService(persistenceService);

    // Initialize default WhatsApp session
    console.log('[Server] Initializing default WhatsApp session...');
    await whatsAppService.initializeDefaultSession();

    // Start session cleanup service
    console.log('[Server] Starting session cleanup service...');
    const cleanupService = new SessionCleanupService();
    cleanupService.start();

    // Start API request cleanup service
    console.log('[Server] Starting API request cleanup service...');
    const apiCleanupService = new ApiRequestCleanupService();
    apiCleanupService.start();

    // Initialize Supabase Storage bucket
    console.log('[Server] Initializing Supabase Storage...');
    const storageService = new StorageService();
    await storageService.ensureBucketExists();

    // Start HTTP server
    httpServer.listen(config.port, () => {
      console.log(`[Server] 🚀 Server is running on port ${config.port}`);
      console.log(`[Server] 📱 WhatsApp Web integration active`);
      console.log(`[Server] 🔌 Socket.io server ready`);
      console.log(`[Server] 🌐 CORS enabled for: ${config.clientOrigin}`);
      console.log(`[Server] Health check: http://localhost:${config.port}/health`);
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n[Server] Shutting down gracefully...');
      cleanupService.stop();
      httpServer.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      console.log('\n[Server] SIGTERM received, shutting down...');
      cleanupService.stop();
      httpServer.close(() => {
        console.log('[Server] Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('[Server] Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
bootstrap();
