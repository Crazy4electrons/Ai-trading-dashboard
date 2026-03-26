import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import '../styles/AccountPanel.css';

export default function AccountPanel() {
  const { accountInfo, positions, setAccountInfo, setPositions } = useStore();

  useEffect(() => {
    // Fetch account info on mount
    const fetchAccountInfo = async () => {
      try {
        const info = await api.getAccountInfo();
        setAccountInfo(info);

        const posData = await api.getPositions();
        if (posData.positions) {
          setPositions(posData.positions);
        }
      } catch (error) {
        console.error('Failed to fetch account info:', error);
      }
    };

    // Fetch initially
    fetchAccountInfo();

    // Refresh every 2 seconds
    const interval = setInterval(fetchAccountInfo, 2000);
    return () => clearInterval(interval);
  }, [setAccountInfo, setPositions]);

  if (!accountInfo) {
    return (
      <div className="account-panel">
        <h3>Account</h3>
        <div className="loading">Loading account info...</div>
      </div>
    );
  }

  const balance = accountInfo.balance ?? 0;
  const equity = accountInfo.equity ?? 0;
  const freeMargin = accountInfo.free_margin ?? 0;
  const marginLevel = (accountInfo.margin_level ?? 0);
  const marginColor =
    marginLevel < 50
      ? 'success'
      : marginLevel < 80
      ? 'warning'
      : 'danger';

  return (
    <div className="account-panel">
      <h3>Account</h3>

      {/* Account info cards */}
      <div className="account-cards">
        {/* Account card */}
        <div className="card">
          <div className="card-label">Account</div>
          <div className="card-value">{accountInfo.account}</div>
          <div className="card-subtext">{accountInfo.account_type}</div>
        </div>

        {/* Balance card */}
        <div className="card">
          <div className="card-label">Balance</div>
          <div className="card-value">
            {balance.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="card-subtext">{accountInfo.currency}</div>
        </div>

        {/* Equity card */}
        <div className="card">
          <div className="card-label">Equity</div>
          <div className="card-value">
            {equity.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="card-subtext">
            {equity - balance >= 0 ? '+' : ''}
            {(equity - balance).toFixed(2)}
          </div>
        </div>

        {/* Margin card */}
        <div className={`card margin-card margin-${marginColor}`}>
          <div className="card-label">Margin %</div>
          <div className="card-value">{marginLevel.toFixed(1)}%</div>
          <div className="margin-bar">
            <div
              className={`margin-fill margin-fill-${marginColor}`}
              style={{ width: `${Math.min(marginLevel, 100)}%` }}
            ></div>
          </div>
        </div>

        {/* Free margin card */}
        <div className="card">
          <div className="card-label">Free Margin</div>
          <div className="card-value">
            {freeMargin.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="card-subtext">Available</div>
        </div>
      </div>

      {/* Open positions */}
      <div className="positions-section">
        <h4>Open Positions ({positions.length})</h4>

        {positions.length === 0 ? (
          <div className="empty-positions">
            <p>No open positions</p>
          </div>
        ) : (
          <div className="positions-list">
            {positions.map((pos) => (
              <div key={pos.ticket} className="position-item">
                <div className="position-header">
                  <span className="position-symbol">{pos.symbol}</span>
                  <span className={`position-type ${pos.type.toLowerCase()}`}>
                    {pos.type}
                  </span>
                </div>

                <div className="position-details">
                  <div className="detail">
                    <span className="label">Volume:</span>
                    <span className="value">{pos.volume}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Entry:</span>
                    <span className="value">{pos.open_price.toFixed(5)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">Current:</span>
                    <span className="value">{pos.current_price.toFixed(5)}</span>
                  </div>
                  <div className="detail">
                    <span className="label">P&L:</span>
                    <span className={`value ${pos.profit_loss >= 0 ? 'profit' : 'loss'}`}>
                      {pos.profit_loss >= 0 ? '+' : ''}
                      {pos.profit_loss.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
