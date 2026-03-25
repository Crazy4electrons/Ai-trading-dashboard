/**
 * AIAnalysisTab — runs AI analysis on current market data
 * Supports weekly and 24h timeframes, rendered as formatted markdown
 */
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import styles from './AIAnalysisTab.module.css';

// Detect API URL from environment or build from window location
const getAPIUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const host = window.location.hostname === 'localhost' ? 'localhost:3001' : window.location.host;
    return `${protocol}//${host}/api/ai`;
  }
  return 'http://localhost:3001/api/ai';
};

const API = getAPIUrl();

export default function AIAnalysisTab({ indicators, candles, news }) {
  const { focusedSymbol, settings } = useApp();
  const [subTab, setSubTab] = useState('24h');
  const [analyses, setAnalyses] = useState({ '24h': null, weekly: null });
  const [loading, setLoading] = useState({ '24h': false, weekly: false });
  const [error, setError] = useState(null);

  const runAnalysis = async () => {
    setLoading((l) => ({ ...l, [subTab]: true }));
    setError(null);

    try {
      const token = localStorage.getItem('tm_token');
      const res = await fetch(`${API}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({
          symbol: focusedSymbol,
          timeframe: subTab,
          indicators,
          news: news?.slice(0, 6),
          candles: candles?.slice(-20),
          provider: settings.llmProvider || 'anthropic',
          apiKey: settings.llmProvider === 'openai' ? settings.openaiKey : settings.anthropicKey,
        }),
        signal: AbortSignal.timeout(30000),
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalyses((a) => ({ ...a, [subTab]: data.analysis }));
    } catch (e) {
      console.error('Analysis error:', e);
      setError(e.message);
    } finally {
      setLoading((l) => ({ ...l, [subTab]: false }));
    }
  };

  const analysis = analyses[subTab];
  const isLoading = loading[subTab];

  return (
    <div className={styles.container}>
      {/* Sub-tabs + run button */}
      <div className={styles.toolbar}>
        <div className={styles.subTabs}>
          {['24h', 'weekly'].map((t) => (
            <button
              key={t}
              className={`${styles.subTab} ${subTab === t ? styles.active : ''}`}
              onClick={() => setSubTab(t)}
            >
              {t === '24h' ? '24H' : 'Weekly'}
            </button>
          ))}
        </div>
        <button
          className={`${styles.runBtn} ${isLoading ? styles.running : ''}`}
          onClick={runAnalysis}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className={styles.spinner}>⟳</span>
          ) : '▶ Run AI Analysis'}
        </button>
      </div>

      {/* Provider info */}
      <div className={styles.providerInfo}>
        <span>Provider: <b>{settings.llmProvider || 'demo'}</b></span>
        <span>Symbol: <b>{focusedSymbol}</b></span>
        <span>Timeframe: <b>{subTab}</b></span>
      </div>

      {/* Result */}
      <div className={styles.resultArea}>
        {error && (
          <div className={styles.error}>
            <span>⚠ {error}</span>
          </div>
        )}

        {isLoading && (
          <div className={styles.loadingState}>
            <div className={styles.loadingDots}>
              <span /><span /><span />
            </div>
            <p>Analysing {focusedSymbol} market data...</p>
          </div>
        )}

        {!isLoading && analysis && (
          <div className={styles.analysis}>
            <MarkdownContent content={analysis} />
          </div>
        )}

        {!isLoading && !analysis && !error && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>◎</span>
            <p>Click <b>Run AI Analysis</b> to generate a {subTab} market analysis for {focusedSymbol}.</p>
            <p className={styles.emptyNote}>Uses current indicators, price action, and news sentiment.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Simple markdown-ish renderer without an external dep */
function MarkdownContent({ content }) {
  const lines = content.split('\n');

  return (
    <div className={styles.markdown}>
      {lines.map((line, i) => {
        if (line.startsWith('## ')) return <h2 key={i}>{line.slice(3)}</h2>;
        if (line.startsWith('# '))  return <h1 key={i}>{line.slice(2)}</h1>;
        if (line.startsWith('**') && line.endsWith('**')) {
          return <h3 key={i}>{line.slice(2, -2)}</h3>;
        }
        if (line.startsWith('- ')) return <li key={i}>{inlineFormat(line.slice(2))}</li>;
        if (line.trim() === '')    return <br key={i} />;
        return <p key={i}>{inlineFormat(line)}</p>;
      })}
    </div>
  );
}

function inlineFormat(text) {
  // Bold **text**
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  );
}
