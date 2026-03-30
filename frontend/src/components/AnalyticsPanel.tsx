import { useEffect, useState } from 'react';
import api from '../services/api';
import '../styles/Dashboard.css';

interface TradeStats {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_win: number;
  avg_loss: number;
  profit_factor: number;
}

interface PortfolioMetrics {
  account_balance: number;
  account_equity: number;
  used_margin: number;
  free_margin: number;
  margin_level: number;
  positions_count: number;
  open_orders_count: number;
}

export default function AnalyticsPanel() {
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null);
  const [portfolioMetrics, setPortfolioMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const [stats, metrics] = await Promise.all([
        api.getTradeStats().catch(() => null),
        api.getPortfolioMetrics().catch(() => null),
      ]);
      
      setTradeStats(stats);
      setPortfolioMetrics(metrics);
    } catch (error) {
      console.error('[ANALYTICS] Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="analytics-panel loading">
        <p>Loading analytics...</p>
      </div>
    );
  }

  return (
    <div className="analytics-panel">
      <div className="analytics-grid">
        {/* Portfolio Metrics */}
        {portfolioMetrics && (
          <div className="analytics-card">
            <h3>Portfolio Status</h3>
            <div className="metrics">
              <div className="metric">
                <span className="label">Balance</span>
                <span className="value">${portfolioMetrics.account_balance.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className="label">Equity</span>
                <span className="value">${portfolioMetrics.account_equity.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className="label">Used Margin</span>
                <span className="value">${portfolioMetrics.used_margin.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className="label">Free Margin</span>
                <span className="value">${portfolioMetrics.free_margin.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className={`label ${portfolioMetrics.margin_level > 200 ? 'warning' : portfolioMetrics.margin_level > 100 ? 'alert' : 'critical'}`}>
                  Margin Level
                </span>
                <span className={`value ${portfolioMetrics.margin_level > 200 ? 'warning' : portfolioMetrics.margin_level > 100 ? 'alert' : 'critical'}`}>
                  {portfolioMetrics.margin_level.toFixed(1)}%
                </span>
              </div>
              <div className="metric">
                <span className="label">Positions</span>
                <span className="value">{portfolioMetrics.positions_count}</span>
              </div>
              <div className="metric">
                <span className="label">Open Orders</span>
                <span className="value">{portfolioMetrics.open_orders_count}</span>
              </div>
            </div>
          </div>
        )}

        {/* Trade Statistics */}
        {tradeStats && (
          <div className="analytics-card">
            <h3>Trade Statistics</h3>
            <div className="metrics">
              <div className="metric">
                <span className="label">Total Trades</span>
                <span className="value">{tradeStats.total_trades}</span>
              </div>
              <div className="metric success">
                <span className="label">Winning</span>
                <span className="value">{tradeStats.winning_trades}</span>
              </div>
              <div className="metric error">
                <span className="label">Losing</span>
                <span className="value">{tradeStats.losing_trades}</span>
              </div>
              <div className="metric">
                <span className="label">Win Rate</span>
                <span className={`value ${tradeStats.win_rate > 50 ? 'success' : tradeStats.win_rate > 40 ? 'warning' : 'error'}`}>
                  {tradeStats.win_rate.toFixed(1)}%
                </span>
              </div>
              <div className="metric">
                <span className="label">Total P&L</span>
                <span className={`value ${tradeStats.total_pnl >= 0 ? 'success' : 'error'}`}>
                  ${tradeStats.total_pnl.toFixed(2)}
                </span>
              </div>
              <div className="metric">
                <span className="label">Avg Win</span>
                <span className="value success">${tradeStats.avg_win.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className="label">Avg Loss</span>
                <span className="value error">${tradeStats.avg_loss.toFixed(2)}</span>
              </div>
              <div className="metric">
                <span className="label">Profit Factor</span>
                <span className={`value ${tradeStats.profit_factor > 1.5 ? 'success' : tradeStats.profit_factor > 1 ? 'warning' : 'error'}`}>
                  {tradeStats.profit_factor.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="refresh-btn" onClick={loadAnalytics}>
        Refresh Analytics
      </button>
    </div>
  );
}
