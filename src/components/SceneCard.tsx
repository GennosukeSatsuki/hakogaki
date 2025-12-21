import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, Chapter, AppSettings } from '../utils/exportUtils';
import styles from './SceneCard.module.css';

interface SortableSceneCardProps {
  scene: Scene;
  chapterList: Chapter[];
  onClick: (scene: Scene) => void;
  onEdit: (sceneId: string) => void;
  settings: AppSettings;
}

export function SortableSceneCard({ 
  scene, 
  chapterList, 
  onClick, 
  onEdit, 
  settings
}: SortableSceneCardProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const chapterColor = scene.chapterId 
    ? (chapterList.find(c => c.id === scene.chapterId)?.color || 'var(--primary)') 
    : 'var(--primary)';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${styles.sceneCard} ${settings.useTextureBackground ? styles.textured : ''}`}
      onClick={() => onClick(scene)}
    >
      <div className={styles.cardHeader}>
        <div className={styles.dragHandle} {...attributes} {...listeners}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 1 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>
        <button 
          className={styles.editBtn} 
          onClick={(e) => { e.stopPropagation(); onEdit(scene.id); }}
          title={t('actions.openEditor')}
        >
          📝
        </button>
      </div>

      <div className={styles.cardTitle}>
        <span className={styles.chapterMark} style={{ color: chapterColor }}>■</span>
        {scene.title || t('scene.noTitle')}
      </div>

      <div className={styles.cardRow}>
        <span className={`${styles.value} ${styles.strong}`}>
          {scene.chapterId ? chapterList.find(c => c.id === scene.chapterId)?.title : (scene.chapter || '-')}
        </span>
      </div>

      <div className={styles.cardRow}>
        <span className={styles.value}>
          {scene.summary ? (scene.summary.length > 80 ? scene.summary.substring(0, 80) + '...' : scene.summary) : t('scene.noSummary')}
        </span>
      </div>

      {scene.isCompleted && (
        <div className={styles.completedStamp}>
          {t('common.completed')}
        </div>
      )}
    </div>
  );
}

export function SceneCardOverlay({ 
  scene, 
  chapterList, 
  settings 
}: { 
  scene: Scene; 
  chapterList: Chapter[]; 
  settings: AppSettings;
}) {
  return (
    <SortableSceneCard 
      scene={scene} 
      chapterList={chapterList}
      settings={settings}
      onClick={() => {}} 
      onEdit={() => {}}
    />
  );
}
