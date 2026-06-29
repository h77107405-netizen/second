import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { generateToken, generateRefreshToken, verifyToken } from '../utils/jwt.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/error.js';

const router = Router();

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required' });
    return;
  }

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  if (user.status !== 'active') {
    res.status(401).json({ success: false, error: 'Account is not active' });
    return;
  }

  const isValid = await comparePassword(password, user.password);
  if (!isValid) {
    res.status(401).json({ success: false, error: 'Invalid email or password' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });
  const refreshToken = generateRefreshToken({ id: user.id, email: user.email, role: user.role as any });

  res.json({
    success: true,
    token,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage,
    },
  });
}));

// POST /api/auth/refresh
router.post('/refresh', asyncHandler(async (req, res) => {
  const refreshToken = req.body?.refreshToken;
  if (!refreshToken) {
    res.status(401).json({ success: false, error: 'Refresh token required' });
    return;
  }

  const decoded = verifyToken(refreshToken, true);
  if (!decoded) {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
    return;
  }

  const [user] = await db.select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, profileImage: schema.users.profileImage, status: schema.users.status }).from(schema.users).where(eq(schema.users.id, decoded.id)).limit(1);
  if (!user || user.status !== 'active') {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
    return;
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role as any });
  res.json({ success: true, token, user });
}));

// GET /api/auth/me
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, profileImage: schema.users.profileImage, status: schema.users.status })
    .from(schema.users)
    .where(eq(schema.users.id, req.user!.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }

  res.json({ success: true, data: user });
}));

// POST /api/auth/change-password
router.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, 'currentPassword and newPassword are required');
  }
  if (newPassword.length < 6) {
    throw new ApiError(400, 'New password must be at least 6 characters');
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.id)).limit(1);
  if (!user) throw new ApiError(404, 'User not found');

  const isValid = await comparePassword(currentPassword, user.password);
  if (!isValid) throw new ApiError(401, 'Current password is incorrect');

  const hashed = await hashPassword(newPassword);
  await db.update(schema.users).set({ password: hashed, updatedAt: new Date() }).where(eq(schema.users.id, user.id));

  res.json({ success: true, message: 'Password changed successfully' });
}));

// PUT /api/auth/profile
router.put('/profile', authenticate, asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  const updates: any = { updatedAt: new Date() };
  if (name) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  await db.update(schema.users).set(updates).where(eq(schema.users.id, req.user!.id));
  res.json({ success: true, message: 'Profile updated' });
}));

export default router;
