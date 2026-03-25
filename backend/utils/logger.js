/**
 * Centralized Logging Utility for Node Backend
 * Logs to separate files for debug, MT5 service, WebSocket, and errors
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.join(__dirname, '../logs');

// Create logs directory if doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

class Logger {
  constructor(name) {
    this.name = name;
    this.debugLog = path.join(LOGS_DIR, 'debug.log');
    this.mt5ServiceLog = path.join(LOGS_DIR, 'mt5_service.log');
    this.websocketLog = path.join(LOGS_DIR, 'websocket.log');
    this.errorLog = path.join(LOGS_DIR, 'errors.log');
  }

  /**
   * Format timestamp as [YYYY-MM-DD HH:MM:SS]
   */
  getTimestamp() {
    return new Date().toISOString().replace('T', ' ').split('.')[0];
  }

  /**
   * Log to file with rotation support
   */
  writeToFile(filepath, message, maxSizeMB = 10) {
    try {
      // Check file size and rotate if needed
      if (fs.existsSync(filepath)) {
        const stats = fs.statSync(filepath);
        const maxBytes = maxSizeMB * 1024 * 1024;
        
        if (stats.size > maxBytes) {
          const timestamp = Date.now();
          fs.renameSync(filepath, `${filepath}.${timestamp}`);
        }
      }

      fs.appendFileSync(filepath, message + '\n');
    } catch (error) {
      console.error(`[Logger] Failed to write to ${filepath}: ${error.message}`);
    }
  }

  /**
   * Format log message
   */
  formatMessage(level, context, message, data = null) {
    const timestamp = this.getTimestamp();
    let msg = `[${timestamp}] [${level}] [${this.name}] ${context}: ${message}`;
    
    if (data) {
      msg += ` | ${JSON.stringify(data)}`;
    }
    
    return msg;
  }

  /**
   * DEBUG level - all messages
   */
  debug(context, message, data = null) {
    const msg = this.formatMessage('DEBUG', context, message, data);
    this.writeToFile(this.debugLog, msg);
    console.log(msg);
  }

  /**
   * INFO level - important events
   */
  info(context, message, data = null) {
    const msg = this.formatMessage('INFO', context, message, data);
    this.writeToFile(this.debugLog, msg);
    console.log(msg);
  }

  /**
   * WARNING level
   */
  warn(context, message, data = null) {
    const msg = this.formatMessage('WARN', context, message, data);
    this.writeToFile(this.debugLog, msg);
    console.warn(msg);
  }

  /**
   * ERROR level - also written to errors.log
   */
  error(context, message, error = null) {
    const errorMsg = error ? ` | ${error.message}` : '';
    const msg = this.formatMessage('ERROR', context, message) + errorMsg;
    this.writeToFile(this.debugLog, msg);
    this.writeToFile(this.errorLog, msg);
    
    if (error && error.stack) {
      this.writeToFile(this.errorLog, `Stack: ${error.stack}`);
    }
    
    console.error(msg);
  }

  /**
   * MT5 Service specific logging
   */
  mt5Service(context, message, data = null) {
    const msg = this.formatMessage('INFO', context, message, data);
    this.writeToFile(this.mt5ServiceLog, msg);
    this.writeToFile(this.debugLog, msg);
    console.log(msg);
  }

  /**
   * WebSocket specific logging
   */
  websocket(context, message, data = null) {
    const msg = this.formatMessage('INFO', context, message, data);
    this.writeToFile(this.websocketLog, msg);
    this.writeToFile(this.debugLog, msg);
    console.log(msg);
  }

  /**
   * Log HTTP request/response
   */
  httpRequest(method, path, statusCode, duration = null) {
    const durationStr = duration ? ` (${duration}ms)` : '';
    const msg = this.formatMessage(
      statusCode >= 400 ? 'WARN' : 'DEBUG',
      'HTTP',
      `${method} ${path} -> ${statusCode}${durationStr}`
    );
    this.writeToFile(this.debugLog, msg);
  }

  /**
   * Log MT5 command sent to Python server
   */
  mt5Command(command, params = null) {
    const msg = this.formatMessage('DEBUG', 'MT5Command', command, params);
    this.writeToFile(this.mt5ServiceLog, msg);
    this.writeToFile(this.debugLog, msg);
  }

  /**
   * Log MT5 server response
   */
  mt5Response(command, result = null) {
    const msg = this.formatMessage('DEBUG', 'MT5Response', command, result);
    this.writeToFile(this.mt5ServiceLog, msg);
    if (result && result.error) {
      this.writeToFile(this.errorLog, msg);
    }
  }
}

// Create logger instances
const debugLogger = new Logger('Backend');
const mt5Logger = new Logger('MT5');
const wsLogger = new Logger('WebSocket');

export { debugLogger, mt5Logger, wsLogger };
export default debugLogger;
