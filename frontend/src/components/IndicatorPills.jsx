/**
 * IndicatorPills — shows active indicator values as pills, with add/remove controls
 */
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ALL_INDICATORS } from '../utils/symbols';
import styles from './IndicatorPills.module.css';

export default function IndicatorPills({ indicators }) {
  const { activeIndicators, addIndicator, removeIndicator } = useApp();
  const [showPicker, setShowPicker] = useState(false);

  const available = ALL_INDICATORS.filter((i) => !activeIndicators.includes(i.id));

  return (
    <div className={styles.bar}>
      <div className={styles.pills}>
        {activeIndicators.map((id) => (
          <IndicatorPill
            key={id}
            id={id}
            data={indicators[id]}
            onRemove={() => removeIndicator(id)}
          />
        ))}
      </div>

      {/* Add indicator */}
      <div className={styles.addWrap}>
        <button
          className={styles.addBtn}
          onClick={() => setShowPicker((v) => !v)}
          title="Add indicator"
        >+</button>
        {showPicker && available.length > 0 && (
          <div className={styles.picker}>
            {available.map((ind) => (
              <button
                key={ind.id}
                className={styles.pickerItem}
                onClick={() => { addIndicator(ind.id); setShowPicker(false); }}
              >
                {ind.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function IndicatorPill({ id, data, onRemove }) {
  const display = formatIndicator(id, data);

  return (
    <div className={styles.pill}>
      <span className={styles.pillLabel}>{id}</span>
      <span className={`${styles.pillValue} ${display.colorClass}`}>{display.value}</span>
      <button className={styles.removeBtn} onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}

function formatIndicator(id, data) {
  if (!data) return { value: '—', colorClass: '' };

  switch (id) {
    case 'RSI': {
      const v = data.value;
      const cls = v >= 70 ? styles.colorRed : v <= 30 ? styles.colorGreen : styles.colorNeutral;
      return { value: v?.toFixed(2) ?? '—', colorClass: cls };
    }
    case 'MACD': {
      const v = data.macd;
      return { value: v?.toFixed(4) ?? '—', colorClass: v > 0 ? styles.colorGreen : styles.colorRed };
    }
    case 'BB': {
      return { value: `${data.position?.toFixed(1)}%`, colorClass: styles.colorNeutral };
    }
    case 'ATR': {
      return { value: data.value?.toFixed(4) ?? '—', colorClass: styles.colorAmber };
    }
    case 'STOCH': {
      const v = data.k;
      const cls = v >= 80 ? styles.colorRed : v <= 20 ? styles.colorGreen : styles.colorNeutral;
      return { value: v?.toFixed(2) ?? '—', colorClass: cls };
    }
    case 'WR': {
      const v = data.value;
      const cls = v >= -20 ? styles.colorRed : v <= -80 ? styles.colorGreen : styles.colorNeutral;
      return { value: v?.toFixed(2) ?? '—', colorClass: cls };
    }
    case 'CCI': {
      const v = data.value;
      const cls = v >= 100 ? styles.colorRed : v <= -100 ? styles.colorGreen : styles.colorNeutral;
      return { value: v?.toFixed(2) ?? '—', colorClass: cls };
    }
    default:
      return { value: '—', colorClass: '' };
  }
}
