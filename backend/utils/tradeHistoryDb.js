/**
 * Trade History Database Utility
 * Manages persistent storage of closed trades and balance snapshots
 * Uses SQLite for local persistent storage
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'trade_history.db');

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

/**
 * Trade History Database Manager
 */
class TradeHistoryDb {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize database connection and create tables
   */
  initialize() {
    if (this.initialized) return;

    try {
      this.db = new Database(dbPath);
      
      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Create trades table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          symbol TEXT NOT NULL,
          type TEXT NOT NULL,
          volume REAL NOT NULL,
          open_price REAL NOT NULL,
          close_price REAL NOT NULL,
          open_time INTEGER NOT NULL,
          close_time INTEGER NOT NULL,
          profit_loss REAL NOT NULL,
          balance REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(account_id, symbol, open_time)
        );
        CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
        CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
        CREATE INDEX IF NOT EXISTS idx_trades_created_at ON trades(created_at);
      `);

      // Create balance snapshots table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS balance_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id INTEGER NOT NULL,
          balance REAL NOT NULL,
          free_margin REAL,
          used_margin REAL,
          equity REAL,
          timestamp INTEGER NOT NULL,
          event TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(account_id, timestamp, event)
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_account_id ON balance_snapshots(account_id);
        CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ON balance_snapshots(timestamp);
      `);

      this.initialized = true;
      console.log(`[TradeHistoryDb] Database initialized at ${dbPath}`);
    } catch (error) {
      console.error('[TradeHistoryDb] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Save a closed trade to database
   * @param {Object} tradeData - Trade info {account_id, symbol, type, volume, open_price, close_price, open_time, close_time, profit_loss, balance}
   * @returns {Object} - {success: boolean, trade_id: number, error?: string}
   */
  saveTrade(tradeData) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      const {
        account_id,
        symbol,
        type,
        volume,
        open_price,
        close_price,
        open_time,
        close_time,
        profit_loss,
        balance
      } = tradeData;

      // Validate required fields
      if (!account_id || !symbol || !type || volume === undefined || 
          open_price === undefined || close_price === undefined ||
          open_time === undefined || close_time === undefined ||
          profit_loss === undefined || balance === undefined) {
        return { success: false, error: 'Missing required trade data fields' };
      }

      const stmt = this.db.prepare(`
        INSERT INTO trades (
          account_id, symbol, type, volume, open_price, close_price,
          open_time, close_time, profit_loss, balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        account_id,
        symbol,
        type,
        volume,
        open_price,
        close_price,
        open_time,
        close_time,
        profit_loss,
        balance
      );

      console.log(`[TradeHistoryDb] Trade saved: ID=${result.lastInsertRowid}, ${symbol}, P&L=${profit_loss}`);
      return { success: true, trade_id: result.lastInsertRowid };
    } catch (error) {
      console.error('[TradeHistoryDb] Save trade error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get trade history for an account
   * @param {number} account_id - Account ID
   * @param {number} limit - Max number of trades to return (default 100)
   * @param {number} offset - Offset for pagination (default 0)
   * @returns {Object} - {success: boolean, trades: Array, total: number, error?: string}
   */
  getTradeHistory(account_id, limit = 100, offset = 0) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      // Get total count
      const countStmt = this.db.prepare(
        'SELECT COUNT(*) as total FROM trades WHERE account_id = ?'
      );
      const countResult = countStmt.get(account_id);
      const total = countResult.total;

      // Get paginated trades
      const stmt = this.db.prepare(`
        SELECT * FROM trades 
        WHERE account_id = ? 
        ORDER BY close_time DESC 
        LIMIT ? OFFSET ?
      `);

      const trades = stmt.all(account_id, limit, offset);

      console.log(`[TradeHistoryDb] Retrieved ${trades.length} trades for account ${account_id}`);
      return { success: true, trades, total };
    } catch (error) {
      console.error('[TradeHistoryDb] Get trade history error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Save account balance snapshot
   * @param {number} account_id - Account ID
   * @param {Object} balanceData - {balance, free_margin?, used_margin?, equity?, event?}
   * @param {number} timestamp - Unix timestamp (milliseconds)
   * @returns {Object} - {success: boolean, snapshot_id?: number, error?: string}
   */
  saveBalanceSnapshot(account_id, balanceData, timestamp = Date.now()) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      const {
        balance,
        free_margin,
        used_margin,
        equity,
        event = 'manual'
      } = balanceData;

      if (balance === undefined) {
        return { success: false, error: 'Balance is required' };
      }

      const stmt = this.db.prepare(`
        INSERT INTO balance_snapshots (
          account_id, balance, free_margin, used_margin, equity, timestamp, event
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        account_id,
        balance,
        free_margin,
        used_margin,
        equity,
        Math.floor(timestamp / 1000), // Convert to seconds
        event
      );

      console.log(`[TradeHistoryDb] Balance snapshot saved: ID=${result.lastInsertRowid}, balance=${balance}`);
      return { success: true, snapshot_id: result.lastInsertRowid };
    } catch (error) {
      console.error('[TradeHistoryDb] Save balance snapshot error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get balance history for an account
   * @param {number} account_id - Account ID
   * @param {number} days - Number of days to look back (default 30)
   * @returns {Object} - {success: boolean, snapshots: Array, error?: string}
   */
  getBalanceHistory(account_id, days = 30) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      const secondsAgo = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

      const stmt = this.db.prepare(`
        SELECT * FROM balance_snapshots 
        WHERE account_id = ? AND timestamp >= ?
        ORDER BY timestamp DESC
      `);

      const snapshots = stmt.all(account_id, secondsAgo);

      console.log(`[TradeHistoryDb] Retrieved ${snapshots.length} balance snapshots for account ${account_id}`);
      return { success: true, snapshots };
    } catch (error) {
      console.error('[TradeHistoryDb] Get balance history error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get trade statistics for an account
   * @param {number} account_id - Account ID
   * @param {number} days - Number of days to analyze (default 30)
   * @returns {Object} - {success: boolean, stats: Object, error?: string}
   */
  getTradeStats(account_id, days = 30) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      const secondsAgo = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as winning_trades,
          SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losing_trades,
          SUM(CASE WHEN profit_loss > 0 THEN profit_loss ELSE 0 END) as total_profit,
          SUM(CASE WHEN profit_loss < 0 THEN profit_loss ELSE 0 END) as total_loss,
          SUM(profit_loss) as net_profit,
          AVG(profit_loss) as avg_profit_per_trade,
          MAX(profit_loss) as max_profit,
          MIN(profit_loss) as max_loss,
          MAX(balance) as max_balance,
          MIN(balance) as min_balance
        FROM trades
        WHERE account_id = ? AND close_time >= ?
      `);

      const stats = stmt.get(account_id, secondsAgo);

      console.log(`[TradeHistoryDb] Retrieved stats for account ${account_id}: ${stats.total_trades} trades`);
      return { success: true, stats };
    } catch (error) {
      console.error('[TradeHistoryDb] Get trade stats error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete old trades (for cleanup)
   * @param {number} days - Delete trades older than this many days
   * @returns {Object} - {success: boolean, deleted: number, error?: string}
   */
  deleteOldTrades(days = 90) {
    if (!this.db) {
      return { success: false, error: 'Database not initialized' };
    }

    try {
      const secondsAgo = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

      const stmt = this.db.prepare(`
        DELETE FROM trades WHERE close_time < ?
      `);

      const result = stmt.run(secondsAgo);

      console.log(`[TradeHistoryDb] Deleted ${result.changes} old trades`);
      return { success: true, deleted: result.changes };
    } catch (error) {
      console.error('[TradeHistoryDb] Delete old trades error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[TradeHistoryDb] Database closed');
    }
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create singleton instance
 */
export function getTradeHistoryDb() {
  if (!instance) {
    instance = new TradeHistoryDb();
    instance.initialize();
  }
  return instance;
}

export default getTradeHistoryDb();
