/**
 * Watchlist — horizontal pill bar showing watched symbols with live price + 24h change
 */
import { useApp } from '../context/AppContext';
import { MOCK_PRICES } from '../utils/symbols';
import styles from './Watchlist.module.css';

export default function Watchlist({ livePrice }) {
  const { watchlist, removeFromWatchlist, focusedSymbol, setFocusedSymbol } = useApp();

  if (!watchlist.length) return null;

  return (
    <div className={styles.bar}>
      <span className={styles.label}>WATCHLIST</span>
      <div className={styles.pills}>
        {watchlist.map((sym) => (
          <WatchPill
            key={sym}
            symbol={sym}
            isFocused={sym === focusedSymbol}
            livePrice={sym === focusedSymbol ? livePrice : null}
            onSelect={() => setFocusedSymbol(sym)}
            onRemove={() => removeFromWatchlist(sym)}
          />
        ))}
      </div>
    </div>
  );
}

function WatchPill({ symbol, isFocused, livePrice, onSelect, onRemove }) {
  const basePrice = MOCK_PRICES[symbol] || 100;
  const currentPrice = livePrice || basePrice;
  const openPrice = basePrice * 0.998; // simulate 00:00 UTC open
  const change = ((currentPrice - openPrice) / openPrice * 100).toFixed(2);
  const isUp = parseFloat(change) >= 0;

  return (
    <div
      className={`${styles.pill} ${isFocused ? styles.focused : ''}`}
      onClick={onSelect}
    >
      <span className={styles.sym}>{symbol}</span>
      <span className={`${styles.price} ${isUp ? styles.up : styles.down}`}>
        {currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </span>
      <span className={`${styles.change} ${isUp ? styles.up : styles.down}`}>
        {isUp ? '+' : ''}{change}%
      </span>
      <button
        className={styles.close}
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        title="Remove from watchlist"
      >✕</button>
    </div>
  );
}
