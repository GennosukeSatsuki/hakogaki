import { useTranslation } from 'react-i18next';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Scene, Chapter, AppSettings } from '../utils/exportUtils';

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`scene-card ${settings.useTextureBackground ? 'textured' : ''}`}
      onClick={() => onClick(scene)}
    >
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="drag-handle" {...attributes} {...listeners}>
          <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">
            <path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" />
          </svg>
        </div>
        <button 
          className="edit-btn" 
          onClick={(e) => { e.stopPropagation(); onEdit(scene.id); }}
          title={t('actions.openEditor')}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px' }}
        >
          📝
        </button>
      </div>

      <div className="card-title" style={{ fontWeight: 'bold', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ 
          color: scene.chapterId ? (chapterList.find(c => c.id === scene.chapterId)?.color || 'var(--primary)') : 'var(--primary)',
          fontSize: '1.2em'
        }}>■</span>
        {scene.title || t('scene.noTitle')}
      </div>

      <div className="card-row">
        <span className="value strong" style={{ fontSize: '0.95em' }}>
          {scene.chapterId ? chapterList.find(c => c.id === scene.chapterId)?.title : (scene.chapter || '-')}
        </span>
      </div>

      <div className="card-row">
        <span className="value" style={{ fontSize: '0.9em', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          {scene.summary ? (scene.summary.length > 80 ? scene.summary.substring(0, 80) + '...' : scene.summary) : t('scene.noSummary')}
        </span>
      </div>

      {scene.isCompleted && (
        <div className="completed-stamp">
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
