/**
 * NewsService — fetches and sentiment-scores financial news via NewsAPI
 */
import axios from 'axios';

// Symbol to search term mapping
const SYMBOL_QUERIES = {
  BTCUSD: 'Bitcoin BTC', ETHUSD: 'Ethereum ETH', SOLUSD: 'Solana SOL',
  XAUUSD: 'Gold XAU', EURUSD: 'EURUSD forex', GBPUSD: 'GBPUSD forex',
  AAPL: 'Apple AAPL stock', MSFT: 'Microsoft MSFT', TSLA: 'Tesla TSLA',
  default: '',
};

const BULLISH_WORDS = ['surge', 'rally', 'gain', 'bull', 'rise', 'breakout', 'high', 'buy', 'positive', 'strong', 'growth', 'profit', 'uptren', 'recover', 'soar'];
const BEARISH_WORDS = ['crash', 'fall', 'drop', 'bear', 'plunge', 'low', 'sell', 'negative', 'weak', 'loss', 'decline', 'downturn', 'risk', 'warning', 'dump'];

function scoreSentiment(text) {
  const lower = text.toLowerCase();
  const bullScore = BULLISH_WORDS.filter((w) => lower.includes(w)).length;
  const bearScore = BEARISH_WORDS.filter((w) => lower.includes(w)).length;
  if (bullScore > bearScore) return 'bullish';
  if (bearScore > bullScore) return 'bearish';
  return 'neutral';
}

export const NewsService = {
  async getNews(symbol, apiKey) {
    const key = apiKey || process.env.NEWS_API_KEY;
    const query = SYMBOL_QUERIES[symbol] || symbol;

    if (!key) return getMockNews(symbol);

    try {
      const res = await axios.get('https://newsapi.org/v2/everything', {
        params: {
          q: query,
          language: 'en',
          sortBy: 'publishedAt',
          pageSize: 20,
          apiKey: key,
        },
      });

      return res.data.articles.map((a) => ({
        id: a.url,
        title: a.title,
        description: a.description || '',
        url: a.url,
        source: a.source.name,
        publishedAt: a.publishedAt,
        sentiment: scoreSentiment(`${a.title} ${a.description || ''}`),
        imageUrl: a.urlToImage,
      }));
    } catch (e) {
      console.error('News fetch error:', e.message);
      return getMockNews(symbol);
    }
  },
};

function getMockNews(symbol) {
  const items = [
    { sentiment: 'bullish', title: `${symbol} breaks key resistance amid strong volume`, description: 'Technical analysts note significant buying pressure as the asset pushes through a critical price level.' },
    { sentiment: 'neutral', title: `${symbol} consolidates ahead of major economic data`, description: 'Markets are cautious as traders await upcoming CPI and employment figures.' },
    { sentiment: 'bearish', title: `${symbol} faces headwinds from macro uncertainty`, description: 'Risk sentiment deteriorates as global central banks signal prolonged higher rates.' },
    { sentiment: 'bullish', title: `Institutional interest in ${symbol} reaches quarterly high`, description: 'On-chain data and fund flows suggest large players accumulating at current levels.' },
    { sentiment: 'neutral', title: `${symbol} technical outlook: mixed signals on daily chart`, description: 'RSI remains in neutral territory while MACD shows fading momentum.' },
    { sentiment: 'bearish', title: `Analysts warn of potential ${symbol} correction`, description: 'Multiple indicators flashing overbought conditions; risk management advised.' },
  ];

  return items.map((item, i) => ({
    id: `mock-${i}`,
    ...item,
    source: 'Market Wire',
    publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
    url: '#',
  }));
}
