import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/env';
import authRoutes from './routes/auth.routes';
import coursesRoutes from './routes/courses.routes';
import trainersRoutes from './routes/trainers.routes';
import availabilityRoutes from './routes/availability.routes';
import bookingsRoutes from './routes/bookings.routes';
import contactRoutes from './routes/contact.routes';
import customRequestsRoutes from './routes/custom-requests.routes';
import eventsRoutes from './routes/events.routes';
import adminRoutes from './routes/admin.routes';
import trainerMessagesRoutes from './routes/trainer-messages.routes';
import eventEnquiryMessagesRoutes from './routes/event-enquiry-messages.routes';
import notificationsRoutes from './routes/notifications.routes';
import feedbackRoutes from './routes/feedback.routes';
import prisma from './config/database';
import path from 'path';

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration with enhanced logging
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Log CORS requests for debugging
    if (config.nodeEnv === 'development') {
      console.log(`🔍 CORS check - Origin: ${origin}`);
      console.log(`🔍 Allowed origins: ${config.cors.origins.join(', ')}`);
    }

    if (config.cors.origins.includes(origin)) {
      callback(null, true);
    } else {
      // Log rejected origins for debugging
      console.warn(`⚠️  CORS rejected origin: ${origin}`);
      console.warn(`⚠️  Allowed origins: ${config.cors.origins.join(', ')}`);
      callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
    }
  },
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request timeout (30 seconds)
app.use((req: Request, res: Response, next: NextFunction) => {
  req.setTimeout(30000, () => {
      res.status(408).json({ error: 'Request timeout' });
  });
  next();
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: process.env.npm_package_version || '1.0.0',
  });
});

// Database health check
app.get('/health/db', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbInfo = await prisma.$queryRaw<Array<{ db: string }>>`SELECT DATABASE() as db`;
    
    res.json({
      status: 'ok',
      database: {
        connected: true,
        name: dbInfo[0]?.db || 'unknown',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      database: {
        connected: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/trainers', trainersRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/custom-requests', customRequestsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/trainer/messages', trainerMessagesRoutes);
app.use('/api/event-enquiry-messages', eventEnquiryMessagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/feedback', feedbackRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
  });
});

// Global error handler
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  // Handle CORS errors specifically
  if (err.message && err.message.includes('CORS')) {
    console.error('❌ CORS Error:', {
      message: err.message,
      origin: req.headers.origin,
      path: req.path,
      method: req.method,
      allowedOrigins: config.cors.origins,
      timestamp: new Date().toISOString(),
    });
    return res.status(403).json({
      error: 'CORS Error',
      message: err.message,
      allowedOrigins: config.cors.origins,
    });
  }

  // Don't log errors for 404s
  if (err.status !== 404) {
    console.error('Error:', {
      message: err.message,
      stack: config.nodeEnv === 'development' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle known error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: err.message,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: err.message,
    });
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Duplicate entry',
      message: 'A record with this value already exists',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Record not found',
      message: 'The requested record does not exist',
    });
  }

  // Default error response
  const statusCode = err.status || err.statusCode || 500;
  return res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(config.nodeEnv === 'development' && { 
      stack: err.stack,
      details: err,
    }),
  });
});

// Start server
const PORT = config.port;

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔒 CORS Configuration:`);
  console.log(`   - Allowed origins: ${config.cors.origins.length > 0 ? config.cors.origins.join(', ') : 'NONE SET!'}`);
  console.log(`   - Credentials: ${config.cors.credentials}`);
  console.log(`   - Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH`);
  if (config.cors.origins.length === 0 && config.nodeEnv === 'production') {
    console.error(`❌ WARNING: No CORS origins configured! Set FRONTEND_URL_ADMIN in Railway!`);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received: closing HTTP server...`);
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    prisma.$disconnect().then(() => {
      console.log('✅ Database connection closed');
      process.exit(0);
    }).catch((error) => {
      console.error('❌ Error closing database:', error);
      process.exit(1);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

export default app;

