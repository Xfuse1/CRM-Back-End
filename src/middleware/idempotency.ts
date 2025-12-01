import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../infrastructure/supabase/client';
import { createConflictError } from './errorHandler';
import { logInfo, logWarn } from '../utils/logger';

/**
 * Idempotency middleware to prevent duplicate requests
 * Clients should send X-Idempotency-Key header with unique request ID
 * 
 * Usage:
 * - Add to routes that should not be repeated (e.g., send message, create order)
 * - Client generates UUID and sends in header: X-Idempotency-Key: abc-123-def-456
 * - If same key sent again within 24 hours, returns cached response
 */
export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const idempotencyKey = req.headers['x-idempotency-key'] as string;

  // Skip if no idempotency key provided (optional usage)
  if (!idempotencyKey) {
    return next();
  }

  try {
    // Get owner ID from authenticated user
    const ownerId = (req as any).user?.userId || 'demo-owner';

    // Check if request with this idempotency key already exists
    const { data: existingRequest, error } = await supabaseAdmin
      .from('api_requests')
      .select('response_status, response_data')
      .eq('idempotency_key', idempotencyKey)
      .eq('owner_id', ownerId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // Error other than "not found"
      logWarn(`Idempotency check failed: ${error.message}`);
      return next(); // Continue anyway to avoid blocking requests
    }

    if (existingRequest) {
      // Request already processed - return cached response
      logInfo(`Duplicate request detected: ${idempotencyKey}`);
      
      res.status(existingRequest.response_status || 200).json(
        existingRequest.response_data || {
          success: true,
          message: 'Request already processed (idempotent response)',
        }
      );
      return;
    }

    // Store request metadata for later caching
    (req as any).idempotencyKey = idempotencyKey;
    (req as any).ownerId = ownerId;

    next();
  } catch (error) {
    logWarn(`Idempotency middleware error: ${error}`);
    next(); // Continue anyway to avoid blocking requests
  }
}

/**
 * Cache response for idempotent requests
 * Call this AFTER successful request processing
 */
export async function cacheIdempotentResponse(
  req: Request,
  statusCode: number,
  responseData: any
): Promise<void> {
  const idempotencyKey = (req as any).idempotencyKey;
  const ownerId = (req as any).ownerId;

  if (!idempotencyKey) {
    return; // No idempotency key - skip caching
  }

  try {
    await supabaseAdmin.from('api_requests').insert({
      idempotency_key: idempotencyKey,
      owner_id: ownerId,
      endpoint: req.path,
      method: req.method,
      response_status: statusCode,
      response_data: responseData,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
    });

    logInfo(`Cached idempotent response: ${idempotencyKey}`);
  } catch (error) {
    logWarn(`Failed to cache idempotent response: ${error}`);
    // Don't throw - caching is optional
  }
}
