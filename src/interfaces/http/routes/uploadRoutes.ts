import express, { Request, Response } from 'express';
import { UploadController } from '../controllers/UploadController';
import { upload } from '../../../middleware/upload';
import { uploadLimiter } from '../../../middleware/rateLimiter';
import { asyncHandler } from '../../../middleware/errorHandler';
// import { authenticateToken } from '../../../middleware/auth'; // Uncomment when auth is enabled

const router = express.Router();
const uploadController = new UploadController();

/**
 * @route POST /api/upload/media
 * @desc Upload media file (image, video, document, audio)
 * @access Private (requires authentication)
 */
router.post(
  '/media',
  uploadLimiter, // Rate limit: 10 uploads per hour
  // authenticateToken, // Uncomment when auth is enabled
  upload.single('file'), // Multer middleware - expects field name 'file'
  asyncHandler(async (req: Request, res: Response) => {
    await uploadController.uploadMedia(req, res);
  })
);

/**
 * @route GET /api/upload/signed-url/:path
 * @desc Get signed URL for existing file
 * @access Private
 */
router.get(
  '/signed-url/:path(*)',
  // authenticateToken, // Uncomment when auth is enabled
  asyncHandler(async (req: Request, res: Response) => {
    await uploadController.getSignedUrl(req, res);
  })
);

/**
 * @route DELETE /api/upload/:path
 * @desc Delete file from storage
 * @access Private
 */
router.delete(
  '/:path(*)',
  // authenticateToken, // Uncomment when auth is enabled
  asyncHandler(async (req: Request, res: Response) => {
    await uploadController.deleteFile(req, res);
  })
);

export default router;
