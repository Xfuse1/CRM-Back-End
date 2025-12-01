import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { supabaseAdmin } from '../../../infrastructure/supabase/client';
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
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      throw createConflictError('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user in database
    const { data: newUser, error } = await supabaseAdmin
      .from('profiles')
      .insert({
        email,
        password_hash: hashedPassword,
        full_name: fullName,
        role: 'user',
      })
      .select('id, email, full_name, role')
      .single();

    if (error || !newUser) {
      logError('Failed to create user', error);
      throw createBadRequestError('Failed to create user');
    }

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
        fullName: newUser.full_name,
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
    const { data: user, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, password_hash, full_name, role')
      .eq('email', email)
      .single();

    if (error || !user) {
      throw createUnauthorizedError('Invalid email or password');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

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
        fullName: user.full_name,
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
