// ============================================
// JWT UTILITIES
// ============================================

import * as jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import type { AuthUser } from '../../../../packages/shared-types/src/index';

const jwtSignOptions: jwt.SignOptions = {
  expiresIn: config.jwtExpiresIn,
};

const jwtRefreshSignOptions: jwt.SignOptions = {
  expiresIn: config.jwtRefreshExpiresIn,
};

export function generateToken(payload: AuthUser): string {
  return jwt.sign(payload, config.jwtSecret as jwt.Secret, jwtSignOptions);
}

export function generateRefreshToken(payload: AuthUser): string {
  return jwt.sign(payload, config.jwtRefreshSecret as jwt.Secret, jwtRefreshSignOptions);
}

export function verifyToken(token: string, isRefresh = false): AuthUser | null {
  try {
    const secret = (isRefresh ? config.jwtRefreshSecret : config.jwtSecret) as jwt.Secret;
    const decoded = jwt.verify(token, secret) as AuthUser;
    return decoded;
  } catch (error) {
    return null;
  }
}

export function decodeToken(token: string): any {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
}
