import { supabaseAdmin } from '../../infrastructure/supabase/client';
import { logInfo, logError } from '../../utils/logger';

/**
 * Service for cleaning up expired API requests (idempotency cache)
 */
export class ApiRequestCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 6; // 6 hours

  /**
   * Start the cleanup cron job
   */
  start(): void {
    if (this.cleanupInterval) {
      logInfo('API request cleanup service already running');
      return;
    }

    logInfo('Starting API request cleanup service (runs every 6 hours)');
    
    // Run cleanup immediately on start
    this.runCleanup();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.runCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup cron job
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logInfo('API request cleanup service stopped');
    }
  }

  /**
   * Run cleanup task - removes expired API requests (>24 hours old)
   */
  private async runCleanup(): Promise<void> {
    try {
      logInfo('Running API request cleanup task...');
      
      // Try RPC function first, fallback to direct delete
      const { data, error } = await supabaseAdmin.rpc('cleanup_expired_api_requests');

      if (error) {
        // If RPC doesn't exist, try direct delete
        if (error.code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('does not exist')) {
          logInfo('RPC function not found, using direct delete...');
          await this.runDirectCleanup();
          return;
        }
        throw error;
      }

      const cleanedCount = data || 0;
      logInfo(`API request cleanup complete: ${cleanedCount} expired requests removed`);
    } catch (error) {
      // Silently handle if table doesn't exist (not all deployments use idempotency)
      const err = error as Error & { code?: string };
      if (err.code === '42P01' || err.message?.includes('does not exist')) {
        logInfo('API requests table not found - skipping cleanup (idempotency not configured)');
        return;
      }
      logError('API request cleanup failed', error as Error);
    }
  }

  /**
   * Direct cleanup without RPC function
   */
  private async runDirectCleanup(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      
      const { error, count } = await supabaseAdmin
        .from('api_requests')
        .delete()
        .lt('created_at', twentyFourHoursAgo);

      if (error) {
        // Table might not exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logInfo('API requests table not found - skipping cleanup');
          return;
        }
        throw error;
      }

      logInfo(`API request cleanup complete: ${count || 0} expired requests removed`);
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === '42P01' || err.message?.includes('does not exist')) {
        logInfo('API requests table not found - skipping cleanup');
        return;
      }
      logError('Direct API request cleanup failed', error as Error);
    }
  }
}
