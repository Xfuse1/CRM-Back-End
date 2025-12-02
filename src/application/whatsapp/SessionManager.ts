import * as whatsappRepo from '../../infrastructure/supabase/whatsappRepository';
import { logInfo, logError, logWarn } from '../../utils/logger';

/**
 * Service for managing WhatsApp session persistence and recovery
 */
export class SessionManager {
  private readonly SESSION_EXPIRY_DAYS = 30;
  private readonly MAX_RECONNECT_ATTEMPTS = 3;

  /**
   * Save session data to database
   */
  async saveSessionData(
    sessionId: string,
    sessionData: any
  ): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + this.SESSION_EXPIRY_DAYS);

      await whatsappRepo.updateSessionData(sessionId, {
        sessionData: sessionData,
        expiresAt: expiresAt,
        isActive: true,
        lastConnectedAt: new Date(),
      });

      logInfo(`Session data saved for: ${sessionId}`);
    } catch (error) {
      logError('Failed to save session data', error);
      throw error;
    }
  }

  /**
   * Load session data from database
   */
  async loadSessionData(sessionId: string): Promise<any | null> {
    try {
      const session = await whatsappRepo.getSessionData(sessionId);

      if (!session) {
        logWarn(`No session data found for: ${sessionId}`);
        return null;
      }

      // Check if session is expired
      if (session.expiresAt) {
        const expiryDate = new Date(session.expiresAt);
        if (expiryDate < new Date()) {
          logWarn(`Session expired for: ${sessionId}`);
          await this.markSessionExpired(sessionId);
          return null;
        }
      }

      logInfo(`Session data loaded for: ${sessionId}`);
      return session.sessionData;
    } catch (error) {
      logError('Failed to load session data', error);
      return null;
    }
  }

  /**
   * Mark session as expired
   */
  async markSessionExpired(sessionId: string): Promise<void> {
    try {
      await whatsappRepo.updateSessionData(sessionId, {
        isActive: false,
        status: 'expired',
      });

      logInfo(`Session marked as expired: ${sessionId}`);
    } catch (error) {
      logError('Failed to mark session as expired', error);
    }
  }

  /**
   * Mark session as disconnected
   */
  async markSessionDisconnected(
    sessionId: string,
    error?: string
  ): Promise<void> {
    try {
      await whatsappRepo.updateSessionData(sessionId, {
        isActive: false,
        status: 'disconnected',
        lastError: error || null,
      });

      logInfo(`Session marked as disconnected: ${sessionId}`);
    } catch (err) {
      logError('Failed to mark session as disconnected', err);
    }
  }

  /**
   * Increment reconnect attempts
   */
  async incrementReconnectAttempts(
    sessionId: string
  ): Promise<number> {
    try {
      const session = await whatsappRepo.getSessionData(sessionId);
      const attempts = (session?.reconnectAttempts || 0) + 1;

      await whatsappRepo.updateSessionData(sessionId, {
        reconnectAttempts: attempts,
      });

      logInfo(`Reconnect attempt ${attempts} for: ${sessionId}`);
      return attempts;
    } catch (error) {
      logError('Failed to increment reconnect attempts', error);
      return 0;
    }
  }

  /**
   * Reset reconnect attempts after successful connection
   */
  async resetReconnectAttempts(sessionId: string): Promise<void> {
    try {
      await whatsappRepo.updateSessionData(sessionId, {
        reconnectAttempts: 0,
        lastError: null,
      });

      logInfo(`Reconnect attempts reset for: ${sessionId}`);
    } catch (error) {
      logError('Failed to reset reconnect attempts', error);
    }
  }

  /**
   * Check if session should attempt reconnection
   */
  async shouldReconnect(sessionId: string): Promise<boolean> {
    try {
      const session = await whatsappRepo.getSessionData(sessionId);

      if (!session) return false;

      const attempts = session.reconnectAttempts || 0;
      return attempts < this.MAX_RECONNECT_ATTEMPTS;
    } catch (error) {
      logError('Failed to check reconnect eligibility', error);
      return false;
    }
  }

  /**
   * Get all active sessions for an owner
   */
  async getActiveSessions(ownerId: string): Promise<any[]> {
    try {
      return await whatsappRepo.getActiveSessionsForOwner(ownerId);
    } catch (error) {
      logError('Failed to get active sessions', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const count = await whatsappRepo.cleanupExpiredSessions();
      logInfo(`Cleaned up ${count} expired sessions`);
    } catch (error) {
      logError('Failed to cleanup expired sessions', error);
    }
  }
}
