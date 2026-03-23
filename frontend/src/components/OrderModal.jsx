/**
 * OrderModal — simple buy/sell confirmation dialog
 */
import { useState } from 'react';
import styles from './OrderModal.module.css';

export default function OrderModal({ symbol, type, onConfirm, onClose }) {
  const [volume, setVolume] = useState('0.01');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    const res = await onConfirm(symbol, type, parseFloat(volume));
    setResult(res);
    setSubmitting(false);
    if (!res?.error) setTimeout(onClose, 1500);
  };

  const isBuy = type === 'buy';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={`${styles.typeTag} ${isBuy ? styles.buy : styles.sell}`}>
            {isBuy ? '▲ MARKET BUY' : '▼ MARKET SELL'}
          </span>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <div className={styles.symbolRow}>
            <span className={styles.symbolLabel}>Symbol</span>
            <span className={styles.symbolValue}>{symbol}</span>
          </div>

          <div className={styles.field}>
            <label>Volume (lots)</label>
            <input
              type="number"
              value={volume}
              min="0.01"
              step="0.01"
              onChange={(e) => setVolume(e.target.value)}
            />
          </div>

          {result && (
            <div className={result.error ? styles.err : styles.ok}>
              {result.error ? `✗ ${result.error}` : '✓ Order placed successfully'}
            </div>
          )}

          <button
            className={`${styles.confirmBtn} ${isBuy ? styles.buyBtn : styles.sellBtn}`}
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Placing order…' : `Confirm ${type.toUpperCase()}`}
          </button>

          <p className={styles.note}>
            ⚠ This will place a real market order on your connected MT5 account.
          </p>
        </div>
      </div>
    </div>
  );
}
