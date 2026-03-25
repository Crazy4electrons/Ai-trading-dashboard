/**
 * NewsTab — displays symbol news with sentiment indicators and a summary bar
 */
import { useEffect } from 'react';
import { useNews } from '../hooks/useNews';
import { useApp } from '../context/AppContext';
import styles from './NewsTab.module.css';

export default function NewsTab() {
  const { focusedSymbol, settings } = useApp();
  const { news, loading, error, fetchNews } = useNews(focusedSymbol, settings.newsApiKey);

  useEffect(() => { fetchNews(); }, [focusedSymbol, settings.newsApiKey, fetchNews]);

  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  news.forEach((n) => counts[n.sentiment]++);
  const total = news.length || 1;
  const pcts = {
    bullish: Math.round((counts.bullish / total) * 100),
    bearish: Math.round((counts.bearish / total) * 100),
    neutral: Math.round((counts.neutral / total) * 100),
  };

  return (
    <div className={styles.container}>
      {/* Sentiment bar */}
      <div className={styles.sentBar}>
        <div className={styles.sentLabels}>
          <span className={styles.bull}>● Bullish {pcts.bullish}%</span>
          <span className={styles.neutral}>● Neutral {pcts.neutral}%</span>
          <span className={styles.bear}>● Bearish {pcts.bearish}%</span>
          <button
            className={styles.refreshBtn}
            onClick={fetchNews}
            disabled={loading}
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
        </div>
        <div className={styles.sentBarTrack}>
          <div className={styles.sentBull} style={{ width: `${pcts.bullish}%` }} />
          <div className={styles.sentNeutral} style={{ width: `${pcts.neutral}%` }} />
          <div className={styles.sentBear} style={{ width: `${pcts.bearish}%` }} />
        </div>
      </div>

      {/* News list */}
      {error && !news.length ? (
        <div className={styles.loader} style={{ color: 'var(--accent-red)' }}>
          ⚠ {error}
        </div>
      ) : loading && !news.length ? (
        <div className={styles.loader}>Loading news...</div>
      ) : news.length === 0 ? (
        <div className={styles.loader}>No news available for {focusedSymbol}</div>
      ) : (
        <div className={styles.list}>
          {news.map((item) => (
            <NewsItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function NewsItem({ item }) {
  const sentClass = item.sentiment === 'bullish' ? styles.bull
    : item.sentiment === 'bearish' ? styles.bear : styles.neutral;
  const sentLabel = item.sentiment === 'bullish' ? '▲ Bullish'
    : item.sentiment === 'bearish' ? '▼ Bearish' : '● Neutral';
  const sentBadge = item.sentiment === 'bullish' ? styles.bullBadge
    : item.sentiment === 'bearish' ? styles.bearBadge : styles.neutralBadge;

  const timeAgo = formatTimeAgo(item.publishedAt);

  return (
    <a
      href={item.url === '#' ? undefined : item.url}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.item}
    >
      <div className={styles.itemHeader}>
        <span className={`${styles.sentBadge} ${sentBadge}`}>{sentLabel}</span>
        <span className={styles.source}>{item.source}</span>
        <span className={styles.time}>{timeAgo}</span>
      </div>
      <p className={styles.title}>{item.title}</p>
      {item.description && (
        <p className={styles.desc}>{item.description.slice(0, 120)}{item.description.length > 120 ? '…' : ''}</p>
      )}
    </a>
  );
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
