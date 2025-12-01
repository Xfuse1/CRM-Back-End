import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

/**
 * Middleware to verify JWT token
 */
export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    jwt.verify(token, config.jwtSecret, (err: jwt.VerifyErrors | null, decoded: any) => {
      if (err) {
        res.status(403).json({ error: 'Invalid or expired token' });
        return;
      }

      req.user = decoded as { id: string; email: string; role: string };
      next();
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Middleware to check if user is admin
 */
export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
};

/**
 * Generate JWT token
 */
export const generateToken = (payload: {
  id: string;
  email: string;
  role: string;
}): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '7d', // Token expires in 7 days
  });
};
