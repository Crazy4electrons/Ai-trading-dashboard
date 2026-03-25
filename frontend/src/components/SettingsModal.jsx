/**
 * SettingsModal — configures News API, LLM provider, and theme
 * MT5 login is now handled by the dedicated LoginScreen component
 */
import { useState } from 'react';
import { useApp } from '../context/AppContext';
import styles from './SettingsModal.module.css';

const SECTIONS = ['api keys', 'llm provider', 'theme'];

export default function SettingsModal() {
  const { settingsOpen, setSettingsOpen, settings, saveSettings } = useApp();
  const [section, setSection] = useState('api keys');
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  if (!settingsOpen) return null;

  const update = (key, val) => setForm((f) => ({ ...f, [key]: val }));

  const handleSave = () => {
    saveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className={styles.overlay} onClick={() => setSettingsOpen(false)}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal header */}
        <div className={styles.header}>
          <span className={styles.title}>⚙ Settings</span>
          <button className={styles.closeBtn} onClick={() => setSettingsOpen(false)}>✕</button>
        </div>

        <div className={styles.body}>
          {/* Sidebar nav */}
          <nav className={styles.nav}>
            {SECTIONS.map((s) => (
              <button
                key={s}
                className={`${styles.navItem} ${section === s ? styles.navActive : ''}`}
                onClick={() => setSection(s)}
              >
                {ICONS[s]}
                <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className={styles.content}>
            {section === 'api keys' && (
              <Section title="API Keys" subtitle="Third-party data sources">
                <Field
                  label="NewsAPI Key"
                  type="password"
                  value={form.newsApiKey}
                  onChange={(v) => update('newsApiKey', v)}
                  placeholder="Get free key at newsapi.org"
                />
                <Note>Free tier: 100 requests/day. Get your key at <a href="https://newsapi.org" target="_blank" rel="noopener noreferrer">newsapi.org</a></Note>
              </Section>
            )}

            {section === 'llm provider' && (
              <Section title="LLM Provider" subtitle="Used for AI analysis">
                <div className={styles.radioGroup}>
                  {['anthropic', 'openai', 'demo'].map((p) => (
                    <label key={p} className={`${styles.radioLabel} ${form.llmProvider === p ? styles.radioActive : ''}`}>
                      <input
                        type="radio"
                        name="llmProvider"
                        value={p}
                        checked={form.llmProvider === p}
                        onChange={() => update('llmProvider', p)}
                      />
                      <span className={styles.radioText}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                        {p === 'demo' && <span className={styles.demoBadge}>No API key needed</span>}
                      </span>
                    </label>
                  ))}
                </div>

                {form.llmProvider === 'anthropic' && (
                  <Field label="Anthropic API Key" type="password" value={form.anthropicKey} onChange={(v) => update('anthropicKey', v)} placeholder="sk-ant-..." />
                )}
                {form.llmProvider === 'openai' && (
                  <Field label="OpenAI API Key" type="password" value={form.openaiKey} onChange={(v) => update('openaiKey', v)} placeholder="sk-..." />
                )}

                <Note>
                  {form.llmProvider === 'demo' && 'Demo mode uses pre-built sample analysis. No API call is made.'}
                  {form.llmProvider === 'anthropic' && 'Uses claude-haiku-4-5 for fast, cost-effective analysis.'}
                  {form.llmProvider === 'openai' && 'Uses gpt-4o-mini for analysis.'}
                </Note>
              </Section>
            )}

            {section === 'theme' && (
              <Section title="Theme & Display" subtitle="Visual preferences">
                <div className={styles.themeGrid}>
                  {['dark', 'darker'].map((t) => (
                    <button
                      key={t}
                      className={`${styles.themeCard} ${form.theme === t ? styles.themeActive : ''}`}
                      onClick={() => update('theme', t)}
                    >
                      <div className={`${styles.themePreview} ${styles[`preview_${t}`]}`} />
                      <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                    </button>
                  ))}
                </div>
                <Note>More themes coming in future updates.</Note>
              </Section>
            )}

            {/* Save button */}
            <div className={styles.saveRow}>
              <button className={`${styles.saveBtn} ${saved ? styles.savedBtn : ''}`} onClick={handleSave}>
                {saved ? '✓ Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {subtitle && <div className={styles.sectionSub}>{subtitle}</div>}
      <div className={styles.sectionBody}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div className={styles.field}>
      <label>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function Note({ children }) {
  return <p className={styles.note}>{children}</p>;
}

const ICONS = {
  account: '⎄',
  'api keys': '⚿',
  'llm provider': '◈',
  theme: '◑',
};
