/**
 * LoginScreen — Authentication page for MT5 credentials
 * Validates credentials with backend, receives JWT token, then redirects to dashboard
 */
import { useState } from 'react';
import styles from './LoginScreen.module.css';

// Compute API endpoints:
// - `VITE_API_URL` may point to MT5-specific routes (e.g. /api/mt5)
// - Auth endpoints live under `/api/auth` (root API), so derive `AUTH_API` accordingly
const getAPIUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api`;
  }
  return 'http://localhost:3001/api';
};

const API = getAPIUrl();

// Auth API root: if `VITE_API_URL` points at `/api/mt5`, replace with `/api`.
const getAuthApi = () => {
  const env = import.meta.env.VITE_API_URL;
  if (env) {
    if (env.endsWith('/api/mt5')) return env.replace('/api/mt5', '/api');
    if (env.includes('/api/mt5')) return env.replace('/api/mt5', '/api');
    // If env already points to API root, use it
    if (env.endsWith('/api')) return env;
    // Otherwise, try to append /api
    return env.replace(/\/$/, '') + '/api';
  }
  // Fallback to computed API
  return API;
};

const AUTH_API = getAuthApi();

export default function LoginScreen({ onLoginSuccess }) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!account.trim() || !password.trim()) {
        throw new Error('Please enter both account and password');
      }

      const res = await fetch(`${AUTH_API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          account: account.trim(),
          password,
          server,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || 'Login failed');
      }

      if (!data.token) {
        throw new Error('No authentication token received');
      }

      // Store token
      localStorage.setItem('tm_token', data.token);
      localStorage.setItem('tm_account', data.account_id || account);

      // Call success callback
      onLoginSuccess(data.token);
    } catch (e) {
      console.error('Login error:', e);
      if (e.name === 'AbortError') {
        setError('Connection timeout. Backend server not responding.');
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.logoArea}>
        <span className={styles.icon}>◈</span>
        <h1 className={styles.title}>TradeMatrix</h1>
        <p className={styles.subtitle}>AI-Powered Trading Dashboard</p>
      </div>

      <form onSubmit={handleLogin} className={styles.form}>
        <h2 className={styles.formTitle}>MT5 Login</h2>

        {error && (
          <div className={styles.errorBox}>
            <span className={styles.errorIcon}>⚠</span>
            <p>{error}</p>
          </div>
        )}

        <div className={styles.formGroup}>
          <label htmlFor="account" className={styles.label}>Account Number</label>
          <input
            id="account"
            type="text"
            placeholder="e.g., 123456789"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            disabled={loading}
            className={styles.input}
            autoFocus
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <div className={styles.passwordWrapper}>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your MT5 terminal password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className={styles.input}
            />
            <button
              type="button"
              className={styles.togglePassword}
              onClick={() => setShowPassword(!showPassword)}
              disabled={loading}
              title={showPassword ? 'Hide' : 'Show'}
            >
              {showPassword ? '👁' : '👁‍🗨'}
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="server" className={styles.label}>Server</label>
          <input
            id="server"
            type="text"
            placeholder="e.g., MetaQuotes-Demo or Custom"
            value={server}
            onChange={(e) => setServer(e.target.value)}
            disabled={loading}
            className={styles.input}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`${styles.submitBtn} ${loading ? styles.loading : ''}`}
        >
          {loading ? (
            <>
              <span className={styles.spinner}>⟳</span>
              Connecting to MT5…
            </>
          ) : (
            '→ Login'
          )}
        </button>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Your credentials are securely transmitted to your backend server only.
            They are not stored in your browser.
          </p>
        </div>
      </form>

      <div className={styles.features}>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>📊</span>
          <span>Live Trading Data</span>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>🔐</span>
          <span>Secure Authentication</span>
        </div>
        <div className={styles.feature}>
          <span className={styles.featureIcon}>⚡</span>
          <span>Real-Time Updates</span>
        </div>
      </div>
    </div>
  );
}
