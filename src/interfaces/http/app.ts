import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from '../../config/env';
import { whatsappRouter } from './routes/whatsappRoutes';
import authRoutes from './routes/authRoutes';
import uploadRoutes from './routes/uploadRoutes';
import aiRoutes from './routes/aiRoutes';
import { apiLimiter } from '../../middleware/rateLimiter';
import { errorHandler, notFoundHandler } from '../../middleware/errorHandler';
import { logHttp } from '../../utils/logger';

export function createApp(): Application {
  const app = express();

  // Security middleware
  app.use(helmet());

  // Request logging middleware
  app.use((req, _res, next) => {
    logHttp(`${req.method} ${req.path}`);
    next();
  });

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CORS middleware
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Rate limiting for all API routes
  app.use('/api', apiLimiter);

  // Health check (no rate limiting)
  app.get('/health', (_req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/upload', uploadRoutes);
  app.use('/api/ai', aiRoutes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
