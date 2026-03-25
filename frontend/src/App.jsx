/**
 * App — root layout with authentication flow
 * Initial: Login Screen → Dashboard (after successful authentication)
 * Stores JWT token in localStorage and uses it for all API requests
 */
import { useState, useEffect } from 'react';
import { useApp } from './context/AppContext';

import LoginScreen from './components/LoginScreen';
import Dashboard from './components/Dashboard';

import './styles/globals.css';

export default function App() {
  const { backendConnected } = useApp();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if user is already authenticated on app load
  useEffect(() => {
    const token = localStorage.getItem('tm_token');
    
    if (token) {
      // Try to verify token with backend
      verifyToken(token);
    } else {
      setCheckingAuth(false);
    }
  }, []);

  const verifyToken = async (token) => {
    try {
      const protocol = window.location.protocol;
      const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
      const apiUrl = `${protocol}//${host}/api/auth/verify`;

      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('tm_token');
        localStorage.removeItem('tm_account');
        setIsAuthenticated(false);
      }
    } catch (e) {
      console.error('Token verification failed:', e);
      // On error, assume not authenticated
      localStorage.removeItem('tm_token');
      setIsAuthenticated(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLoginSuccess = (token) => {
    localStorage.setItem('tm_token', token);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_account');
    setIsAuthenticated(false);
  };

  // Show loading state while checking authentication
  if (checkingAuth) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        background: 'var(--bg-primary)',
        color: 'var(--text-secondary)',
        fontSize: 14,
      }}>
        <span style={{ animation: 'spin 1.5s linear infinite' }}>⟳</span>
        <span style={{ marginLeft: 12 }}>Checking authentication…</span>
      </div>
    );
  }

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  // Show dashboard if authenticated
  return <Dashboard onLogout={handleLogout} />;
}