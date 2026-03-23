/**
 * Technical indicator calculations from OHLCV candle data
 */

/** Simple Moving Average */
export function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Exponential Moving Average */
export function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let result = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

/** RSI (Relative Strength Index) */
export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c) => (c > 0 ? c : 0));
  const losses = changes.map((c) => (c < 0 ? -c : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(2);
}

/** MACD */
export function macd(closes, fast = 12, slow = 26, signal = 9) {
  if (closes.length < slow + signal) return null;
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  if (emaFast === null || emaSlow === null) return null;
  const macdLine = emaFast - emaSlow;

  // Build MACD line history for signal calculation
  const macdHistory = [];
  for (let i = slow - 1; i < closes.length; i++) {
    const f = ema(closes.slice(0, i + 1), fast);
    const s = ema(closes.slice(0, i + 1), slow);
    if (f && s) macdHistory.push(f - s);
  }

  const signalLine = ema(macdHistory, signal);
  const histogram = signalLine ? macdLine - signalLine : null;

  return {
    macd: +macdLine.toFixed(5),
    signal: signalLine ? +signalLine.toFixed(5) : null,
    histogram: histogram ? +histogram.toFixed(5) : null,
    ema12: +emaFast.toFixed(5),
    ema26: +emaSlow.toFixed(5),
  };
}

/** Bollinger Bands */
export function bollingerBands(closes, period = 20, multiplier = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mid, 2), 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + multiplier * std;
  const lower = mid - multiplier * std;
  const last = closes[closes.length - 1];
  const position = ((last - lower) / (upper - lower)) * 100;

  return {
    upper: +upper.toFixed(5),
    mid: +mid.toFixed(5),
    lower: +lower.toFixed(5),
    position: +position.toFixed(1),
    width: +(((upper - lower) / mid) * 100).toFixed(3),
  };
}

/** ATR (Average True Range) */
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trueRanges = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
  });
  return +sma(trueRanges, period).toFixed(5);
}

/** Stochastic Oscillator */
export function stochastic(candles, kPeriod = 14, dPeriod = 3) {
  if (candles.length < kPeriod) return null;
  const slice = candles.slice(-kPeriod);
  const lowest = Math.min(...slice.map((c) => c.low));
  const highest = Math.max(...slice.map((c) => c.high));
  const last = slice[slice.length - 1].close;
  const k = +((last - lowest) / (highest - lowest) * 100).toFixed(2);
  return { k, d: k }; // simplified; full D requires history
}

/** Williams %R */
export function williamsR(candles, period = 14) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const highest = Math.max(...slice.map((c) => c.high));
  const lowest = Math.min(...slice.map((c) => c.low));
  const last = slice[slice.length - 1].close;
  return +((highest - last) / (highest - lowest) * -100).toFixed(2);
}

/** CCI (Commodity Channel Index) */
export function cci(candles, period = 20) {
  if (candles.length < period) return null;
  const slice = candles.slice(-period);
  const typicals = slice.map((c) => (c.high + c.low + c.close) / 3);
  const meanTP = typicals.reduce((a, b) => a + b, 0) / period;
  const meanDev = typicals.reduce((a, b) => a + Math.abs(b - meanTP), 0) / period;
  return +((typicals[typicals.length - 1] - meanTP) / (0.015 * meanDev)).toFixed(2);
}

/** Calculate all active indicators from candle data */
export function calculateAll(candles, indicators) {
  if (!candles?.length) return {};
  const closes = candles.map((c) => c.close);
  const result = {};

  indicators.forEach((ind) => {
    switch (ind) {
      case 'RSI':   result.RSI = { value: rsi(closes), period: 14 }; break;
      case 'MACD':  result.MACD = macd(closes); break;
      case 'BB':    result.BB = bollingerBands(closes); break;
      case 'ATR':   result.ATR = { value: atr(candles), period: 14 }; break;
      case 'STOCH': result.STOCH = stochastic(candles); break;
      case 'WR':    result.WR = { value: williamsR(candles) }; break;
      case 'CCI':   result.CCI = { value: cci(candles) }; break;
      default: break;
    }
  });

  return result;
}
