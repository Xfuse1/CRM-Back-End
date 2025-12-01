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
      
      const { data, error } = await supabaseAdmin.rpc('cleanup_expired_api_requests');

      if (error) {
        throw error;
      }

      const cleanedCount = data || 0;
      logInfo(`API request cleanup complete: ${cleanedCount} expired requests removed`);
    } catch (error) {
      logError('API request cleanup failed', error as Error);
    }
  }
}
