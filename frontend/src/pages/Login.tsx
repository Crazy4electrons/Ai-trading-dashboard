import { useState } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import '../styles/Login.css';

interface LoginForm {
  server: string;
  account_number: string;
  password: string;
}

export default function Login() {
  const { setAuth } = useStore();
  const [form, setForm] = useState<LoginForm>({
    server: 'MetaQuotes-Demo',
    account_number: '',
    password: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.login({
        server: form.server,
        account_number: parseInt(form.account_number),
        password: form.password,
      });

      // Save token
      localStorage.setItem('access_token', response.access_token);
      api.setToken(response.access_token);

      // Update store
      setAuth(
        response.access_token,
        response.account_id,
        response.account_number,
        form.server
      );

      // Fetch initial data
      try {
        await api.refreshSymbolsCache();
        const watchlist = await api.getWatchlist();
        const accountInfo = await api.getAccountInfo();
        useStore.setState({
          watchlist: watchlist.items,
          accountInfo: accountInfo,
        });
      } catch (e) {
        console.warn('Failed to fetch initial data:', e);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="login-branding">
          <img src="/tradematrix-logo.svg" alt="TradeMatrix" />
          <h1>TradeMatrix</h1>
          <p>AI-Powered Trading Dashboard</p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-card">
          <h2>MT5 Login</h2>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Server</label>
              <input
                type="text"
                name="server"
                value={form.server}
                onChange={handleChange}
                placeholder="e.g. MetaQuotes-Demo or Custom"
                required
              />
            </div>

            <div className="form-group">
              <label>Account Number</label>
              <input
                type="number"
                name="account_number"
                value={form.account_number}
                onChange={handleChange}
                placeholder="Your account number"
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Your password"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn btn-primary login-button"
              disabled={isLoading}
            >
              {isLoading ? 'Logging in...' : '→ Login'}
            </button>
          </form>

          <div className="login-features">
            <div className="feature">
              <span className="icon">📊</span>
              <span>Live Trading Data</span>
            </div>
            <div className="feature">
              <span className="icon">🔒</span>
              <span>Secure Authentication</span>
            </div>
            <div className="feature">
              <span className="icon">⚡</span>
              <span>Real-Time Updates</span>
            </div>
          </div>

          <p className="login-disclaimer">
            Your credentials are securely transmitted to your backend server only. 
            They are not stored in plain text.
          </p>
        </div>
      </div>
    </div>
  );
}
