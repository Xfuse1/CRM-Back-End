import { SessionManager } from './SessionManager';
import { logInfo, logError } from '../../utils/logger';

/**
 * Service for periodic cleanup of expired WhatsApp sessions
 */
export class SessionCleanupService {
  private sessionManager: SessionManager;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 1000 * 60 * 60; // 1 hour

  constructor() {
    this.sessionManager = new SessionManager();
  }

  /**
   * Start the cleanup cron job
   */
  start(): void {
    if (this.cleanupInterval) {
      logInfo('Session cleanup service already running');
      return;
    }

    logInfo('Starting session cleanup service (runs every hour)');
    
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
      logInfo('Session cleanup service stopped');
    }
  }

  /**
   * Run cleanup task
   */
  private async runCleanup(): Promise<void> {
    try {
      logInfo('Running session cleanup task...');
      const cleanedCount = await this.sessionManager.cleanupExpiredSessions();
      logInfo(`Session cleanup complete: ${cleanedCount} sessions marked inactive`);
    } catch (error) {
      logError('Session cleanup failed', error as Error);
    }
  }
}
