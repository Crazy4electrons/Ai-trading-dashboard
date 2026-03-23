/**
 * AIService — generates trading analysis using OpenAI or Anthropic
 */
import axios from 'axios';

export const AIService = {
  async analyze({ symbol, timeframe, indicators, news, candles, provider, apiKey }) {
    const prompt = buildPrompt(symbol, timeframe, indicators, news, candles);

    if (provider === 'openai') {
      return callOpenAI(prompt, apiKey || process.env.OPENAI_API_KEY);
    } else if (provider === 'anthropic') {
      return callAnthropic(prompt, apiKey || process.env.ANTHROPIC_API_KEY);
    }
    return getMockAnalysis(symbol, timeframe);
  },
};

function buildPrompt(symbol, timeframe, indicators, news, candles) {
  const lastCandles = candles?.slice(-5) || [];
  const newsSummary = news?.slice(0, 5).map((n) => `[${n.sentiment}] ${n.title}`).join('\n') || 'No news data';
  const indSummary = Object.entries(indicators || {}).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n');

  return `You are an expert technical analyst. Provide a concise trading analysis for ${symbol} (${timeframe} timeframe).

TECHNICAL INDICATORS:
${indSummary}

RECENT CANDLES (last 5):
${lastCandles.map((c) => `O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join('\n')}

RECENT NEWS:
${newsSummary}

Provide:
1. Overall bias (Bullish/Bearish/Neutral) with confidence %
2. Key support and resistance levels
3. Entry, stop-loss, and take-profit suggestions
4. Risk factors to watch
5. Summary in 2-3 sentences

Be concise and actionable. Format with clear sections.`;
}

async function callOpenAI(prompt, apiKey) {
  if (!apiKey) return getMockAnalysis();
  try {
    const res = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    }, { headers: { Authorization: `Bearer ${apiKey}` } });
    return { analysis: res.data.choices[0].message.content, provider: 'openai' };
  } catch (e) {
    return { error: e.message };
  }
}

async function callAnthropic(prompt, apiKey) {
  if (!apiKey) return getMockAnalysis();
  try {
    const res = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    return { analysis: res.data.content[0].text, provider: 'anthropic' };
  } catch (e) {
    return { error: e.message };
  }
}

function getMockAnalysis(symbol = 'Asset', timeframe = '24h') {
  return {
    analysis: `## ${symbol} Analysis — ${timeframe}

**Overall Bias: Neutral** | Confidence: 62%

**Key Levels**
- Resistance: 68,450 / 70,200
- Support: 64,800 / 62,500

**Trade Setup**
- Entry: Wait for breakout above 68,450 with volume confirmation
- Stop Loss: Below 64,800 (2.5% risk)
- Take Profit: 72,500 (target 1) / 76,000 (target 2)
- Risk/Reward: 1:2.4

**Risk Factors**
- Macro uncertainty from upcoming Fed meeting
- MACD showing bearish divergence on 4H
- Low volume consolidation — breakout may be false

**Summary**
Price is consolidating in a tight range after a recent pullback. RSI near neutral suggests no immediate momentum. Wait for a decisive break with volume before committing to a direction. Manage risk tightly given macro headwinds.`,
    provider: 'demo',
  };
}
