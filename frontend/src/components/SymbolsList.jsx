/**
 * SymbolsList — left panel with categorized symbols, search, favorites/watchlist
 */
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SYMBOLS } from '../utils/symbols';
import { MOCK_PRICES } from '../utils/symbols';
import styles from './SymbolsList.module.css';

const CATEGORIES = ['crypto', 'forex', 'commodities', 'stocks'];

export default function SymbolsList({ visible }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('crypto');
  const { focusedSymbol, setFocusedSymbol, favorites, toggleFavorite, watchlist, addToWatchlist, removeFromWatchlist } = useApp();

  if (!visible) return null;

  const symbols = SYMBOLS[activeCategory] || [];
  const filtered = symbols.filter(
    (s) =>
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className={styles.panel}>
      {/* Category tabs */}
      <div className={styles.catTabs}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`${styles.catBtn} ${activeCategory === cat ? styles.active : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          className={styles.search}
          placeholder={`Search ${activeCategory}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Count */}
      <div className={styles.count}>
        {activeCategory.toUpperCase()} — {filtered.length}
      </div>

      {/* Symbol rows */}
      <div className={styles.list}>
        {filtered.map((s) => (
          <SymbolRow
            key={s.symbol}
            sym={s}
            isFocused={focusedSymbol === s.symbol}
            isFavorite={favorites.includes(s.symbol)}
            inWatchlist={watchlist.includes(s.symbol)}
            onSelect={() => setFocusedSymbol(s.symbol)}
            onToggleFav={() => toggleFavorite(s.symbol)}
            onToggleWatch={() =>
              watchlist.includes(s.symbol)
                ? removeFromWatchlist(s.symbol)
                : addToWatchlist(s.symbol)
            }
          />
        ))}
      </div>
    </aside>
  );
}

function SymbolRow({ sym, isFocused, isFavorite, inWatchlist, onSelect, onToggleFav, onToggleWatch }) {
  const price = MOCK_PRICES[sym.symbol] || 100;
  const isUp = Math.random() > 0.4; // demo: random up/down

  return (
    <div
      className={`${styles.row} ${isFocused ? styles.focused : ''}`}
      onClick={onSelect}
    >
      <div className={styles.rowLeft}>
        <span className={styles.rowSymbol}>{sym.symbol}</span>
        <span className={styles.rowName}>{sym.base} / {sym.quote}</span>
      </div>
      <div className={styles.rowRight}>
        <button
          className={`${styles.iconAction} ${isFavorite ? styles.favActive : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
          title={isFavorite ? 'Remove favourite' : 'Add favourite'}
        >★</button>
        <button
          className={`${styles.iconAction} ${inWatchlist ? styles.watchActive : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleWatch(); }}
          title={inWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
        >+</button>
      </div>
    </div>
  );
}
