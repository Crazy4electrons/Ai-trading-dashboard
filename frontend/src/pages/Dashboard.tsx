import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import Watchlist from '../components/Watchlist';
import Chart from '../components/Chart';
import AccountPanel from '../components/AccountPanel';
import '../styles/Dashboard.css';

export default function Dashboard() {
  const { isAuthenticated, accountNumber, server, wsConnected, selectedSymbol, setSelectedSymbol, watchlist } = useStore();
  const [symbolsCache, setSymbolsCache] = useState<Map<string, any[]>>(new Map());
  const [lastSymbolsFetch, setLastSymbolsFetch] = useState<number>(0);

  useEffect(() => {
    const initializeDashboard = async () => {
      console.log('[DASHBOARD] Initializing dashboard...');
      try {
        // Fetch symbols from MT5 first
        console.log('[DASHBOARD] Loading symbols from MT5...');
        const symbolsData = await api.getSymbols();
        console.log('[DASHBOARD] Symbols loaded:', Object.keys(symbolsData).length, 'categories');
        
        // Fetch watchlist
        console.log('[DASHBOARD] Loading watchlist...');
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

        // Fetch account info
        console.log('[DASHBOARD] Loading account info...');
        const accountInfo = await api.getAccountInfo();
        console.log('[DASHBOARD] Account info loaded:', accountInfo);
        useStore.setState({ accountInfo });

        // Fetch positions
        console.log('[DASHBOARD] Loading positions...');
        const positionsData = await api.getPositions();
        console.log(`[DASHBOARD] Positions loaded: ${positionsData.positions?.length || 0} positions`);
        if (positionsData.positions) {
          useStore.setState({ positions: positionsData.positions });
        }

        console.log('[DASHBOARD] Dashboard initialization complete');
        setIsLoading(false);
      } catch (error) {
        console.error('[DASHBOARD] Failed to initialize dashboard:', error);
        setIsLoading(false);
      }
    };

    if (isAuthenticated) {
      initializeDashboard();
    }
  }, [isAuthenticated, selectedSymbol, setSelectedSymbol]);

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
      console.error('Logout error:', error);
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
