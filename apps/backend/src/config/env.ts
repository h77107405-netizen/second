import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'coaching-platform-jwt-secret-2024',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'coaching-platform-jwt-refresh-secret-2024',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5000,http://localhost:5002,http://127.0.0.1:5000,http://127.0.0.1:5002',
  sessionSecret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'coaching-platform-session-secret-2024',
} as const;

export function validateEnv() {
  const missing = [] as string[];
  if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!process.env.JWT_SECRET) missing.push('JWT_SECRET');
  if (!process.env.JWT_REFRESH_SECRET) missing.push('JWT_REFRESH_SECRET');
  if (missing.length) {
    const message = `Missing required environment variables: ${missing.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(message);
    }
    console.warn(`⚠️ ${message}`);
  }
}
