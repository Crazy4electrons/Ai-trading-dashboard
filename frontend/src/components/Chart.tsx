import { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import { useStore } from '../store/useStore';
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

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    // Create chart
    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0f0f0f' },
        textColor: '#d1d5db',
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
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

    // Fit content and handle resize
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

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Fetch real candles data from API
  useEffect(() => {
    if (!selectedSymbol || !seriesRef.current || !chartRef.current) {
      return;
    }

    const fetchCandles = async () => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(`[CHART] Fetching candles for symbol: ${selectedSymbol}, timeframe: ${timeframe}`);
        
        // Get token from localStorage
        const token = localStorage.getItem('access_token');
        const tokenParam = token ? `&token=${token}` : '';
        console.log(`[CHART] Token available: ${!!token}`);
        
        const url = `http://localhost:8000/api/candles/${selectedSymbol}?timeframe=${timeframe}&count=100${tokenParam}`;
        console.log(`[CHART] Request URL: ${url}`);
        console.log(`[CHART] Making fetch request...`);
        
        // Call backend API to get real MT5 candle data
        const response = await fetch(url);
        console.log(`[CHART] Response status: ${response.status} (${response.statusText})`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[CHART] HTTP Error: ${response.status}`, errorData);
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
        if (!candles || candles.length === 0) {
          console.error(`[CHART] No candles in response`);
          throw new Error('No candle data received from MT5');
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

    fetchCandles();
  }, [selectedSymbol, timeframe]);

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
          </div>
        </div>
      ) : isLoading ? (
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
