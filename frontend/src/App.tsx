import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { WebSocketClient } from './services/websocket';
import api from './services/api';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import './App.css';

// Global WebSocket instance for access from components
let globalWebSocketClient: WebSocketClient | null = null;

export function getWebSocketClient(): WebSocketClient | null {
  return globalWebSocketClient;
}

function App() {
  const { isAuthenticated, accessToken, setWSConnected } = useStore();
  const cleanupRef = useRef<(() => void) | null>(null);

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
      globalWebSocketClient = ws;
      
      ws.connect()
        .then(() => {
          setWSConnected(true);
          console.log('[APP] WebSocket connected');
          
          // Subscribe to watch quotes (for the watchlist)
          ws.subscribeWatchQuotes();
          
          // Setup message handlers
          ws.onMessage('watch_quotes', (data) => {
            console.log('[WEBSOCKET] Watch quotes update:', data);
            // Update store with quote data - only if changed
            useStore.setState((state) => {
              const updatedWatchlist = state.watchlist.map((item) => {
                if (item.symbol?.name && data[item.symbol.name]) {
                  const newQuote = data[item.symbol.name];
                  // Only update if quote actually changed
                  if (item.symbol.bid !== newQuote.bid || item.symbol.ask !== newQuote.ask) {
                    return {
                      ...item,
                      symbol: {
                        ...item.symbol,
                        bid: newQuote.bid,
                        ask: newQuote.ask,
                      },
                    };
                  }
                }
                return item;
              });
              return { watchlist: updatedWatchlist };
            });
          });

          ws.onMessage('chart_ticks', (data) => {
            console.log('[WEBSOCKET] Chart ticks update:', data);
            // Update chart with new tick data - only if changed
            // This would update the chart with real-time tick data
          });

          ws.onMessage('account', (data) => {
            console.log('[WEBSOCKET] Account update (polled):', data);
            useStore.setState((state) => {
              if (!state.accountInfo ||
                  state.accountInfo.balance !== data.balance ||
                  state.accountInfo.equity !== data.equity ||
                  state.accountInfo.margin !== data.margin ||
                  state.accountInfo.free_margin !== data.free_margin) {
                return { accountInfo: data };
              }
              return {};
            });
          });

          ws.onMessage('positions', (data) => {
            console.log('[WEBSOCKET] Positions update (polled):', data);
            useStore.setState((state) => {
              const currentPositions = state.positions || [];
              if (currentPositions.length !== data.length ||
                  currentPositions.some((pos, i) => 
                    !data[i] || 
                    pos.ticket !== data[i].ticket || 
                    pos.profit_loss !== data[i].profit_loss ||
                    pos.volume !== data[i].volume
                  )) {
                return { positions: data };
              }
              return {};
            });
          });

          ws.onMessage('history', (data) => {
            console.log('[WEBSOCKET] History update (polled):', data);
            // Update store with new history entries
            if (data && data.length > 0) {
              useStore.setState((state) => ({
                history: [...(state.history || []), ...data]
              }));
            }
          });

          ws.onMessage('watchlist', (data) => {
            console.log('[WEBSOCKET] Watchlist update (polled):', data);
            // Update watchlist structure if changed
          });

          ws.onMessage('subscribed', (data) => {
            console.log('[WEBSOCKET] Subscription confirmed:', data);
          });

          ws.onMessage('unsubscribed', (data) => {
            console.log('[WEBSOCKET] Unsubscription confirmed:', data);
          });

          // Send ping periodically to keep connection alive
          const pingInterval = setInterval(() => {
            if (ws.isConnected()) {
              ws.ping();
            }
          }, 30000);

          cleanupRef.current = () => {
            clearInterval(pingInterval);
            ws.disconnect();
            globalWebSocketClient = null;
          };
        })
        .catch((error) => {
          console.error('[APP] Failed to connect to WebSocket:', error);
          setWSConnected(false);
        });

      return () => {
        if (cleanupRef.current) {
          cleanupRef.current();
        }
      };
    }
  }, [isAuthenticated, accessToken, setWSConnected]);

  return (
    <div className="app">
      {isAuthenticated ? <Dashboard /> : <Login />}
    </div>
  );
}

export default App;
