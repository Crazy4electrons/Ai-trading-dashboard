/**
 * App — root layout with drag-to-resize side panels.
 * Uses inline grid-template-columns driven by state instead of CSS classes.
 */
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useApp } from './context/AppContext';
import { useMT5, useAccount } from './hooks/useMT5';
import { calculateAll } from './utils/indicators';
import { getCompositeSignal, getSignals } from './utils/signals';

import Header from './components/Header';
import Watchlist from './components/Watchlist';
import SymbolsList from './components/SymbolsList';
import TradingChart from './components/TradingChart';
import IndicatorPills from './components/IndicatorPills';
import TabsSection from './components/TabsSection';
import AccountPanel from './components/AccountPanel';
import SettingsModal from './components/SettingsModal';
import OrderModal from './components/OrderModal';

import './styles/globals.css';

const MIN_PANEL = 160;
const MAX_PANEL = 420;

export default function App() {
  const { focusedSymbol, showSymbols, showAccounts, activeIndicators } = useApp();

  const [timeframe, setTimeframe]       = useState('1h');
  const [orderModal, setOrderModal]     = useState(null);
  const [symbolsWidth, setSymbolsWidth] = useState(220);
  const [accountsWidth, setAccountsWidth] = useState(260);
  const prevPriceRef = useRef(null);

  const { candles, price, loading } = useMT5(focusedSymbol, timeframe);
  const { placeOrder }              = useAccount();

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
  const dragging = useRef(null); // 'left' | 'right'

  const onMouseMove = useCallback((e) => {
    if (!dragging.current) return;
    if (dragging.current === 'left') {
      setSymbolsWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, e.clientX)));
    } else {
      setAccountsWidth((w) => Math.min(MAX_PANEL, Math.max(MIN_PANEL, window.innerWidth - e.clientX)));
    }
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = null; document.body.style.cursor = ''; }, []);

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
    showSymbols  ? `${symbolsWidth}px`  : '0px',
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
      <Header price={currentPrice} prevPrice={prevPriceRef.current} />
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
        {loading && !candles.length ? (
          <LoadingState symbol={focusedSymbol} />
        ) : (
          <>
            <TradingChart
              candles={candles}
              price={price}
              timeframe={timeframe}
              onTimeframeChange={setTimeframe}
              compositeSignal={compositeSignal}
              onBuy={()  => setOrderModal({ type: 'buy' })}
              onSell={() => setOrderModal({ type: 'sell' })}
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

function LoadingState({ symbol }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 12, color: 'var(--text-secondary)',
    }}>
      <span style={{ fontSize: 32, opacity: 0.2 }}>◈</span>
      <p style={{ fontSize: 13 }}>Loading {symbol}…</p>
      <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>Generating chart data</p>
    </div>
  );
}