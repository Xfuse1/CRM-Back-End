/**
 * WhatsApp Session Store Service
 * 
 * This service handles loading and saving Baileys auth state to PostgreSQL via Prisma.
 * It enables session persistence across server restarts and ephemeral filesystems (like Railway).
 * 
 * Uses BufferJSON from Baileys to properly serialize/deserialize auth state including Buffers.
 */

import prisma from '../infrastructure/prisma/client';
import { BufferJSON } from '@whiskeysockets/baileys';
import logger from '../utils/logger';

/**
 * Load session from database
 * @param ownerId - Unique identifier for the session owner
 * @returns The deserialized auth state or null if not found
 */
export async function loadSession(ownerId: string): Promise<any | null> {
  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { ownerId },
    });

    if (!session || !session.data) {
      logger.info(`[SessionStore] No existing session found for owner: ${ownerId}`);
      return null;
    }

    // Convert buffer to string and parse with BufferJSON reviver
    const json = session.data.toString('utf-8');
    const state = JSON.parse(json, BufferJSON.reviver);
    
    logger.info(`[SessionStore] Session loaded successfully for owner: ${ownerId}`);
    return state;
  } catch (error) {
    logger.error(`[SessionStore] Error loading session for owner ${ownerId}:`, error);
    return null;
  }
}

/**
 * Save session to database
 * @param ownerId - Unique identifier for the session owner
 * @param state - The Baileys auth state to persist
 */
export async function saveSession(ownerId: string, state: any): Promise<void> {
  try {
    // Serialize with BufferJSON replacer to handle Buffer objects
    const json = JSON.stringify(state, BufferJSON.replacer);
    const buffer = Buffer.from(json, 'utf-8');

    await prisma.whatsappSession.upsert({
      where: { ownerId },
      update: { 
        data: buffer,
        updatedAt: new Date(),
      },
      create: { 
        ownerId, 
        data: buffer,
      },
    });

    logger.info(`[SessionStore] Session saved successfully for owner: ${ownerId}`);
  } catch (error) {
    logger.error(`[SessionStore] Error saving session for owner ${ownerId}:`, error);
    throw error;
  }
}

/**
 * Delete session from database
 * @param ownerId - Unique identifier for the session owner
 */
export async function deleteSession(ownerId: string): Promise<void> {
  try {
    await prisma.whatsappSession.delete({
      where: { ownerId },
    });
    logger.info(`[SessionStore] Session deleted for owner: ${ownerId}`);
  } catch (error) {
    logger.error(`[SessionStore] Error deleting session for owner ${ownerId}:`, error);
    // Don't throw - session might not exist
  }
}

/**
 * Check if session exists in database
 * @param ownerId - Unique identifier for the session owner
 * @returns true if session exists
 */
export async function sessionExists(ownerId: string): Promise<boolean> {
  try {
    const session = await prisma.whatsappSession.findUnique({
      where: { ownerId },
      select: { id: true },
    });
    return session !== null;
  } catch (error) {
    logger.error(`[SessionStore] Error checking session existence for owner ${ownerId}:`, error);
    return false;
  }
}
