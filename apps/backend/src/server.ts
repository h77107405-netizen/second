import express from 'express';
import cors from 'cors';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateEnv } from './config/env.js';
import { connectDatabase } from './config/database.js';
import routes from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

validateEnv();

const app = express();

// Trust proxy (needed for Replit + rate limiting to correctly identify clients)
app.set('trust proxy', 1);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

const allowedOrigins = (config.corsOrigin || '').split(',').map((origin) => origin.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.includes('app.github.dev') || origin.includes('preview') || origin.includes('vercel.app')) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);
app.use('/api/auth/login', authLimiter);

// Serve uploaded files
app.use('/api/uploads', express.static(path.join(process.cwd(), 'uploads')));

if (config.nodeEnv === 'development') {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({ message: 'Coaching Platform API', version: '1.0.0' });
});

app.use(notFoundHandler);
app.use(errorHandler);

async function startServer() {
  try {
    await connectDatabase();
    app.listen(config.port, () => {
      console.log(`🚀 API Server running on port ${config.port}`);
      console.log(`📡 SSE notifications available at /api/notifications/stream`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));

startServer();

export default app;
