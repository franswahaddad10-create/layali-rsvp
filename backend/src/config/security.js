const rateLimit = require('express-rate-limit');

const insecureJwtSecrets = new Set(['supersecretjwt', 'changeme', 'secret']);
const defaultAdminUsernames = new Set(['admin']);
const defaultAdminPasswords = new Set(['admin123', 'password', '123456']);

const isProduction = () => process.env.NODE_ENV === 'production';

const getJwtSecret = () => {
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required.');
  }

  return jwtSecret;
};

const validateSecurityConfig = () => {
  const jwtSecret = getJwtSecret();
  const adminUsername = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || 'admin123';

  if (isProduction() && insecureJwtSecrets.has(jwtSecret)) {
    throw new Error('JWT_SECRET must not use a known insecure default value in production.');
  }

  if (isProduction() && (defaultAdminUsernames.has(adminUsername) || defaultAdminPasswords.has(adminPassword))) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD must be changed from default values in production.');
  }
};

const getAllowedOrigins = () => {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const buildCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.length === 0 && !isProduction()) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('CORS origin denied.'));
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Auth-Token'],
  };
};

const isSeedAdminEnabled = () => process.env.ENABLE_SEED_ADMIN === 'true' && !isProduction();

const getPasswordMinLength = () => Number(process.env.PASSWORD_MIN_LENGTH) || 10;

const validatePasswordStrength = (password, username = '') => {
  if (typeof password !== 'string' || password.length < getPasswordMinLength()) {
    return {
      valid: false,
      error: `Password must be at least ${getPasswordMinLength()} characters long and include uppercase, lowercase, and a number.`,
    };
  }

  if (/\s/.test(password)) {
    return { valid: false, error: 'Password cannot contain spaces.' };
  }

  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    return {
      valid: false,
      error: `Password must be at least ${getPasswordMinLength()} characters long and include uppercase, lowercase, and a number.`,
    };
  }

  if (username && password.toLowerCase().includes(String(username).trim().toLowerCase())) {
    return { valid: false, error: 'Password cannot contain the username.' };
  }

  return { valid: true };
};

const getLoginMaxFailedAttempts = () => Number(process.env.LOGIN_MAX_FAILED_ATTEMPTS) || 5;
const getLoginLockMinutes = () => Number(process.env.LOGIN_LOCK_MINUTES) || 15;
const getLoginLockDurationMs = () => getLoginLockMinutes() * 60 * 1000;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Please try again later.' },
});

const publicRsvpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.PUBLIC_RSVP_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many RSVP requests. Please try again later.' },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.WEBHOOK_RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many webhook requests. Please try again later.' },
});

module.exports = {
  authLimiter,
  buildCorsOptions,
  getJwtSecret,
  getLoginLockDurationMs,
  getLoginLockMinutes,
  getLoginMaxFailedAttempts,
  getPasswordMinLength,
  isSeedAdminEnabled,
  publicRsvpLimiter,
  validatePasswordStrength,
  validateSecurityConfig,
  webhookLimiter,
};