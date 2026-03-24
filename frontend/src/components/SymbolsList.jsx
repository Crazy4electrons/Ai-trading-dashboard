/**
 * SymbolsList — left panel with categorized symbols + Favourites tab
 * Category tabs are horizontally scrollable when panel is narrow
 */
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SYMBOLS, MOCK_PRICES, findSymbol } from '../utils/symbols';
import styles from './SymbolsList.module.css';

const CATEGORIES = ['favourites', 'crypto', 'forex', 'commodities', 'stocks'];

export default function SymbolsList({ visible }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('crypto');

  const {
    focusedSymbol, setFocusedSymbol,
    favorites, toggleFavorite,
    watchlist, addToWatchlist, removeFromWatchlist,
  } = useApp();

  if (!visible) return null;

  /* Build symbol list for active category */
  let symbols = [];
  if (activeCategory === 'favourites') {
    // Resolve favourite symbol strings back to full objects
    symbols = favorites.map((sym) => findSymbol(sym)).filter(Boolean);
  } else {
    symbols = SYMBOLS[activeCategory] || [];
  }

  const filtered = symbols.filter(
    (s) =>
      s.symbol.toLowerCase().includes(search.toLowerCase()) ||
      s.name.toLowerCase().includes(search.toLowerCase())
  );

  const countLabel = activeCategory === 'favourites'
    ? `FAVOURITES — ${filtered.length}`
    : `${activeCategory.toUpperCase()} — ${filtered.length}`;

  return (
    <aside className={styles.panel}>

      {/* Horizontally scrollable category tabs */}
      <div className={styles.catTabs}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`${styles.catBtn} ${activeCategory === cat ? styles.active : ''}`}
            onClick={() => { setActiveCategory(cat); setSearch(''); }}
          >
            {cat === 'favourites' ? '★' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            {cat === 'favourites' && favorites.length > 0 && (
              <span className={styles.favBadge}>{favorites.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>⌕</span>
        <input
          className={styles.search}
          placeholder={`Search${activeCategory === 'favourites' ? ' favourites' : ` ${activeCategory}`}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Count bar */}
      <div className={styles.count}>{countLabel}</div>

      {/* Symbol list — scrollable */}
      <div className={styles.list}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>
            {activeCategory === 'favourites'
              ? 'No favourites yet. Click ★ on any symbol to add it.'
              : 'No symbols match your search.'}
          </div>
        ) : (
          filtered.map((s) => (
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
          ))
        )}
      </div>
    </aside>
  );
}

function SymbolRow({ sym, isFocused, isFavorite, inWatchlist, onSelect, onToggleFav, onToggleWatch }) {
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
          title={isFavorite ? 'Remove favourite' : 'Add to favourites'}
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