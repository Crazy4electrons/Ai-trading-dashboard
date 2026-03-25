/**
 * Auth utility — JWT token generation and validation
 * Handles secure token creation, validation, and credential management
 */
import jwt from 'jsonwebtoken';
import { mt5Logger } from './logger.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production-min-32-chars';
const TOKEN_EXPIRY = '24h'; // Token expires in 24 hours
const REFRESH_TOKEN_EXPIRY = '7d'; // Refresh token expires in 7 days

/**
 * Generate JWT token for authenticated user
 */
export function generateToken(accountId, account, server) {
  try {
    const token = jwt.sign(
      {
        accountId,
        account,
        server,
        iat: Math.floor(Date.now() / 1000),
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    mt5Logger.debug('AuthToken', 'Token generated', { accountId });
    return token;
  } catch (error) {
    mt5Logger.error('TokenGen', 'Failed to generate token', error);
    throw error;
  }
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    if (!token) {
      throw new Error('No token provided');
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    const decoded = jwt.verify(cleanToken, JWT_SECRET);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      mt5Logger.warn('TokenVerify', 'Token expired');
      throw new Error('Token expired');
    }
    if (error.name === 'JsonWebTokenError') {
      mt5Logger.warn('TokenVerify', 'Invalid token');
      throw new Error('Invalid token');
    }
    mt5Logger.error('TokenVerify', 'Token verification failed', error);
    throw error;
  }
}

/**
 * Middleware to verify token in requests
 */
export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'No authorization header',
        message: 'Missing authentication token'
      });
    }

    const decoded = verifyToken(authHeader);
    
    // Attach decoded token to request
    req.user = decoded;
    req.token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    
    next();
  } catch (error) {
    mt5Logger.warn('AuthMiddleware', 'Authentication failed', { error: error.message });
    return res.status(401).json({
      error: error.message,
      message: 'Authentication failed'
    });
  }
}

/**
 * Get token from request header
 */
export function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
}

/**
 * Optionally verify token (doesn't fail if missing)
 */
export function optionalAuthMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const decoded = verifyToken(authHeader);
      req.user = decoded;
      req.token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    }
  } catch (error) {
    // Silently fail - log but continue
    mt5Logger.debug('OptionalAuth', 'Optional auth check failed', { error: error.message });
  }
  
  next();
}
