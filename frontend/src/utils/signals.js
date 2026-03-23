/**
 * Signal generation — converts indicator values to buy/sell/neutral signals
 */

export function getRSISignal(value) {
  if (value === null) return { signal: 'neutral', label: 'No data', strength: 0 };
  if (value >= 70) return { signal: 'sell', label: 'Overbought', strength: (value - 70) / 30 };
  if (value <= 30) return { signal: 'buy', label: 'Oversold', strength: (30 - value) / 30 };
  if (value > 55) return { signal: 'buy', label: 'Bullish zone', strength: (value - 50) / 20 };
  if (value < 45) return { signal: 'sell', label: 'Bearish zone', strength: (50 - value) / 20 };
  return { signal: 'neutral', label: 'Neutral zone', strength: 0 };
}

export function getMACDSignal(data) {
  if (!data?.macd) return { signal: 'neutral', label: 'No data', strength: 0 };
  const { macd: m, signal: s, histogram: h } = data;
  if (m > s && h > 0) return { signal: 'buy', label: 'Bullish momentum', strength: Math.min(Math.abs(h) / Math.abs(m) * 2, 1) };
  if (m < s && h < 0) return { signal: 'sell', label: 'Bearish momentum', strength: Math.min(Math.abs(h) / Math.abs(m) * 2, 1) };
  if (m > 0)  return { signal: 'buy', label: 'Above zero line', strength: 0.3 };
  if (m < 0)  return { signal: 'sell', label: 'Below zero line', strength: 0.3 };
  return { signal: 'neutral', label: 'Crossing', strength: 0 };
}

export function getBBSignal(data) {
  if (!data) return { signal: 'neutral', label: 'No data', strength: 0 };
  const pos = data.position;
  if (pos > 90) return { signal: 'sell', label: 'Near upper band', strength: (pos - 80) / 20 };
  if (pos < 10) return { signal: 'buy', label: 'Near lower band', strength: (20 - pos) / 20 };
  if (pos > 50) return { signal: 'buy', label: 'Mid-range — trend continuation', strength: 0.2 };
  return { signal: 'sell', label: 'Mid-range — trend continuation', strength: 0.2 };
}

export function getATRSignal(value) {
  // ATR is a volatility measure — no direct directional signal
  return { signal: 'neutral', label: 'Volatility measure', strength: 0 };
}

export function getStochSignal(data) {
  if (!data) return { signal: 'neutral', label: 'No data', strength: 0 };
  const k = data.k;
  if (k >= 80) return { signal: 'sell', label: 'Overbought', strength: (k - 80) / 20 };
  if (k <= 20) return { signal: 'buy', label: 'Oversold', strength: (20 - k) / 20 };
  return { signal: 'neutral', label: 'Neutral', strength: 0 };
}

export function getWRSignal(value) {
  if (value === null) return { signal: 'neutral', label: 'No data', strength: 0 };
  if (value >= -20) return { signal: 'sell', label: 'Overbought', strength: (value + 20) / 20 };
  if (value <= -80) return { signal: 'buy', label: 'Oversold', strength: (-80 - value) / 20 };
  return { signal: 'neutral', label: 'Neutral', strength: 0 };
}

export function getCCISignal(value) {
  if (value === null) return { signal: 'neutral', label: 'No data', strength: 0 };
  if (value >= 100) return { signal: 'sell', label: 'Overbought', strength: Math.min((value - 100) / 100, 1) };
  if (value <= -100) return { signal: 'buy', label: 'Oversold', strength: Math.min((-100 - value) / 100, 1) };
  return { signal: 'neutral', label: 'Neutral', strength: 0 };
}

/** Map indicator names to their signal functions */
const SIGNAL_FNS = {
  RSI:   (d) => getRSISignal(d?.value),
  MACD:  getMACDSignal,
  BB:    getBBSignal,
  ATR:   (d) => getATRSignal(d?.value),
  STOCH: getStochSignal,
  WR:    (d) => getWRSignal(d?.value),
  CCI:   (d) => getCCISignal(d?.value),
};

/** Compute per-indicator signals */
export function getSignals(indicators) {
  const signals = {};
  for (const [key, data] of Object.entries(indicators)) {
    const fn = SIGNAL_FNS[key];
    if (fn) signals[key] = { ...fn(data), data };
  }
  return signals;
}

/** Composite signal from all indicators */
export function getCompositeSignal(signals) {
  const entries = Object.values(signals);
  if (!entries.length) return { signal: 'neutral', confidence: 0 };

  let buyScore = 0, sellScore = 0, total = 0;
  entries.forEach(({ signal, strength }) => {
    const w = 0.5 + (strength || 0) * 0.5;
    if (signal === 'buy')  { buyScore  += w; total += w; }
    if (signal === 'sell') { sellScore += w; total += w; }
    if (signal === 'neutral') total += 0.3;
  });

  if (total === 0) return { signal: 'neutral', confidence: 0 };

  const buyRatio  = buyScore / total;
  const sellRatio = sellScore / total;

  if (buyRatio > 0.5)  return { signal: 'buy',  confidence: Math.round(buyRatio * 100) };
  if (sellRatio > 0.5) return { signal: 'sell', confidence: Math.round(sellRatio * 100) };
  return { signal: 'neutral', confidence: Math.round((1 - Math.abs(buyRatio - sellRatio)) * 60) };
}
