import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useStore } from '../store/useStore';
import { getWebSocketClient } from '../App';
import '../styles/Chart.css';

type TimeframeKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export default function Chart() {
  const { selectedSymbol } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeKey>('1h');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasBackscroll, setHasBackscroll] = useState(false);
  const [isBackscrollLoading, setIsBackscrollLoading] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  const chartInitializedRef = useRef(false);
  const previousSymbolRef = useRef<string | null>(null);
  const currentTimeframeRef = useRef<TimeframeKey>('1h');

  // Track whether a backscroll fetch is in flight so the poll doesn't interfere
  const backscrollInFlightRef = useRef(false);
  // Track whether the first segment-0 load has completed
  const initialLoadDoneRef = useRef(false);

  // ─── WebSocket subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    const ws = getWebSocketClient();
    if (!ws || !ws.isConnected()) return;

    if (selectedSymbol !== previousSymbolRef.current) {
      if (previousSymbolRef.current) {
        ws.unsubscribeChartTicks(previousSymbolRef.current);
      }
      if (selectedSymbol) {
        ws.subscribeChartTicks(selectedSymbol);
      }
      previousSymbolRef.current = selectedSymbol;
    }

    return () => {
      if (selectedSymbol && previousSymbolRef.current === selectedSymbol) {
        ws.unsubscribeChartTicks(selectedSymbol);
      }
    };
  }, [selectedSymbol]);

  // ─── Chart initialisation ───────────────────────────────────────────────────
  // containerRef must ALWAYS be in the DOM — overlays are layered on top via CSS.
  useEffect(() => {
    if (!containerRef.current || chartInitializedRef.current) return;

    const initTimer = setTimeout(() => {
      if (!containerRef.current) return;

      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;

      if (w === 0 || h === 0) {
        setTimeout(() => {
          if (containerRef.current && !chartInitializedRef.current) {
            const rw = containerRef.current.clientWidth;
            const rh = containerRef.current.clientHeight;
            if (rw > 0 && rh > 0) initializeChart(containerRef.current, rw, rh);
          }
        }, 500);
        return;
      }

      initializeChart(containerRef.current, w, h);
    }, 100);

    return () => clearTimeout(initTimer);
  }, []);

  const initializeChart = (container: HTMLDivElement, width: number, height: number) => {
    if (chartInitializedRef.current) return;

    try {
      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: '#0f0f0f' },
          textColor: '#d1d5db',
        },
        width,
        height,
        timeScale: { timeVisible: true, secondsVisible: false },
      });

      const series = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      chartRef.current = chart;
      seriesRef.current = series;
      chartInitializedRef.current = true;
      setChartReady(true);

      chart.timeScale().fitContent();

      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      };
      window.addEventListener('resize', handleResize);
      (window as any).__chartCleanup = () => window.removeEventListener('resize', handleResize);
    } catch (err) {
      console.error('[CHART] Failed to initialize chart:', err);
      chartInitializedRef.current = false;
    }
  };

  // ─── Chart cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        try {
          (window as any).__chartCleanup?.();
          chartRef.current.remove();
        } catch (_) {}
        chartRef.current = null;
        seriesRef.current = null;
        chartInitializedRef.current = false;
      }
    };
  }, []);

  // ─── Data state ─────────────────────────────────────────────────────────────
  const segmentSize = 500;
  const [loadedSegments, setLoadedSegments] = useState<Set<number>>(new Set());
  const [prefetchingSegments, setPrefetchingSegments] = useState<Set<number>>(new Set());
  const chartDataRef = useRef<Array<{ time: Time; open: number; high: number; low: number; close: number }>>([]);

  // ─── fetchSegment ────────────────────────────────────────────────────────────
  const fetchSegment = useCallback(async (
    segmentIndex: number,
    isBackscroll: boolean = false,
    tryCount: number = 0,
  ) => {
    if (!selectedSymbol) return;

    // FIX 1: Don't let the silent poll run while a backscroll fetch is in flight.
    // The poll would reset isBackscrollLoading and cause the spinner to flicker or vanish.
    if (segmentIndex === 0 && !isBackscroll && backscrollInFlightRef.current) {
      console.log('[CHART] Poll skipped — backscroll in flight');
      return;
    }

    // FIX 2: Classify this fetch so we only show UI changes for things the user
    // needs to know about. Silent polls show no spinner at all.
    const isInitialLoad = segmentIndex === 0 && !isBackscroll && !initialLoadDoneRef.current;
    const isActualBackscroll = isBackscroll && segmentIndex > 0;

    if (isInitialLoad) {
      setIsLoading(true);
    } else if (isActualBackscroll) {
      backscrollInFlightRef.current = true;
      setIsBackscrollLoading(true);
    }
    // Silent poll (segment 0, initialLoadDone, not backscroll): no spinner change

    setError(null);

    const maxRetries = 3;
    const token = localStorage.getItem('access_token');
    const tokenParam = token ? `&token=${token}` : '';
    const url = `http://localhost:8000/api/candles/${selectedSymbol}?timeframe=${timeframe}&count=${segmentSize}&segment=${segmentIndex}${tokenParam}`;

    console.log(`[CHART] fetchSegment=${segmentIndex} isBackscroll=${isBackscroll} retry=${tryCount}`);

    try {
      const response = await fetch(url);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.detail || response.statusText || 'Unknown error';
        console.error(`[CHART] HTTP ${response.status} for segment=${segmentIndex}:`, message);

        if (tryCount < maxRetries) {
          await new Promise((r) => setTimeout(r, 2 ** tryCount * 1000));
          return fetchSegment(segmentIndex, isBackscroll, tryCount + 1);
        }

        if (isInitialLoad) {
          setError(`Couldn't load ${selectedSymbol}. ${message}`);
        }
        return;
      }

      const data = await response.json();

      // ── Empty response ───────────────────────────────────────────────────
      if (!data || !Array.isArray(data.candles) || data.candles.length === 0) {
        if (segmentIndex === 0 && !isBackscroll) {
          if (tryCount < maxRetries) {
            await new Promise((r) => setTimeout(r, 2 ** tryCount * 1000));
            return fetchSegment(segmentIndex, isBackscroll, tryCount + 1);
          }
          if (isInitialLoad) {
            setError(`No candle data returned for ${selectedSymbol}`);
          }
        } else {
          // Backscroll segment came back empty — no more history on this broker
          console.info(`[CHART] Segment ${segmentIndex} empty — no more history`);
          setHasBackscroll(false);
        }
        return;
      }

      // ── Map candles ──────────────────────────────────────────────────────
      const candles = data.candles.map((c: any) => ({
        time: c.time as Time,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));

      // ── Merge into chart data ────────────────────────────────────────────
      // Always merge by time key so we never lose backscrolled history when
      // a segment-0 poll comes in.
      const existingMap = new Map(chartDataRef.current.map((c) => [c.time, c]));
      candles.forEach((c: { time: Time; open: number; high: number; low: number; close: number }) =>
        existingMap.set(c.time, c),
      );
      chartDataRef.current = Array.from(existingMap.values()).sort(
        (a, b) => (a.time as number) - (b.time as number),
      );

      // Push to TradingView
      if (seriesRef.current) {
        seriesRef.current.setData(chartDataRef.current);
        if (isInitialLoad) {
          chartRef.current?.timeScale().fitContent();
        }
      }

      setLoadedSegments((prev) => new Set(prev).add(segmentIndex));

      if (isInitialLoad) {
        initialLoadDoneRef.current = true;
      }

      // FIX 3: Only trust `has_backscroll` from the server response.
      // The old code forced backscroll=true whenever candle count < segmentSize,
      // which caused an eternal "Loading older candles..." spinner on demo accounts
      // that legitimately have fewer bars (e.g. 7 candles on a new demo account).
      const serverSaysMore = data.has_backscroll === true;
      setHasBackscroll(serverSaysMore);

      console.log(`[CHART] Segment ${segmentIndex} OK: ${candles.length} candles, has_backscroll=${serverSaysMore}`);

      // Kick off prefetch of next segments
      if (!isBackscroll && segmentIndex === 0 && serverSaysMore) {
        [1, 2, 3].forEach((nextSeg) => {
          if (!loadedSegments.has(nextSeg) && !prefetchingSegments.has(nextSeg)) {
            setPrefetchingSegments((prev) => new Set(prev).add(nextSeg));
            fetchSegment(nextSeg, true).finally(() => {
              setPrefetchingSegments((prev) => {
                const copy = new Set(prev);
                copy.delete(nextSeg);
                return copy;
              });
            });
          }
        });
      }

    } catch (err) {
      console.error('[CHART] fetchSegment error:', err);
      if (isInitialLoad) {
        setError(`Unexpected error loading ${selectedSymbol}`);
      }
    } finally {
      // FIX 4: Always clean up the correct loading flag in finally, even on error.
      if (isInitialLoad) {
        setIsLoading(false);
      }
      if (isActualBackscroll) {
        setIsBackscrollLoading(false);
        backscrollInFlightRef.current = false;
      }
    }
  }, [selectedSymbol, timeframe, loadedSegments, prefetchingSegments]);

  // ─── Symbol / timeframe change detector ─────────────────────────────────────
  useEffect(() => {
    if (!selectedSymbol || !chartInitializedRef.current) return;

    if (
      selectedSymbol !== previousSymbolRef.current ||
      timeframe !== currentTimeframeRef.current
    ) {
      console.log(`[CHART] Symbol/timeframe changed → ${selectedSymbol}/${timeframe}`);
      previousSymbolRef.current = selectedSymbol;
      currentTimeframeRef.current = timeframe;

      // Full reset for new symbol/timeframe
      chartDataRef.current = [];
      initialLoadDoneRef.current = false;
      backscrollInFlightRef.current = false;
      setLoadedSegments(new Set());
      setPrefetchingSegments(new Set());
      setHasBackscroll(false);
      setIsLoading(true);
      setIsBackscrollLoading(false);
      setError(null);

      fetchSegment(0, false);
    }
  }, [selectedSymbol, timeframe, chartReady, fetchSegment]);

  // ─── Ensure first load when chart becomes ready ──────────────────────────────
  useEffect(() => {
    if (!chartReady || !selectedSymbol) return;
    if (!loadedSegments.has(0) && !initialLoadDoneRef.current) {
      console.log('[CHART] chartReady — forcing initial fetchSegment(0)');
      fetchSegment(0, false);
    }
  }, [chartReady, selectedSymbol, timeframe, loadedSegments, fetchSegment]);

  // ─── Silent background poll (5 s) ────────────────────────────────────────────
  useEffect(() => {
    if (!chartReady || !selectedSymbol) return;

    const id = setInterval(() => {
      // FIX 5: Only poll once the initial load is done and no backscroll is running.
      if (initialLoadDoneRef.current && !backscrollInFlightRef.current) {
        fetchSegment(0, false);
      }
    }, 5000);

    return () => clearInterval(id);
  }, [chartReady, selectedSymbol, timeframe, fetchSegment]);

  // ─── Backscroll on visible range change ──────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !selectedSymbol) return;

    const handleVisibleTimeRangeChange = (timeRange: any) => {
      if (!timeRange || !hasBackscroll || isBackscrollLoading) return;

      const data = chartDataRef.current;
      if (!data || data.length < 2) return;

      const earliestTime = data[0].time as number;
      const latestTime = data[data.length - 1].time as number;
      if (typeof timeRange.from !== 'number') return;

      const totalSpan = latestTime - earliestTime;
      if (totalSpan <= 0) return;

      const relative = ((timeRange.from as number) - earliestTime) / totalSpan;
      if (relative > 0.2) return;

      const nextSegment =
        Math.max(...Array.from(loadedSegments.values()).concat([0])) + 1;

      // Cap at 10 segments to avoid hammering a broker with limited history
      if (nextSegment > 10) return;

      if (!loadedSegments.has(nextSegment) && !prefetchingSegments.has(nextSegment)) {
        console.log(`[CHART] Backscroll → segment ${nextSegment}`);
        setPrefetchingSegments((prev) => new Set(prev).add(nextSegment));
        fetchSegment(nextSegment, true).finally(() => {
          setPrefetchingSegments((prev) => {
            const copy = new Set(prev);
            copy.delete(nextSegment);
            return copy;
          });
        });
      }
    };

    const chart = chartRef.current;
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    return () => chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
  }, [selectedSymbol, hasBackscroll, isBackscrollLoading, fetchSegment, loadedSegments, prefetchingSegments]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  const hasChartData = chartDataRef.current.length > 0;
  const showEmpty = !selectedSymbol;
  const showError = !!error && !isLoading;
  const showInitialLoading = !error && isLoading && !hasChartData && !!selectedSymbol;

  return (
    <div className="chart-container">
      <div className="chart-header">
        <div className="chart-title">
          {selectedSymbol ? (
            <>
              <span className="symbol">{selectedSymbol}</span>
              <span className="price">—</span>
              <span className="change neutral">—</span>
            </>
          ) : (
            <span className="no-symbol">Select a symbol from watchlist</span>
          )}
        </div>

        <div className="chart-controls">
          <div className="timeframe-buttons">
            {(['1m', '5m', '15m', '1h', '4h', '1d'] as TimeframeKey[]).map((tf) => (
              <button
                key={tf}
                className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
                onClick={() => setTimeframe(tf)}
              >
                {tf}
              </button>
            ))}
          </div>
          <div className="chart-settings">
            <button className="btn-settings" title="Chart settings">⚙️</button>
          </div>
        </div>
      </div>

      {/*
        The canvas container is ALWAYS mounted so TradingView can attach to it on init.
        States (empty / loading / error) are CSS overlays — they never unmount the canvas.
      */}
      <div className="chart-body chart-ready" style={{ position: 'relative' }}>
        <div
          ref={containerRef}
          className="chart-inner"
          style={{ visibility: showEmpty || showError ? 'hidden' : 'visible' }}
        />

        {showEmpty && (
          <div className="chart-overlay chart-empty">
            <div className="chart-placeholder">
              <p>📊 No symbol selected</p>
              <p>Select a symbol from the watchlist to see the chart</p>
            </div>
          </div>
        )}

        {showError && (
          <div className="chart-overlay chart-error">
            <div className="chart-placeholder">
              <p>⚠️ Error loading chart</p>
              <p className="chart-error-msg">{error}</p>
              <p className="chart-error-note">Check browser console for details</p>
            </div>
          </div>
        )}

        {showInitialLoading && (
          <div className="chart-overlay chart-loading">
            <div className="chart-placeholder">
              <div className="spinner"></div>
              <p>Loading chart for {selectedSymbol}...</p>
            </div>
          </div>
        )}

        {/*
          Small backscroll banner — only shown while a historical fetch is actively
          in flight AND the server confirmed more data exists.
          FIX: Previously shown permanently because isBackscrollLoading never cleared.
        */}
        {isBackscrollLoading && hasChartData && (
          <div className="chart-backscroll-indicator">
            <div className="spinner small"></div>
            <span>Loading older candles...</span>
          </div>
        )}
      </div>
    </div>
  );
}