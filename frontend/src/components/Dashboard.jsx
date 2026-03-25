/**
 * Dashboard — main trading dashboard with drag-to-resize panels
 * Only shown after successful authentication
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useMT5, useAccount } from '../hooks/useMT5';
import { calculateAll } from '../utils/indicators';
import { getCompositeSignal, getSignals } from '../utils/signals';

import Header from './Header';
import Watchlist from './Watchlist';
import SymbolsList from './SymbolsList';
import TradingChart from './TradingChart';
import IndicatorPills from './IndicatorPills';
import TabsSection from './TabsSection';
import AccountPanel from './AccountPanel';
import SettingsModal from './SettingsModal';
import OrderModal from './OrderModal';

const MIN_PANEL = 160;
const MAX_PANEL = 420;

export default function Dashboard({ onLogout }) {
  const { focusedSymbol, showSymbols, showAccounts, activeIndicators } = useApp();

  const [timeframe, setTimeframe] = useState('1h');
  const [orderModal, setOrderModal] = useState(null);
  const [symbolsWidth, setSymbolsWidth] = useState(220);
  const [accountsWidth, setAccountsWidth] = useState(260);
  const prevPriceRef = useRef(null);

  const { candles, price, depth, loading, error, connected, fetchOlderCandles, scrollBuffer } = useMT5(focusedSymbol, timeframe);
  const { placeOrder } = useAccount();

  const currentPrice = price?.bid ?? candles?.[candles.length - 1]?.close;
  if (currentPrice && currentPrice !== prevPriceRef.current) {
    prevPriceRef.current = currentPrice;
  }

  const indicators = useMemo(
    () => (candles?.length ? calculateAll(candles, activeIndicators) : {}),
    [candles, activeIndicators]
  );
  const compositeSignal = useMemo(() => getCompositeSignal(getSignals(indicators)), [indicators]);

  /* ── Drag-resize logic ── */
  const dragging = useRef(null);

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    if (dragging.current === 'left') {
      setSymbolsWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, e.clientX)));
    } else {
      setAccountsWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, window.innerWidth - e.clientX)));
    }
  }, []);

  const onMouseUp = useCallback(() => { 
    dragging.current = null; 
    document.body.style.cursor = ''; 
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const startDrag = (side) => (e) => {
    e.preventDefault();
    dragging.current = side;
    document.body.style.cursor = 'col-resize';
  };

  /* ── Grid columns ── */
  const cols = [
    showSymbols ? `${symbolsWidth}px` : '0px',
    '1fr',
    showAccounts ? `${accountsWidth}px` : '0px',
  ].join(' ');

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '48px 44px 1fr',
        gridTemplateColumns: cols,
        gridTemplateAreas: '"header header header" "watch watch watch" "symbols main accounts"',
        height: '100vh',
        overflow: 'hidden',
        transition: 'grid-template-columns 150ms ease',
      }}
    >
      <Header price={currentPrice} prevPrice={prevPriceRef.current} onLogout={onLogout} />
      <Watchlist livePrice={currentPrice} />

      {/* ── Left panel: symbols ── */}
      <div style={{
        gridArea: 'symbols',
        overflow: 'hidden',
        display: showSymbols ? 'flex' : 'none',
        flexDirection: 'column',
        position: 'relative',
      }}>
        <SymbolsList visible={showSymbols} />
        {/* Right drag handle */}
        <DragHandle side="right" onMouseDown={startDrag('left')} />
      </div>

      {/* ── Center: main dashboard ── */}
      <main style={{
        gridArea: 'main',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        {error && !candles.length ? (
          <ErrorState error={error} symbol={focusedSymbol} />
        ) : loading && !candles.length ? (
          <LoadingState symbol={focusedSymbol} connected={connected} />
        ) : (
          <>
            <TradingChart
              candles={candles}
              price={price}
              depth={depth}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              compositeSignal={compositeSignal}
              onBuy={() => setOrderModal({ type: 'buy' })}
              onSell={() => setOrderModal({ type: 'sell' })}
              fetchOlderCandles={fetchOlderCandles}
              scrollBuffer={scrollBuffer}
            />
            <IndicatorPills indicators={indicators} />
            <TabsSection indicators={indicators} candles={candles} />
          </>
        )}
      </main>

      {/* ── Right panel: accounts ── */}
      <div style={{
        gridArea: 'accounts',
        overflow: 'hidden',
        display: showAccounts ? 'flex' : 'none',
        flexDirection: 'column',
        position: 'relative',
      }}>
        {/* Left drag handle */}
        <DragHandle side="left" onMouseDown={startDrag('right')} />
        <AccountPanel visible={showAccounts} />
      </div>

      <SettingsModal />
      {orderModal && (
        <OrderModal
          symbol={focusedSymbol}
          type={orderModal.type}
          onConfirm={placeOrder}
          onClose={() => setOrderModal(null)}
        />
      )}
    </div>
  );
}

/** Thin draggable resize handle */
function DragHandle({ side, onMouseDown }) {
  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side]: 0,
        width: '4px',
        cursor: 'col-resize',
        zIndex: 50,
        background: 'transparent',
        transition: 'background 150ms',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-blue)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    />
  );
}

function ErrorState({ error, symbol }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, color: 'var(--text-secondary)', padding: 24,
    }}>
      <span style={{ fontSize: 32, opacity: 0.5 }}>⚠</span>
      <p style={{ fontSize: 14, fontWeight: 500 }}>Connection Error</p>
      <p style={{
        fontSize: 12, color: 'var(--text-muted)', textAlign: 'center',
        maxWidth: 400, lineHeight: 1.5,
      }}>
        {error && error.includes('localhost')
          ? `Cannot reach backend at localhost:3001. Make sure the backend server is running.`
          : `Failed to load ${symbol} data: ${error || 'Unknown error'}`
        }
      </p>
      <p style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 8 }}>
        Check the browser console for details.
      </p>
    </div>
  );
}

function LoadingState({ symbol, connected }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, color: 'var(--text-secondary)',
    }}>
      <span style={{ fontSize: 32, opacity: 0.2, animation: 'spin 3s linear infinite' }}>◈</span>
      <p style={{ fontSize: 13 }}>Loading {symbol}…</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {connected ? 'Fetching market data' : 'Connecting to backend…'}
      </p>
    </div>
  );
}
