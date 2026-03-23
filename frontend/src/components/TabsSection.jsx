/**
 * TabsSection — Signals / News / AI Analysis tab container
 */
import { useState } from 'react';
import SignalsTab from './SignalsTab';
import NewsTab from './NewsTab';
import AIAnalysisTab from './AIAnalysisTab';
import styles from './TabsSection.module.css';

const TABS = ['signals', 'news', 'ai analysis'];

export default function TabsSection({ indicators, candles, news }) {
  const [activeTab, setActiveTab] = useState('signals');

  return (
    <div className={styles.section}>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${styles.tabBtn} ${activeTab === tab ? styles.active : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {activeTab === 'signals' && <SignalsTab indicators={indicators} />}
        {activeTab === 'news' && <NewsTab />}
        {activeTab === 'ai analysis' && (
          <AIAnalysisTab indicators={indicators} candles={candles} news={news} />
        )}
      </div>
    </div>
  );
}
