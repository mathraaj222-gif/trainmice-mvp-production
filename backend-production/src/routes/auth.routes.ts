import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../config/database';
import { hashPassword, comparePassword } from '../utils/utils/password';
import { generateToken } from '../utils/utils/jwt';
import { authenticate, AuthRequest } from '../middleware/auth';
import { generateTrainerId, generateAdminCode } from '../utils/utils/sequentialId';
import { generateVerificationToken, getTokenExpiry, isTokenExpired } from '../utils/utils/verification';
import { sendVerificationEmail } from '../utils/email';
import { isBlockedEmailDomain, isValidEmailFormat } from '../utils/utils/emailValidation';

const router = express.Router();

// Register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').optional().trim(),
    body('role').isIn(['CLIENT', 'TRAINER', 'ADMIN']),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, fullName, role, contactNumber, userName } = req.body;

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user
      // Admins don't need email verification - set emailVerified to true
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role,
          emailVerified: role === 'ADMIN' ? true : false, // Auto-verify admin accounts
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          createdAt: true,
        },
      });

      // Create role-specific profile
      if (role === 'CLIENT') {
        await prisma.client.create({
          data: {
            id: user.id,
            companyEmail: email,
            userName: userName || fullName || email.split('@')[0],
            contactNumber: contactNumber || '',
          },
        });
      } else if (role === 'TRAINER') {
        const customTrainerId = await generateTrainerId();
        await prisma.trainer.create({
          data: {
            id: user.id,
            customTrainerId,
            fullName: fullName || email.split('@')[0],
            icNumber: '',
          },
        });
      } else if (role === 'ADMIN') {
        const adminCode = await generateAdminCode();
        await prisma.admin.create({
          data: {
            id: user.id,
            adminCode,
            email,
            fullName: fullName || email.split('@')[0],
          },
        });
      }

      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return res.status(201).json({
        message: 'User registered successfully',
        user,
        token,
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      return res.status(500).json({ error: 'Registration failed', details: error.message });
    }
  }
);

// Login
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Verify password
      const isValidPassword = await comparePassword(password, user.passwordHash);

      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        return res.status(403).json({ 
          error: 'Email not verified',
          message: 'Please verify your email address before logging in. Check your inbox for the verification email.',
          requiresVerification: true,
        });
      }

      // Generate token
      const token = generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
      });

      return res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: user.role,
        },
        token,
      });
    } catch (error: any) {
      console.error('Login error:', error);
      return res.status(500).json({ error: 'Login failed', details: error.message });
    }
  }
);

// Client Signup (Company Email Only)
router.post(
  '/client/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').optional().trim(),
    body('userName').optional().trim(),
    body('contactNumber').optional().trim(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, fullName, contactNumber, userName } = req.body;

      // Validate email format
      if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if email domain is blocked (personal emails)
      if (isBlockedEmailDomain(email)) {
        return res.status(400).json({ 
          error: 'Company email required',
          message: 'Please use your company email address. Personal email addresses are not allowed for client accounts.',
        });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const tokenExpiry = getTokenExpiry();

      // Create user with verification token
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role: 'CLIENT',
          emailVerified: false,
          verificationToken,
          tokenExpiry,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      // Create client profile
      await prisma.client.create({
        data: {
          id: user.id,
          companyEmail: email,
          userName: userName || fullName || email.split('@')[0],
          contactNumber: contactNumber || '',
        },
      });

      // Send verification email
      try {
        await sendVerificationEmail({
          email,
          token: verificationToken,
          role: 'CLIENT',
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail signup if email fails - user can request resend
      }

      return res.status(201).json({
        message: 'Account created successfully. Please verify your email to activate your account.',
        user: {
          ...user,
          emailVerified: false,
        },
        requiresVerification: true,
      });
    } catch (error: any) {
      console.error('Client signup error:', error);
      return res.status(500).json({ error: 'Signup failed', details: error.message });
    }
  }
);

// Trainer Signup (Any Email Allowed)
router.post(
  '/trainer/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('fullName').optional().trim(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, fullName } = req.body;

      // Validate email format only (no domain restrictions for trainers)
      if (!isValidEmailFormat(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Generate verification token
      const verificationToken = generateVerificationToken();
      const tokenExpiry = getTokenExpiry();

      // Create user with verification token
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role: 'TRAINER',
          emailVerified: false,
          verificationToken,
          tokenExpiry,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        },
      });

      // Create trainer profile
      const customTrainerId = await generateTrainerId();
      await prisma.trainer.create({
        data: {
          id: user.id,
          customTrainerId,
          fullName: fullName || email.split('@')[0],
          icNumber: '',
        },
      });

      // Send verification email
      try {
        await sendVerificationEmail({
          email,
          token: verificationToken,
          role: 'TRAINER',
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        // Don't fail signup if email fails - user can request resend
      }

      return res.status(201).json({
        message: 'Account created successfully. Please verify your email to activate your account.',
        user: {
          ...user,
          emailVerified: false,
        },
        requiresVerification: true,
      });
    } catch (error: any) {
      console.error('Trainer signup error:', error);
      return res.status(500).json({ error: 'Signup failed', details: error.message });
    }
  }
);

// Verify Email Handler (shared logic)
const handleEmailVerification = async (token: string, res: Response) => {
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  // Find user by verification token
  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
    },
  });

  if (!user) {
    return res.status(400).json({ error: 'Invalid verification token' });
  }

  // Check if token is expired
  if (!user.tokenExpiry || isTokenExpired(user.tokenExpiry)) {
    return res.status(400).json({ error: 'Verification token has expired' });
  }

  // Check if already verified
  if (user.emailVerified) {
    return res.status(400).json({ error: 'Email already verified' });
  }

  // Verify email and clear token
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      tokenExpiry: null,
    },
  });

  // Redirect to frontend home page (success page will auto-close/redirect)
  const frontendUrl = user.role === 'CLIENT' 
    ? process.env.FRONTEND_URL_CLIENT || 'http://localhost:5173'
    : process.env.FRONTEND_URL_TRAINER || 'http://localhost:5174';

  return res.redirect(`${frontendUrl}/verify-email-success`);
};

// Short verification route (for shorter URLs in emails)
router.get('/v', async (req: Request, res: Response) => {
  try {
    const token = req.query.t as string;
    return await handleEmailVerification(token, res);
  } catch (error: any) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

// Verify Email (legacy route for backward compatibility)
router.get('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    return await handleEmailVerification(token, res);
  } catch (error: any) {
    console.error('Email verification error:', error);
    return res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

// Resend Verification Email
router.post(
  '/resend-verification',
  [
    body('email').isEmail().normalizeEmail(),
  ],
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists for security
        return res.json({ 
          message: 'If an account exists with this email, a verification email has been sent.',
        });
      }

      // Check if already verified
      if (user.emailVerified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Generate new verification token
      const verificationToken = generateVerificationToken();
      const tokenExpiry = getTokenExpiry();

      // Update user with new token
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken,
          tokenExpiry,
        },
      });

      // Send verification email
      try {
        await sendVerificationEmail({
          email,
          token: verificationToken,
          role: user.role as 'CLIENT' | 'TRAINER',
        });
      } catch (emailError) {
        console.error('Failed to send verification email:', emailError);
        return res.status(500).json({ error: 'Failed to send verification email' });
      }

      return res.json({ 
        message: 'Verification email sent. Please check your inbox.',
      });
    } catch (error: any) {
      console.error('Resend verification error:', error);
      return res.status(500).json({ error: 'Failed to resend verification email', details: error.message });
    }
  }
);

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ user });
  } catch (error: any) {
    console.error('Get user error:', error);
    return res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
});

export default router;

