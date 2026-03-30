import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { useAdminWebSocket } from '../hooks/useAdminWebSocket';
import api from '../services/api';
import '../styles/AdminPanel.css';

interface CacheConfig {
  timeframe: number;
  cache_months: number;
  enabled: boolean;
  last_sync_time: string | null;
}

interface CacheStatus {
  last_updated: string;
  timeframes: Array<{
    timeframe: number;
    cache_months: number;
    enabled: boolean;
    last_sync_time: string | null;
    candle_count: number;
  }>;
}

interface Terminal {
  account_id: string;
  account_number: number;
  server: string;
  process_id: number;
  is_running: boolean;
  login_status: string;
  started_at: string;
  last_ping: string;
  folder_size_mb: number;
  uptime_seconds: number;
}

interface TerminalStats {
  total_terminals: number;
  running_terminals: number;
  offline_terminals: number;
  error_terminals: number;
  total_size_mb: number;
}

interface DatabaseStats {
  total_candles: number;
  total_historical: number;
  oldest_candle: string | null;
  newest_candle: string | null;
  symbols_count: number;
  estimated_size_mb: number;
  cleanup_due: boolean;
}

interface PollerStatus {
  data_type: string;
  is_active: boolean;
  is_failing: boolean;
  retry_count: number;
  base_interval: number;
  current_interval: number;
  last_error: string | null;
  last_success_time: string | null;
  last_failure_time: string | null;
}

const TIMEFRAME_NAMES: Record<number, string> = {
  1: '1 minute',
  5: '5 minutes',
  15: '15 minutes',
  30: '30 minutes',
  60: '1 hour',
  240: '4 hours',
  1440: '1 day',
  10080: '1 week',
  43200: '1 month',
};

type TabType = 'cache' | 'database' | 'terminals' | 'polling' | 'stats';

export default function AdminPanel() {
  const { isAuthenticated, accountNumber, accessToken } = useStore();
  const [activeTab, setActiveTab] = useState<TabType>('cache');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Cache tab state
  const [cacheConfig, setCacheConfig] = useState<CacheConfig[]>([]);
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [editingTimeframe, setEditingTimeframe] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ months: number; enabled: boolean }>({
    months: 0,
    enabled: true,
  });

  // Terminal tab state
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalStats, setTerminalStats] = useState<TerminalStats | null>(null);

  // Database tab state
  const [databaseStats, setDatabaseStats] = useState<DatabaseStats | null>(null);

  // Polling tab state
  const [pollingStatus, setPollingStatus] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    loadAllData();
  }, [isAuthenticated]);

  // Initialize WebSocket for real-time admin updates
  useAdminWebSocket(
    accessToken,
    true, // isAdmin - we know we're on admin page if we got here
    (data) => { setCacheStatus(data); }, // onCacheUpdate
    (data) => { 
      if (data.terminals) setTerminals(data.terminals);
      if (data.stats) setTerminalStats(data.stats);
    }, // onTerminalUpdate
    (data) => { setPollingStatus(data); }, // onPollingUpdate
    (data) => { setDatabaseStats(data); } // onDatabaseUpdate
  );

  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadCacheConfig(),
        loadCacheStatus(),
        loadTerminalData(),
        loadDatabaseStats(),
        loadPollingStatus(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  // ============================================================================
  // CACHE TAB FUNCTIONS
  // ============================================================================

  const loadCacheConfig = async () => {
    try {
      console.log('[ADMIN] Loading cache config...');
      const config = await api.getCacheConfig();
      setCacheConfig(config);
    } catch (error) {
      console.error('[ADMIN] Error loading cache config:', error);
    }
  };

  const loadCacheStatus = async () => {
    try {
      const status = await api.getCacheStatus();
      setCacheStatus(status);
    } catch (error) {
      console.error('[ADMIN] Error loading cache status:', error);
    }
  };

  const handleEditClick = (config: CacheConfig) => {
    setEditingTimeframe(config.timeframe);
    setEditValues({
      months: config.cache_months,
      enabled: config.enabled,
    });
  };

  const handleSaveConfig = async (timeframe: number) => {
    try {
      setSyncing(true);
      await api.updateCacheConfig(timeframe, editValues.months, editValues.enabled);
      showMessage(`Updated ${TIMEFRAME_NAMES[timeframe]} cache configuration`);
      setEditingTimeframe(null);
      await loadCacheConfig();
      await loadCacheStatus();
    } catch (error) {
      console.error('[ADMIN] Error saving cache config:', error);
      showMessage('Failed to update cache configuration', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleForceSyncAll = async () => {
    try {
      setSyncing(true);
      await api.forceSyncNow();
      showMessage('Sync triggered for all timeframes');
      setTimeout(loadCacheStatus, 2000);
    } catch (error) {
      console.error('[ADMIN] Error forcing sync:', error);
      showMessage('Failed to trigger sync', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ============================================================================
  // TERMINAL TAB FUNCTIONS
  // ============================================================================

  const loadTerminalData = async () => {
    try {
      const [listResponse, statsResponse] = await Promise.all([
        api.listTerminals(),
        api.getTerminalStats(),
      ]);
      setTerminals(listResponse.terminals || []);
      setTerminalStats(statsResponse);
    } catch (error) {
      console.error('[ADMIN] Error loading terminal data:', error);
    }
  };

  const handleCleanupTerminal = async (accountId: string) => {
    if (!window.confirm('Are you sure? This will kill the terminal and delete its files.')) {
      return;
    }
    try {
      setSyncing(true);
      await api.cleanupTerminal(accountId);
      showMessage('Terminal cleaned up successfully');
      await loadTerminalData();
    } catch (error) {
      console.error('[ADMIN] Error cleaning up terminal:', error);
      showMessage('Failed to cleanup terminal', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleCleanupInactive = async () => {
    if (!window.confirm('Clean up all inactive terminals (not used in 24 hours)?')) {
      return;
    }
    try {
      setSyncing(true);
      const result = await api.cleanupInactiveTerminals(24);
      showMessage(result.message);
      await loadTerminalData();
    } catch (error) {
      console.error('[ADMIN] Error cleaning inactive terminals:', error);
      showMessage('Failed to cleanup inactive terminals', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ============================================================================
  // DATABASE TAB FUNCTIONS
  // ============================================================================

  const loadDatabaseStats = async () => {
    try {
      const stats = await api.getDatabaseStats();
      setDatabaseStats(stats);
    } catch (error) {
      console.error('[ADMIN] Error loading database stats:', error);
    }
  };

  const handleDatabaseCleanup = async () => {
    if (!window.confirm('Clean up old database records? This will delete candles older than 6 months and historical data older than 90 days.')) {
      return;
    }
    try {
      setSyncing(true);
      const result = await api.cleanupDatabase();
      showMessage(result.message);
      await loadDatabaseStats();
    } catch (error) {
      console.error('[ADMIN] Error cleaning database:', error);
      showMessage('Failed to cleanup database', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // ============================================================================
  // POLLING TAB FUNCTIONS
  // ============================================================================

  const loadPollingStatus = async () => {
    try {
      const status = await api.getPollingStatus();
      setPollingStatus(status);
    } catch (error) {
      console.error('[ADMIN] Error loading polling status:', error);
    }
  };

  // ============================================================================
  // LOGOUT
  // ============================================================================

  const handleLogout = async () => {
    try {
      await api.logout();
      localStorage.removeItem('access_token');
      useStore.setState({
        isAuthenticated: false,
        accessToken: null,
        accountId: null,
        accountNumber: null,
        server: null,
      });
    } catch (error) {
      console.error('[ADMIN] Logout error:', error);
    }
  };

  if (!isAuthenticated) {
    return <div className="admin-panel">Please login first</div>;
  }

  if (loading) {
    return (
      <div className="admin-panel">
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="header-left">
          <h1>TradeMatrix Admin</h1>
        </div>
        <div className="header-right">
          <span className="admin-account">Admin #{accountNumber}</span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {message && (
        <div className={`message ${messageType}`}>
          {message}
          <button
            className="close-btn"
            onClick={() => setMessage('')}
          >
            ×
          </button>
        </div>
      )}

      <div className="tabs-container">
        <div className="tabs">
          <button
            className={`tab ${activeTab === 'cache' ? 'active' : ''}`}
            onClick={() => setActiveTab('cache')}
          >
            Cache Configuration
          </button>
          <button
            className={`tab ${activeTab === 'database' ? 'active' : ''}`}
            onClick={() => setActiveTab('database')}
          >
            Database
          </button>
          <button
            className={`tab ${activeTab === 'terminals' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminals')}
          >
            Terminals ({terminalStats?.total_terminals || 0})
          </button>
          <button
            className={`tab ${activeTab === 'polling' ? 'active' : ''}`}
            onClick={() => setActiveTab('polling')}
          >
            Polling
          </button>
          <button
            className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            System Stats
          </button>
        </div>
      </div>

      <div className="admin-content">
        {/* CACHE TAB */}
        {activeTab === 'cache' && (
          <>
            <section className="admin-section">
              <h2>Cache Configuration</h2>
              <div className="config-table-container">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Timeframe</th>
                      <th>Cache Months</th>
                      <th>Enabled</th>
                      <th>Last Sync</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cacheConfig.map((config) => (
                      <tr key={config.timeframe}>
                        <td className="timeframe-name">
                          {TIMEFRAME_NAMES[config.timeframe] || `${config.timeframe}m`}
                        </td>
                        <td>
                          {editingTimeframe === config.timeframe ? (
                            <input
                              type="number"
                              min="1"
                              title="Cache months for this timeframe"
                              value={editValues.months}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  months: parseInt(e.target.value),
                                }))
                              }
                              disabled={syncing}
                            />
                          ) : (
                            config.cache_months
                          )}
                        </td>
                        <td>
                          {editingTimeframe === config.timeframe ? (
                            <input
                              type="checkbox"
                              title="Enable or disable this cache configuration"
                              checked={editValues.enabled}
                              onChange={(e) =>
                                setEditValues((prev) => ({
                                  ...prev,
                                  enabled: e.target.checked,
                                }))
                              }
                              disabled={syncing}
                            />
                          ) : (
                            <span className={`status ${config.enabled ? 'enabled' : 'disabled'}`}>
                              {config.enabled ? '✓' : '✗'}
                            </span>
                          )}
                        </td>
                        <td className="last-sync">
                          {config.last_sync_time
                            ? new Date(config.last_sync_time).toLocaleString()
                            : 'Never'}
                        </td>
                        <td className="actions">
                          {editingTimeframe === config.timeframe ? (
                            <>
                              <button
                                className="save-btn"
                                onClick={() => handleSaveConfig(config.timeframe)}
                                disabled={syncing}
                              >
                                Save
                              </button>
                              <button
                                className="cancel-btn"
                                onClick={() => setEditingTimeframe(null)}
                                disabled={syncing}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="edit-btn"
                              onClick={() => handleEditClick(config)}
                              disabled={syncing}
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="admin-section">
              <h2>Cache Status</h2>
              <div className="status-container">
                {cacheStatus && (
                  <div className="status-grid">
                    {cacheStatus.timeframes.map((tf) => (
                      <div key={tf.timeframe} className="status-card">
                        <h3>{TIMEFRAME_NAMES[tf.timeframe] || `${tf.timeframe}m`}</h3>
                        <div className="status-info">
                          <div className="info-row">
                            <span className="label">Candles:</span>
                            <span className="value">{tf.candle_count}</span>
                          </div>
                          <div className="info-row">
                            <span className="label">Cache Size:</span>
                            <span className="value">{tf.cache_months} mo</span>
                          </div>
                          <div className={`status ${tf.enabled ? 'enabled' : 'disabled'}`}>
                            {tf.enabled ? 'Active' : 'Inactive'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="admin-section">
              <h2>Cache Actions</h2>
              <div className="actions-container">
                <button
                  className="sync-btn"
                  onClick={handleForceSyncAll}
                  disabled={syncing}
                >
                  {syncing ? 'Syncing...' : 'Force Sync All'}
                </button>
                <p className="action-description">
                  Trigger immediate synchronization of all enabled timeframes.
                </p>
              </div>
            </section>
          </>
        )}

        {/* DATABASE TAB */}
        {activeTab === 'database' && (
          <>
            <section className="admin-section">
              <h2>Database Statistics</h2>
              {databaseStats && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{databaseStats.total_candles}</div>
                    <div className="stat-label">Total Candles</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{databaseStats.total_historical}</div>
                    <div className="stat-label">Historical Records</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{databaseStats.symbols_count}</div>
                    <div className="stat-label">Unique Symbols</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{databaseStats.estimated_size_mb} MB</div>
                    <div className="stat-label">Est. Size</div>
                  </div>
                </div>
              )}
              {databaseStats && (
                <div className="db-details">
                  <p>
                    <strong>Data Range:</strong>{' '}
                    {databaseStats.oldest_candle
                      ? new Date(databaseStats.oldest_candle).toLocaleDateString()
                      : 'N/A'}{' '}
                    to{' '}
                    {databaseStats.newest_candle
                      ? new Date(databaseStats.newest_candle).toLocaleDateString()
                      : 'N/A'}
                  </p>
                  {databaseStats.cleanup_due && (
                    <p className="warning">
                      ⚠️ Cleanup recommended: {databaseStats.total_candles} records stored
                    </p>
                  )}
                </div>
              )}
            </section>

            <section className="admin-section">
              <h2>Database Cleanup</h2>
              <p className="section-description">
                Delete old data according to retention policies:
                <br />- Candles older than 6 months
                <br />- Historical data older than 90 days
              </p>
              <button
                className="cleanup-btn"
                onClick={handleDatabaseCleanup}
                disabled={syncing}
              >
                {syncing ? 'Cleaning...' : 'Run Cleanup'}
              </button>
            </section>
          </>
        )}

        {/* TERMINALS TAB */}
        {activeTab === 'terminals' && (
          <>
            <section className="admin-section">
              <h2>Terminal Statistics</h2>
              {terminalStats && (
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-value">{terminalStats.total_terminals}</div>
                    <div className="stat-label">Total Terminals</div>
                  </div>
                  <div className="stat-card success">
                    <div className="stat-value">{terminalStats.running_terminals}</div>
                    <div className="stat-label">Running</div>
                  </div>
                  <div className="stat-card warning">
                    <div className="stat-value">{terminalStats.offline_terminals}</div>
                    <div className="stat-label">Offline</div>
                  </div>
                  <div className="stat-card error">
                    <div className="stat-value">{terminalStats.error_terminals}</div>
                    <div className="stat-label">Errors</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{terminalStats.total_size_mb} MB</div>
                    <div className="stat-label">Total Size</div>
                  </div>
                </div>
              )}
            </section>

            <section className="admin-section">
              <h2>Active Terminals</h2>
              {terminals.length === 0 ? (
                <p className="no-data">No active terminals</p>
              ) : (
                <div className="terminals-table-container">
                  <table className="terminals-table">
                    <thead>
                      <tr>
                        <th>Account #</th>
                        <th>Server</th>
                        <th>Status</th>
                        <th>PID</th>
                        <th>Uptime</th>
                        <th>Size (MB)</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {terminals.map((terminal) => (
                        <tr key={terminal.account_id}>
                          <td>{terminal.account_number}</td>
                          <td>{terminal.server}</td>
                          <td>
                            <span
                              className={`status-badge ${
                                terminal.is_running ? 'running' : 'offline'
                              }`}
                            >
                              {terminal.login_status}
                            </span>
                          </td>
                          <td>{terminal.process_id}</td>
                          <td>
                            {terminal.uptime_seconds > 0
                              ? `${Math.floor(terminal.uptime_seconds / 3600)}h ${Math.floor(
                                  (terminal.uptime_seconds % 3600) / 60
                                )}m`
                              : '—'}
                          </td>
                          <td>{terminal.folder_size_mb.toFixed(1)}</td>
                          <td>
                            <button
                              className="cleanup-terminal-btn"
                              onClick={() =>
                                handleCleanupTerminal(terminal.account_id)
                              }
                              disabled={syncing}
                            >
                              Cleanup
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-section">
              <h2>Terminal Cleanup</h2>
              <p className="section-description">
                Clean up inactive terminals that haven't been used in 24 hours.
              </p>
              <button
                className="cleanup-inactive-btn"
                onClick={handleCleanupInactive}
                disabled={syncing || terminals.length === 0}
              >
                {syncing ? 'Cleaning...' : 'Clean Inactive Terminals'}
              </button>
            </section>
          </>
        )}

        {/* POLLING TAB */}
        {activeTab === 'polling' && (
          <>
            <section className="admin-section">
              <h2>Polling Service Status</h2>
              {pollingStatus ? (
                <div className="polling-status-container">
                  {pollingStatus.map((poller: PollerStatus) => (
                    <div key={poller.data_type} className="poller-card">
                      <div className="poller-header">
                        <h3>{poller.data_type}</h3>
                        <div className="poller-badges">
                          <span className={`status-badge ${poller.is_active ? 'active' : 'inactive'}`}>
                            {poller.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {poller.is_failing && (
                            <span className="status-badge failing">Failing</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="poller-details">
                        <div className="detail-row">
                          <span className="detail-label">Base Interval:</span>
                          <span className="detail-value">{poller.base_interval}s</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Current Interval:</span>
                          <span className="detail-value">{poller.current_interval}s</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Retry Count:</span>
                          <span className="detail-value">{poller.retry_count}</span>
                        </div>
                        
                        {poller.last_success_time && (
                          <div className="detail-row success">
                            <span className="detail-label">Last Success:</span>
                            <span className="detail-value">
                              {new Date(poller.last_success_time).toLocaleString()}
                            </span>
                          </div>
                        )}
                        
                        {poller.last_failure_time && (
                          <div className="detail-row error">
                            <span className="detail-label">Last Failure:</span>
                            <span className="detail-value">
                              {new Date(poller.last_failure_time).toLocaleString()}
                            </span>
                          </div>
                        )}
                        
                        {poller.last_error && (
                          <div className="detail-row error">
                            <span className="detail-label">Error:</span>
                            <span className="detail-value">{poller.last_error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>Loading polling status...</p>
              )}
            </section>
          </>
        )}

        {/* STATS TAB */}
        {activeTab === 'stats' && (
          <section className="admin-section">
            <h2>System Statistics</h2>
            <div className="system-stats">
              <div className="stat-group">
                <h3>Database</h3>
                {databaseStats && (
                  <ul>
                    <li>
                      Total Records: <strong>{databaseStats.total_candles + databaseStats.total_historical}</strong>
                    </li>
                    <li>
                      Total Size: <strong>{databaseStats.estimated_size_mb} MB</strong>
                    </li>
                    <li>
                      Symbols: <strong>{databaseStats.symbols_count}</strong>
                    </li>
                    <li>
                      Cleanup Due: <strong>{databaseStats.cleanup_due ? 'Yes' : 'No'}</strong>
                    </li>
                  </ul>
                )}
              </div>

              <div className="stat-group">
                <h3>Terminals</h3>
                {terminalStats && (
                  <ul>
                    <li>
                      Total: <strong>{terminalStats.total_terminals}</strong>
                    </li>
                    <li>
                      Running: <strong className="success">{terminalStats.running_terminals}</strong>
                    </li>
                    <li>
                      Offline: <strong className="warning">{terminalStats.offline_terminals}</strong>
                    </li>
                    <li>
                      Errors: <strong className="error">{terminalStats.error_terminals}</strong>
                    </li>
                    <li>
                      Total Size: <strong>{terminalStats.total_size_mb} MB</strong>
                    </li>
                  </ul>
                )}
              </div>

              <div className="stat-group">
                <h3>Cache</h3>
                {cacheStatus && (
                  <ul>
                    <li>
                      Last Updated: <strong>{new Date(cacheStatus.last_updated).toLocaleString()}</strong>
                    </li>
                    <li>
                      Timeframes: <strong>{cacheStatus.timeframes.length}</strong>
                    </li>
                    <li>
                      Active: <strong>{cacheStatus.timeframes.filter((t) => t.enabled).length}</strong>
                    </li>
                    <li>
                      Total Candles: <strong>{cacheStatus.timeframes.reduce((sum, t) => sum + t.candle_count, 0)}</strong>
                    </li>
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
