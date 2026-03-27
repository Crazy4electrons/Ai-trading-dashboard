import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import api from '../services/api';
import '../styles/Watchlist.css';

export default function Watchlist() {
  const {
    watchlist,
    expandedCategories,
    toggleCategoryExpanded,
    selectedSymbol,
    setSelectedSymbol,
    removeFromWatchlist,
  } = useStore();

  const [symbols, setSymbols] = useState<Record<string, any[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    // Group watchlist items by category
    const grouped: Record<string, any[]> = {};
    watchlist.forEach((item) => {
      const category = item.symbol?.category || 'Other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(item);
    });
    setSymbols(grouped);
  }, [watchlist]);

  // Fetch live quotes for watchlist symbols
  // NOTE: These quotes are also broadcast via WebSocket watch_quotes stream
  // The polling serves as a fallback and ensures periodic updates even if WebSocket messages are missed
  useEffect(() => {
    if (watchlist.length === 0) {
      console.log('[WATCHLIST] No symbols in watchlist to fetch quotes for');
      return;
    }

    console.log(`[WATCHLIST] Setting up quote update interval for ${watchlist.length} symbols`);
    
    const updateQuotes = async () => {
      const symbolNames = watchlist
        .map((item) => item.symbol?.name)
        .filter((name) => name); // Filter out null/undefined
      console.log(`[WATCHLIST] Updating quotes for: ${symbolNames.join(', ')}`);
      
      if (symbolNames.length === 0) {
        console.log('[WATCHLIST] No valid symbol names to fetch quotes for');
        return;
      }
      
      try {
        const quotes = await api.getSymbolQuotesBatch(symbolNames);
        console.log('[WATCHLIST] Quotes received:', quotes);
        
        // Update watchlist items with new bid/ask values
        const updated = watchlist.map((item) => {
          if (item.symbol?.name && quotes[item.symbol.name]) {
            return {
              ...item,
              symbol: {
                ...item.symbol,
                bid: quotes[item.symbol.name].bid,
                ask: quotes[item.symbol.name].ask,
              },
            };
          }
          return item;
        });
        
        useStore.setState({ watchlist: updated });
        console.log('[WATCHLIST] Watchlist updated with new quotes');
      } catch (error) {
        console.error('[WATCHLIST] Error updating quotes:', error);
      }
    };

    // Fetch quotes immediately
    updateQuotes();

    // Then fetch every 2 seconds
    const interval = setInterval(updateQuotes, 2000);
    
    return () => {
      console.log('[WATCHLIST] Cleaning up quote update interval');
      clearInterval(interval);
    };
  }, [watchlist.length]);

  const handleSearch = async (value: string) => {
    console.log(`[WATCHLIST] Searching for symbols: "${value}"`);
    setSearchQuery(value);
    if (value.length < 1) {
      console.log(`[WATCHLIST] Search query empty, clearing results`);
      setSearchResults([]);
      return;
    }

    try {
      console.log(`[WATCHLIST] Calling api.searchSymbols("${value}")`);
      const results = await api.searchSymbols(value);
      console.log(`[WATCHLIST] Search returned ${results.length} results:`, results);
      setSearchResults(results);
    } catch (error) {
      console.error('[WATCHLIST] Search error:', error);
      setSearchResults([]);
    }
  };

  const handleAddSymbol = async (symbolName: string) => {
    console.log(`[WATCHLIST] Adding symbol to watchlist: ${symbolName}`);
    try {
      console.log(`[WATCHLIST] Calling api.addToWatchlist("${symbolName}")`);
      await api.addToWatchlist(symbolName);
      console.log(`[WATCHLIST] Symbol added successfully`);
      
      // Refresh watchlist
      console.log(`[WATCHLIST] Refreshing watchlist...`);
      const updated = await api.getWatchlist();
      console.log(`[WATCHLIST] Watchlist refreshed, ${updated.items?.length || 0} items`);
      useStore.setState({ watchlist: updated.items });
      
      setSearchQuery('');
      setSearchResults([]);
      console.log(`[WATCHLIST] Search cleared`);
    } catch (error: any) {
      console.error('[WATCHLIST] Add to watchlist error:', error);
      alert(error.response?.data?.detail || 'Failed to add symbol');
    }
  };

  const handleRemoveSymbol = async (symbolName: string) => {
    try {
      await api.removeFromWatchlist(symbolName);
      
      // Update store
      removeFromWatchlist(symbolName);
      
      if (selectedSymbol === symbolName) {
        setSelectedSymbol(null);
      }
    } catch (error) {
      console.error('Remove from watchlist error:', error);
    }
  };

  const categories = Object.keys(symbols).sort();

  return (
    <div className="watchlist">
      <h3>Watchlist</h3>

      {/* Search */}
      <div className="search-box">
        <input
          type="text"
          placeholder="Search symbol..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Search results */}
      {searchResults.length > 0 && (
        <div className="search-results">
          <div className="search-header">
            <span>Search Results</span>
            <button
              className="btn-close"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
              }}
            >
              ✕
            </button>
          </div>
          <div className="results-list">
            {searchResults.map((result) => (
              <div key={result.name} className="result-item">
                <div className="result-info">
                  <span className="result-symbol">{result.name}</span>
                  <span className="result-category">{result.category}</span>
                </div>
                <button
                  className="btn-add"
                  onClick={() => handleAddSymbol(result.name)}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories and symbols */}
      <div className="categories-list">
        {categories.length === 0 ? (
          <div className="empty-state">
            <p>No symbols in watchlist</p>
            <p className="hint">Search and add symbols above</p>
          </div>
        ) : (
          categories.map((category) => (
            <div key={category} className="category">
              <button
                className="category-header"
                onClick={() => toggleCategoryExpanded(category)}
              >
                <span className="category-icon">
                  {expandedCategories.has(category) ? '▼' : '▶'}
                </span>
                <span className="category-name">{category}</span>
                <span className="category-count">{symbols[category].length}</span>
              </button>

              {expandedCategories.has(category) && (
                <div className="category-items">
                  {symbols[category].map((item) => (
                    <div
                      key={item.symbol.name}
                      className={`symbol-row ${
                        selectedSymbol === item.symbol.name ? 'selected' : ''
                      }`}
                      onClick={() => setSelectedSymbol(item.symbol.name)}
                    >
                      <div className="symbol-left">
                        <span className="symbol-name">{item.symbol.name}</span>
                      </div>

                      <div className="symbol-prices">
                        <span className="price bid">{item.symbol.bid.toFixed(5)}</span>
                        <span className="price ask">{item.symbol.ask.toFixed(5)}</span>
                      </div>

                      <button
                        className="btn-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSymbol(item.symbol.name);
                        }}
                        title="Remove from watchlist"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
