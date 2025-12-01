import { supabaseAdmin } from '../supabase/client';
import logger from '../../utils/logger';
import * as fs from 'fs/promises';

/**
 * Custom session store for whatsapp-web.js RemoteAuth
 * Stores session data in Supabase for persistence across server restarts/deploys
 * 
 * Implements the Store interface required by RemoteAuth:
 * - sessionExists({ session: string }): Promise<boolean>
 * - save({ session: string }): Promise<void>  - reads {session}.zip from disk
 * - extract({ session: string, path: string }): Promise<void>  - writes to path
 * - delete({ session: string }): Promise<void>
 */
export class SupabaseSessionStore {
  /**
   * Check if session data exists in Supabase
   */
  async sessionExists(options: { session: string }): Promise<boolean> {
    try {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_sessions')
        .select('auth_credentials')
        .eq('session_key', options.session)
        .single();

      if (error || !data) {
        return false;
      }

      const hasCredentials = data.auth_credentials !== null && data.auth_credentials !== undefined;
      logger.info(`[SupabaseStore] Session exists check for ${options.session}: ${hasCredentials}`);
      return hasCredentials;
    } catch (error) {
      logger.error('[SupabaseStore] Error checking session existence:', error);
      return false;
    }
  }

  /**
   * Save session credentials to Supabase
   * RemoteAuth creates a {session}.zip file that we read and store as base64
   */
  async save(options: { session: string }): Promise<void> {
    try {
      // Read the ZIP file created by RemoteAuth
      const zipPath = `${options.session}.zip`;
      const zipData = await fs.readFile(zipPath);
      const base64Data = zipData.toString('base64');

      // First check if session exists
      const { data: existing } = await supabaseAdmin
        .from('whatsapp_sessions')
        .select('id')
        .eq('session_key', options.session)
        .single();

      if (existing) {
        // Update existing session
        const { error } = await supabaseAdmin
          .from('whatsapp_sessions')
          .update({
            auth_credentials: base64Data,
            is_active: true,
            status: 'connected',
            last_connected_at: new Date().toISOString(),
          })
          .eq('session_key', options.session);

        if (error) throw error;
      } else {
        // Create new session record
        const { error } = await supabaseAdmin
          .from('whatsapp_sessions')
          .insert({
            session_key: options.session,
            auth_credentials: base64Data,
            is_active: true,
            status: 'connected',
            last_connected_at: new Date().toISOString(),
          });

        if (error) throw error;
      }

      logger.info(`[SupabaseStore] Session saved for: ${options.session}`);
    } catch (error) {
      logger.error('[SupabaseStore] Failed to save session:', error);
      throw error;
    }
  }

  /**
   * Extract session credentials from Supabase and write to ZIP file
   * RemoteAuth expects the ZIP file at the specified path
   */
  async extract(options: { session: string; path: string }): Promise<void> {
    try {
      const { data, error } = await supabaseAdmin
        .from('whatsapp_sessions')
        .select('auth_credentials')
        .eq('session_key', options.session)
        .single();

      if (error || !data || !data.auth_credentials) {
        logger.warn(`[SupabaseStore] No session found for: ${options.session}`);
        return;
      }

      // Convert base64 back to binary and write to file
      const zipData = Buffer.from(data.auth_credentials as string, 'base64');
      await fs.writeFile(options.path, zipData);

      logger.info(`[SupabaseStore] Session extracted for: ${options.session} to ${options.path}`);
    } catch (error) {
      logger.error('[SupabaseStore] Failed to extract session:', error);
      throw error;
    }
  }

  /**
   * Delete session from Supabase
   */
  async delete(options: { session: string }): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('whatsapp_sessions')
        .update({
          auth_credentials: null,
          is_active: false,
          status: 'disconnected',
        })
        .eq('session_key', options.session);

      if (error) {
        throw error;
      }

      logger.info(`[SupabaseStore] Session deleted for: ${options.session}`);
    } catch (error) {
      logger.error('[SupabaseStore] Failed to delete session:', error);
    }
  }
}
