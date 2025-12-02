import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../../../infrastructure/prisma/client';
import { generateToken } from '../../../middleware/auth';
import { validate, schemas } from '../../../middleware/validation';
import { authLimiter } from '../../../middleware/rateLimiter';
import { asyncHandler } from '../../../middleware/errorHandler';
import {
  createBadRequestError,
  createUnauthorizedError,
  createConflictError,
} from '../../../middleware/errorHandler';
import { logInfo, logError } from '../../../utils/logger';

const router = Router();

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post(
  '/register',
  authLimiter,
  validate(schemas.register),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password, fullName } = req.body;

    // Check if user already exists
    const existingUser = await prisma.profile.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw createConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user in database
    const newUser = await prisma.profile.create({
      data: {
        email,
        passwordHash: hashedPassword,
        fullName,
        role: 'user',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
      },
    });

    // Generate JWT token
    const token = generateToken({
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    logInfo(`New user registered: ${email}`);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        role: newUser.role,
      },
    });
  })
);

/**
 * POST /api/auth/login
 * Login existing user
 */
router.post(
  '/login',
  authLimiter,
  validate(schemas.login),
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    // Find user
    const user = await prisma.profile.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        fullName: true,
        role: true,
      },
    });

    if (!user) {
      throw createUnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      logInfo(`Failed login attempt for: ${email}`);
      throw createUnauthorizedError('Invalid email or password');
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    logInfo(`User logged in: ${email}`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    });
  })
);

/**
 * GET /api/auth/me
 * Get current user info (requires authentication)
 */
router.get(
  '/me',
  // authenticateToken middleware will be added later
  asyncHandler(async (req: Request, res: Response) => {
    // This will be implemented after adding auth middleware to routes
    res.json({ message: 'User info endpoint' });
  })
);

export default router;
