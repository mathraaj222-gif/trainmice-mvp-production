import dotenv from 'dotenv';

dotenv.config();

// Validate required environment variables in production
const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);
  if (missing.length > 0) {
    console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Validate JWT_SECRET strength in production
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long in production');
    process.exit(1);
  }
}

// Validate CORS origins format
const validateOrigin = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Normalize URL by removing trailing slash
const normalizeUrl = (url: string): string => {
  return url.endsWith('/') ? url.slice(0, -1) : url;
};

const getCorsOrigins = () => {
  const origins: string[] = [];
  
  if (process.env.FRONTEND_URL_CLIENT) {
    if (validateOrigin(process.env.FRONTEND_URL_CLIENT)) {
      origins.push(normalizeUrl(process.env.FRONTEND_URL_CLIENT));
    } else {
      console.warn(`⚠️  Invalid FRONTEND_URL_CLIENT: ${process.env.FRONTEND_URL_CLIENT}`);
    }
  }
  
  if (process.env.FRONTEND_URL_TRAINER) {
    if (validateOrigin(process.env.FRONTEND_URL_TRAINER)) {
      origins.push(normalizeUrl(process.env.FRONTEND_URL_TRAINER));
    } else {
      console.warn(`⚠️  Invalid FRONTEND_URL_TRAINER: ${process.env.FRONTEND_URL_TRAINER}`);
    }
  }
  
  if (process.env.FRONTEND_URL_ADMIN) {
    if (validateOrigin(process.env.FRONTEND_URL_ADMIN)) {
      origins.push(normalizeUrl(process.env.FRONTEND_URL_ADMIN));
    } else {
      console.warn(`⚠️  Invalid FRONTEND_URL_ADMIN: ${process.env.FRONTEND_URL_ADMIN}`);
    }
  }

  // In production, require at least one valid origin
  if (process.env.NODE_ENV === 'production' && origins.length === 0) {
    console.error('❌ At least one FRONTEND_URL must be set in production');
    process.exit(1);
  }

  // Fallback to localhost in development
  if (origins.length === 0) {
    origins.push(
      normalizeUrl('http://localhost:5173'),
      normalizeUrl('http://localhost:5174'),
      normalizeUrl('http://localhost:5175')
    );
  }

  return origins;
};

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'supersecretkey123-dev-only'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origins: getCorsOrigins(),
    credentials: true,
    // Legacy support for direct URL access
    clientUrl: process.env.FRONTEND_URL_CLIENT || 'http://localhost:5173',
    trainerUrl: process.env.FRONTEND_URL_TRAINER || 'http://localhost:5174',
    adminUrl: process.env.FRONTEND_URL_ADMIN || 'http://localhost:5175',
  },
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@trainmice.com',
  },
  app: {
    baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  },
  uploads: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
    allowedMimeTypes: (process.env.ALLOWED_MIME_TYPES || 'application/pdf,image/jpeg,image/png,image/jpg').split(','),
  },
};

export default config;

