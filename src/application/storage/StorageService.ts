import { supabaseAdmin } from '../../infrastructure/supabase/client';
import { logInfo, logError } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

const BUCKET_NAME = 'whatsapp-media';

/**
 * Service for managing file uploads to Supabase Storage
 */
export class StorageService {
  /**
   * Initialize Supabase Storage bucket (run once on startup)
   */
  async ensureBucketExists(): Promise<void> {
    try {
      // Check if bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      const bucketExists = buckets?.some((b: { name: string }) => b.name === BUCKET_NAME);

      if (!bucketExists) {
        logInfo(`Creating Supabase Storage bucket: ${BUCKET_NAME}`);
        
        const { error } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
          public: false, // Private bucket - requires authentication
          fileSizeLimit: 52428800, // 50MB
          allowedMimeTypes: [
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'video/mp4',
            'video/mpeg',
            'video/quicktime',
            'video/webm',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'audio/mpeg',
            'audio/ogg',
            'audio/wav',
            'audio/webm',
          ],
        });

        if (error) {
          logError('Failed to create storage bucket', error as Error);
        } else {
          logInfo(`Storage bucket ${BUCKET_NAME} created successfully`);
        }
      } else {
        logInfo(`Storage bucket ${BUCKET_NAME} already exists`);
      }
    } catch (error) {
      logError('Error checking/creating storage bucket', error as Error);
    }
  }

  /**
   * Upload file to Supabase Storage
   * @param filePath - Local file path
   * @param fileName - Name for the file in storage
   * @param ownerId - Owner ID for organizing files
   * @returns Public URL or signed URL
   */
  async uploadFile(
    filePath: string,
    fileName: string,
    ownerId: string
  ): Promise<{ url: string; path: string }> {
    try {
      // Read file from disk
      const fileBuffer = await fs.readFile(filePath);

      // Create storage path: ownerId/timestamp-filename
      const timestamp = Date.now();
      const storagePath = `${ownerId}/${timestamp}-${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .upload(storagePath, fileBuffer, {
          contentType: this.getMimeType(fileName),
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Generate signed URL (valid for 1 hour)
      const { data: signedData, error: signError } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 3600);

      if (signError) {
        throw new Error(`Failed to create signed URL: ${signError.message}`);
      }

      logInfo(`File uploaded successfully: ${storagePath}`);

      return {
        url: signedData.signedUrl,
        path: storagePath,
      };
    } catch (error) {
      logError('File upload failed', error as Error);
      throw error;
    }
  }

  /**
   * Delete file from Supabase Storage
   */
  async deleteFile(storagePath: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([storagePath]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }

      logInfo(`File deleted: ${storagePath}`);
    } catch (error) {
      logError('File deletion failed', error as Error);
      throw error;
    }
  }

  /**
   * Get signed URL for existing file (1 hour expiry)
   */
  async getSignedUrl(storagePath: string): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(storagePath, 3600);

      if (error) {
        throw new Error(`Failed to create signed URL: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error) {
      logError('Failed to get signed URL', error as Error);
      throw error;
    }
  }

  /**
   * Clean up temporary file from local disk
   */
  async cleanupTempFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logInfo(`Temp file deleted: ${filePath}`);
    } catch (error) {
      logError('Failed to delete temp file', error as Error);
    }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mpeg': 'video/mpeg',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
