import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import { createBadRequestError } from './errorHandler';

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'];

const ALL_ALLOWED_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
  ...ALLOWED_AUDIO_TYPES,
];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_AUDIO_SIZE = 15 * 1024 * 1024; // 15MB

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Store files in temp directory
    cb(null, 'uploads/temp');
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-randomstring-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  },
});

// File filter function
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Check if file type is allowed
  if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(
      createBadRequestError(
        `File type ${file.mimetype} is not allowed. Allowed types: images, videos, documents, audio`
      )
    );
  }

  // Check file size based on type
  const fileSize = parseInt(req.headers['content-length'] || '0');
  
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype) && fileSize > MAX_IMAGE_SIZE) {
    return cb(createBadRequestError(`Image file size exceeds 5MB limit`));
  }
  
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype) && fileSize > MAX_VIDEO_SIZE) {
    return cb(createBadRequestError(`Video file size exceeds 50MB limit`));
  }
  
  if (ALLOWED_DOCUMENT_TYPES.includes(file.mimetype) && fileSize > MAX_DOCUMENT_SIZE) {
    return cb(createBadRequestError(`Document file size exceeds 10MB limit`));
  }
  
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype) && fileSize > MAX_AUDIO_SIZE) {
    return cb(createBadRequestError(`Audio file size exceeds 15MB limit`));
  }

  cb(null, true);
};

// Create multer instance
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE, // Set to largest allowed size
    files: 1, // Only allow 1 file per request
  },
});

/**
 * Get file category based on mimetype
 */
export function getFileCategory(mimetype: string): string {
  if (ALLOWED_IMAGE_TYPES.includes(mimetype)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimetype)) return 'video';
  if (ALLOWED_DOCUMENT_TYPES.includes(mimetype)) return 'document';
  if (ALLOWED_AUDIO_TYPES.includes(mimetype)) return 'audio';
  return 'unknown';
}

/**
 * Validate uploaded file
 */
export function validateUploadedFile(file: Express.Multer.File | undefined): void {
  if (!file) {
    throw createBadRequestError('No file uploaded');
  }

  if (!ALL_ALLOWED_TYPES.includes(file.mimetype)) {
    throw createBadRequestError(`File type ${file.mimetype} is not allowed`);
  }
}
