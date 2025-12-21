import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Scene, Chapter, Location, Character, AppSettings } from '../../utils/exportUtils';
import styles from './Modal.module.css';

interface EditSceneModalProps {
  isOpen: boolean;
  editingId: string | null;
  editForm: Partial<Scene>;
  chapters: Chapter[];
  locations: Location[];
  characters: Character[];
  settings: AppSettings;
  onClose: () => void;
  onSave: (closeAfterSave?: boolean) => void;
  onDelete: (id: string) => void;
  onChange: React.Dispatch<React.SetStateAction<Partial<Scene>>>;
  toggleCharacterInScene: (charId: string) => void;
  handleInputChange: (field: keyof Scene, value: any) => void;
  handleTimeButtonPress: (callback: () => void) => void;
  handleTimeButtonRelease: () => void;
  onOpenCharacterMenu: () => void;
}

export function EditSceneModal({
  isOpen,
  editingId,
  editForm,
  chapters,
  locations,
  characters,
  settings,
  onClose,
  onSave,
  onDelete,
  onChange,
  toggleCharacterInScene,
  handleInputChange,
  handleTimeButtonPress,
  handleTimeButtonRelease,
  onOpenCharacterMenu,
}: EditSceneModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('modals.editScene.title')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.editForm}>
          {/* Scene Title */}
          <div className={styles.formGroup}>
            <label>{t('scene.title')}</label>
            <input
              value={editForm.title || ''}
              onChange={e => handleInputChange('title', e.target.value)}
              placeholder={t('scene.placeholder.title')}
            />
          </div>
          <div className={styles.row2Col}>
            {/* Chapter selection */}
            <div className={styles.formGroup}>
              <label>章タイトル</label>
              <select
                value={editForm.chapterId || ''}
                onChange={e => {
                  const newId = e.target.value;
                  const newTitle = chapters.find(c => c.id === newId)?.title || '';
                  onChange({ ...editForm, chapterId: newId, chapter: newTitle });
                }}
              >
                <option value="">-- {t('common.select')} --</option>
                {chapters.map(c => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            {/* Time input */}
            <div className={styles.formGroup}>
              <label>時間</label>
              {settings.timeInputMode === 'datetime' ? (
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                  <input
                    type="date"
                    value={editForm.time ? editForm.time.split('T')[0] : ''}
                    onChange={e => {
                      const currentTime = editForm.time?.includes('T') ? editForm.time.split('T')[1] : '12:00';
                      const newDateTime = e.target.value ? `${e.target.value}T${currentTime}` : '';
                      onChange({ ...editForm, time: newDateTime, timeMode: 'datetime' });
                    }}
                    style={{ flex: 1 }}
                  />
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    gap: '0.25rem',
                    backgroundColor: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.25rem'
                  }}>
                    {/* Hours */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        type="button"
                        onMouseDown={() => {
                          handleTimeButtonPress(() => {
                            onChange(prev => {
                              if (!prev) return prev;
                              const [datePart, timePart] = (prev.time || '').split('T');
                              const [hours, minutes] = (timePart || '12:00').split(':');
                              const newHours = (parseInt(hours) + 1) % 24;
                              const newTime = `${datePart || new Date().toISOString().split('T')[0]}T${String(newHours).padStart(2, '0')}:${minutes}`;
                              return { ...prev, time: newTime, timeMode: 'datetime' };
                            });
                          });
                        }}
                        onMouseUp={handleTimeButtonRelease}
                        onMouseLeave={handleTimeButtonRelease}
                        style={{
                          padding: '2px',
                          fontSize: '0.7rem',
                          backgroundColor: 'var(--bg-hover)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: 'var(--text-main)'
                        }}
                      >▲</button>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: 'var(--text-main)'
                      }}>
                        {editForm.time?.includes('T') ? editForm.time.split('T')[1].split(':')[0] : '12'}
                      </div>
                      <button
                        type="button"
                        onMouseDown={() => {
                          handleTimeButtonPress(() => {
                            onChange(prev => {
                              if (!prev) return prev;
                              const [datePart, timePart] = (prev.time || '').split('T');
                              const [hours, minutes] = (timePart || '12:00').split(':');
                              const newHours = (parseInt(hours) - 1 + 24) % 24;
                              const newTime = `${datePart || new Date().toISOString().split('T')[0]}T${String(newHours).padStart(2, '0')}:${minutes}`;
                              return { ...prev, time: newTime, timeMode: 'datetime' };
                            });
                          });
                        }}
                        onMouseUp={handleTimeButtonRelease}
                        onMouseLeave={handleTimeButtonRelease}
                        style={{
                          padding: '2px',
                          fontSize: '0.7rem',
                          backgroundColor: 'var(--bg-hover)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: 'var(--text-main)'
                        }}
                      >▼</button>
                    </div>
                    {/* Minutes */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        type="button"
                        onMouseDown={() => {
                          handleTimeButtonPress(() => {
                            onChange(prev => {
                              if (!prev) return prev;
                              const [datePart, timePart] = (prev.time || '').split('T');
                              const [hours, minutes] = (timePart || '12:00').split(':');
                              const newMinutes = (parseInt(minutes) + 1) % 60;
                              const newTime = `${datePart || new Date().toISOString().split('T')[0]}T${hours}:${String(newMinutes).padStart(2, '0')}`;
                              return { ...prev, time: newTime, timeMode: 'datetime' };
                            });
                          });
                        }}
                        onMouseUp={handleTimeButtonRelease}
                        onMouseLeave={handleTimeButtonRelease}
                        style={{
                          padding: '2px',
                          fontSize: '0.7rem',
                          backgroundColor: 'var(--bg-hover)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: 'var(--text-main)'
                        }}
                      >▲</button>
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        color: 'var(--text-main)'
                      }}>
                        {editForm.time?.includes('T') ? editForm.time.split('T')[1].split(':')[1] : '00'}
                      </div>
                      <button
                        type="button"
                        onMouseDown={() => {
                          handleTimeButtonPress(() => {
                            onChange(prev => {
                              if (!prev) return prev;
                              const [datePart, timePart] = (prev.time || '').split('T');
                              const [hours, minutes] = (timePart || '12:00').split(':');
                              const newMinutes = (parseInt(minutes) - 1 + 60) % 60;
                              const newTime = `${datePart || new Date().toISOString().split('T')[0]}T${hours}:${String(newMinutes).padStart(2, '0')}`;
                              return { ...prev, time: newTime, timeMode: 'datetime' };
                            });
                          });
                        }}
                        onMouseUp={handleTimeButtonRelease}
                        onMouseLeave={handleTimeButtonRelease}
                        style={{
                          padding: '2px',
                          fontSize: '0.7rem',
                          backgroundColor: 'var(--bg-hover)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '2px',
                          cursor: 'pointer',
                          color: 'var(--text-main)'
                        }}
                      >▼</button>
                    </div>
                  </div>
                </div>
              ) : (
                <input
                  value={editForm.time}
                  onChange={e => handleInputChange('time', e.target.value)}
                />
              )}
            </div>
            {/* Place input */}
            <div className={styles.formGroup}>
              <label>{t('scene.place')}</label>
              {settings.placeInputMode === 'select' ? (
                <select
                  value={editForm.place}
                  onChange={e => handleInputChange('place', e.target.value)}
                >
                  <option value="">-</option>
                  {locations.map(l => (
                    <option key={l.id} value={l.name}>{l.name}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={editForm.place}
                  onChange={e => handleInputChange('place', e.target.value)}
                />
              )}
            </div>
          </div>
          {/* Characters */}
          <div className={styles.formGroup}>
            <label>{t('scene.characters')} <small style={{color: 'var(--text-secondary)'}}>(選択中: {editForm.characterIds?.length || 0})</small></label>
            <div className={styles.characterTags}>
              {characters.map(char => (
                <button
                  key={char.id}
                  className={`${styles.characterTag} ${editForm.characterIds?.includes(char.id) ? styles.active : ''}`}
                  onClick={() => toggleCharacterInScene(char.id)}
                >
                  {char.name}
                </button>
              ))}
              <button className={styles.addTagBtn} onClick={onOpenCharacterMenu}>+</button>
            </div>
          </div>
          {/* Aim */}
          <div className={styles.formGroup}>
            <label>{t('scene.aim')}</label>
            <textarea
              value={editForm.aim}
              onChange={e => handleInputChange('aim', e.target.value)}
              rows={2}
            />
          </div>
          {/* Summary */}
          <div className={styles.formGroup}>
            <label>{t('scene.summary')}</label>
            <textarea
              value={editForm.summary}
              onChange={e => handleInputChange('summary', e.target.value)}
              rows={5}
              placeholder={t('scene.placeholder.summary')}
            />
          </div>
          {/* Note */}
          <div className={styles.formGroup}>
            <label>{t('scene.note')}</label>
            <textarea
              value={editForm.note}
              onChange={e => handleInputChange('note', e.target.value)}
              rows={3}
              className="note-input"
              style={{ fontFamily: 'monospace', opacity: 0.9 }}
              placeholder={t('scene.placeholder.note')}
            />
          </div>
          {/* Actions */}
          <div className={styles.modalActions}>
            <button className="delete-btn" onClick={() => onDelete(editingId!)}>{t('common.delete')}</button>
            <div className={styles.rightActions}>
              <button className="secondary" onClick={() => onSave(false)}>{t('common.save')}</button>
              <button className="primary" onClick={() => onSave(true)}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
