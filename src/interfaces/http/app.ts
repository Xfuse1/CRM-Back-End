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
import { prisma } from '../../infrastructure/prisma/client';

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

  // CORS middleware - allow multiple origins
  const allowedOrigins = [
    config.clientOrigin,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed.includes(origin))) {
          return callback(null, true);
        }
        
        // Log blocked origins for debugging
        console.warn(`[CORS] Blocked request from origin: ${origin}`);
        console.warn(`[CORS] Allowed origins: ${allowedOrigins.join(', ')}`);
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    })
  );

  // Rate limiting for all API routes
  app.use('/api', apiLimiter);

  // Health check (no rate limiting)
  app.get('/health', async (_req, res) => {
    let dbStatus = 'unknown';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      dbStatus = 'disconnected';
      console.error('[Health] Database check failed:', error);
    }
    
    res.json({ 
      status: dbStatus === 'connected' ? 'ok' : 'degraded', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbStatus,
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
