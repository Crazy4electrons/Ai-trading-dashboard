/**
 * TradingChart — candlestick chart using lightweight-charts v4
 * Includes timeframe selector, signal overlay, and buy/sell buttons
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useApp } from '../context/AppContext';
import { findSymbol, TIMEFRAMES } from '../utils/symbols';
import styles from './TradingChart.module.css';

export default function TradingChart({ candles, price, connected, onTimeframeChange, timeframe, compositeSignal, onBuy, onSell }) {
  const chartRef = useRef(null);
  const containerRef = useRef(null);
  const seriesRef = useRef(null);
  const { focusedSymbol } = useApp();
  const sym = findSymbol(focusedSymbol);

  // Init chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#7a8fa8',
        fontFamily: "'Space Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(30,45,61,0.5)', style: 1 },
        horzLines: { color: 'rgba(30,45,61,0.5)', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#2a3f56', width: 1, style: 2 },
        horzLine: { color: '#2a3f56', width: 1, style: 2 },
      },
      rightPriceScale: {
        borderColor: '#1e2d3d',
        textColor: '#7a8fa8',
      },
      timeScale: {
        borderColor: '#1e2d3d',
        textColor: '#7a8fa8',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale: { mouseWheel: true, axisPressedMouseMove: true },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#00e676',
      downColor: '#ff3d57',
      borderUpColor: '#00e676',
      borderDownColor: '#ff3d57',
      wickUpColor: '#00e676',
      wickDownColor: '#ff3d57',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    return () => {
      chart.remove();
    };
  }, []);

  // Update candle data
  useEffect(() => {
    if (seriesRef.current && candles?.length) {
      seriesRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();
    }
  }, [candles]);

  const sigColor = compositeSignal?.signal === 'buy' ? styles.sigBuy
    : compositeSignal?.signal === 'sell' ? styles.sigSell : styles.sigNeutral;

  const currentPrice = price?.bid || candles?.[candles.length - 1]?.close;
  const prevClose = candles?.[candles.length - 2]?.close;
  const isUp = currentPrice && prevClose ? currentPrice >= prevClose : true;
  const displayPrice = currentPrice
    ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
    : '—';
  const changePct = currentPrice && prevClose
    ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2)
    : '0.00';

  return (
    <div className={styles.wrapper}>
      {/* Chart header */}
      <div className={styles.chartHeader}>
        <div className={styles.symbolMeta}>
          <span className={styles.base}>{sym.base.toUpperCase()}</span>
          <span className={styles.slash}> / </span>
          <span className={styles.quote}>{sym.quote.toUpperCase()}</span>
          <span className={`${styles.categoryTag} pill pill-blue`}>{sym.symbol.includes('USD') && !['XAUUSD','XAGUSD'].includes(focusedSymbol) ? 'CRYPTO' : 'ASSET'}</span>
        </div>

        {/* Signal top-right */}
        <div className={styles.signalArea}>
          {compositeSignal && (
            <div className={`${styles.compositeSignalBadge} ${sigColor}`}>
              {compositeSignal.signal.toUpperCase()}
              <span className={styles.confidence}>{compositeSignal.confidence}%</span>
            </div>
          )}
          <button className={`${styles.tradeBtn} ${styles.buyBtn}`} onClick={onBuy}>▲ BUY</button>
          <button className={`${styles.tradeBtn} ${styles.sellBtn}`} onClick={onSell}>▼ SELL</button>
        </div>
      </div>

      {/* Price + change */}
      <div className={styles.priceRow}>
        <span className={`${styles.mainPrice} ${isUp ? styles.up : styles.down}`}>
          {displayPrice}
        </span>
        <span className={`${styles.mainChange} ${isUp ? styles.up : styles.down}`}>
          {isUp ? '▲' : '▼'} {Math.abs(changePct)}%
        </span>

        {/* Timeframe selector */}
        <div className={styles.tfSelector}>
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              className={`${styles.tfBtn} ${timeframe === tf.value ? styles.tfActive : ''}`}
              onClick={() => onTimeframeChange(tf.value)}
            >
              {tf.label}
            </button>
          ))}
          <span className={styles.liveTag}>
            <span className="live-dot" /> Live
          </span>
        </div>
      </div>

      {/* Chart canvas */}
      <div ref={containerRef} className={styles.chartCanvas} />
    </div>
  );
}