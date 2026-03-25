/**
 * AI Trading Dashboard - Complete Frontend
 * 
 * Architecture:
 * - WebSocket: ONLY chart candle updates + watchlist tick updates
 * - REST API + Polling: account info, orders, positions, history, symbols
 * - Persistent memory: localStorage for last viewed symbol/timeframe
 * - TradingChart: scrollable candlestick chart with Market Profile (volume histogram + POC line)
 * - Session/Market Profile buttons with hover settings popover
 * - Symbols from GET /api/mt5/symbols only
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = "http://localhost:3001/api";
const WS_URL = "ws://localhost:3001";
const POLL_INTERVALS = { account: 5000, positions: 3000, history: 10000, symbols: 30000 };
const TIMEFRAMES = ["1m","5m","15m","30m","1h","4h","1d","1w"];
const CANDLE_COUNT = 500;

// ─── Utilities ────────────────────────────────────────────────────────────────
const storage = {
  get: (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const fmt = {
  price: (v, d = 5) => v == null ? "—" : Number(v).toFixed(d),
  num: (v) => v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  pct: (v) => v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%",
  time: (ms) => { const d = new Date(ms); return d.toLocaleTimeString(); },
  date: (ms) => { const d = new Date(ms); return d.toLocaleDateString() + " " + d.toLocaleTimeString(); },
};

async function apiFetch(path, opts = {}, token = null) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || e.error || res.statusText); }
  return res.json();
}

// ─── Color Palette ─────────────────────────────────────────────────────────────
const C = {
  bg0: "#0d0f14", bg1: "#13161d", bg2: "#1a1e28", bg3: "#222736",
  border: "#2a2f3f", borderHover: "#3d4458",
  text: "#e2e8f0", textMuted: "#6b7694", textDim: "#3d4458",
  bull: "#26a69a", bear: "#ef5350", neutral: "#7b8bbd",
  accent: "#5865f2", accentHover: "#6d7af5",
  profit: "#26a69a", loss: "#ef5350",
  poc: "#f59e0b", session: "#7c3aed",
  yellow: "#f59e0b", blue: "#3b82f6", purple: "#8b5cf6",
};

// ─── Global Styles ─────────────────────────────────────────────────────────────
const GlobalStyle = () => (
  <style>{`
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: ${C.bg0}; color: ${C.text}; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; overflow: hidden; }
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: ${C.bg1}; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover { background: ${C.borderHover}; }
    .btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 4px; border: 1px solid ${C.border}; background: ${C.bg2}; color: ${C.text}; cursor: pointer; font-family: inherit; font-size: 11px; transition: all 0.15s; white-space: nowrap; }
    .btn:hover { background: ${C.bg3}; border-color: ${C.borderHover}; }
    .btn.active { background: ${C.accent}; border-color: ${C.accent}; color: #fff; }
    .btn.danger { border-color: ${C.bear}; color: ${C.bear}; }
    .btn.danger:hover { background: ${C.bear}22; }
    .btn.success { border-color: ${C.bull}; color: ${C.bull}; }
    .btn.success:hover { background: ${C.bull}22; }
    input, select { background: ${C.bg2}; border: 1px solid ${C.border}; border-radius: 4px; color: ${C.text}; font-family: inherit; font-size: 11px; padding: 5px 8px; outline: none; width: 100%; }
    input:focus, select:focus { border-color: ${C.accent}; }
    select option { background: ${C.bg2}; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; letter-spacing: 0.5px; }
    .tag.bull { background: ${C.bull}22; color: ${C.bull}; }
    .tag.bear { background: ${C.bear}22; color: ${C.bear}; }
    .tag.neutral { background: ${C.neutral}22; color: ${C.neutral}; }
    @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.4 } }
    @keyframes fadeIn { from { opacity:0; transform:translateY(-4px) } to { opacity:1; transform:translateY(0) } }
    .fadeIn { animation: fadeIn 0.15s ease; }
    canvas { display: block; }
  `}</style>
);

// ─── WebSocket Hook (chart + watchlist ONLY) ──────────────────────────────────
function useWebSocket(token, onTick, onCandle) {
  const wsRef = useRef(null);
  const reconnRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const subsRef = useRef(new Set());
  const candleSubsRef = useRef(new Set());

  const connect = useCallback(() => {
    if (!token) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Re-subscribe
      subsRef.current.forEach(sym => ws.send(JSON.stringify({ type: "subscribe", symbol: sym })));
      candleSubsRef.current.forEach(key => {
        const [symbol, timeframe] = key.split(":");
        ws.send(JSON.stringify({ type: "subscribe_candles", symbol, timeframe }));
      });
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "tick") onTick?.(msg);
        else if (msg.type === "candle_update") onCandle?.(msg);
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      reconnRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((symbol) => {
    subsRef.current.add(symbol);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "subscribe", symbol }));
  }, []);

  const unsubscribe = useCallback((symbol) => {
    subsRef.current.delete(symbol);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "unsubscribe", symbol }));
  }, []);

  const subscribeCandles = useCallback((symbol, timeframe) => {
    const key = `${symbol}:${timeframe}`;
    candleSubsRef.current.add(key);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "subscribe_candles", symbol, timeframe }));
  }, []);

  const unsubscribeCandles = useCallback((symbol, timeframe) => {
    const key = `${symbol}:${timeframe}`;
    candleSubsRef.current.delete(key);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "unsubscribe_candles", symbol, timeframe }));
  }, []);

  return { connected, subscribe, unsubscribe, subscribeCandles, unsubscribeCandles };
}

// ─── Polling Hook ─────────────────────────────────────────────────────────────
function usePolling(fn, interval, deps = []) {
  useEffect(() => {
    fn();
    const id = setInterval(fn, interval);
    return () => clearInterval(id);
  }, deps);
}

// ─── Market Profile Calculator ────────────────────────────────────────────────
function calcMarketProfile(candles, bins = 40) {
  if (!candles?.length) return { levels: [], poc: null, va_high: null, va_low: null };
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP;
  if (range === 0) return { levels: [], poc: null };
  const binSize = range / bins;
  const vol = new Array(bins).fill(0);
  candles.forEach(c => {
    const lo = Math.floor((c.low - minP) / binSize);
    const hi = Math.ceil((c.high - minP) / binSize);
    const v = (c.volume || 1) / Math.max(hi - lo, 1);
    for (let i = Math.max(0, lo); i < Math.min(bins, hi); i++) vol[i] += v;
  });
  const maxVol = Math.max(...vol);
  const pocIdx = vol.indexOf(maxVol);
  const levels = vol.map((v, i) => ({ price: minP + (i + 0.5) * binSize, volume: v, pct: v / maxVol, binSize }));
  // Value Area (70% of volume)
  let total = vol.reduce((a,b)=>a+b,0), target = total * 0.7, cum = vol[pocIdx], lo = pocIdx, hi = pocIdx;
  while (cum < target && (lo > 0 || hi < bins-1)) {
    const addLo = lo > 0 ? vol[lo-1] : 0, addHi = hi < bins-1 ? vol[hi+1] : 0;
    if (addLo >= addHi && lo > 0) { lo--; cum += addLo; }
    else if (hi < bins-1) { hi++; cum += addHi; }
    else break;
  }
  return { levels, poc: levels[pocIdx]?.price, va_high: levels[hi]?.price, va_low: levels[lo]?.price, minP, maxP };
}

// ─── Candlestick Chart Component ──────────────────────────────────────────────
function TradingChart({ candles, symbol, timeframe, ticks, showMarketProfile, showSession, mpConfig, sessionConfig }) {
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);
  const stateRef = useRef({
    offsetX: 0, isDragging: false, dragStartX: 0, dragOffsetX: 0,
    candleW: 10, zoom: 1, crossX: -1, crossY: -1, showCross: false
  });
  const animRef = useRef(null);

  const PADDING = { top: 40, right: 80, bottom: 30, left: 0 };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles?.length) return;
    const W = canvas.width, H = canvas.height;
    const ctx = canvas.getContext("2d");
    const s = stateRef.current;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = C.bg0;
    ctx.fillRect(0, 0, W, H);

    const chartW = W - PADDING.right - (showMarketProfile ? 80 : 0);
    const chartH = H - PADDING.top - PADDING.bottom;

    // Candle width based on zoom
    const baseW = Math.max(2, Math.min(20, s.zoom * 10));
    const gap = Math.max(1, baseW * 0.15);
    const totalW = baseW + gap;

    // How many candles visible
    const visCount = Math.floor(chartW / totalW) + 2;
    const totalCandles = candles.length;

    // Offset clamped
    const maxOffset = Math.max(0, totalCandles - Math.floor(chartW / totalW));
    s.offsetX = Math.max(0, Math.min(s.offsetX, maxOffset));

    const startIdx = Math.max(0, totalCandles - visCount - Math.floor(s.offsetX));
    const endIdx = Math.min(totalCandles, startIdx + visCount + 2);
    const visCandles = candles.slice(startIdx, endIdx);

    if (!visCandles.length) return;

    // Price range
    const highs = visCandles.map(c => c.high), lows = visCandles.map(c => c.low);
    let pMax = Math.max(...highs), pMin = Math.min(...lows);
    const pRange = pMax - pMin;
    pMax += pRange * 0.05; pMin -= pRange * 0.05;
    const pRangeF = pMax - pMin;

    const toY = (p) => PADDING.top + chartH * (1 - (p - pMin) / pRangeF);
    const toX = (i) => {
      const fromRight = (totalCandles - 1 - (startIdx + i)) - s.offsetX;
      return chartW - fromRight * totalW - totalW / 2;
    };

    // Market Profile calculation
    const mp = showMarketProfile ? calcMarketProfile(visCandles) : null;

    // ── Grid lines ───────────────────────────────────────────────────────────
    const gridLines = 6;
    ctx.strokeStyle = C.bg3; ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridLines; i++) {
      const y = PADDING.top + (chartH / gridLines) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      const price = pMax - (pRangeF / gridLines) * i;
      ctx.fillStyle = C.textMuted; ctx.font = "10px monospace";
      ctx.textAlign = "left";
      ctx.fillText(price.toFixed(5), chartW + 4, y + 4);
    }

    // ── Session coloring ───────────────────────────────────────────────────
    if (showSession) {
      const sessions = { tokyo: { start: 0, end: 9, color: "#7c3aed18" }, london: { start: 8, end: 17, color: "#1d4ed818" }, newyork: { start: 13, end: 22, color: "#065f4618" } };
      const active = sessionConfig?.activeSessions || ["london", "newyork"];
      visCandles.forEach((c, i) => {
        const x = toX(i);
        const hour = new Date(c.time).getUTCHours();
        active.forEach(sname => {
          const sess = sessions[sname];
          if (sess && hour >= sess.start && hour < sess.end) {
            ctx.fillStyle = sess.color;
            ctx.fillRect(x - totalW / 2, PADDING.top, totalW, chartH);
          }
        });
      });
    }

    // ── Candles ──────────────────────────────────────────────────────────────
    visCandles.forEach((c, i) => {
      const x = toX(i);
      if (x < -totalW || x > chartW + totalW) return;
      const bull = c.close >= c.open;
      const color = bull ? C.bull : C.bear;
      const oY = toY(c.open), cY = toY(c.close), hY = toY(c.high), lY = toY(c.low);

      // Wick
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();

      // Body
      const bodyTop = Math.min(oY, cY), bodyH = Math.max(1, Math.abs(cY - oY));
      ctx.fillStyle = bull ? C.bull : C.bear;
      ctx.fillRect(x - baseW / 2, bodyTop, baseW, bodyH);
    });

    // ── Market Profile (volume histogram left side) ──────────────────────────
    if (showMarketProfile && mp?.levels?.length) {
      const mpW = 70;
      const mpX = chartW + PADDING.right - 5; // right side inside chart area
      // Draw on left side of price axis
      const mpStartX = chartW + 2;

      // Actually draw as left-side column
      const colX = 0; // leftmost column
      mp.levels.forEach(lvl => {
        const y = toY(lvl.price);
        const barW = Math.max(2, lvl.pct * 60);
        const isBull = lvl.volume > 0;
        ctx.fillStyle = lvl.price === mp.poc ? `${C.poc}99` : `${C.neutral}44`;
        ctx.fillRect(0, y - 2, barW, Math.max(2, (lvl.binSize / pRangeF) * chartH));
        if (lvl.pct > 0.3) {
          ctx.fillStyle = C.textMuted; ctx.font = "9px monospace";
          ctx.textAlign = "left";
          ctx.fillText(Math.round(lvl.volume), barW + 2, y + 3);
        }
      });

      // POC line
      if (mp.poc) {
        const pocY = toY(mp.poc);
        ctx.strokeStyle = C.poc; ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(0, pocY); ctx.lineTo(chartW, pocY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.poc; ctx.font = "bold 10px monospace";
        ctx.textAlign = "left";
        ctx.fillText("POC " + mp.poc.toFixed(5), chartW + 4, pocY - 3);
      }

      // VA lines
      if (mp.va_high) {
        const vaHY = toY(mp.va_high);
        ctx.strokeStyle = `${C.purple}88`; ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, vaHY); ctx.lineTo(chartW, vaHY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.purple; ctx.font = "9px monospace";
        ctx.fillText("VAH", chartW + 4, vaHY - 2);
      }
      if (mp.va_low) {
        const vaLY = toY(mp.va_low);
        ctx.strokeStyle = `${C.purple}88`; ctx.lineWidth = 0.8;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(0, vaLY); ctx.lineTo(chartW, vaLY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.purple; ctx.font = "9px monospace";
        ctx.fillText("VAL", chartW + 4, vaLY + 8);
      }
    }

    // ── Current price line ───────────────────────────────────────────────────
    const lastClose = candles[candles.length - 1]?.close;
    if (lastClose) {
      const y = toY(lastClose);
      ctx.strokeStyle = `${C.accent}99`; ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(chartW, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.accent;
      ctx.fillRect(chartW, y - 9, PADDING.right - 2, 18);
      ctx.fillStyle = "#fff"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
      ctx.fillText(lastClose.toFixed(5), chartW + (PADDING.right - 2) / 2, y + 4);
    }

    // ── Tick price overlay ────────────────────────────────────────────────────
    if (ticks?.[symbol]) {
      const tick = ticks[symbol];
      const askY = toY(tick.ask);
      ctx.fillStyle = `${C.bull}cc`;
      ctx.fillRect(chartW, askY - 8, PADDING.right - 2, 16);
      ctx.fillStyle = "#fff"; ctx.font = "10px monospace"; ctx.textAlign = "center";
      ctx.fillText(tick.ask.toFixed(5), chartW + (PADDING.right - 2) / 2, askY + 4);
    }

    // ── Crosshair ─────────────────────────────────────────────────────────────
    if (s.showCross && s.crossX >= 0 && s.crossX <= chartW) {
      ctx.strokeStyle = `${C.textMuted}88`; ctx.lineWidth = 0.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(s.crossX, PADDING.top); ctx.lineTo(s.crossX, PADDING.top + chartH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s.crossY); ctx.lineTo(chartW, s.crossY); ctx.stroke();
      ctx.setLineDash([]);

      // Price label on y-axis
      const crossPrice = pMax - ((s.crossY - PADDING.top) / chartH) * pRangeF;
      if (crossPrice >= pMin && crossPrice <= pMax) {
        ctx.fillStyle = C.bg3;
        ctx.fillRect(chartW, s.crossY - 9, PADDING.right - 2, 18);
        ctx.fillStyle = C.text; ctx.font = "10px monospace"; ctx.textAlign = "center";
        ctx.fillText(crossPrice.toFixed(5), chartW + (PADDING.right - 2) / 2, s.crossY + 4);
      }

      // OHLCV on hover candle
      const hovIdx = Math.round((chartW - s.crossX) / totalW);
      const candleIdx = totalCandles - 1 - Math.floor(s.offsetX) - hovIdx;
      if (candleIdx >= 0 && candleIdx < totalCandles) {
        const c = candles[candleIdx];
        ctx.fillStyle = `${C.bg2}ee`;
        ctx.fillRect(PADDING.top, 4, 320, 20);
        ctx.fillStyle = c.close >= c.open ? C.bull : C.bear;
        ctx.font = "10px monospace"; ctx.textAlign = "left";
        ctx.fillText(
          `O:${c.open.toFixed(5)} H:${c.high.toFixed(5)} L:${c.low.toFixed(5)} C:${c.close.toFixed(5)} V:${c.volume}`,
          PADDING.top + 4, 16
        );
      }
    }

    // ── Time axis ─────────────────────────────────────────────────────────────
    ctx.fillStyle = C.bg1;
    ctx.fillRect(0, H - PADDING.bottom, W, PADDING.bottom);
    const timeStep = Math.max(1, Math.floor(40 / totalW));
    visCandles.forEach((c, i) => {
      if (i % timeStep !== 0) return;
      const x = toX(i);
      if (x < 30 || x > chartW - 20) return;
      ctx.fillStyle = C.textMuted; ctx.font = "9px monospace"; ctx.textAlign = "center";
      const d = new Date(c.time);
      const label = timeframe.includes("d") || timeframe.includes("w")
        ? d.toLocaleDateString("en", { month: "short", day: "numeric" })
        : d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
      ctx.fillText(label, x, H - 8);
    });

  }, [candles, symbol, timeframe, ticks, showMarketProfile, showSession, mpConfig, sessionConfig]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    resize();
    return () => ro.disconnect();
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse events
  const onMouseDown = (e) => {
    const s = stateRef.current;
    s.isDragging = true; s.dragStartX = e.clientX; s.dragOffsetX = s.offsetX;
  };
  const onMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = stateRef.current;
    const rect = canvas.getBoundingClientRect();
    s.crossX = e.clientX - rect.left;
    s.crossY = e.clientY - rect.top;
    s.showCross = true;
    if (s.isDragging) {
      const dx = e.clientX - s.dragStartX;
      const baseW = Math.max(2, Math.min(20, s.zoom * 10));
      const totalW = baseW + Math.max(1, baseW * 0.15);
      s.offsetX = s.dragOffsetX - dx / totalW;
    }
    draw();
  };
  const onMouseLeave = () => { stateRef.current.showCross = false; stateRef.current.isDragging = false; draw(); };
  const onMouseUp = () => { stateRef.current.isDragging = false; };
  const onWheel = (e) => {
    e.preventDefault();
    const s = stateRef.current;
    if (e.ctrlKey || e.metaKey) {
      s.zoom = Math.max(0.3, Math.min(3, s.zoom - e.deltaY * 0.005));
    } else {
      const baseW = Math.max(2, Math.min(20, s.zoom * 10));
      const totalW = baseW + Math.max(1, baseW * 0.15);
      s.offsetX += e.deltaY * 0.5 / totalW;
    }
    draw();
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: C.bg0 }}>
      <canvas
        ref={canvasRef}
        style={{ cursor: "crosshair", userSelect: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      />
    </div>
  );
}

// ─── Settings Popover ─────────────────────────────────────────────────────────
function SettingsPopover({ config, onChange, fields, title }) {
  return (
    <div className="fadeIn" style={{
      position: "absolute", top: "100%", right: 0, zIndex: 100,
      background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: 12, minWidth: 180, boxShadow: "0 8px 24px #00000066"
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: C.text, fontSize: 11 }}>{title}</div>
      {fields.map(f => (
        <div key={f.key} style={{ marginBottom: 8 }}>
          <div style={{ color: C.textMuted, fontSize: 10, marginBottom: 3 }}>{f.label}</div>
          {f.type === "select" ? (
            <select value={config[f.key] ?? f.default} onChange={e => onChange({ ...config, [f.key]: e.target.value })}>
              {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === "multicheck" ? (
            <div>{f.options.map(o => (
              <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, cursor: "pointer" }}>
                <input type="checkbox" checked={(config[f.key] || f.default || []).includes(o.value)}
                  onChange={e => {
                    const cur = config[f.key] || f.default || [];
                    onChange({ ...config, [f.key]: e.target.checked ? [...cur, o.value] : cur.filter(v => v !== o.value) });
                  }} style={{ width: "auto" }} />
                <span style={{ color: C.text, fontSize: 11 }}>{o.label}</span>
              </label>
            ))}</div>
          ) : (
            <input type={f.type || "number"} value={config[f.key] ?? f.default}
              onChange={e => onChange({ ...config, [f.key]: f.type === "number" ? +e.target.value : e.target.value })} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Chart Toolbar ────────────────────────────────────────────────────────────
function ChartToolbar({ symbol, timeframe, onTimeframe, showMP, onToggleMP, showSession, onToggleSession, mpConfig, onMpConfig, sessionConfig, onSessionConfig }) {
  const [mpSettings, setMpSettings] = useState(false);
  const [sessSettings, setSessSettings] = useState(false);
  const mpRef = useRef(null);
  const sessRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (mpRef.current && !mpRef.current.contains(e.target)) setMpSettings(false);
      if (sessRef.current && !sessRef.current.contains(e.target)) setSessSettings(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", background: C.bg1, borderBottom: `1px solid ${C.border}`, flexWrap: "wrap" }}>
      {/* Symbol label */}
      <span style={{ color: C.text, fontWeight: 700, marginRight: 4, fontSize: 12 }}>{symbol}</span>

      {/* Timeframes */}
      {TIMEFRAMES.map(tf => (
        <button key={tf} className={`btn${timeframe === tf ? " active" : ""}`} style={{ padding: "3px 7px", fontSize: 10 }} onClick={() => onTimeframe(tf)}>{tf}</button>
      ))}

      <div style={{ flex: 1 }} />

      {/* Session button with settings */}
      <div ref={sessRef} style={{ position: "relative" }}
        onMouseLeave={() => setSessSettings(false)}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className={`btn${showSession ? " active" : ""}`} onClick={onToggleSession} style={{ fontSize: 10 }}>
            Session
          </button>
          <button className="btn" style={{ padding: "3px 5px", fontSize: 9, marginLeft: 1 }}
            onMouseEnter={() => setSessSettings(true)}>⚙</button>
        </div>
        {sessSettings && (
          <SettingsPopover title="Session Settings" config={sessionConfig} onChange={onSessionConfig}
            fields={[{ key: "activeSessions", label: "Active Sessions", type: "multicheck", default: ["london","newyork"],
              options: [{ value: "tokyo", label: "🇯🇵 Tokyo" }, { value: "london", label: "🇬🇧 London" }, { value: "newyork", label: "🇺🇸 New York" }] }]} />
        )}
      </div>

      {/* Market Profile button with settings */}
      <div ref={mpRef} style={{ position: "relative" }}
        onMouseLeave={() => setMpSettings(false)}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <button className={`btn${showMP ? " active" : ""}`} onClick={onToggleMP} style={{ fontSize: 10 }}>
            Mkt Profile
          </button>
          <button className="btn" style={{ padding: "3px 5px", fontSize: 9, marginLeft: 1 }}
            onMouseEnter={() => setMpSettings(true)}>⚙</button>
        </div>
        {mpSettings && (
          <SettingsPopover title="Market Profile" config={mpConfig} onChange={onMpConfig}
            fields={[
              { key: "bins", label: "Price Bins", type: "number", default: 40 },
              { key: "valueAreaPct", label: "Value Area %", type: "number", default: 70 }
            ]} />
        )}
      </div>
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [server, setServer] = useState("MetaQuotes-Demo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!account || !password) { setError("Account and password required"); return; }
    setLoading(true); setError("");
    try {
      const res = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ account: +account, password, server }) });
      onLogin(res.token, res.account_id);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg0 }}>
      <div style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 8, padding: 32, width: 320 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.accent, letterSpacing: 1 }}>MT5 DASHBOARD</div>
          <div style={{ color: C.textMuted, fontSize: 11, marginTop: 4 }}>Connect your trading account</div>
        </div>

        {error && <div style={{ background: `${C.bear}22`, border: `1px solid ${C.bear}44`, borderRadius: 4, padding: "8px 12px", color: C.bear, fontSize: 11, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={{ color: C.textMuted, fontSize: 10, display: "block", marginBottom: 4 }}>ACCOUNT NUMBER</label>
            <input type="number" value={account} onChange={e => setAccount(e.target.value)} placeholder="12345678" /></div>
          <div><label style={{ color: C.textMuted, fontSize: 10, display: "block", marginBottom: 4 }}>PASSWORD</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleLogin()} /></div>
          <div><label style={{ color: C.textMuted, fontSize: 10, display: "block", marginBottom: 4 }}>SERVER</label>
            <input value={server} onChange={e => setServer(e.target.value)} placeholder="MetaQuotes-Demo" /></div>
          <button className="btn active" style={{ width: "100%", justifyContent: "center", padding: "10px", fontSize: 12, marginTop: 4 }}
            onClick={handleLogin} disabled={loading}>
            {loading ? "Connecting…" : "Connect to MT5"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account Panel ─────────────────────────────────────────────────────────────
function AccountPanel({ account, wsConnected }) {
  if (!account) return (
    <div style={{ padding: "8px 12px", display: "flex", gap: 16, background: C.bg1, borderBottom: `1px solid ${C.border}`, alignItems: "center" }}>
      <div style={{ color: C.textMuted, fontSize: 11, animation: "pulse 1.5s infinite" }}>Loading account…</div>
    </div>
  );

  const items = [
    { label: "Balance", value: `$${fmt.num(account.balance)}`, color: C.text },
    { label: "Equity", value: `$${fmt.num(account.equity)}`, color: account.equity >= account.balance ? C.profit : C.loss },
    { label: "Free Margin", value: `$${fmt.num(account.free_margin)}`, color: C.text },
    { label: "P&L", value: `$${fmt.num(account.profit_loss)}`, color: account.profit_loss >= 0 ? C.profit : C.loss },
    { label: "Margin Level", value: account.margin_level ? account.margin_level.toFixed(1) + "%" : "—", color: C.text },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "0 8px", height: 34, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 12, borderRight: `1px solid ${C.border}`, marginRight: 12 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: wsConnected ? C.bull : C.bear, boxShadow: `0 0 6px ${wsConnected ? C.bull : C.bear}` }} />
        <span style={{ color: C.textMuted, fontSize: 10 }}>#{account.account_id}</span>
      </div>
      {items.map(it => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 6, paddingRight: 16 }}>
          <span style={{ color: C.textMuted, fontSize: 10 }}>{it.label}:</span>
          <span style={{ color: it.color, fontSize: 11, fontWeight: 600 }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Watchlist ────────────────────────────────────────────────────────────────
function Watchlist({ symbols, selected, onSelect, ticks }) {
  const [search, setSearch] = useState("");
  const filtered = symbols.filter(s => s.name.toLowerCase().includes(search.toLowerCase())).slice(0, 60);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg1 }}>
      <div style={{ padding: "6px 8px", borderBottom: `1px solid ${C.border}` }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbols…" style={{ fontSize: 11 }} />
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.map(sym => {
          const tick = ticks[sym.name];
          const isActive = selected === sym.name;
          return (
            <div key={sym.name} onClick={() => onSelect(sym.name)}
              style={{ padding: "5px 8px", cursor: "pointer", background: isActive ? `${C.accent}22` : "transparent", borderLeft: isActive ? `2px solid ${C.accent}` : "2px solid transparent", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.1s" }}>
              <div>
                <div style={{ color: isActive ? C.accent : C.text, fontWeight: isActive ? 600 : 400, fontSize: 11 }}>{sym.name}</div>
                {sym.description && <div style={{ color: C.textMuted, fontSize: 9, marginTop: 1 }}>{sym.description.slice(0, 20)}</div>}
              </div>
              {tick ? (
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: C.text, fontSize: 10, fontWeight: 600 }}>{tick.bid?.toFixed(5)}</div>
                  <div style={{ color: C.textMuted, fontSize: 9 }}>{tick.ask?.toFixed(5)}</div>
                </div>
              ) : (
                <div style={{ color: C.textDim, fontSize: 10 }}>—</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Positions Tab ────────────────────────────────────────────────────────────
function PositionsTab({ positions, token, onRefresh }) {
  const [closing, setClosing] = useState(null);

  const closePos = async (ticket) => {
    setClosing(ticket);
    try { await apiFetch(`/mt5/close/${ticket}`, { method: "POST" }, token); onRefresh(); }
    catch (e) { alert(e.message); } finally { setClosing(null); }
  };

  if (!positions?.length) return <div style={{ padding: 16, color: C.textMuted, fontSize: 11 }}>No open positions</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.bg2 }}>
            {["Ticket","Symbol","Type","Volume","Open","Current","P&L","Time",""].map(h => (
              <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.ticket} style={{ borderBottom: `1px solid ${C.border}22` }}>
              <td style={{ padding: "5px 8px", color: C.textMuted }}>{p.ticket}</td>
              <td style={{ padding: "5px 8px", color: C.text, fontWeight: 600 }}>{p.symbol}</td>
              <td style={{ padding: "5px 8px" }}><span className={`tag ${p.type === "BUY" ? "bull" : "bear"}`}>{p.type}</span></td>
              <td style={{ padding: "5px 8px", color: C.text }}>{p.volume}</td>
              <td style={{ padding: "5px 8px", color: C.text }}>{fmt.price(p.open_price)}</td>
              <td style={{ padding: "5px 8px", color: C.text }}>{fmt.price(p.current_price)}</td>
              <td style={{ padding: "5px 8px", color: p.profit_loss >= 0 ? C.profit : C.loss, fontWeight: 600 }}>{p.profit_loss >= 0 ? "+" : ""}{fmt.num(p.profit_loss)}</td>
              <td style={{ padding: "5px 8px", color: C.textMuted }}>{fmt.time(p.open_time)}</td>
              <td style={{ padding: "5px 8px" }}>
                <button className="btn danger" style={{ padding: "2px 7px", fontSize: 10 }} disabled={closing === p.ticket}
                  onClick={() => closePos(p.ticket)}>Close</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function HistoryTab({ trades }) {
  if (!trades?.length) return <div style={{ padding: 16, color: C.textMuted, fontSize: 11 }}>No trade history</div>;

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: C.bg2 }}>
            {["Ticket","Symbol","Type","Volume","Open","Close","P&L","Opened","Closed"].map(h => (
              <th key={h} style={{ padding: "5px 8px", textAlign: "left", color: C.textMuted, fontWeight: 600, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trades.slice(0, 100).map((t, i) => (
            <tr key={t.ticket || i} style={{ borderBottom: `1px solid ${C.border}22` }}>
              <td style={{ padding: "5px 8px", color: C.textMuted }}>{t.ticket}</td>
              <td style={{ padding: "5px 8px", color: C.text, fontWeight: 600 }}>{t.symbol}</td>
              <td style={{ padding: "5px 8px" }}><span className={`tag ${t.type === "BUY" ? "bull" : "bear"}`}>{t.type}</span></td>
              <td style={{ padding: "5px 8px", color: C.text }}>{t.volume}</td>
              <td style={{ padding: "5px 8px", color: C.text }}>{fmt.price(t.open_price)}</td>
              <td style={{ padding: "5px 8px", color: C.text }}>{fmt.price(t.close_price)}</td>
              <td style={{ padding: "5px 8px", color: t.profit_loss >= 0 ? C.profit : C.loss, fontWeight: 600 }}>{t.profit_loss >= 0 ? "+" : ""}{fmt.num(t.profit_loss)}</td>
              <td style={{ padding: "5px 8px", color: C.textMuted }}>{t.open_time ? fmt.time(t.open_time) : "—"}</td>
              <td style={{ padding: "5px 8px", color: C.textMuted }}>{t.close_time ? fmt.time(t.close_time) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Order Form ───────────────────────────────────────────────────────────────
function OrderForm({ symbol, token, onSuccess }) {
  const [type, setType] = useState("BUY");
  const [volume, setVolume] = useState("0.01");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const place = async () => {
    setLoading(true); setMsg(null);
    try {
      const res = await apiFetch("/mt5/order", { method: "POST", body: JSON.stringify({ symbol, type, volume: +volume, stop_loss: sl ? +sl : null, take_profit: tp ? +tp : null }) }, token);
      setMsg({ ok: true, text: `Order placed: ticket #${res.ticket}` });
      onSuccess?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 12, background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6 }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: C.text, fontSize: 12 }}>New Order — {symbol}</div>
      {msg && <div style={{ padding: "6px 10px", borderRadius: 4, marginBottom: 10, fontSize: 11, background: msg.ok ? `${C.bull}22` : `${C.bear}22`, color: msg.ok ? C.bull : C.bear }}>{msg.text}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <button className={`btn${type === "BUY" ? " success" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => setType("BUY")}>▲ BUY</button>
        <button className={`btn${type === "SELL" ? " danger" : ""}`} style={{ flex: 1, justifyContent: "center" }} onClick={() => setType("SELL")}>▼ SELL</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div><label style={{ color: C.textMuted, fontSize: 10 }}>Volume</label><input value={volume} onChange={e => setVolume(e.target.value)} type="number" step="0.01" /></div>
        <div><label style={{ color: C.textMuted, fontSize: 10 }}>Stop Loss</label><input value={sl} onChange={e => setSl(e.target.value)} placeholder="optional" /></div>
        <div><label style={{ color: C.textMuted, fontSize: 10 }}>Take Profit</label><input value={tp} onChange={e => setTp(e.target.value)} placeholder="optional" /></div>
      </div>
      <button className={`btn ${type === "BUY" ? "success" : "danger"} active`} style={{ width: "100%", justifyContent: "center", padding: 8 }}
        onClick={place} disabled={loading}>
        {loading ? "Placing…" : `Place ${type} Order`}
      </button>
    </div>
  );
}

// ─── AI Analysis Tab ──────────────────────────────────────────────────────────
function AITab({ symbol, timeframe, candles, token }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState("demo");
  const [apiKey, setApiKey] = useState("");

  const analyze = async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/ai/analyze", { method: "POST", body: JSON.stringify({ symbol, timeframe, candles: candles?.slice(-20), provider, apiKey }) }, token);
      setAnalysis(res.analysis);
    } catch (e) { setAnalysis("Error: " + e.message); } finally { setLoading(false); }
  };

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <select value={provider} onChange={e => setProvider(e.target.value)} style={{ width: "auto" }}>
          <option value="demo">Demo</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
        </select>
        {provider !== "demo" && <input placeholder="API Key" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} style={{ flex: 1 }} />}
        <button className="btn active" onClick={analyze} disabled={loading}>{loading ? "Analyzing…" : "Analyze"}</button>
      </div>
      {analysis && (
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 6, padding: 12, fontSize: 11, lineHeight: 1.6, color: C.text, whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
          {analysis}
        </div>
      )}
    </div>
  );
}

// ─── News Tab ─────────────────────────────────────────────────────────────────
function NewsTab({ symbol, token }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol || !token) return;
    setLoading(true);
    apiFetch(`/news/${symbol}`, {}, token)
      .then(setNews).catch(() => setNews([])).finally(() => setLoading(false));
  }, [symbol, token]);

  if (loading) return <div style={{ padding: 16, color: C.textMuted }}>Loading news…</div>;

  return (
    <div style={{ padding: 8 }}>
      {news.map((n, i) => (
        <div key={n.id || i} style={{ padding: "8px 0", borderBottom: `1px solid ${C.border}22`, display: "flex", gap: 10 }}>
          <span className={`tag ${n.sentiment}`} style={{ marginTop: 2, flexShrink: 0 }}>{n.sentiment}</span>
          <div>
            <div style={{ color: C.text, fontSize: 11, lineHeight: 1.4 }}>{n.title}</div>
            <div style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{n.source} · {n.publishedAt ? new Date(n.publishedAt).toLocaleDateString() : ""}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Bottom Panel (Tabs) ──────────────────────────────────────────────────────
function BottomPanel({ positions, history, symbol, timeframe, candles, token, onRefreshPositions }) {
  const [tab, setTab] = useState("positions");
  const tabs = [
    { id: "positions", label: `Positions (${positions?.length || 0})` },
    { id: "history", label: "History" },
    { id: "order", label: "New Order" },
    { id: "ai", label: "AI Analysis" },
    { id: "news", label: "News" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg0 }}>
      <div style={{ display: "flex", gap: 0, background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "0 4px" }}>
        {tabs.map(t => (
          <button key={t.id} className={`btn${tab === t.id ? " active" : ""}`} style={{ borderRadius: 0, border: "none", borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", padding: "6px 12px", fontSize: 11 }}
            onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "positions" && <PositionsTab positions={positions} token={token} onRefresh={onRefreshPositions} />}
        {tab === "history" && <HistoryTab trades={history} />}
        {tab === "order" && <div style={{ padding: 12 }}><OrderForm symbol={symbol} token={token} onSuccess={onRefreshPositions} /></div>}
        {tab === "ai" && <AITab symbol={symbol} timeframe={timeframe} candles={candles} token={token} />}
        {tab === "news" && <NewsTab symbol={symbol} token={token} />}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [token, setToken] = useState(() => storage.get("token", null));
  const [accountId, setAccountId] = useState(() => storage.get("accountId", null));
  const [account, setAccount] = useState(null);

  // Persistent symbol/timeframe
  const [symbol, setSymbol] = useState(() => storage.get("symbol", "EURUSD"));
  const [timeframe, setTimeframe] = useState(() => storage.get("timeframe", "1h"));

  // Data
  const [symbols, setSymbols] = useState([]);
  const [candles, setCandles] = useState([]);
  const [positions, setPositions] = useState([]);
  const [history, setHistory] = useState([]);
  const [ticks, setTicks] = useState({});

  // Chart config
  const [showMP, setShowMP] = useState(() => storage.get("showMP", false));
  const [showSession, setShowSession] = useState(() => storage.get("showSession", false));
  const [mpConfig, setMpConfig] = useState(() => storage.get("mpConfig", { bins: 40, valueAreaPct: 70 }));
  const [sessionConfig, setSessionConfig] = useState(() => storage.get("sessionConfig", { activeSessions: ["london", "newyork"] }));

  // Status
  const [candlesLoading, setCandlesLoading] = useState(false);

  // Persist prefs
  useEffect(() => { storage.set("symbol", symbol); }, [symbol]);
  useEffect(() => { storage.set("timeframe", timeframe); }, [timeframe]);
  useEffect(() => { storage.set("showMP", showMP); }, [showMP]);
  useEffect(() => { storage.set("showSession", showSession); }, [showSession]);
  useEffect(() => { storage.set("mpConfig", mpConfig); }, [mpConfig]);
  useEffect(() => { storage.set("sessionConfig", sessionConfig); }, [sessionConfig]);

  // WebSocket: ticks + candle updates
  const { connected: wsConnected, subscribe, unsubscribe, subscribeCandles, unsubscribeCandles } = useWebSocket(
    token,
    (tick) => setTicks(prev => ({ ...prev, [tick.symbol]: tick })),
    (msg) => {
      if (msg.symbol === symbol && msg.timeframe === timeframe) {
        setCandles(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.time === msg.candle.time) { updated[lastIdx] = msg.candle; }
          else { updated.push(msg.candle); if (updated.length > CANDLE_COUNT + 50) updated.shift(); }
          return updated;
        });
      }
    }
  );

  // Subscribe watchlist to ticks
  useEffect(() => {
    if (!symbols.length) return;
    const tops = symbols.slice(0, 20).map(s => s.name);
    tops.forEach(s => subscribe(s));
    return () => tops.forEach(s => unsubscribe(s));
  }, [symbols]);

  // Subscribe to candles for current chart
  useEffect(() => {
    subscribeCandles(symbol, timeframe);
    return () => unsubscribeCandles(symbol, timeframe);
  }, [symbol, timeframe]);

  // REST: Load symbols (once, then refresh every 30s)
  const loadSymbols = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch("/mt5/symbols", {}, token);
      if (res.symbols) setSymbols(res.symbols);
    } catch {}
  }, [token]);
  usePolling(loadSymbols, POLL_INTERVALS.symbols, [loadSymbols]);

  // REST: Account info polling
  const loadAccount = useCallback(async () => {
    if (!token) return;
    try { const res = await apiFetch("/mt5/account", {}, token); setAccount(res); } catch {}
  }, [token]);
  usePolling(loadAccount, POLL_INTERVALS.account, [loadAccount]);

  // REST: Positions polling
  const loadPositions = useCallback(async () => {
    if (!token) return;
    try { const res = await apiFetch("/mt5/positions", {}, token); if (res.positions) setPositions(res.positions); } catch {}
  }, [token]);
  usePolling(loadPositions, POLL_INTERVALS.positions, [loadPositions]);

  // REST: History polling
  const loadHistory = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`/mt5/trades?account_id=${accountId}&limit=100`, {}, token);
      if (res.trades) setHistory(res.trades);
    } catch {}
  }, [token, accountId]);
  usePolling(loadHistory, POLL_INTERVALS.history, [loadHistory]);

  // REST: Load candles on symbol/timeframe change
  useEffect(() => {
    if (!token || !symbol) return;
    setCandlesLoading(true);
    apiFetch(`/mt5/candles/${symbol}?timeframe=${timeframe}&count=${CANDLE_COUNT}`, {}, token)
      .then(res => { if (res.candles) setCandles(res.candles); })
      .catch(() => {})
      .finally(() => setCandlesLoading(false));
  }, [token, symbol, timeframe]);

  const handleLogin = (tok, accId) => {
    storage.set("token", tok);
    storage.set("accountId", accId);
    setToken(tok); setAccountId(accId);
  };

  const handleLogout = () => {
    storage.set("token", null); storage.set("accountId", null);
    setToken(null); setAccountId(null); setAccount(null);
  };

  if (!token) return <><GlobalStyle /><LoginScreen onLogin={handleLogin} /></>;

  return (
    <>
      <GlobalStyle />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", background: C.bg1, borderBottom: `1px solid ${C.border}`, padding: "0 12px", height: 36, gap: 12, flexShrink: 0 }}>
          <span style={{ color: C.accent, fontWeight: 700, fontSize: 13, letterSpacing: 1 }}>MT5</span>
          <span style={{ color: C.border }}>|</span>
          <span style={{ color: C.text, fontSize: 11, fontWeight: 600 }}>{symbol}</span>
          <span style={{ color: C.textMuted, fontSize: 10 }}>{timeframe}</span>
          {ticks[symbol] && (
            <>
              <span style={{ color: C.bull, fontSize: 11 }}>B: {ticks[symbol].bid?.toFixed(5)}</span>
              <span style={{ color: C.bear, fontSize: 11 }}>A: {ticks[symbol].ask?.toFixed(5)}</span>
            </>
          )}
          <div style={{ flex: 1 }} />
          {candlesLoading && <span style={{ color: C.textMuted, fontSize: 10, animation: "pulse 1s infinite" }}>Loading…</span>}
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: wsConnected ? C.bull : C.textMuted, title: wsConnected ? "WS Connected" : "WS Disconnected" }} />
          <button className="btn danger" style={{ fontSize: 10 }} onClick={handleLogout}>Logout</button>
        </div>

        {/* Account bar */}
        <AccountPanel account={account} wsConnected={wsConnected} />

        {/* Main layout */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
          {/* Watchlist */}
          <div style={{ width: 160, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflow: "hidden" }}>
            <Watchlist symbols={symbols} selected={symbol} onSelect={setSymbol} ticks={ticks} />
          </div>

          {/* Center: Chart + Bottom Panel */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            {/* Chart toolbar */}
            <ChartToolbar
              symbol={symbol} timeframe={timeframe} onTimeframe={setTimeframe}
              showMP={showMP} onToggleMP={() => setShowMP(v => !v)}
              showSession={showSession} onToggleSession={() => setShowSession(v => !v)}
              mpConfig={mpConfig} onMpConfig={setMpConfig}
              sessionConfig={sessionConfig} onSessionConfig={setSessionConfig}
            />

            {/* Chart */}
            <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
              {candles.length > 0 ? (
                <TradingChart
                  candles={candles} symbol={symbol} timeframe={timeframe} ticks={ticks}
                  showMarketProfile={showMP} showSession={showSession}
                  mpConfig={mpConfig} sessionConfig={sessionConfig}
                />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.textMuted, fontSize: 12 }}>
                  {candlesLoading ? "Loading chart data…" : "No data available"}
                </div>
              )}
            </div>

            {/* Bottom panel */}
            <div style={{ height: 220, flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
              <BottomPanel
                positions={positions} history={history}
                symbol={symbol} timeframe={timeframe} candles={candles}
                token={token} onRefreshPositions={loadPositions}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}