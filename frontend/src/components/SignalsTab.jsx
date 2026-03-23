/**
 * SignalsTab — shows composite signal and per-indicator signal cards
 */
import { getSignals, getCompositeSignal } from '../utils/signals';
import styles from './SignalsTab.module.css';

export default function SignalsTab({ indicators }) {
  const signals = getSignals(indicators);
  const composite = getCompositeSignal(signals);

  return (
    <div className={styles.container}>
      {/* Composite row — first */}
      <CompositeRow composite={composite} />

      {/* Per-indicator rows */}
      {Object.entries(signals).map(([id, sig]) => (
        <SignalCard key={id} id={id} signal={sig} data={indicators[id]} />
      ))}
    </div>
  );
}

function CompositeRow({ composite }) {
  const cls = composite.signal === 'buy' ? styles.buy
    : composite.signal === 'sell' ? styles.sell : styles.neutral;

  return (
    <div className={`${styles.compositeCard} ${cls}Border`}>
      <div className={styles.compositeLeft}>
        <span className={styles.compositeLabel}>COMPOSITE SIGNAL</span>
        <span className={`${styles.signalBadge} ${cls}`}>
          {composite.signal.toUpperCase()}
        </span>
      </div>
      <div className={styles.compositeRight}>
        <span className={styles.confLabel}>Confidence</span>
        <span className={`${styles.confValue} ${cls}`}>{composite.confidence}%</span>
      </div>
    </div>
  );
}

function SignalCard({ id, signal, data }) {
  const { signal: sig, label, strength } = signal;
  const cls = sig === 'buy' ? styles.buy : sig === 'sell' ? styles.sell : styles.neutral;
  const barPct = Math.round((strength || 0) * 100);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardId}>{id}</span>
        <span className={`${styles.signalBadge} ${cls}`}>{sig.toUpperCase()}</span>
      </div>
      <div className={styles.cardBody}>
        <IndicatorDetail id={id} data={data} />
        {barPct > 0 && (
          <div className={styles.strengthBar}>
            <div className={`${styles.strengthFill} ${cls}Fill`} style={{ width: `${barPct}%` }} />
          </div>
        )}
        <span className={styles.sigLabel}>{label}</span>
      </div>
    </div>
  );
}

function IndicatorDetail({ id, data }) {
  if (!data) return null;

  switch (id) {
    case 'RSI':
      return (
        <div className={styles.detail}>
          <span className={styles.bigVal}>{data.value?.toFixed(2)}</span>
          <div className={styles.rsiBar}>
            <div className={styles.rsiTrack}>
              <div className={styles.rsiFill} style={{ left: `${data.value}%` }} />
            </div>
            <div className={styles.rsiLabels}>
              <span>0</span><span>30</span><span>70</span><span>100</span>
            </div>
          </div>
        </div>
      );
    case 'MACD':
      return (
        <div className={styles.detail}>
          <span className={`${styles.bigVal} ${data.macd > 0 ? styles.textGreen : styles.textRed}`}>
            {data.macd?.toFixed(5)}
          </span>
          <div className={styles.macdSub}>
            <span>EMA12: <b>{data.ema12?.toFixed(3)}</b></span>
            <span>EMA26: <b>{data.ema26?.toFixed(3)}</b></span>
            <span>Signal: <b>{data.signal?.toFixed(5)}</b></span>
          </div>
        </div>
      );
    case 'BB':
      return (
        <div className={styles.detail}>
          <div className={styles.bbBar}>
            <span className={styles.bbEdge}>↓ {data.lower?.toFixed(2)}</span>
            <div className={styles.bbTrack}>
              <div className={styles.bbThumb} style={{ left: `${Math.max(2, Math.min(98, data.position))}%` }}>
                <span className={styles.bbPrice}>{data.position?.toFixed(1)}%</span>
              </div>
            </div>
            <span className={styles.bbEdge}>{data.upper?.toFixed(2)} ↑</span>
          </div>
          <div className={styles.macdSub}>
            <span>Mid: <b>{data.mid?.toFixed(2)}</b></span>
            <span>Width: <b>{data.width?.toFixed(3)}%</b></span>
          </div>
        </div>
      );
    case 'ATR':
      return (
        <div className={styles.detail}>
          <span className={styles.bigVal}>{data.value?.toFixed(4)}</span>
        </div>
      );
    default:
      return (
        <div className={styles.detail}>
          <span className={styles.bigVal}>{data.value?.toFixed(2) ?? data.k?.toFixed(2) ?? '—'}</span>
        </div>
      );
  }
}
