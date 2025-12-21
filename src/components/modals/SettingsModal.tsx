import { useTranslation } from 'react-i18next';
import { AppSettings } from '../../utils/exportUtils';
import { AVAILABLE_PLUGINS } from '../../plugins/registry';
import styles from './Modal.module.css';

interface SettingsModalProps {
  isOpen: boolean;
  settings: AppSettings;
  systemFonts: string[];
  activeTab: 'general' | 'outline' | 'editor' | 'plugins';
  onClose: () => void;
  onSettingsChange: (settings: AppSettings) => void;
  onTabChange: (tab: 'general' | 'outline' | 'editor' | 'plugins') => void;
}

export function SettingsModal({
  isOpen,
  settings,
  systemFonts,
  activeTab,
  onClose,
  onSettingsChange,
  onTabChange,
}: SettingsModalProps) {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language as 'ja' | 'en';

  if (!isOpen) return null;

  const isPluginEnabled = (pluginId: string) => {
    return settings.enabledPlugins?.includes(pluginId) ?? false;
  };

  const togglePlugin = (pluginId: string) => {
    const currentPlugins = settings.enabledPlugins || [];
    let newPlugins: string[];
    
    if (currentPlugins.includes(pluginId)) {
      newPlugins = currentPlugins.filter(id => id !== pluginId);
    } else {
      newPlugins = [...currentPlugins, pluginId];
    }
    
    onSettingsChange({ 
      ...settings, 
      enabledPlugins: newPlugins,
      ...(pluginId === 'vertical-writing' && !newPlugins.includes(pluginId) ? { verticalWriting: false } : {}),
      ...(pluginId === 'texture-background' && !newPlugins.includes(pluginId) ? { useTextureBackground: false } : {})
    });
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('modals.settings.title')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        
        <div className={styles.tabContainer}>
          {[
            { id: 'general', label: t('settings.tabs.general') },
            { id: 'outline', label: t('settings.tabs.outline') },
            { id: 'editor', label: t('settings.tabs.editor') },
            { id: 'plugins', label: t('settings.tabs.plugins') }
          ].map(tab => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
              onClick={() => onTabChange(tab.id as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.editForm} style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {activeTab === 'general' && (
            <div className="settings-section">
              <div className={styles.formGroup}>
                <label>{t('settings.language')}</label>
                <select 
                  value={settings.language || 'ja'}
                  onChange={(e) => {
                    const lang = e.target.value as 'en' | 'ja';
                    onSettingsChange({ 
                      ...settings, 
                      language: lang,
                      verticalWriting: lang === 'en' ? false : settings.verticalWriting
                    });
                  }}
                >
                  <option value="ja">日本語 (Japanese)</option>
                  <option value="en">English</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>{t('settings.theme.label')}</label>
                <select 
                  value={settings.theme}
                  onChange={(e) => onSettingsChange({ ...settings, theme: e.target.value as 'system' | 'light' | 'dark' })}
                >
                  <option value="system">{t('settings.theme.system')}</option>
                  <option value="light">{t('settings.theme.light')}</option>
                  <option value="dark">{t('settings.theme.dark')}</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label>{t('settings.autoSave.label')}</label>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={settings.autoSave}
                      onChange={(e) => onSettingsChange({ ...settings, autoSave: e.target.checked })}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  {t('settings.autoSave.description')}
                </small>
              </div>

              {isPluginEnabled('texture-background') && (
                <div className={styles.formGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>{t('settings.textureBackground.label')}</label>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox" 
                        checked={settings.useTextureBackground}
                        onChange={(e) => onSettingsChange({ ...settings, useTextureBackground: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    {t('settings.textureBackground.description')}
                  </small>
                </div>
              )}
            </div>
          )}

          {activeTab === 'outline' && (
            <>
              <div className={styles.formGroup}>
                <label>{t('settings.timeInput.label')}</label>
                <select 
                  value={settings.timeInputMode}
                  onChange={(e) => onSettingsChange({ ...settings, timeInputMode: e.target.value as 'text' | 'datetime' })}
                >
                  <option value="text">{t('settings.timeInput.text')}</option>
                  <option value="datetime">{t('settings.timeInput.datetime')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  {t('settings.timeInput.description')}
                </small>
              </div>
              <div className={styles.formGroup}>
                <label>{t('settings.placeInput.label')}</label>
                <select 
                  value={settings.placeInputMode}
                  onChange={(e) => onSettingsChange({ ...settings, placeInputMode: e.target.value as 'text' | 'select' })}
                >
                  <option value="text">{t('settings.placeInput.text')}</option>
                  <option value="select">{t('settings.placeInput.select')}</option>
                </select>
                <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  {t('settings.placeInput.description')}
                </small>
              </div>
            </>
          )}

          {activeTab === 'editor' && (
            <>
              <div className={styles.formGroup}>
                <label>{t('settings.editor.font')}</label>
                <select 
                  value={settings.editorFontFamily || 'sans-serif'}
                  onChange={(e) => onSettingsChange({ ...settings, editorFontFamily: e.target.value })}
                >
                  <option value="sans-serif">{t('settings.editor.gothic')}</option>
                  <option value="serif">{t('settings.editor.mincho')}</option>
                  {isPluginEnabled('vertical-writing') && (
                    <option value='"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "MS PMincho", "MS Mincho", serif'>游明朝 ({t('settings.editor.verticalWriting')})</option>
                  )}
                  <option value="monospace">{t('settings.editor.monospace')}</option>
                  {systemFonts.length > 0 && (
                    <>
                      <option disabled>──────────</option>
                      {systemFonts.map(font => (
                        <option key={font} value={`"${font}"`}>{font}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>{t('settings.editor.fontSize')}</label>
                <input 
                  type="number" 
                  min="10" 
                  max="72"
                  value={settings.editorFontSize || 16}
                  onChange={(e) => onSettingsChange({ ...settings, editorFontSize: parseInt(e.target.value) || 16 })}
                />
              </div>
              {isPluginEnabled('vertical-writing') && settings.language !== 'en' && (
                <div className={styles.formGroup}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label>{t('settings.editor.verticalWriting')}</label>
                    <label className="toggle-switch">
                      <input 
                        type="checkbox"
                        checked={settings.verticalWriting || false}
                        onChange={(e) => onSettingsChange({ ...settings, verticalWriting: e.target.checked })}
                      />
                      <span className="slider round"></span>
                    </label>
                  </div>
                  <small style={{ color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    {t('settings.editor.verticalWritingDesc')}
                  </small>
                </div>
              )}
            </>
          )}

          {activeTab === 'plugins' && (
            <div className="plugins-section">
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                {settings.language === 'ja' ? '特定の地域や用途向けの機能を有効化できます。' : 'Enable features for specific regions or use cases.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {AVAILABLE_PLUGINS.map(plugin => (
                  <div key={plugin.id} className={styles.pluginCard}>
                    <div className={styles.pluginHeader}>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>{plugin.name[currentLang] || plugin.name['en']}</h3>
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={isPluginEnabled(plugin.id)}
                          onChange={() => togglePlugin(plugin.id)}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      {plugin.description[currentLang] || plugin.description['en']}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className={styles.modalActions} style={{ margin: 0, paddingBottom: '1.5rem' }}>
          <div /> {/* Spacer */}
          <button className="primary" onClick={onClose} style={{ marginRight: '1.5rem' }}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}

interface AboutModalProps {
  isOpen: boolean;
  appVersion: string;
  onClose: () => void;
}

export function AboutModal({ isOpen, appVersion, onClose }: AboutModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} style={{ maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '2rem 1rem 1rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>HakoGraph</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Version {appVersion}</p>
          
          <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            {t('modals.about.description').split('\n').map((line, i) => (
              <span key={i}>{line}<br/></span>
            ))}
          </p>
          
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            &copy; 2025 Gennosuke Satsuki
          </p>
        </div>
        <div className={styles.modalActions} style={{ justifyContent: 'center', borderTop: 'none' }}>
          <button className="primary" onClick={onClose} style={{ minWidth: '120px', marginBottom: '1.5rem' }}>{t('common.close')}</button>
        </div>
      </div>
    </div>
  );
}
