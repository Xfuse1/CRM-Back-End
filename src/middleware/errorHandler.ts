import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger';

/**
 * Custom Application Error class
 */
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handling middleware
 */
export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Log error
  logError('Error occurred', err);

  // Determine status code
  const statusCode = (err as AppError).statusCode || 500;
  const isOperational = (err as AppError).isOperational || false;

  // Send error response
  if (process.env.NODE_ENV === 'production' && !isOperational) {
    // Don't leak error details in production for non-operational errors
    res.status(500).json({
      error: 'Internal server error',
      message: 'Something went wrong. Please try again later.',
    });
  } else {
    res.status(statusCode).json({
      error: err.name || 'Error',
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  }
};

/**
 * 404 Not Found handler
 */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

/**
 * Async error wrapper to catch errors in async route handlers
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Common error creators
 */
export const createBadRequestError = (message: string) => {
  return new AppError(message, 400);
};

export const createUnauthorizedError = (message: string = 'Unauthorized') => {
  return new AppError(message, 401);
};

export const createForbiddenError = (message: string = 'Forbidden') => {
  return new AppError(message, 403);
};

export const createNotFoundError = (message: string) => {
  return new AppError(message, 404);
};

export const createConflictError = (message: string) => {
  return new AppError(message, 409);
};

export const createInternalError = (message: string) => {
  return new AppError(message, 500, false);
};
