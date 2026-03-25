/**
 * AccountPanel — right panel with Account Details and Orders (open + history)
 */
import { useState } from 'react';
import { useAccount } from '../hooks/useMT5';
import styles from './AccountPanel.module.css';

export default function AccountPanel({ visible }) {
  const [mainTab, setMainTab] = useState('account');
  const [ordersTab, setOrdersTab] = useState('open');
  const { account, positions, history, loading, error } = useAccount();

  if (!visible) return null;

  if (error) {
    return (
      <aside className={styles.panel}>
        <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          <p>⚠ Cannot connect to account</p>
          <p style={{ fontSize: 11, marginTop: 8 }}>{error}</p>
        </div>
      </aside>
    );
  }

  if (loading && !account) {
    return (
      <aside className={styles.panel}>
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: 12 }}>Loading account…</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={styles.panel}>
      {/* Main tabs */}
      <div className={styles.mainTabs}>
        <button
          className={`${styles.mainTab} ${mainTab === 'account' ? styles.active : ''}`}
          onClick={() => setMainTab('account')}
        >Account</button>
        <button
          className={`${styles.mainTab} ${mainTab === 'orders' ? styles.active : ''}`}
          onClick={() => setMainTab('orders')}
        >Orders</button>
      </div>

      {mainTab === 'account' && <AccountDetails account={account} positions={positions} />}
      {mainTab === 'orders' && (
        <OrdersPanel
          positions={positions}
          history={history}
          ordersTab={ordersTab}
          setOrdersTab={setOrdersTab}
        />
      )}
    </aside>
  );
}

function AccountDetails({ account, positions }) {
  if (!account) return <div className={styles.loading}>Connecting to MT5…</div>;

  // Ensure positions is an array for safe reduce
  const posArray = Array.isArray(positions) ? positions : [];
  const unrealizedPnL = posArray.reduce((sum, p) => sum + (p.unrealizedProfit || 0), 0);
  const pnlColor = unrealizedPnL >= 0 ? styles.green : styles.red;

  return (
    <div className={styles.accountBody}>
      {/* Account header */}
      <div className={styles.accHeader}>
        <span className={styles.accName}>{account.name || 'Demo Account'}</span>
        <span className={styles.accLogin}>{account.login}</span>
        <span className={`pill pill-green`}>ACTIVE</span>
      </div>
      <div className={styles.accBroker}>
        <span className={styles.muted}>Broker:</span> {account.broker || 'Demo Broker'}
        &nbsp;|&nbsp;
        <span className={styles.muted}>Server:</span> {account.server || 'Demo-Server'}
      </div>

      <div className={styles.divider} />

      {/* Metrics grid */}
      <div className={styles.metricsGrid}>
        <MetricRow label="Portfolio Value" value={`$${fmt(account.equity || account.balance)}`} />
        <MetricRow label="Equity" value={`$${fmt(account.equity)}`} />
        <MetricRow label="Balance" value={`$${fmt(account.balance)}`} />
        <MetricRow label="Free Margin" value={`$${fmt(account.freeMargin)}`} />
        <MetricRow label="Buying Power" value={`$${fmt((account.freeMargin || 0) * (account.leverage || 1))}`} />
        <MetricRow
          label="Unrealised P&L"
          value={`${unrealizedPnL >= 0 ? '+' : ''}$${fmt(unrealizedPnL)}`}
          valueClass={pnlColor}
        />
        <MetricRow label="Leverage" value={`1:${account.leverage || 100}`} />
        <MetricRow label="Currency" value={account.currency || 'USD'} />
      </div>

      <div className={styles.divider} />

      {/* Open positions */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>OPEN POSITIONS ({posArray.length})</span>
        {posArray.length === 0 ? (
          <p className={styles.empty}>No open positions</p>
        ) : (
          posArray.map((pos) => <PositionRow key={pos.id} pos={pos} />)
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value, valueClass }) {
  return (
    <div className={styles.metricRow}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={`${styles.metricValue} ${valueClass || ''}`}>{value || '—'}</span>
    </div>
  );
}

function PositionRow({ pos }) {
  const pnl = pos.unrealizedProfit || 0;
  const isUp = pnl >= 0;

  return (
    <div className={styles.posRow}>
      <div className={styles.posTop}>
        <span className={styles.posSymbol}>{pos.symbol}</span>
        <span className={`${styles.posType} ${pos.type === 'POSITION_TYPE_BUY' ? styles.buyTag : styles.sellTag}`}>
          {pos.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL'}
        </span>
        <span className={`${styles.posPnl} ${isUp ? styles.green : styles.red}`}>
          {isUp ? '+' : ''}${fmt(pnl)}
        </span>
      </div>
      <div className={styles.posMeta}>
        <span>{pos.volume} lots @ {pos.openPrice?.toFixed(5)}</span>
        <span>Current: {pos.currentPrice?.toFixed(5)}</span>
      </div>
    </div>
  );
}

function OrdersPanel({ positions, history, ordersTab, setOrdersTab }) {
  // Ensure positions and history are arrays
  const posArray = Array.isArray(positions) ? positions : [];
  const histArray = Array.isArray(history) ? history : [];

  return (
    <div className={styles.ordersBody}>
      {/* Sub-tabs */}
      <div className={styles.subTabs}>
        <button
          className={`${styles.subTab} ${ordersTab === 'open' ? styles.active : ''}`}
          onClick={() => setOrdersTab('open')}
        >Open ({posArray.length})</button>
        <button
          className={`${styles.subTab} ${ordersTab === 'history' ? styles.active : ''}`}
          onClick={() => setOrdersTab('history')}
        >History</button>
      </div>

      <div className={styles.ordersList}>
        {ordersTab === 'open' && (
          posArray.length === 0
            ? <p className={styles.empty}>No open orders</p>
            : posArray.map((pos) => <OpenOrderRow key={pos.id} pos={pos} />)
        )}
        {ordersTab === 'history' && (
          histArray.length === 0
            ? <p className={styles.empty}>No order history</p>
            : histArray.map((ord, i) => <HistoryOrderRow key={ord.id || i} ord={ord} />)
        )}
      </div>
    </div>
  );
}

function OpenOrderRow({ pos }) {
  const pnl = pos.unrealizedProfit || 0;
  const isUp = pnl >= 0;

  return (
    <div className={styles.orderRow}>
      <div className={styles.orderTop}>
        <span className={styles.orderSymbol}>{pos.symbol}</span>
        <span className={`${styles.orderType} ${pos.type === 'POSITION_TYPE_BUY' ? styles.buyTag : styles.sellTag}`}>
          {pos.type === 'POSITION_TYPE_BUY' ? 'BUY' : 'SELL'}
        </span>
      </div>
      <div className={styles.orderMeta}>
        <span>{pos.volume} lots</span>
        <span>Open: {pos.openPrice?.toFixed(5)}</span>
        <span className={isUp ? styles.green : styles.red}>
          P&L: {isUp ? '+' : ''}${fmt(pnl)}
        </span>
      </div>
      <div className={styles.orderTime}>
        {pos.openTime ? new Date(pos.openTime).toLocaleString() : '—'}
      </div>
    </div>
  );
}

function HistoryOrderRow({ ord }) {
  const profit = ord.profit || 0;
  const isUp = profit >= 0;

  return (
    <div className={styles.orderRow}>
      <div className={styles.orderTop}>
        <span className={styles.orderSymbol}>{ord.symbol}</span>
        <span className={`${styles.orderType} ${ord.type?.includes('BUY') ? styles.buyTag : styles.sellTag}`}>
          {ord.type?.includes('BUY') ? 'BUY' : 'SELL'}
        </span>
        <span className={`${styles.histPnl} ${isUp ? styles.green : styles.red}`}>
          {isUp ? '+' : ''}${fmt(profit)}
        </span>
      </div>
      <div className={styles.orderMeta}>
        <span>{ord.volume} lots</span>
        <span>@ {ord.openPrice?.toFixed(5)}</span>
        <span>→ {ord.closePrice?.toFixed(5)}</span>
      </div>
      <div className={styles.orderTime}>
        {ord.closeTime ? new Date(ord.closeTime).toLocaleString() : '—'}
      </div>
    </div>
  );
}

// Format number with commas
function fmt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
