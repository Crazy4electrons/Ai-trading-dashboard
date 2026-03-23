/**
 * App — root layout. Uses CSS grid-area for explicit, stable column placement.
 */
import { useState, useMemo, useRef } from 'react';
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

export default function App() {
  const { focusedSymbol, showSymbols, showAccounts, activeIndicators } = useApp();

  const [timeframe, setTimeframe]   = useState('1h');
  const [orderModal, setOrderModal] = useState(null);
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

  const compositeSignal = useMemo(() => {
    const sigs = getSignals(indicators);
    return getCompositeSignal(sigs);
  }, [indicators]);

  const layoutClass = [
    'app-layout',
    !showSymbols  ? 'hide-symbols'  : '',
    !showAccounts ? 'hide-accounts' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={layoutClass}>

      <Header price={currentPrice} prevPrice={prevPriceRef.current} />

      <Watchlist livePrice={currentPrice} />

      {/* col 1: symbols */}
      <div style={{
        gridArea: 'symbols',
        overflow: 'hidden',
        display: showSymbols ? 'flex' : 'none',
        flexDirection: 'column',
      }}>
        <SymbolsList visible={showSymbols} />
      </div>

      {/* col 2: main */}
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

      {/* col 3: accounts */}
      <div style={{
        gridArea: 'accounts',
        overflow: 'hidden',
        display: showAccounts ? 'flex' : 'none',
        flexDirection: 'column',
      }}>
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