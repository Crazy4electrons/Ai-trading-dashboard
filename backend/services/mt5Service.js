/**
 * MT5Service — communicates with Python MT5 bridge via subprocess
 * Provides account info, candles, positions, orders, and order management
 */
import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { platform } from 'os';
import { existsSync } from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const BRIDGE_PATH = join(__dirname, '../python/mt5_bridge.py');

// Detect correct Python executable — prefer .venv if available
function getPythonCmd() {
  const isWindows = platform() === 'win32';
  const pythonDir = join(__dirname, '../python'); // backend/python/
  const venvPath = isWindows
    ? join(pythonDir, '.venv', 'Scripts', 'python.exe')
    : join(pythonDir, '.venv', 'bin', 'python');
  
  if (existsSync(venvPath)) {
    console.log(`✅ Found virtual environment at: ${venvPath}`);
    return venvPath;
  }
  
  console.warn(`⚠️  Virtual environment not found at: ${venvPath}`);
  console.warn(`   Falling back to system Python executable`);
  
  // Fallback to system Python
  return isWindows ? 'python' : 'python3';
}

const PYTHON_CMD = getPythonCmd();

let bridgeProcess = null;
let connected = false;
let pendingRequests = new Map();
let nextRequestId = 1;
let tickCallbacks = [];
let candleCallbacks = [];
let bridgeReady = false;

function startBridge() {
  if (bridgeProcess) return;
  
  try {
    console.log(`🐍 Starting MT5 Bridge with Python: ${PYTHON_CMD}`);
    
    // Set up environment for venv
    const env = { ...process.env };
    if (existsSync(join(__dirname, '../python', '.venv'))) {
      const pythonDir = join(__dirname, '../python');
      const isWindows = platform() === 'win32';
      const venvPath = isWindows
        ? join(pythonDir, '.venv')
        : join(pythonDir, '.venv');
      
      // Set VIRTUAL_ENV and update PATH to use venv
      env.VIRTUAL_ENV = venvPath;
      if (isWindows) {
        env.PATH = join(venvPath, 'Scripts') + ';' + env.PATH;
      } else {
        env.PATH = join(venvPath, 'bin') + ':' + env.PATH;
      }
      console.log(`✅ Virtual environment activated: ${venvPath}`);
    }
    
    bridgeProcess = spawn(PYTHON_CMD, [BRIDGE_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
      env: env,
    });

    let buffer = '';
    let stderrOutput = '';

    bridgeProcess.stdout.on('data', (data) => {
      buffer += data;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line

      lines.forEach((line) => {
        if (!line.trim()) return;
        try {
          const response = JSON.parse(line);
          
          // Handle startup confirmation
          if (response.status === 'bridge_started') {
            bridgeReady = true;
            console.log('✅ MT5 Bridge is ready and waiting for commands');
            return;
          }
          
          const id = response.id;
          if (id && pendingRequests.has(id)) {
            const { resolve } = pendingRequests.get(id);
            pendingRequests.delete(id);
            resolve(response);
          }
        } catch (e) {
          console.error('Failed to parse bridge response:', e.message);
        }
      });
    });

    bridgeProcess.stderr.on('data', (data) => {
      stderrOutput += data.toString();
      console.error('[MT5 Bridge stderr]', data.toString());
    });

    bridgeProcess.on('error', (err) => {
      console.error('Bridge spawn error:', err.message);
      if (err.code === 'ENOENT') {
        console.error(`\n❌ Python executable "${PYTHON_CMD}" not found.`);
        console.error(`\n📝 Fix this by:`);
        console.error(`   1. Install Python 3 from https://www.python.org/downloads/`);
        console.error(`   2. On Windows: Check "Add Python to PATH" during installation`);
        console.error(`   3. Create virtual environment: cd backend/python && python -m venv .venv`);
        console.error(`   4. Install MetaTrader5: uv pip install MetaTrader5`);
        console.error(`   5. Restart the backend server\n`);
      }
      bridgeProcess = null;
      connected = false;
    });

    bridgeProcess.on('exit', (code) => {
      if (code !== 0) {
        console.error(`\n❌ MT5 Bridge exited with code ${code}`);
        if (stderrOutput) {
          console.error('Error output:');
          console.error(stderrOutput);
        }
        console.error(`\n📝 Troubleshooting:`);
        console.error(`   1. Run: test_mt5.bat (to check MetaTrader5 installation)`);
        console.error(`   2. Run: diagnose_python.bat (for full diagnostic)`);
        console.error(`   3. Ensure MetaTrader 5 terminal is running`);
        console.error(`   4. Check credentials in environment variables\n`);
      } else {
        console.log('MT5 Bridge exited normally');
      }
      bridgeProcess = null;
      connected = false;
    });
  } catch (e) {
    console.error('Failed to start MT5 bridge:', e.message);
    bridgeProcess = null;
  }
}

function sendCommand(cmd) {
  return new Promise((resolve) => {
    if (!bridgeProcess) {
      startBridge();
    }

    if (!bridgeProcess) {
      return resolve({ error: 'Failed to start MT5 bridge. Ensure Python 3 and MetaTrader5 library are installed.' });
    }

    const id = nextRequestId++;
    const request = { ...cmd, id };
    
    // Longer timeout for connect command since MT5 init can take time
    const isConnect = cmd.cmd === 'connect';
    const timeoutDuration = isConnect ? 30000 : 10000;
    
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      const timeoutMsg = isConnect 
        ? 'MT5 connection timeout. Make sure MetaTrader 5 terminal is running and account credentials are correct.'
        : 'Request timeout';
      resolve({ error: timeoutMsg });
    }, timeoutDuration);

    pendingRequests.set(id, {
      resolve: (response) => {
        clearTimeout(timeout);
        if (response.debug) {
          console.log('[MT5 Bridge debug]', response.debug);
        }
        resolve(response);
      },
    });

    try {
      bridgeProcess.stdin.write(JSON.stringify(request) + '\n');
    } catch (e) {
      pendingRequests.delete(id);
      resolve({ error: `Failed to send command: ${e.message}` });
    }
  });
}

export const MT5Service = {
  /** Initialize MT5 connection with account credentials */
  async init(account, password, server = 'MetaQuotes-Demo') {
    try {
      // Validate inputs
      if (!account || !password) {
        return { error: 'Account and password required' };
      }

      // Start bridge if not running
      if (!bridgeProcess) {
        startBridge();
      }

      // Send connect command
      const response = await sendCommand({
        cmd: 'connect',
        account: parseInt(account),
        password,
        server: server || 'MetaQuotes-Demo',
      });

      if (response.success) {
        connected = true;
        console.log('✅ Connected to MT5');
      }

      return response;
    } catch (e) {
      return { error: e.message };
    }
  },

  /** Get account information */
  async getAccountInfo() {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({ cmd: 'account_info' });
  },

  /** Get candles for a symbol */
  async getCandles(symbol, timeframe = '1h', count = 200) {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({
      cmd: 'get_candles',
      symbol,
      timeframe,
      count,
    });
  },

  /** Get current price for a symbol */
  async getPrice(symbol) {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({
      cmd: 'get_price',
      symbol,
    });
  },

  /** Get open positions */
  async getPositions() {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({ cmd: 'get_positions' });
  },

  /** Get trade history */
  async getHistory(fromDate = null, toDate = null, days = 30) {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({
      cmd: 'get_history',
      from_date: fromDate,
      to_date: toDate,
      days,
    });
  },

  /** Place a new order */
  async placeOrder(symbol, type, volume, price = null, sl = null, tp = null) {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({
      cmd: 'place_order',
      symbol,
      type,
      volume,
      price,
      sl,
      tp,
    });
  },

  /** Close a position by ticket */
  async closeOrder(ticket) {
    if (!connected) {
      return { error: 'Not connected to MT5. Call /connect first.' };
    }
    return await sendCommand({
      cmd: 'close_order',
      ticket,
    });
  },

  /** Subscribe to price updates */
  onTick(callback) {
    tickCallbacks.push(callback);
  },

  /** Subscribe to candle updates */
  onCandleUpdate(callback) {
    candleCallbacks.push(callback);
  },

  /** Emit a candle update (called from server.js for live updates) */
  emitCandleUpdate(symbol, timeframe, candle) {
    candleCallbacks.forEach((cb) => {
      try {
        cb(symbol, timeframe, candle);
      } catch (e) {
        console.error('Error in candle callback:', e);
      }
    });
  },

  /** Get mock candles for testing */
  getMockCandles(symbol, timeframe = '1h', count = 100) {
    const candles = [];
    const now = Date.now() / 1000; // Convert to seconds
    
    // Calculate interval in seconds based on timeframe
    let interval = 3600; // default 1 hour
    if (timeframe === '5m') interval = 300;
    else if (timeframe === '15m') interval = 900;
    else if (timeframe === '30m') interval = 1800;
    else if (timeframe === '1h') interval = 3600;
    else if (timeframe === '4h') interval = 14400;
    else if (timeframe === '1d') interval = 86400;
    else if (timeframe === '1w') interval = 604800;

    // Generate realistic looking candlesticks
    let basePrice = symbol.includes('USD') ? 
      (symbol === 'BTCUSD' ? 45000 : symbol === 'ETHUSD' ? 2500 : 1.0) : 100;
    
    for (let i = count - 1; i >= 0; i--) {
      const time = Math.floor(now - i * interval);
      const open = basePrice + (Math.random() - 0.5) * (basePrice * 0.02);
      const close = open + (Math.random() - 0.5) * (basePrice * 0.02);
      const high = Math.max(open, close) + Math.random() * (basePrice * 0.01);
      const low = Math.min(open, close) - Math.random() * (basePrice * 0.01);

      candles.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 1000000),
      });
      
      // Slight trend for more realistic chart
      basePrice = close;
    }

    return candles;
  },
};

export const getMockCandles = (symbol, timeframe = '1h', count = 100) => {
  return MT5Service.getMockCandles(symbol, timeframe, count);
};
