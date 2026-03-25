/**
 * Authentication routes
 * Handles user login, logout, and token verification
 */
import { Router } from 'express';
import { MT5Service } from '../services/mt5Service.js';
import { generateToken, verifyToken, authMiddleware } from '../utils/authToken.js';
import { mt5Logger } from '../utils/logger.js';

const router = Router();

/**
 * POST /auth/login
 * Authenticate user with MT5 credentials
 * Returns JWT token if successful
 */
router.post('/login', async (req, res) => {
  try {
    const { account, password, server = 'MetaQuotes-Demo' } = req.body;

    // Validate input
    if (!account || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Account and password are required'
      });
    }

    mt5Logger.mt5Service('Login', 'Attempting authentication', {
      account,
      server
    });

    // Attempt to connect to MT5
    const result = await MT5Service.init(account, password, server);

    if (!result.connected) {
      mt5Logger.warn('Login', 'MT5 connection failed', {
        account,
        error: result.error
      });

      return res.status(401).json({
        error: result.error || 'MT5 connection failed',
        message: 'Failed to authenticate with MT5'
      });
    }

    // Generate JWT token
    const token = generateToken(result.account_id, account, server);

    mt5Logger.mt5Service('Login', 'Authentication successful', {
      account: result.account_id,
      balance: result.balance
    });

    return res.status(200).json({
      success: true,
      token,
      account_id: result.account_id,
      balance: result.balance,
      equity: result.equity,
      message: 'Successfully authenticated'
    });

  } catch (error) {
    mt5Logger.error('Login', 'Login error', error);
    
    return res.status(500).json({
      error: error.message,
      message: 'Internal server error during login'
    });
  }
});

/**
 * GET /auth/verify
 * Verify that the current token is valid
 * Requires authentication token
 */
router.get('/verify', authMiddleware, async (req, res) => {
  try {
    const { accountId, account, server } = req.user;

    mt5Logger.debug('Verify', 'Token verified', { accountId });

    return res.status(200).json({
      success: true,
      accountId,
      account,
      server,
      message: 'Token is valid'
    });

  } catch (error) {
    mt5Logger.error('Verify', 'Verification error', error);
    
    return res.status(500).json({
      error: error.message,
      message: 'Token verification failed'
    });
  }
});

/**
 * POST /auth/logout
 * Logout current user and invalidate token
 * Requires authentication token
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    const { accountId } = req.user;

    mt5Logger.mt5Service('Logout', 'User logged out', { accountId });

    // In a real app, you might invalidate the token in a blacklist
    // For now, we just return success - token becomes invalid on its own

    return res.status(200).json({
      success: true,
      message: 'Successfully logged out'
    });

  } catch (error) {
    mt5Logger.error('Logout', 'Logout error', error);
    
    return res.status(500).json({
      error: error.message,
      message: 'Logout failed'
    });
  }
});

/**
 * GET /auth/status
 * Get current authentication status
 * Optional authentication - returns status whether authenticated or not
 */
router.get('/status', (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(200).json({
        authenticated: false,
        message: 'Not authenticated'
      });
    }

    try {
      const decoded = verifyToken(authHeader);
      
      return res.status(200).json({
        authenticated: true,
        accountId: decoded.accountId,
        account: decoded.account,
        server: decoded.server,
        message: 'User is authenticated'
      });
    } catch (tokenError) {
      return res.status(200).json({
        authenticated: false,
        message: 'Token invalid or expired'
      });
    }

  } catch (error) {
    mt5Logger.error('Status', 'Status check error', error);
    
    return res.status(500).json({
      error: error.message,
      message: 'Status check failed'
    });
  }
});

export default router;
