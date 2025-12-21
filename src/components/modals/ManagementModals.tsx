import { useTranslation } from 'react-i18next';
import { Character, Location, Chapter } from '../../utils/exportUtils';
import styles from './Modal.module.css';

interface CharacterManagementModalProps {
  isOpen: boolean;
  characters: Character[];
  newCharacterName: string;
  onClose: () => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onNewNameChange: (name: string) => void;
}

export function CharacterManagementModal({
  isOpen,
  characters,
  newCharacterName,
  onClose,
  onUpdate,
  onDelete,
  onAdd,
  onNewNameChange,
}: CharacterManagementModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('modals.character.title')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.editForm}>
          <ul className={styles.modalList}>
            {characters.map(char => (
              <li key={char.id} className={styles.modalListItem}>
                <input 
                  value={char.name}
                  onChange={(e) => onUpdate(char.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <button 
                  type="button" 
                  className="delete-btn" 
                  onClick={() => onDelete(char.id)} 
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              type="text"
              value={newCharacterName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
              placeholder={t('modals.character.placeholder')}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={onAdd}>{t('common.add')}</button>
            <button type="button" className="primary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LocationManagementModalProps {
  isOpen: boolean;
  locations: Location[];
  newLocationName: string;
  onClose: () => void;
  onUpdate: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onNewNameChange: (name: string) => void;
}

export function LocationManagementModal({
  isOpen,
  locations,
  newLocationName,
  onClose,
  onUpdate,
  onDelete,
  onAdd,
  onNewNameChange,
}: LocationManagementModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('modals.location.title')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.editForm}>
          <ul className={styles.modalList}>
            {locations.map(loc => (
              <li key={loc.id} className={styles.modalListItem}>
                <input 
                  value={loc.name}
                  onChange={(e) => onUpdate(loc.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <button 
                  type="button" 
                  className="delete-btn" 
                  onClick={() => onDelete(loc.id)} 
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              type="text"
              value={newLocationName}
              onChange={(e) => onNewNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
              placeholder={t('modals.location.placeholder')}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={onAdd}>{t('common.add')}</button>
            <button type="button" className="primary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChapterManagementModalProps {
  isOpen: boolean;
  chapters: Chapter[];
  newChapterTitle: string;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Chapter>) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  onNewTitleChange: (title: string) => void;
}

export function ChapterManagementModal({
  isOpen,
  chapters,
  newChapterTitle,
  onClose,
  onUpdate,
  onDelete,
  onAdd,
  onNewTitleChange,
}: ChapterManagementModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{t('modals.chapter.title')}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.editForm}>
          <ul className={styles.modalList}>
            {chapters.map(chap => (
              <li key={chap.id} className={styles.modalListItem}>
                <input 
                  type="color"
                  value={chap.color || '#5468ff'}
                  onChange={(e) => onUpdate(chap.id, { color: e.target.value })}
                  style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                />
                <input 
                  value={chap.title}
                  onChange={(e) => onUpdate(chap.id, { title: e.target.value })}
                  onClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <button 
                  type="button" 
                  className="delete-btn" 
                  onClick={() => onDelete(chap.id)} 
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                >
                  {t('common.delete')}
                </button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input 
              type="text"
              value={newChapterTitle}
              onChange={(e) => onNewTitleChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
              placeholder={t('modals.chapter.placeholder')}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={onAdd}>{t('common.add')}</button>
            <button type="button" className="primary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
