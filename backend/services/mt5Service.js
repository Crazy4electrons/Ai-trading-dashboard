/**
 * MT5Service - FastAPI Python Server Client
 * Spawns Python MT5 bridge server and communicates with it via HTTP/REST
 * Handles credential persistence, health checks, and automatic reconnection
 */
import { spawn, execSync } from 'child_process';
import axios from 'axios';
import { mt5Logger } from '../utils/logger.js';
import { getCredentialManager } from '../utils/credentialEncryption.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_MT5_DIR = path.join(__dirname, '../../pythonMT5');
const PYTHON_MAIN = path.join(PYTHON_MT5_DIR, 'src/main.py');

// Configuration
const PYTHON_MT5_PORT = parseInt(process.env.PYTHON_MT5_PORT || '3002');
const PYTHON_MT5_HOST = '127.0.0.1';
const PYTHON_MT5_URL = `http://${PYTHON_MT5_HOST}:${PYTHON_MT5_PORT}`;
const API_TOKEN = process.env.PYTHON_MT5_TOKEN_SECRET || 'default_token';
const PYTHON_PATH = process.env.PYTHON_PATH || 'python';
const HEALTH_CHECK_INTERVAL = 2000; // 2 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const AUTO_RESTART_TIMEOUT = 30000; // 30 seconds between restart attempts

class MT5ServiceImpl {
  constructor() {
    this.pythonProcess = null;
    this.connected = false;
    this.accountInfo = null;
    this.healthCheckInterval = null;
    this.isShuttingDown = false;
    this.restartAttempts = 0;
    this.maxRestartAttempts = 3;
    this.lastRestartTime = 0;
    this.candleCache = new Map();
    this.credentialManager = null;
    
    mt5Logger.debug('MT5Service', 'Initialized');
  }

  /**
   * Check if Python is available in PATH
   */
  checkPythonAvailable() {
    try {
      const cmd = platform() === 'win32' ? 'where python' : 'which python';
      execSync(cmd, { stdio: 'pipe' });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Start Python MT5 server as subprocess
   * Spawns the FastAPI server with MT5 credentials
   */
  async startPythonServer(account, password, server) {
    if (this.pythonProcess) {
      mt5Logger.warn('MT5Server', 'Python server already running');
      return true;
    }

    // Check if Python is available
    if (!this.checkPythonAvailable()) {
      const errorMsg = `Python is not installed or not in PATH. Cannot start MT5 server. ` +
        `Please install Python 3.8+ from https://www.python.org/downloads/ and add it to PATH.`;
      mt5Logger.error('PythonCheck', errorMsg);
      this.pythonNotAvailable = true;
      return false;
    }

    // Rate limit restart attempts
    if (this.restartAttempts > 0 && Date.now() - this.lastRestartTime < AUTO_RESTART_TIMEOUT) {
      mt5Logger.warn('MT5Server', `Restart throttled. Next attempt at ${new Date(this.lastRestartTime + AUTO_RESTART_TIMEOUT)}`);
      return false;
    }

    try {
      mt5Logger.mt5Service('StartServer', 'Spawning Python server', {
        account,
        server,
        pythonExe: PYTHON_PATH,
        mainScript: PYTHON_MAIN,
        port: PYTHON_MT5_PORT
      });

      // Prepare environment variables for Python process
      const childEnv = {
        ...process.env,
        NODE_API_TOKEN: API_TOKEN,
        NODE_WS_URL: `ws://127.0.0.1:${process.env.PORT || 3001}/api/mt5/ws-internal`
      };

      // Start Python process
      this.pythonProcess = spawn(PYTHON_PATH, [
        PYTHON_MAIN,
        '--account', String(account),
        '--password', password,
        '--server', server,
        '--port', String(PYTHON_MT5_PORT),
        '--host', PYTHON_MT5_HOST
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        cwd: PYTHON_MT5_DIR,
        shell: platform() === 'win32' ? true : false,
        env: childEnv
      });

      let stdoutBuffer = '';
      let stderrBuffer = '';

      // Capture stdout (logs)
      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutBuffer += output;
        
        // Log individual lines
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.trim()) {
            mt5Logger.debug('Python', line.trim());
          }
        });
      });

      // Capture stderr (errors)
      this.pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrBuffer += output;
        
        const lines = stderrBuffer.split('\n');
        stderrBuffer = lines.pop() || '';
        
        lines.forEach(line => {
          if (line.trim()) {
            mt5Logger.error('Python', 'stderr', new Error(line.trim()));
          }
        });
      });

      this.pythonProcess.on('error', (error) => {
        mt5Logger.error('PythonSpawn', 'Failed to spawn Python process', error);
        this.pythonProcess = null;
        this.connected = false;
      });

      this.pythonProcess.on('exit', (code, signal) => {
        if (!this.isShuttingDown) {
          mt5Logger.error('PythonProcess', `Exited with code ${code}, signal ${signal}`);
        }
        this.pythonProcess = null;
        this.connected = false;
      });

      // Wait for server to be ready
      await this.waitForServerReady();

      this.connected = true;
      this.restartAttempts = 0;
      this.lastRestartTime = Date.now();

      mt5Logger.mt5Service('StartServer', 'Python server started successfully', { port: PYTHON_MT5_PORT });

      // Start health check
      this.startHealthCheck();

      return true;

    } catch (error) {
      mt5Logger.error('StartServer', 'Failed to start Python server', error);
      this.restartAttempts++;
      this.lastRestartTime = Date.now();

      if (this.pythonProcess) {
        try {
          this.pythonProcess.kill();
        } catch (e) {
          // Already dead
        }
        this.pythonProcess = null;
      }

      return false;
    }
  }

  /**
   * Wait for Python server to be ready AND MT5 to be connected
   * Python auto-login happens asynchronously, so we need to wait for mt5_connected
   */
  async waitForServerReady(timeoutMs = 30000) {
    const startTime = Date.now();
    let lastStatus = null;

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await axios.get(`${PYTHON_MT5_URL}/health`, {
          timeout: 3000
        });

        lastStatus = response.data;
        
        if (response.status === 200 && response.data.status === 'ok' && response.data.mt5_connected) {
          mt5Logger.debug('HealthCheck', 'Server and MT5 are ready', {
            serverStatus: response.data.status,
            mt5Connected: response.data.mt5_connected,
            wsConnected: response.data.ws_connected
          });
          return true;
        } else if (response.status === 200) {
          mt5Logger.debug('ServerReady', 'Server up, waiting for MT5 login', {
            status: response.data.status,
            mt5_connected: response.data.mt5_connected,
            elapsed: Date.now() - startTime
          }); 
        }
      } catch (error) {
        mt5Logger.debug('ServerReady', 'Server not ready yet', { error: error.message });
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const errorMsg = lastStatus 
      ? `Python server did not fully initialize within ${timeoutMs}ms. Status: MT5=${lastStatus.mt5_connected}, WS=${lastStatus.ws_connected}`
      : `Python server did not respond within ${timeoutMs}ms`;
    
    throw new Error(errorMsg);
  }

  /**
   * Start periodic health checks
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${PYTHON_MT5_URL}/health`, {
          timeout: HEALTH_CHECK_TIMEOUT
        });

        if (response.status === 200) {
          const { mt5_connected } = response.data;
          if (!mt5_connected && this.connected) {
            mt5Logger.warn('HealthCheck', 'MT5 disconnected on server');
            this.connected = false;
          }
        }
      } catch (error) {
        if (this.connected && !this.isShuttingDown) {
          mt5Logger.error('HealthCheck', 'Health check failed', error);
          this.connected = false;
        }
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Shutdown Python server gracefully
   */
  shutdown() {
    this.isShuttingDown = true;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    if (this.pythonProcess) {
      try {
        this.pythonProcess.kill('SIGTERM');
        mt5Logger.mt5Service('Shutdown', 'Sent SIGTERM to Python server');
      } catch (error) {
        mt5Logger.error('Shutdown', 'Failed to kill Python process', error);
      }
    }

    this.connected = false;
  }

  /**
   * HTTP request to Python server with token auth
   */
  async httpRequest(method, endpoint, data = null, retries = 3) {
    const url = `${PYTHON_MT5_URL}${endpoint}`;
    const headers = {
      'X-API-Token': API_TOKEN,
      'Content-Type': 'application/json'
    };

    // Sanitize data for logging (mask sensitive fields)
    const sanitize = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      try {
        const copy = JSON.parse(JSON.stringify(obj));
        if (copy.password) copy.password = '***';
        if (copy.token) copy.token = '***';
        return copy;
      } catch (e) {
        return obj;
      }
    };

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let response;

        mt5Logger.mt5Command('HTTPRequest', `Attempt ${attempt + 1}: ${method} ${endpoint}`, sanitize(data));

        if (method === 'GET') {
          response = await axios.get(url, { headers, timeout: 10000 });
        } else if (method === 'POST') {
          response = await axios.post(url, data, { headers, timeout: 10000 });
        } else {
          throw new Error(`Unsupported method: ${method}`);
        }

        mt5Logger.mt5Response(endpoint, { attempt: attempt + 1, status: response.status, data: response.data });

        return response.data;

      } catch (error) {
        // If axios provided a response, include status/data in the log
        if (error.response) {
          mt5Logger.error('HTTPRequest', `Attempt ${attempt + 1} failed: ${method} ${endpoint} -> HTTP ${error.response.status}`, {
            attempt: attempt + 1,
            status: error.response.status,
            data: error.response.data
          });
        } else {
          mt5Logger.error('HTTPRequest', `Attempt ${attempt + 1} failed: ${method} ${endpoint}`, { attempt: attempt + 1, message: error.message });
        }

        if (attempt === retries - 1) {
          this.connected = false;
          const msg = error.response ? (error.response.data || error.response.statusText) : error.message;
          return { error: String(msg), status: error.response ? error.response.status : null };
        }

        // Exponential backoff before retry
        const delay = Math.min(1000 * (2 ** attempt), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return { error: 'Max retries exceeded' };
  }

  /**
   * Initialize MT5 connection
   */
  async init(account, password, server = 'MetaQuotes-Demo') {
    try {
      this.credentialManager = getCredentialManager();

      // Start Python server
      const serverStarted = await this.startPythonServer(account, password, server);

      if (!serverStarted) {
        const errorMsg = this.pythonNotAvailable 
          ? 'Python is not installed. Please install Python 3.8+ and add it to your system PATH.'
          : 'Failed to start Python server';
        return {
          error: true,
          connected: false,
          message: errorMsg
        };
      }

      // Send login request
      const result = await this.httpRequest('POST', '/login', {
        account,
        password,
        server
      });

      if (result.connected) {
        this.accountInfo = result;

        // Save credentials encrypted
        try {
          this.credentialManager.saveCredentials(account, password, server);
          mt5Logger.mt5Service('Init', 'Credentials saved to disk');
        } catch (error) {
          mt5Logger.warn('Init', 'Failed to save credentials', error);
        }

        return result;
      }

      return result;

    } catch (error) {
      mt5Logger.error('Init', 'Connection failed', error);
      return {
        error: true,
        connected: false,
        message: error.message
      };
    }
  }

  /**
   * Auto-init with saved credentials
   */
  async autoInit() {
    try {
      this.credentialManager = getCredentialManager();
      const saved = this.credentialManager.loadCredentials();

      if (!saved) {
        mt5Logger.debug('AutoInit', 'No saved credentials found');
        return false;
      }

      mt5Logger.mt5Service('AutoInit', 'Attempting auto-login with saved credentials', {
        account: saved.account
      });

      return await this.init(saved.account, saved.password, saved.server);

    } catch (error) {
      mt5Logger.error('AutoInit', 'Auto-init failed', error);
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }
    return await this.httpRequest('GET', '/account');
  }

  /**
   * Get candles (with caching)
   */
  async getCandles(symbol, timeframe = '1h', count = 200) {
    if (!this.connected) {
      return { error: 'MT5 not connected', candles: [] };
    }

    // Check cache
    const cacheKey = `${symbol}:${timeframe}`;
    const cached = this.candleCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      mt5Logger.debug('CandleCache', 'Cache hit', { symbol, timeframe });
      return { error: false, candles: cached.candles };
    }

    const result = await this.httpRequest('GET', `/candles/${symbol}?timeframe=${timeframe}&count=${count}`);

    if (!result.error && result.candles) {
      this.candleCache.set(cacheKey, {
        candles: result.candles,
        timestamp: Date.now()
      });
    }

    return result;
  }

  /**
   * Get prices (latest tick)
   */
  async getPrice(symbol) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }
    // Get latest tick from cache or fetch
    return await this.httpRequest('GET', `/symbol/${symbol}`);
  }

  /**
   * Get open positions
   */
  async getPositions() {
    if (!this.connected) {
      return { error: 'MT5 not connected', positions: [] };
    }
    return await this.httpRequest('GET', '/positions');
  }

  /**
   * Get trade history
   */
  async getHistory(startDate = null, endDate = null, days = 30) {
    if (!this.connected) {
      return { error: 'MT5 not connected', trades: [] };
    }
    return await this.httpRequest('GET', `/trades?days=${days}`);
  }

  /**
   * Place order
   */
  async placeOrder(symbol, orderType, volume, stopLoss = null, takeProfit = null) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }

    return await this.httpRequest('POST', '/order', {
      symbol,
      order_type: orderType,
      volume,
      stop_loss: stopLoss,
      take_profit: takeProfit
    });
  }

  /**
   * Close position
   */
  async closePosition(ticket) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }

    return await this.httpRequest('POST', `/close/${ticket}`, {});
  }

  /**
   * Get symbols
   */
  async getSymbols() {
    if (!this.connected) {
      return { error: 'MT5 not connected', symbols: [] };
    }
    return await this.httpRequest('GET', '/symbols');
  }

  /**
   * Get symbol information
   */
  async getSymbolInfo(symbol) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }
    return await this.httpRequest('GET', `/symbol/${symbol}`);
  }

  /**
   * Get order book depth
   */
  async getDepth(symbol) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }
    return await this.httpRequest('GET', `/depth/${symbol}`);
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.pythonProcess !== null;
  }

  /**
   * Subscribe to real-time ticks
   */
  async subscribeSymbol(symbol) {
    if (!this.connected) {
      return { error: 'MT5 not connected' };
    }
    return await this.httpRequest('POST', `/subscribe/${symbol}`, {});
  }

  /**
   * Unsubscribe from real-time ticks
   */
  async unsubscribeSymbol(symbol) {
    return await this.httpRequest('POST', `/unsubscribe/${symbol}`, {});
  }
}

// Singleton instance
let mt5ServiceInstance = null;

export function getMT5Service() {
  if (!mt5ServiceInstance) {
    mt5ServiceInstance = new MT5ServiceImpl();
  }
  return mt5ServiceInstance;
}

export const MT5Service = {
  init: (account, password, server) => getMT5Service().init(account, password, server),
  autoInit: () => getMT5Service().autoInit(),
  getAccountInfo: () => getMT5Service().getAccountInfo(),
  getCandles: (symbol, timeframe, count) => getMT5Service().getCandles(symbol, timeframe, count),
  getCandlesPaginated: (symbol, timeframe, offset, limit) =>
    getMT5Service().getCandles(symbol, timeframe, limit),
  getPrice: (symbol) => getMT5Service().getPrice(symbol),
  getPositions: () => getMT5Service().getPositions(),
  getHistory: (from, to, days) => getMT5Service().getHistory(from, to, days),
  placeOrder: (symbol, type, volume, stopLoss = null, takeProfit = null) =>
    getMT5Service().placeOrder(symbol, type, volume, stopLoss, takeProfit),
  closePosition: (ticket) => getMT5Service().closePosition(ticket),
  getSymbols: () => getMT5Service().getSymbols(),
  getSymbolInfo: (symbol) => getMT5Service().getSymbolInfo(symbol),
  getDepth: (symbol) => getMT5Service().getDepth(symbol),
  isConnected: () => getMT5Service().isConnected(),
  subscribeSymbol: (symbol) => getMT5Service().subscribeSymbol(symbol),
  unsubscribeSymbol: (symbol) => getMT5Service().unsubscribeSymbol(symbol),
  shutdown: () => getMT5Service().shutdown()
};

export default MT5Service;
