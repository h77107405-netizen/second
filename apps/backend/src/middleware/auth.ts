// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import type { AuthUser, UserRole } from '../../../../packages/shared-types/src/index';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
      });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
      });
      return;
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
    });
  }
}

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Not authenticated',
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Insufficient permissions.',
      });
      return;
    }

    next();
  };
}

// Specific role middlewares
export const requireAdmin = authorize('admin' as UserRole);
export const requireTeacher = authorize('teacher' as UserRole, 'admin' as UserRole);
export const requireStudent = authorize('student' as UserRole, 'teacher' as UserRole, 'admin' as UserRole);
