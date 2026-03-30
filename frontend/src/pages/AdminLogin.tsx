import { useState } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import '../styles/Login.css';

export default function AdminLogin() {
  const [formData, setFormData] = useState({
    account_number: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { setAuth } = useStore((state) => ({
    setAuth: state.setAuth,
  }));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      console.log('[ADMIN-LOGIN] Attempting admin login with account:', formData.account_number);

      // Use unified login endpoint without server - backend checks admin credentials
      const response = await api.login({
        account_number: parseInt(formData.account_number),
        password: formData.password,
      });

      console.log('[ADMIN-LOGIN] Response:', response);

      // Verify it's admin
      if (response.role !== 'admin') {
        setError('Account is not an admin account');
        setLoading(false);
        return;
      }

      // Save token
      localStorage.setItem('access_token', response.access_token);
      api.setToken(response.access_token);

      // Update store with admin info
      setAuth(response.access_token, response.account_id, response.account_number, '', 'admin');

      console.log('[ADMIN-LOGIN] Authenticated as admin, redirecting to admin panel');
    } catch (error: any) {
      console.error('[ADMIN-LOGIN] Login failed:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Admin login failed';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>TradeMatrix Admin</h1>
        <p className="subtitle">Administrator Panel</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="account_number">Admin Account Number</label>
            <input
              type="number"
              name="account_number"
              id="account_number"
              value={formData.account_number}
              onChange={handleChange}
              placeholder="Enter admin account number"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              name="password"
              id="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="Enter password"
              required
              disabled={loading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Admin Login'}
          </button>
        </form>

        <div className="login-footer">
          <p>
            Regular user? <a href="/login">Login here</a>
          </p>
        </div>
      </div>
    </div>
  );
}
