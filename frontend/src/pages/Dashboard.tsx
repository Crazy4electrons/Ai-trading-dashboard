import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import { pollingService } from '../services/polling';
import Watchlist from '../components/Watchlist';
import Chart from '../components/Chart';
import AccountPanel from '../components/AccountPanel';
import AnalyticsPanel from '../components/AnalyticsPanel';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { isAuthenticated, accountNumber, server, wsConnected, selectedSymbol, setSelectedSymbol } = useStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeDashboard = async () => {
      console.log('[DASHBOARD] Initializing dashboard...');
      try {
        // Fetch symbols from MT5 (only once on init, updated on search)
        console.log('[DASHBOARD] Loading symbols from MT5...');
        try {
          const symbolsData = await api.getSymbols();
          console.log('[DASHBOARD] Symbols loaded:', Object.keys(symbolsData).length, 'categories');
        } catch (error) {
          console.error('[DASHBOARD] Failed to load symbols:', error);
        }
        
        // Fetch watchlist (only once on init)
        console.log('[DASHBOARD] Loading watchlist...');
        try {
          const watchlistData = await api.getWatchlist();
          console.log(`[DASHBOARD] Watchlist loaded: ${watchlistData.items?.length || 0} items`);
          useStore.setState({ watchlist: watchlistData.items });

          // Auto-select first symbol if none is selected
          if (!selectedSymbol && watchlistData.items?.length > 0) {
            const firstSymbol = watchlistData.items[0].symbol?.name;
            if (firstSymbol) {
              console.log('[DASHBOARD] Auto-selecting first symbol:', firstSymbol);
              setSelectedSymbol(firstSymbol);
            }
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load watchlist:', error);
        }

        // Fetch initial account info
        console.log('[DASHBOARD] Loading initial account info...');
        try {
          const accountInfo = await api.getAccountInfo();
          console.log('[DASHBOARD] Account info loaded:', accountInfo);
          if (!accountInfo.error) {
            useStore.setState({ accountInfo });
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load account info:', error);
        }

        // Fetch initial positions
        console.log('[DASHBOARD] Loading initial positions...');
        try {
          const positionsData = await api.getPositions();
          console.log(`[DASHBOARD] Positions loaded: ${positionsData.positions?.length || 0} positions`);
          if (positionsData.positions) {
            useStore.setState({ positions: positionsData.positions });
          }
        } catch (error) {
          console.error('[DASHBOARD] Failed to load positions:', error);
        }

        console.log('[DASHBOARD] Initial dashboard load complete');
        setIsLoading(false);

        // Set up polling for account data (10 seconds)
        console.log('[DASHBOARD] Starting account data polling (10s interval)');
        pollingService.startPolling(
          'account_info',
          10000,
          () => api.getAccountInfo(),
          (data) => {
            if (data && !data.error) {
              console.log('[DASHBOARD] Account data updated via polling:', data);
              useStore.setState({ accountInfo: data });
            }
          },
          (error) => {
            console.error('[DASHBOARD] Account polling error:', error);
          }
        );

        // Set up polling for positions (5 seconds)
        console.log('[DASHBOARD] Starting positions polling (5s interval)');
        pollingService.startPolling(
          'positions',
          5000,
          () => api.getPositions(),
          (data) => {
            if (data && data.positions) {
              console.log('[DASHBOARD] Positions updated via polling:', data.positions.length, 'positions');
              useStore.setState({ positions: data.positions });
            }
          },
          (error) => {
            console.error('[DASHBOARD] Positions polling error:', error);
          }
        );

      } catch (error) {
        console.error('[DASHBOARD] Failed to initialize dashboard:', error);
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      initializeDashboard();
    }

    // Clean up polling on unmount
    return () => {
      console.log('[DASHBOARD] Cleaning up polling services');
      pollingService.stopPolling('account_info');
      pollingService.stopPolling('positions');
    };
  }, [isAuthenticated, selectedSymbol, setSelectedSymbol]);

  const handleLogout = async () => {
    try {
      console.log('[DASHBOARD] Logging out...');
      
      // Call backend logout endpoint to clear server-side session
      try {
        await api.logout();
        console.log('[DASHBOARD] Backend logout successful');
      } catch (error) {
        // Still proceed with client-side logout even if server call fails
        console.warn('[DASHBOARD] Backend logout failed (might be due to invalid token):', error);
      }
      
      // Clear token from localStorage
      localStorage.removeItem('access_token');
      console.log('[DASHBOARD] Token cleared from localStorage');
      
      // Clear all auth state from store (this will trigger re-render and show Login)
      useStore.setState({
        isAuthenticated: false,
        accessToken: null,
        accountId: null,
        accountNumber: null,
        server: null,
      });
      console.log('[DASHBOARD] Auth state cleared, redirecting to login');
    } catch (error) {
      console.error('[DASHBOARD] Logout error:', error);
      // Force redirect to login even if something fails
      localStorage.removeItem('access_token');
      useStore.setState({
        isAuthenticated: false,
        accessToken: null,
        accountId: null,
        accountNumber: null,
        server: null,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>TradeMatrix</h1>
        </div>

        <div className="header-center">
          <span className="account-info">
            Account: <strong>{accountNumber}</strong> @ {server}
          </span>
        </div>

        <div className="header-right">
          <button
            className="btn btn-secondary"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Analytics Section */}
      <section className="dashboard-analytics">
        <AnalyticsPanel />
      </section>

      {/* Main content */}
      <div className="dashboard-content">
        {/* Left sidebar - Watchlist */}
        <aside className="dashboard-sidebar">
          <Watchlist />
        </aside>

        {/* Center - Chart */}
        <main className="dashboard-main">
          <Chart />
        </main>

        {/* Right panel - Account info */}
        <aside className="dashboard-panel">
          <AccountPanel />
        </aside>
      </div>

      {/* Connection status indicator */}
      <div className="connection-status">
        <div className={`status-indicator ${wsConnected ? 'connected' : 'disconnected'}`}></div>
        <span>{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>
    </div>
  );
}
