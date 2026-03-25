/**
 * TradingChart — candlestick chart with:
 *  - Order book depth visualization (left side)
 *  - Professional candlestick chart (center)
 *  - SVG drawing tools (trendline, hline, ray, rectangle, fib, text)
 *  - Market Profile (right side volume profile with POC line)
 *  - Market Sessions (dotted vertical lines with labels)
 */
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useApp } from '../context/AppContext';
import { findSymbol, TIMEFRAMES } from '../utils/symbols';
import { DepthVisualization } from './DepthVisualization';
import styles from './TradingChart.module.css';

/* ── Drawing tools ── */
const TOOLS = [
  { id: 'trendline', label: 'Trend Line',  icon: '╱' },
  { id: 'hline',     label: 'Horiz. Line', icon: '—' },
  { id: 'ray',       label: 'Ray',         icon: '→' },
  { id: 'rectangle', label: 'Rectangle',   icon: '▭' },
  { id: 'fib',       label: 'Fibonacci',   icon: 'ϕ' },
  { id: 'text',      label: 'Text Label',  icon: 'T' },
];
const TOOL_COLORS = {
  trendline: '#40a9ff', hline: '#ffab00', ray: '#40a9ff',
  rectangle: '#a78bfa', fib: '#00e676',   text: '#e8edf4',
};
const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/* ── Market Sessions config ── */
const FOREX_SESSIONS = [
  { name: 'Sydney',   open: 21, color: '#a78bfa' },
  { name: 'Tokyo',    open: 0,  color: '#40a9ff' },
  { name: 'London',   open: 7,  color: '#ffab00' },
  { name: 'New York', open: 12, color: '#00e676' },
];
const CRYPTO_SESSIONS = [
  { name: '00:00 UTC', open: 0,  color: '#a78bfa' },
  { name: '08:00 UTC', open: 8,  color: '#40a9ff' },
  { name: '16:00 UTC', open: 16, color: '#00e676' },
];
const FOREX_SYMBOLS = ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP'];

function getSessionsForSymbol(symbol) {
  return FOREX_SYMBOLS.includes(symbol?.toUpperCase()) ? FOREX_SESSIONS : CRYPTO_SESSIONS;
}

/* ── Market Profile helpers ── */
const MP_BUCKETS = 30;
const MP_WIDTH   = 100; // px width of profile sidebar - increased for better layout

function buildMarketProfile(candles) {
  if (!candles?.length) return { buckets: [], poc: null, valueAreaHigh: null, valueAreaLow: null, maxVol: 0 };
  const maxP = Math.max(...candles.map(c => c.high));
  const minP = Math.min(...candles.map(c => c.low));
  const step  = (maxP - minP || 1) / MP_BUCKETS;

  const buckets = Array.from({ length: MP_BUCKETS }, (_, i) => ({
    priceHigh: minP + (i + 1) * step,
    priceLow:  minP + i * step,
    priceMid:  minP + (i + 0.5) * step,
    volume:    0,
  }));

  candles.forEach(c => {
    const vpp = (c.volume || 1) / (c.high - c.low || 0.0001);
    buckets.forEach(b => {
      const overlap = Math.max(0, Math.min(c.high, b.priceHigh) - Math.max(c.low, b.priceLow));
      b.volume += overlap * vpp;
    });
  });

  const maxVol    = Math.max(...buckets.map(b => b.volume));
  const pocBucket = buckets.reduce((a, b) => b.volume > a.volume ? b : a);

  // Value Area: 70% of total volume around POC
  const totalVol = buckets.reduce((s, b) => s + b.volume, 0);
  let accum = pocBucket.volume;
  const included = new Set([buckets.indexOf(pocBucket)]);
  while (accum < totalVol * 0.7) {
    const above = Math.max(...[...included]) + 1;
    const below = Math.min(...[...included]) - 1;
    const upVol  = above < buckets.length ? buckets[above].volume : -1;
    const dnVol  = below >= 0            ? buckets[below].volume  : -1;
    if (upVol < 0 && dnVol < 0) break;
    if (upVol >= dnVol) { included.add(above); accum += upVol; }
    else                { included.add(below); accum += dnVol; }
  }
  const incl = [...included].map(i => buckets[i]);
  return {
    buckets, maxVol, poc: pocBucket.priceMid,
    valueAreaHigh: Math.max(...incl.map(b => b.priceHigh)),
    valueAreaLow:  Math.min(...incl.map(b => b.priceLow)),
  };
}

function sliceForProfile(candles, mode) {
  if (!candles?.length) return candles;
  const now    = candles[candles.length - 1].time;
  const cutoff = mode === 'weekly' ? now - 86400 * 7 : now - 86400 * 2;
  return candles.filter(c => c.time >= cutoff);
}

/* ═══════════════════════════════════════════════════════════════ */
export default function TradingChart({
  candles, price, depth, onTimeframeChange, timeframe, compositeSignal, onBuy, onSell, fetchOlderCandles, scrollBuffer = 50,
}) {
  const chartRef  = useRef(null);
  const canvasRef = useRef(null);
  const svgRef    = useRef(null);
  const seriesRef = useRef(null);
  const { focusedSymbol } = useApp();
  const sym = findSymbol(focusedSymbol);
  const fetchingOlderRef = useRef(false); // Single flag to prevent concurrent fetches

  /* Drawing */
  const [activeTool,  setActiveTool]  = useState(null);
  const [drawings,    setDrawings]    = useState([]);
  const [renderTick,  setRenderTick]  = useState(0);
  const [showToolbar, setShowToolbar] = useState(false);
  const [textInput,   setTextInput]   = useState({ visible: false, px: 0, py: 0, value: '' });
  const [draftPx,     setDraftPx]     = useState(null);
  const dragStart = useRef(null);

  /* Overlays */
  const [mpMode,       setMpMode]       = useState('daily');
  const [showMP,       setShowMP]       = useState(true);
  const [showSessions, setShowSessions] = useState(true);

  /* Canvas size */
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 300 });

  /* ── Init chart ── */
  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = createChart(canvasRef.current, {
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
      rightPriceScale: { borderColor: '#1e2d3d', textColor: '#7a8fa8' },
      timeScale: { borderColor: '#1e2d3d', textColor: '#7a8fa8', timeVisible: true, secondsVisible: false },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#00e676', downColor: '#ff3d57',
      borderUpColor: '#00e676', borderDownColor: '#ff3d57',
      wickUpColor: '#00e676', wickDownColor: '#ff3d57',
    });
    chartRef.current  = chart;
    seriesRef.current = series;

    /* Re-render SVG overlays on any chart change */
    const bump = () => setRenderTick(n => n + 1);
    
    /* Detect scroll-back: when user scrolls to see older candles, fetch buffer */
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range && candles.length > 0 && fetchOlderCandles && !fetchingOlderRef.current) {
        const fromIdx = range.from; // Logical index of leftmost visible candle
        // If viewing within scrollBuffer of oldest data, fetch more
        if (fromIdx < scrollBuffer) {
          console.log(`📍 Scroll-back: ${Math.round(fromIdx)} candles from start, fetching older...`);
          fetchingOlderRef.current = true;
          fetchOlderCandles().finally(() => {
            fetchingOlderRef.current = false;
          });
        }
      }
      bump();
    });
    
    chart.timeScale().subscribeVisibleTimeRangeChange(bump);
    chart.subscribeCrosshairMove(bump);

    /* Poll loop for price-axis drag */
    let rafId, lastRef = null;
    const loop = () => {
      const probe = seriesRef.current?.priceToCoordinate(0);
      if (probe !== lastRef) { lastRef = probe; bump(); }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(rafId); chart.remove(); };
  }, []);

  /* Disable chart scroll/scale while drawing */
  useEffect(() => {
    if (!chartRef.current) return;
    const off = !!activeTool;
    chartRef.current.applyOptions({
      handleScroll: { mouseWheel: !off, pressedMouseMove: !off },
      handleScale:  { mouseWheel: !off, axisPressedMouseMove: !off },
    });
  }, [activeTool]);

  /* Load candle data */
  useEffect(() => {
    if (seriesRef.current && candles?.length > 0) {
      // Force re-initialization with new data
      seriesRef.current.setData(candles);
      chartRef.current?.timeScale().fitContent();
      console.log(`✅ Loaded ${candles.length} candles for ${timeframe}`);
    } else if (seriesRef.current && (!candles || candles.length === 0)) {
      // Clear chart if no candles
      seriesRef.current.setData([]);
      console.warn('⚠️ No candles data available');
    }
  }, [candles, timeframe]);

  /* Track canvas size for SVG viewBox */
  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setCanvasSize({ w: e.contentRect.width, h: e.contentRect.height });
      setRenderTick(n => n + 1);
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── Coordinate helpers ── */
  const toLogical = useCallback((px, py) => {
    if (!chartRef.current || !seriesRef.current) return null;
    const time  = chartRef.current.timeScale().coordinateToTime(px);
    const price = seriesRef.current.coordinateToPrice(py);
    if (time == null || price == null) return null;
    return { time, price };
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const toPixel = useCallback((time, price) => {
    if (!chartRef.current || !seriesRef.current) return null;
    const x = chartRef.current.timeScale().timeToCoordinate(time);
    const y = seriesRef.current.priceToCoordinate(price);
    if (x == null || y == null) return null;
    return { x, y };
  }, [renderTick]);

  const getCanvasPoint = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  };

  /* ── Mouse handlers for drawing ── */
  const handleMouseDown = useCallback(e => {
    if (!activeTool) return;
    const { px, py } = getCanvasPoint(e);
    if (activeTool === 'text') { setTextInput({ visible: true, px, py, value: '' }); return; }
    dragStart.current = { px, py };
  }, [activeTool]);

  const handleMouseMove = useCallback(e => {
    if (!dragStart.current || !activeTool) return;
    const { px, py } = getCanvasPoint(e);
    setDraftPx({ x1: dragStart.current.px, y1: dragStart.current.py, x2: px, y2: py, tool: activeTool });
  }, [activeTool]);

  const handleMouseUp = useCallback(e => {
    if (!dragStart.current) return;
    const { px, py } = getCanvasPoint(e);
    const start = toLogical(dragStart.current.px, dragStart.current.py);
    const end   = toLogical(px, py);
    if (start && end && (Math.abs(px - dragStart.current.px) > 3 || Math.abs(py - dragStart.current.py) > 3)) {
      setDrawings(prev => [...prev, {
        id: Date.now(), tool: activeTool,
        color: TOOL_COLORS[activeTool], start, end,
      }]);
    }
    dragStart.current = null;
    setDraftPx(null);
  }, [activeTool, toLogical]);

  const commitText = () => {
    if (textInput.value.trim()) {
      const logical = toLogical(textInput.px, textInput.py);
      if (logical) setDrawings(prev => [...prev, {
        id: Date.now(), tool: 'text',
        color: TOOL_COLORS.text, start: logical, text: textInput.value,
      }]);
    }
    setTextInput({ visible: false, px: 0, py: 0, value: '' });
  };

  const removeDrawing = id => setDrawings(prev => prev.filter(d => d.id !== id));
  const clearAll = () => { setDrawings([]); setDraftPx(null); };

  /* ── Market Profile data ── */
  const profileSlice  = useMemo(() => sliceForProfile(candles, mpMode), [candles, mpMode]);
  const marketProfile = useMemo(() => buildMarketProfile(profileSlice), [profileSlice]);

  /* ── Session lines (last 300 candles, deduplicated per hour/session) ── */
  const sessions     = useMemo(() => getSessionsForSymbol(focusedSymbol), [focusedSymbol]);
  const sessionLines = useMemo(() => {
    if (!showSessions || !candles?.length) return [];
    const lines = [], seen = new Set();
    candles.slice(-300).forEach(c => {
      const utcH = new Date(c.time * 1000).getUTCHours();
      sessions.forEach(s => {
        const key = `${Math.floor(c.time / 3600)}-${s.name}`;
        if (utcH === s.open && !seen.has(key)) {
          seen.add(key);
          lines.push({ time: c.time, session: s });
        }
      });
    });
    return lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, sessions, showSessions, renderTick]);

  /* ── Price display ── */
  const sigColor     = compositeSignal?.signal === 'buy'
    ? styles.sigBuy : compositeSignal?.signal === 'sell'
    ? styles.sigSell : styles.sigNeutral;
  const currentPrice = price?.bid || candles?.[candles.length - 1]?.close;
  const prevClose    = candles?.[candles.length - 2]?.close;
  const isUp         = currentPrice && prevClose ? currentPrice >= prevClose : true;
  const displayPrice = currentPrice
    ? currentPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })
    : '—';
  const changePct = currentPrice && prevClose
    ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : '0.00';

  const effectiveMPWidth = showMP ? MP_WIDTH : 0;

  return (
    <div className={styles.wrapper}>

      {/* ── Chart header ── */}
      <div className={styles.chartHeader}>
        <div className={styles.symbolMeta}>
          <span className={styles.base}>{sym.base.toUpperCase()}</span>
          <span className={styles.slash}> / </span>
          <span className={styles.quote}>{sym.quote.toUpperCase()}</span>
          <span className="pill pill-blue" style={{ marginLeft: 8, fontSize: 9, letterSpacing: 1 }}>
            {FOREX_SYMBOLS.includes(focusedSymbol)
              ? 'FOREX'
              : focusedSymbol.includes('USD') && !['XAUUSD','XAGUSD'].includes(focusedSymbol)
              ? 'CRYPTO' : 'ASSET'}
          </span>
        </div>
        <div className={styles.signalArea}>
          {compositeSignal && (
            <div className={`${styles.compositeSignalBadge} ${sigColor}`}>
              {compositeSignal.signal.toUpperCase()}
              <span className={styles.confidence}>{compositeSignal.confidence}%</span>
            </div>
          )}
          <button className={`${styles.tradeBtn} ${styles.buyBtn}`}  onClick={onBuy}>▲ BUY</button>
          <button className={`${styles.tradeBtn} ${styles.sellBtn}`} onClick={onSell}>▼ SELL</button>
        </div>
      </div>

      {/* ── Price row ── */}
      <div className={styles.priceRow}>
        <span className={`${styles.mainPrice} ${isUp ? styles.up : styles.down}`}>{displayPrice}</span>
        <span className={`${styles.mainChange} ${isUp ? styles.up : styles.down}`}>
          {isUp ? '▲' : '▼'} {Math.abs(changePct)}%
        </span>
        <div className={styles.tfSelector}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.value}
              className={`${styles.tfBtn} ${timeframe === tf.value ? styles.tfActive : ''}`}
              onClick={() => onTimeframeChange(tf.value)}
            >
              {tf.label}
            </button>
          ))}
          <span className={styles.liveTag}><span className="live-dot" /> Live</span>
        </div>
      </div>

      {/* ── Chart body: depth + chart + profile sidebar ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>

        {/* ── Order book depth visualization (optional left panel) ── */}
        {depth && (
          <DepthVisualization
            depth={depth}
            width={80}
            height={canvasSize.h}
          />
        )}

        {/* ── Market Profile left sidebar ── */}
        {showMP && (
          <MarketProfileSidebar
            profile={marketProfile}
            canvasH={canvasSize.h}
            toPixel={toPixel}
            width={MP_WIDTH}
          />
        )}

        {/* ── Chart canvas + SVG overlay ── */}
        <div
          ref={canvasRef}
          className={styles.chartCanvas}
          style={{ flex: 1, position: 'relative', overflow: 'hidden' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          {/* Loading overlay */}
          {!candles || candles.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 100,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(10, 18, 28, 0.7)', backdropFilter: 'blur(2px)',
            }}>
              <div style={{
                textAlign: 'center', color: '#7a8fa8', fontFamily: "'Space Mono', monospace",
              }}>
                <div style={{ fontSize: 13, marginBottom: 12 }}>Loading {focusedSymbol} {timeframe} candles...</div>
                <div style={{ fontSize: 11, opacity: 0.6 }}>Please ensure MT5 is connected</div>
              </div>
            </div>
          )}

          {/* SVG layer for all overlays and drawings */}
          <svg
            ref={svgRef}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              pointerEvents: activeTool ? 'all' : 'none',
              cursor: activeTool === 'eraser' ? 'no-drop' : activeTool ? 'crosshair' : 'default',
              zIndex: 10, overflow: 'visible',
            }}
            viewBox={`0 0 ${canvasSize.w} ${canvasSize.h}`}
            preserveAspectRatio="none"
          >
            <defs>
              <clipPath id="chart-clip">
                <rect x={0} y={0} width={canvasSize.w} height={canvasSize.h} />
              </clipPath>
            </defs>
            <g clipPath="url(#chart-clip)">

              {/* ── Market session vertical lines ── */}
              {sessionLines.map((sl, i) => {
                const px = toPixel(sl.time, candles?.[candles.length - 1]?.close || 0);
                if (!px || px.x < 0 || px.x > canvasSize.w) return null;

                /* Convert UTC timestamp to local HH:MM */
                const localTime = new Date(sl.time * 1000).toLocaleTimeString([], {
                  hour: '2-digit', minute: '2-digit',
                });

                return (
                  <g key={`sess-${i}-${sl.time}`}>
                    {/* Dotted vertical line full chart height */}
                    <line
                      x1={px.x} y1={0} x2={px.x} y2={canvasSize.h}
                      stroke={sl.session.color}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                      strokeOpacity={0.6}
                    />
                    {/* Label background */}
                    <rect
                      x={px.x + 3} y={4}
                      width={68} height={28}
                      fill="rgba(8,11,16,0.85)"
                      rx={3}
                    />
                    {/* Session name */}
                    <text
                      x={px.x + 7} y={16}
                      fill={sl.session.color}
                      fontSize={9}
                      fontFamily="'Space Mono',monospace"
                      fontWeight="700"
                    >
                      {sl.session.name}
                    </text>
                    {/* Local time */}
                    <text
                      x={px.x + 7} y={27}
                      fill={sl.session.color}
                      fontSize={8}
                      fontFamily="'Space Mono',monospace"
                      opacity={0.75}
                    >
                      {localTime}
                    </text>
                  </g>
                );
              })}

              {/* ── POC horizontal line across full chart ── */}
              {showMP && marketProfile.poc != null && (() => {
                const py = seriesRef.current?.priceToCoordinate(marketProfile.poc);
                if (py == null) return null;
                return (
                  <g>
                    {/* POC line */}
                    <line
                      x1={0} y1={py} x2={canvasSize.w} y2={py}
                      stroke="#ff3d57" strokeWidth={2} strokeDasharray="8 4"
                      opacity={0.8}
                    />
                    {/* POC label at right side */}
                    <rect
                      x={canvasSize.w - 90} y={py - 11}
                      width={88} height={18}
                      fill="rgba(255,61,87,0.2)" 
                      stroke="rgba(255,61,87,0.5)"
                      strokeWidth={1}
                      rx={3}
                    />
                    <text
                      x={canvasSize.w - 86} y={py + 4}
                      fill="#ff3d57"
                      fontSize={10}
                      fontFamily="'Space Mono', monospace"
                      fontWeight="700"
                      letterSpacing={0.5}
                    >
                      POC {marketProfile.poc.toFixed(4)}
                    </text>
                  </g>
                );
              })()}

              {/* ── Profile period start vertical marker ── */}
              {showMP && profileSlice?.length > 0 && (() => {
                const px = toPixel(profileSlice[0].time, candles?.[candles.length - 1]?.close || 0);
                if (!px) return null;
                const periodLabel = mpMode === 'weekly' ? '1W START' : '2D START';
                return (
                  <g>
                    {/* Vertical line marking period start */}
                    <line
                      x1={px.x} y1={0} x2={px.x} y2={canvasSize.h}
                      stroke="#a78bfa" strokeWidth={1.5}
                      strokeDasharray="5 5" strokeOpacity={0.6}
                    />
                    {/* Label at bottom */}
                    <rect
                      x={px.x + 3} y={canvasSize.h - 20}
                      width={70} height={16}
                      fill="rgba(167,139,250,0.15)" 
                      stroke="rgba(167,139,250,0.4)"
                      strokeWidth={0.8}
                      rx={2}
                    />
                    <text
                      x={px.x + 7} y={canvasSize.h - 7}
                      fill="#a78bfa"
                      fontSize={9}
                      fontFamily="'Space Mono', monospace"
                      fontWeight="600"
                      letterSpacing={0.3}
                    >
                      {periodLabel}
                    </text>
                  </g>
                );
              })()}

              {/* ── Committed drawings ── */}
              {drawings.map(d => (
                <ProjectedShape
                  key={`${d.id}-${renderTick}`}
                  d={d}
                  toPixel={toPixel}
                  canvasH={canvasSize.h}
                  isEraser={activeTool === 'eraser'}
                  onRemove={() => removeDrawing(d.id)}
                />
              ))}

              {/* ── Draft shape while dragging ── */}
              {draftPx && <DraftShape d={draftPx} />}

            </g>
          </svg>

          {/* Text label input overlay */}
          {textInput.visible && (
            <input
              autoFocus
              className={styles.textOverlayInput}
              style={{ left: textInput.px, top: textInput.py }}
              value={textInput.value}
              onChange={e => setTextInput(t => ({ ...t, value: e.target.value }))}
              onKeyDown={e => {
                if (e.key === 'Enter') commitText();
                if (e.key === 'Escape') setTextInput({ visible: false });
              }}
              onBlur={commitText}
              placeholder="Type label…"
            />
          )}
        </div>
      </div>

      {/* ── Bottom controls ── */}
      <div className={styles.drawingControls}>

        {/* Drawing toggle */}
        <button
          className={`${styles.drawToggleBtn} ${showToolbar ? styles.drawToggleActive : ''}`}
          onClick={() => { setShowToolbar(v => !v); if (showToolbar) setActiveTool(null); }}
          title="Drawing tools"
        >
          <IconDraw />
        </button>

        {/* Market Profile toggle */}
        <button
          className={`${styles.overlayBtn} ${showMP ? styles.overlayActive : ''}`}
          onClick={() => setShowMP(v => !v)}
          title="Market Profile"
        >
          MP
        </button>

        {/* MP period toggle (only visible when MP is on) */}
        {showMP && (
          <button
            className={styles.mpModeBtn}
            onClick={() => setMpMode(m => m === 'daily' ? 'weekly' : 'daily')}
            title="Switch Market Profile period"
          >
            {mpMode === 'daily' ? '2D' : '1W'}
          </button>
        )}

        {/* Sessions toggle */}
        <button
          className={`${styles.overlayBtn} ${showSessions ? styles.overlayActive : ''}`}
          onClick={() => setShowSessions(v => !v)}
          title="Market Sessions"
        >
          SES
        </button>

        {/* Drawing toolbar panel */}
        {showToolbar && (
          <div className={styles.drawToolbar}>
            {TOOLS.map(t => (
              <button
                key={t.id}
                className={`${styles.drawBtn} ${activeTool === t.id ? styles.drawBtnActive : ''}`}
                onClick={() => setActiveTool(cur => cur === t.id ? null : t.id)}
                title={t.label}
                style={activeTool === t.id ? { borderColor: TOOL_COLORS[t.id], color: TOOL_COLORS[t.id] } : {}}
              >
                <span className={styles.drawBtnIcon}>{t.icon}</span>
                <span className={styles.drawBtnLabel}>{t.label}</span>
              </button>
            ))}
            <div className={styles.toolDivider} />
            <button
              className={`${styles.drawBtn} ${activeTool === 'eraser' ? styles.drawBtnActive : ''}`}
              onClick={() => setActiveTool(cur => cur === 'eraser' ? null : 'eraser')}
            >
              <span className={styles.drawBtnIcon}>⌫</span>
              <span className={styles.drawBtnLabel}>Eraser</span>
            </button>
            {drawings.length > 0 && (
              <button className={`${styles.drawBtn} ${styles.clearBtn}`} onClick={clearAll}>
                <span className={styles.drawBtnIcon}>✕</span>
                <span className={styles.drawBtnLabel}>Clear All</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Market Profile left sidebar
   Single column with price-level blocks showing volume with colors
────────────────────────────────────────────────────────────── */
function MarketProfileSidebar({ profile, canvasH, toPixel, width }) {
  const { buckets, maxVol, poc, valueAreaHigh, valueAreaLow } = profile;

  if (!buckets?.length || !maxVol || canvasH < 10) {
    return (
      <div style={{
        width, flexShrink: 0,
        background: 'var(--bg-base)',
        borderRight: '1px solid var(--border)',
      }} />
    );
  }

  return (
    <div style={{
      width,
      flexShrink: 0,
      background: 'var(--bg-base)',
      borderRight: '1px solid var(--border)',
      overflow: 'hidden',
      position: 'relative',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header label */}
      <div style={{
        padding: '8px 6px',
        borderBottom: '1px solid var(--border)',
        fontSize: '10px',
        fontFamily: "'Space Mono', monospace",
        fontWeight: '700',
        letterSpacing: '0.5px',
        color: 'rgba(122,143,168,0.5)',
      }}>
        MARKET PROFILE
      </div>

      {/* SVG blocks */}
      <svg width={width} height={canvasH - 28} style={{ display: 'block', flex: 1 }}>
        {buckets.map((b, i) => {
          /* Map price levels to Y pixels via toPixel */
          const topPx = toPixel(0, b.priceHigh);
          const botPx = toPixel(0, b.priceLow);
          if (!topPx || !botPx) return null;

          const yTop = Math.min(topPx.y, botPx.y);
          const yBot = Math.max(topPx.y, botPx.y);
          const blockH = Math.max(2, yBot - yTop);

          // Full-width block
          const blockW = width - 2;

          const isPOC = poc != null && b.priceLow <= poc && b.priceHigh >= poc;
          const isVA  = valueAreaHigh != null
            && b.priceMid <= valueAreaHigh
            && b.priceMid >= valueAreaLow;

          // Color gradient based on volume intensity
          const volumeRatio = b.volume / maxVol;
          let fill;
          if (isPOC) {
            fill = '#ff3d57'; // Red for POC
          } else if (isVA) {
            fill = `rgba(64,169,255,${0.4 + volumeRatio * 0.5})`; // Blue shades for Value Area
          } else {
            fill = `rgba(64,169,255,${0.1 + volumeRatio * 0.25})`; // Lighter blue for rest
          }

          // Format volume label
          const volLabel = b.volume >= 1000
            ? `${(b.volume / 1000).toFixed(1)}k`
            : Math.round(b.volume).toString();

          return (
            <g key={`block-${i}`}>
              {/* Block with border */}
              <rect
                x={1} y={yTop}
                width={blockW} height={blockH}
                fill={fill}
                stroke={isPOC ? 'rgba(255,61,87,0.6)' : 'rgba(64,169,255,0.15)'}
                strokeWidth={isPOC ? 0.8 : 0.4}
                rx={0.5}
              />
              {/* Volume number inside block (if tall enough) */}
              {blockH >= 10 && (
                <text
                  x={4}
                  y={yTop + blockH / 2 + 3}
                  fill={isPOC ? '#ffaaaa' : 'rgba(200,220,240,0.75)'}
                  fontSize={7}
                  fontFamily="'Space Mono', monospace"
                  fontWeight={isPOC ? '700' : '500'}
                  pointerEvents="none"
                >
                  {volLabel}
                </text>
              )}
              {/* POC indicator dot */}
              {isPOC && (
                <circle
                  cx={width - 4}
                  cy={yTop + blockH / 2}
                  r={2}
                  fill="#ff3d57"
                  opacity={0.7}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* POC price label at bottom */}
      {poc != null && (
        <div style={{
          padding: '6px 6px',
          borderTop: '1px solid var(--border)',
          fontSize: '9px',
          fontFamily: "'Space Mono', monospace",
          fontWeight: '700',
          color: '#ff3d57',
          backgroundColor: 'rgba(255,61,87,0.08)',
        }}>
          POC {poc.toFixed(3)}
        </div>
      )}
    </div>
  );
}

/* ── Committed drawing shapes (price-projected) ── */
function ProjectedShape({ d, toPixel, canvasH, isEraser, onRemove }) {
  const p1 = toPixel(d.start.time, d.start.price);
  const p2 = d.end ? toPixel(d.end.time, d.end.price) : p1;
  if (!p1) return null;
  const color      = d.color || '#40a9ff';
  const clickProps = isEraser
    ? { onClick: onRemove, style: { cursor: 'no-drop' } }
    : {};

  switch (d.tool) {
    case 'trendline':
      if (!p2) return null;
      return (
        <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke={color} strokeWidth={2} {...clickProps} />
      );
    case 'hline':
      return (
        <g {...clickProps}>
          <line x1={0} y1={p1.y} x2={99999} y2={p1.y}
            stroke={color} strokeWidth={1.5} strokeDasharray="6 3" />
          <rect x={p1.x} y={p1.y - 9} width={72} height={14}
            fill="rgba(0,0,0,0.5)" rx={2} />
          <text x={p1.x + 4} y={p1.y + 4}
            fill={color} fontSize={9} fontFamily="'Space Mono',monospace">
            {d.start.price.toFixed(2)}
          </text>
        </g>
      );
    case 'ray': {
      if (!p2) return null;
      const dx = p2.x - p1.x, dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      return (
        <g {...clickProps}>
          <line x1={p1.x} y1={p1.y}
            x2={p1.x + (dx / len) * 9999}
            y2={p1.y + (dy / len) * 9999}
            stroke={color} strokeWidth={2} />
          <circle cx={p1.x} cy={p1.y} r={3} fill={color} />
        </g>
      );
    }
    case 'rectangle': {
      if (!p2) return null;
      const rx = Math.min(p1.x, p2.x), ry = Math.min(p1.y, p2.y);
      return (
        <g {...clickProps}>
          <rect x={rx} y={ry}
            width={Math.abs(p2.x - p1.x)} height={Math.abs(p2.y - p1.y)}
            stroke={color} strokeWidth={2}
            fill={color} fillOpacity={0.07} />
        </g>
      );
    }
    case 'fib': {
      if (!p2) return null;
      const minY = Math.min(p1.y, p2.y), maxY = Math.max(p1.y, p2.y);
      const range = maxY - minY;
      const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
      return (
        <g {...clickProps}>
          {FIB_LEVELS.map(lvl => {
            const ly = maxY - lvl * range;
            const fc = lvl === 0.618 ? '#00e676' : lvl === 0.5 ? '#ffab00' : color;
            const priceAtLevel = d.start.price + (d.end.price - d.start.price) * (1 - lvl);
            return (
              <g key={lvl}>
                <line x1={x1} y1={ly} x2={x2} y2={ly}
                  stroke={fc}
                  strokeWidth={lvl === 0 || lvl === 1 ? 2 : 1}
                  strokeDasharray={lvl === 0 || lvl === 1 ? 'none' : '4 2'} />
                <rect x={x2 + 2} y={ly - 8} width={90} height={13}
                  fill="rgba(0,0,0,0.45)" rx={2} />
                <text x={x2 + 5} y={ly + 3}
                  fill={fc} fontSize={9} fontFamily="'Space Mono',monospace">
                  {(lvl * 100).toFixed(1)}% {priceAtLevel.toFixed(2)}
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    case 'text':
      return (
        <text x={p1.x} y={p1.y}
          fill={color} fontSize={13}
          fontFamily="'Space Mono',monospace" fontWeight="600"
          {...clickProps}
          style={isEraser ? { cursor: 'no-drop' } : {}}>
          {d.text}
        </text>
      );
    default:
      return null;
  }
}

/* ── Draft shape while mouse is held down ── */
function DraftShape({ d }) {
  const color = TOOL_COLORS[d.tool] || '#40a9ff';
  const s = {
    stroke: color, strokeWidth: 1.5,
    fill: 'none', strokeOpacity: 0.7,
    strokeDasharray: '5 3',
  };
  switch (d.tool) {
    case 'trendline':
    case 'ray':
      return <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} {...s} />;
    case 'hline':
      return <line x1={0} y1={d.y1} x2={99999} y2={d.y1} {...s} />;
    case 'rectangle': {
      const rx = Math.min(d.x1, d.x2), ry = Math.min(d.y1, d.y2);
      return (
        <rect x={rx} y={ry}
          width={Math.abs(d.x2 - d.x1)} height={Math.abs(d.y2 - d.y1)}
          {...s} fill={color} fillOpacity={0.05} />
      );
    }
    case 'fib': {
      const minY = Math.min(d.y1, d.y2), maxY = Math.max(d.y1, d.y2);
      const range = maxY - minY;
      return (
        <g>
          {FIB_LEVELS.map(lvl => (
            <line key={lvl}
              x1={Math.min(d.x1, d.x2)} y1={maxY - lvl * range}
              x2={Math.max(d.x1, d.x2)} y2={maxY - lvl * range}
              stroke={color} strokeWidth={1}
              strokeDasharray="4 2" strokeOpacity={0.6} />
          ))}
        </g>
      );
    }
    default:
      return null;
  }
}

function IconDraw() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 11L10 3l2 2L4 13H2v-2z"
        stroke="currentColor" strokeWidth="1.4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 4.5l2 2"
        stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}