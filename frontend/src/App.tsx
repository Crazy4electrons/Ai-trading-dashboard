import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { WebSocketClient } from './services/websocket';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

function App() {
  const { isAuthenticated, accessToken, setWSConnected } = useStore();

  useEffect(() => {
    // Check if token exists in localStorage
    const savedToken = localStorage.getItem('access_token');
    if (savedToken) {
      api.setToken(savedToken);
      useStore.setState({
        accessToken: savedToken,
        isAuthenticated: true,
      });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      // Connect WebSocket
      const ws = new WebSocketClient(accessToken);
      ws.connect()
        .then(() => {
          setWSConnected(true);
          
          // Setup message handlers
          ws.onMessage('quote', (data) => {
            console.log('Quote update:', data);
            // Update store with quote data
          });

          ws.onMessage('account', (data) => {
            console.log('Account update:', data);
            // Update store with account data
          });

          ws.onMessage('watchlist', (data) => {
            console.log('Watchlist update:', data);
          });

          // Send ping periodically to keep connection alive
          const pingInterval = setInterval(() => {
            if (ws.isConnected()) {
              ws.ping();
            }
          }, 30000);

          return () => {
            clearInterval(pingInterval);
            ws.disconnect();
          };
        })
        .catch((error) => {
          console.error('Failed to connect to WebSocket:', error);
          setWSConnected(false);
        });
    }
  }, [isAuthenticated, accessToken, setWSConnected]);

  return (
    <div className="app">
      {isAuthenticated ? <Dashboard /> : <Login />}
    </div>
  );
}

export default App;
