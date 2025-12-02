import { Request, Response } from 'express';
import { StorageService } from '../../../application/storage/StorageService';
import { validateUploadedFile, getFileCategory } from '../../../middleware/upload';
import { createBadRequestError } from '../../../middleware/errorHandler';
import { AuthRequest } from '../../../middleware/auth';

export class UploadController {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  /**
   * Upload media file
   * POST /api/upload/media
   */
  async uploadMedia(req: Request, res: Response): Promise<void> {
    try {
      // Validate file
      validateUploadedFile(req.file);

      if (!req.file) {
        throw createBadRequestError('No file uploaded');
      }

      // Get owner ID from authenticated user (required)
      const ownerId = (req as AuthRequest).user?.id;
      if (!ownerId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      // Upload to Supabase Storage
      const result = await this.storageService.uploadFile(
        req.file.path,
        req.file.originalname,
        ownerId
      );

      // Clean up temp file
      await this.storageService.cleanupTempFile(req.file.path);

      // Get file category
      const category = getFileCategory(req.file.mimetype);

      res.status(200).json({
        success: true,
        data: {
          url: result.url,
          path: result.path,
          category,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
        },
      });
    } catch (error) {
      // Clean up temp file on error
      if (req.file) {
        await this.storageService.cleanupTempFile(req.file.path).catch(() => {});
      }
      throw error;
    }
  }

  /**
   * Get signed URL for existing file
   * GET /api/upload/signed-url/:path
   */
  async getSignedUrl(req: Request, res: Response): Promise<void> {
    const { path: storagePath } = req.params;

    if (!storagePath) {
      throw createBadRequestError('Storage path is required');
    }

    const url = await this.storageService.getSignedUrl(storagePath);

    res.status(200).json({
      success: true,
      data: { url },
    });
  }

  /**
   * Delete file
   * DELETE /api/upload/:path
   */
  async deleteFile(req: Request, res: Response): Promise<void> {
    const { path: storagePath } = req.params;

    if (!storagePath) {
      throw createBadRequestError('Storage path is required');
    }

    await this.storageService.deleteFile(storagePath);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
    });
  }
}
