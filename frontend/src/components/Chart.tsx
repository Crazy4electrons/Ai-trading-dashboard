import { useEffect, useRef, useState } from 'react';
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
  const chartInitializedRef = useRef(false);
  const previousSymbolRef = useRef<string | null>(null);
  const currentTimeframeRef = useRef<TimeframeKey>('1h');
  const previousSymbolRef = useRef<string | null>(null);

  // Manage WebSocket subscriptions for chart ticks
  useEffect(() => {
    const ws = getWebSocketClient();
    if (!ws || !ws.isConnected()) {
      console.log('[CHART] WebSocket not available for subscriptions');
      return;
    }

    // If symbol changed, manage subscriptions
    if (selectedSymbol !== previousSymbolRef.current) {
      // Unsubscribe from previous symbol if it existed
      if (previousSymbolRef.current) {
        console.log(`[CHART] Unsubscribing from chart_ticks for ${previousSymbolRef.current}`);
        ws.unsubscribeChartTicks(previousSymbolRef.current);
      }

      // Subscribe to new symbol if selected
      if (selectedSymbol) {
        console.log(`[CHART] Subscribing to chart_ticks for ${selectedSymbol}`);
        ws.subscribeChartTicks(selectedSymbol);
      }

      previousSymbolRef.current = selectedSymbol;
    }

    return () => {
      // On cleanup, unsubscribe if we have a symbol
      if (selectedSymbol && previousSymbolRef.current === selectedSymbol) {
        console.log(`[CHART] Cleanup: Unsubscribing from chart_ticks for ${selectedSymbol}`);
        ws.unsubscribeChartTicks(selectedSymbol);
      }
    };
  }, [selectedSymbol]);

  // Initialize chart with delay to ensure container has dimensions
  useEffect(() => {
    if (!containerRef.current || chartInitializedRef.current) return;

    // Use a small delay to ensure DOM has settled and container has dimensions
    const initTimer = setTimeout(() => {
      if (!containerRef.current) return;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;

      console.log(`[CHART] Initializing with dimensions: ${width}x${height}`);

      if (width === 0 || height === 0) {
        console.error('[CHART] Container has no dimensions! Width:', width, 'Height:', height);
        return;
      }

      try {
        // Create chart
        const chart = createChart(containerRef.current!, {
          layout: {
            background: { type: ColorType.Solid, color: '#0f0f0f' },
            textColor: '#d1d5db',
          },
          width: width,
          height: height,
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Add candlestick series
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

        console.log(`[CHART] Chart initialized successfully`);

        // Fit content
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

        // Store cleanup function reference for later use
        (window as any).__chartCleanup = () => {
          window.removeEventListener('resize', handleResize);
        };
      } catch (err) {
        console.error('[CHART] Failed to initialize chart:', err);
      }
    }, 100);

    return () => {
      clearTimeout(initTimer);
      // Clean up chart when component unmounts
      if (chartRef.current) {
        console.log('[CHART] Cleaning up chart');
        (window as any).__chartCleanup?.();
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        chartInitializedRef.current = false;
      }
    };
  }, []);

  // Fetch real candles data from API with caching and backscroll
  const fetchCandles = useCallback(async (fromTime?: number, isBackscroll: boolean = false) => {
    if (!selectedSymbol) return;

    if (isBackscroll) {
      setIsBackscrollLoading(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      console.log(`[CHART] Fetching candles for ${selectedSymbol}, timeframe=${timeframe}, fromTime=${fromTime}, isBackscroll=${isBackscroll}`);
      
      // Get token from localStorage
      const token = localStorage.getItem('access_token');
      const tokenParam = token ? `&token=${token}` : '';
      
      // Build URL with backscroll support
      let url = `http://localhost:8000/api/candles/${selectedSymbol}?timeframe=${timeframe}&count=500${tokenParam}`;
      if (fromTime) {
        url += `&from_time=${fromTime}`;
      }
      
      console.log(`[CHART] Request URL: ${url}`);
      
      // Call backend API to get cached/real MT5 candle data
      const response = await fetch(url);
      console.log(`[CHART] Response status: ${response.status} (${response.statusText})`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`[CHART] HTTP Error: ${response.status}`, errorData);
        
        // Log error to console as requested
        console.error(`[CHART] Failed to load candles for ${selectedSymbol}: ${errorData.detail || response.statusText}`);
        
        throw new Error(errorData.detail || `Failed to fetch candles: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[CHART] Successfully received data:`, data);
      
      const candles = data.candles as Array<{
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
      }>;

      console.log(`[CHART] Candles array length: ${candles?.length || 0}`);
      console.log(`[CHART] Cached: ${data.cached}`);
      
      if (!candles || candles.length === 0) {
        console.error(`[CHART] No candles in response`);
        throw new Error('No candle data received');
      }

      console.log(`[CHART] First candle: time=${candles[0].time}, open=${candles[0].open}, close=${candles[0].close}`);
      console.log(`[CHART] Last candle: time=${candles[candles.length-1].time}, open=${candles[candles.length-1].open}, close=${candles[candles.length-1].close}`);

      // Convert MT5 timestamps and format for TradingView
      const chartData: Array<{ time: Time; open: number; high: number; low: number; close: number }> =
        candles.map((candle) => ({
          time: (candle.time || Math.floor(Date.now() / 1000)) as Time,
          open: Number(candle.open),
          high: Number(candle.high),
          low: Number(candle.low),
          close: Number(candle.close),
        }));

      console.log(`[CHART] Formatted ${chartData.length} candles for chart`);

      // Set data on chart
      if (seriesRef.current) {
        if (isBackscroll && chartData.length > 0) {
          // For backscroll, merge with existing data
          console.log(`[CHART] Merging backscroll data...`);
          // Note: TradingView handles backscroll automatically when we setData with older data
        }
        
        console.log(`[CHART] Setting data on chart series...`);
        seriesRef.current.setData(chartData);
        console.log(`[CHART] Chart series data set`);
      } else {
        console.error(`[CHART] Series reference is null!`);
      }

      // Fit content
      if (chartRef.current) {
        console.log(`[CHART] Fitting chart content to screen...`);
        chartRef.current.timeScale().fitContent();
        console.log(`[CHART] Chart content fitted`);
      } else {
        console.error(`[CHART] Chart reference is null!`);
      }

      // Update backscroll availability
      setHasBackscroll(chartData.length >= 500); // If we got 500 candles, there might be more

      console.log(`[CHART] Chart successfully updated with ${chartData.length} candles`);
      setError(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error loading chart data';
      console.error('[CHART] Error fetching candles:', errorMessage);
      console.error('[CHART] Full error:', err);
      setError(`Could not load asset pair ${selectedSymbol}. ${errorMessage}`);
      
      // Fallback: show mock data for demo
      console.log('Loading fallback mock data...');
      try {
        const now = Math.floor(Date.now() / 1000);
        const mockCandles: Array<{ time: Time; open: number; high: number; low: number; close: number }> = [];
        
        for (let i = 30; i >= 0; i--) {
          const time = now - i * 3600; // 1 hour intervals
          const open = 1.0800 + (Math.random() - 0.5) * 0.02;
          const high = open + Math.random() * 0.01;
          const low = open - Math.random() * 0.01;
          const close = low + Math.random() * (high - low);
          
          mockCandles.push({
            time: time as Time,
            open: parseFloat(open.toFixed(5)),
            high: parseFloat(high.toFixed(5)),
            low: parseFloat(low.toFixed(5)),
            close: parseFloat(close.toFixed(5)),
          });
        }
        
        if (seriesRef.current) {
          seriesRef.current.setData(mockCandles);
        }
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
        
        console.log('Fallback mock data loaded');
        setError(`Could not load ${selectedSymbol} - showing demo data`);
      } catch (fallbackErr) {
        console.error('Fallback data error:', fallbackErr);
      }
    } finally {
      setIsLoading(false);
      setIsBackscrollLoading(false);
    }
  }, [selectedSymbol, timeframe]);
        }

        console.log(`[CHART] First candle: time=${candles[0].time}, open=${candles[0].open}, close=${candles[0].close}`);
        console.log(`[CHART] Last candle: time=${candles[candles.length-1].time}, open=${candles[candles.length-1].open}, close=${candles[candles.length-1].close}`);

        // Convert MT5 timestamps and format for TradingView
        const chartData: Array<{ time: Time; open: number; high: number; low: number; close: number }> =
          candles.map((candle) => ({
            time: (candle.time || Math.floor(Date.now() / 1000)) as Time,
            open: Number(candle.open),
            high: Number(candle.high),
            low: Number(candle.low),
            close: Number(candle.close),
          }));

        console.log(`[CHART] Formatted ${chartData.length} candles for chart`);

        // Set data on chart
        if (seriesRef.current) {
          console.log(`[CHART] Setting data on chart series...`);
          seriesRef.current.setData(chartData);
          console.log(`[CHART] Chart series data set`);
        } else {
          console.error(`[CHART] Series reference is null!`);
        }

        // Fit content
        if (chartRef.current) {
          console.log(`[CHART] Fitting chart content to screen...`);
          chartRef.current.timeScale().fitContent();
          console.log(`[CHART] Chart content fitted`);
        } else {
          console.error(`[CHART] Chart reference is null!`);
        }

        console.log(`[CHART] Chart successfully updated with ${chartData.length} candles`);
        setError(null);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error loading chart data';
        console.error('[CHART] Error fetching candles:', errorMessage);
        console.error('[CHART] Full error:', err);
        setError(errorMessage);
        
        // Fallback: show mock data for demo
        console.log('Loading fallback mock data...');
        try {
          const now = Math.floor(Date.now() / 1000);
          const mockCandles: Array<{ time: Time; open: number; high: number; low: number; close: number }> = [];
          
          for (let i = 30; i >= 0; i--) {
            const time = now - i * 3600; // 1 hour intervals
            const open = 1.0800 + (Math.random() - 0.5) * 0.02;
            const high = open + Math.random() * 0.01;
            const low = open - Math.random() * 0.01;
            const close = low + Math.random() * (high - low);
            
            mockCandles.push({
              time: time as Time,
              open: parseFloat(open.toFixed(5)),
              high: parseFloat(high.toFixed(5)),
              low: parseFloat(low.toFixed(5)),
              close: parseFloat(close.toFixed(5)),
            });
          }
          
          if (seriesRef.current) {
            seriesRef.current.setData(mockCandles);
          }
          if (chartRef.current) {
            chartRef.current.timeScale().fitContent();
          }
          
          console.log('Fallback mock data loaded');
        } catch (fallbackErr) {
          console.error('Fallback data error:', fallbackErr);
        }
      } finally {
        setIsLoading(false);
      }
    };

  }, [selectedSymbol, timeframe]);

  // Handle symbol/timeframe changes
  useEffect(() => {
    if (selectedSymbol && (selectedSymbol !== previousSymbolRef.current || timeframe !== currentTimeframeRef.current)) {
      console.log(`[CHART] Symbol/timeframe changed: ${previousSymbolRef.current}/${currentTimeframeRef.current} -> ${selectedSymbol}/${timeframe}`);
      previousSymbolRef.current = selectedSymbol;
      currentTimeframeRef.current = timeframe;
      fetchCandles();
    }
  }, [selectedSymbol, timeframe, fetchCandles]);

  // Handle backscroll when user scrolls left
  useEffect(() => {
    if (!chartRef.current || !selectedSymbol) return;

    const handleVisibleTimeRangeChange = (timeRange: any) => {
      if (!timeRange || !hasBackscroll || isBackscrollLoading) return;

      // Check if user is near the left edge (backscroll needed)
      const fromTime = timeRange.from;
      if (fromTime && fromTime < Date.now() / 1000 - 86400) { // If looking more than 1 day back
        console.log('[CHART] User scrolled back, loading more data...');
        fetchCandles(fromTime, true);
      }
    };

    const chart = chartRef.current;
    chart.timeScale().subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);

    return () => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    };
  }, [selectedSymbol, hasBackscroll, isBackscrollLoading, fetchCandles]);

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
            <button className="btn-settings" title="Chart settings">
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {!selectedSymbol ? (
        <div className="chart-body chart-empty">
          <div className="chart-placeholder">
            <p>📊 No symbol selected</p>
            <p>Select a symbol from the watchlist to see the chart</p>
          </div>
        </div>
      ) : error ? (
        <div className="chart-body chart-error">
          <div className="chart-placeholder">
            <p>⚠️ Error loading chart</p>
            <p style={{ color: '#ef4444', fontSize: '0.85em', marginTop: '8px' }}>{error}</p>
            <p style={{ color: '#6b7280', fontSize: '0.8em', marginTop: '4px' }}>
              Check browser console for details
            </p>
          </div>
        </div>
      ) : (isLoading || isBackscrollLoading) ? (
        <div className="chart-body chart-loading">
          <div className="chart-placeholder">
            <div className="spinner"></div>
            <p>{isBackscrollLoading ? 'Loading more data...' : 'Loading chart...'}</p>
          </div>
        </div>
      ) : (
        <div className="chart-body">
          <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      )}
    </div>
  );
}
        <div className="chart-body chart-loading">
          <div className="spinner"></div>
          <p>Loading chart...</p>
        </div>
      ) : (
        <div className="chart-body" ref={containerRef} />
      )}
    </div>
  );
}
