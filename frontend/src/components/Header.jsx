/**
 * Header — app name, focused symbol price, and layout toggle buttons
 */
import { useApp } from '../context/AppContext';
import { findSymbol } from '../utils/symbols';
import styles from './Header.module.css';

export default function Header({ price, prevPrice }) {
  const {
    focusedSymbol,
    showSymbols, setShowSymbols,
    showAccounts, setShowAccounts,
    setSettingsOpen,
  } = useApp();

  const sym = findSymbol(focusedSymbol);
  const isUp = price && prevPrice ? price >= prevPrice : true;
  const change = price && prevPrice ? ((price - prevPrice) / prevPrice * 100).toFixed(2) : '0.00';
  const displayPrice = price ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 }) : '—';

  return (
    <header className={styles.header}>
      {/* Left: App name */}
      <div className={styles.brand}>
        <span className={styles.brandIcon}>◈</span>
        <span className={styles.brandName}>TradeMatrix</span>
      </div>

      {/* Center: Focused symbol */}
      <div className={styles.symbolInfo}>
        <span className={styles.symbolPair}>{focusedSymbol}</span>
        <span className={`${styles.price} ${isUp ? styles.up : styles.down}`}>
          {displayPrice}
        </span>
        <span className={`${styles.change} ${isUp ? styles.up : styles.down}`}>
          {isUp ? '▲' : '▼'} {Math.abs(change)}%
        </span>
        <span className={styles.liveWrapper}>
          <span className="live-dot" />
          <span className={styles.liveLabel}>Live</span>
        </span>
      </div>

      {/* Right: Layout controls */}
      <div className={styles.controls}>
        <button
          className={`${styles.iconBtn} ${showSymbols ? styles.active : ''}`}
          onClick={() => setShowSymbols((v) => !v)}
          title="Toggle Symbols Panel"
        >
          <IconPanelLeft />
        </button>
        <button
          className={`${styles.iconBtn} ${showAccounts ? styles.active : ''}`}
          onClick={() => setShowAccounts((v) => !v)}
          title="Toggle Accounts Panel"
        >
          <IconPanelRight />
        </button>
        <div className={styles.divider} />
        <button
          className={styles.iconBtn}
          onClick={() => setSettingsOpen(true)}
          title="Settings"
        >
          <IconSettings />
        </button>
      </div>
    </header>
  );
}

function IconPanelLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="5" height="14" rx="1" fill="currentColor" opacity="0.5"/>
      <rect x="8" y="1" width="7" height="14" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
    </svg>
  );
}

function IconPanelRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="7" height="14" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none"/>
      <rect x="10" y="1" width="5" height="14" rx="1" fill="currentColor" opacity="0.5"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
