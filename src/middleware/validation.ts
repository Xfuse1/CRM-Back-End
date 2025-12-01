import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

/**
 * Validation middleware factory
 */
export const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false, // Return all errors
      stripUnknown: true, // Remove unknown fields
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));

      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    // Replace req.body with validated and sanitized data
    req.body = value;
    next();
  };
};

/**
 * Common validation schemas
 */
export const schemas = {
  // Send WhatsApp message
  sendMessage: Joi.object({
    to: Joi.string()
      .required()
      .pattern(/^[\d@.]+$/)
      .min(5)
      .max(50)
      .messages({
        'string.pattern.base': 'Invalid phone number format',
        'string.empty': 'Recipient phone number is required',
      }),
    message: Joi.string().required().min(1).max(10000).messages({
      'string.empty': 'Message cannot be empty',
      'string.max': 'Message too long (max 10000 characters)',
    }),
  }),

  // User registration
  register: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Invalid email address',
      'string.empty': 'Email is required',
    }),
    password: Joi.string().min(8).required().messages({
      'string.min': 'Password must be at least 8 characters',
      'string.empty': 'Password is required',
    }),
    fullName: Joi.string().min(2).max(100).required().messages({
      'string.min': 'Name must be at least 2 characters',
      'string.max': 'Name too long',
      'string.empty': 'Full name is required',
    }),
  }),

  // User login
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Update contact
  updateContact: Joi.object({
    displayName: Joi.string().min(1).max(100).optional(),
    tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  }),

  // Create AI agent
  createAIAgent: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    model: Joi.string().valid('gemini-pro', 'gpt-3.5-turbo', 'gpt-4').required(),
    instructions: Joi.string().min(10).max(5000).required(),
    temperature: Joi.number().min(0).max(2).default(0.7),
    isActive: Joi.boolean().default(true),
  }),
};

/**
 * Sanitize input to prevent XSS
 */
export const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim();
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  // WhatsApp JID format: digits@c.us or digits@s.whatsapp.net
  const phoneRegex = /^\d{1,15}@(c\.us|s\.whatsapp\.net)$/;
  const simplePhoneRegex = /^\+?\d{10,15}$/;
  
  return phoneRegex.test(phone) || simplePhoneRegex.test(phone);
};

/**
 * Validate file upload
 */
export const validateFileUpload = (
  file: Express.Multer.File,
  maxSize: number = 10 * 1024 * 1024, // 10MB default
  allowedTypes: string[] = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4']
): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File too large (max ${maxSize / (1024 * 1024)}MB)`,
    };
  }

  if (!allowedTypes.includes(file.mimetype)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
    };
  }

  return { valid: true };
};
