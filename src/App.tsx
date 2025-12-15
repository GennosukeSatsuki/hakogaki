import { useState } from 'react';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { save, open } from '@tauri-apps/plugin-dialog';

import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';

import './App.css';

// Type definition for a Scene
// Scene No removed from type as it is derived from order
interface Scene {
  id: string;
  title: string; // シーンタイトル
  chapter: string; // 章タイトル
  characters: string; // 登場人物
  time: string; // 時間
  place: string; // 場所
  aim: string; // 狙いと役割
  summary: string; // 詳細なあらすじ
  note: string; // 裏設定
}

const INITIAL_SCENE: Scene = {
  id: '1',
  title: '物語の始まり',
  chapter: '第1章',
  characters: '主人公, ヒロイン',
  time: '夕方',
  place: '通学路',
  aim: '主人公の日常と、非日常への入り口を描写する',
  summary: '主人公は学校からの帰り道、不思議な光を目撃する。好奇心から近づくと、そこで倒れているヒロインを発見する。',
  note: '実はこの時すでに敵組織に見つかっている',
};

// Sortable Scene Card Component
interface SortableSceneCardProps {
  scene: Scene;
  onClick: (scene: Scene) => void;
  isHiddenFull?: boolean; // For DragOverlay
}

function SortableSceneCard({ scene, onClick, isHiddenFull }: SortableSceneCardProps) {
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
    cursor: 'grab',
  };

  // If used in DragOverlay, we want full opacity and 'grabbing' cursor
  if (isHiddenFull) {
    // This prop means we are just rendering for overlay, logic handled by parent mostly
    // But actually, DragOverlay renders a clone.
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="scene-card"
      onClick={() => onClick(scene)}
    >
      <div className="card-header">
        {/* シーンNOは非表示にするため削除 */}
        <span className="scene-title">{scene.title || '(無題)'}</span>
      </div>
      
      {scene.chapter && (
        <div className="card-row">
          <span className="label">章</span>
          <span className="value strong">{scene.chapter}</span>
        </div>
      )}
      
      <div className="card-row">
        <span className="label">登場人物</span>
        <span className="value">{scene.characters || '-'}</span>
      </div>

      {(scene.time || scene.place) && (
        <div className="card-row">
           <span className="label">場所・時</span>
           <span className="value">{(scene.place || '-') + ' / ' + (scene.time || '-')}</span>
        </div>
      )}

      <div className="card-row">
        <span className="label">狙い</span>
        <span className="value">{scene.aim || '-'}</span>
      </div>

      <div className="card-row">
        <span className="label">あらすじ</span>
        <span className="value">{scene.summary ? (scene.summary.length > 50 ? scene.summary.substring(0, 50) + '...' : scene.summary) : '-'}</span>
      </div>
    </div>
  );
}

// Plain component for DragOverlay
function SceneCardOverlay({ scene }: { scene: Scene }) {
  return (
    <div className="scene-card" style={{ cursor: 'grabbing', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
       <div className="card-header">
        <span className="scene-title">{scene.title || '(無題)'}</span>
      </div>
      {scene.chapter && (
        <div className="card-row">
          <span className="label">章</span>
          <span className="value strong">{scene.chapter}</span>
        </div>
      )}
      <div className="card-row">
        <span className="label">登場人物</span>
        <span className="value">{scene.characters || '-'}</span>
      </div>
      {(scene.time || scene.place) && (
        <div className="card-row">
           <span className="label">場所・時</span>
           <span className="value">{(scene.place || '-') + ' / ' + (scene.time || '-')}</span>
        </div>
      )}
    </div>
  );
}


function App() {
  const [scenes, setScenes] = useState<Scene[]>([INITIAL_SCENE]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Scene | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Avoid triggering drag on simple clicks
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setScenes((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      title: '',
      chapter: '',
      characters: '',
      time: '',
      place: '',
      aim: '',
      summary: '',
      note: '',
    };
    setScenes([...scenes, newScene]);
    startEditing(newScene);
  };

  const startEditing = (scene: Scene) => {
    setEditingId(scene.id);
    setEditForm({ ...scene });
  };

  const saveScene = () => {
    if (!editForm) return;
    setScenes(scenes.map(s => s.id === editForm.id ? editForm : s));
    setEditingId(null);
    setEditForm(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const deleteScene = (id: string) => {
    if (confirm('本当に削除しますか？')) {
      setScenes(scenes.filter(s => s.id !== id));
      if (editingId === id) cancelEdit();
    }
  };

  const handleInputChange = (field: keyof Scene, value: string) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value });
    }
  };

  const handleSaveFile = async () => {
    setIsFileMenuOpen(false);
    try {
      const path = await save({
        filters: [{
          name: 'Hakogaki File',
          extensions: ['hako']
        }]
      });
      
      if (path) {
        await writeTextFile(path, JSON.stringify(scenes, null, 2));
        alert('保存しました');
      }
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました: ' + e);
    }
  };

  const handleLoadFile = async () => {
    setIsFileMenuOpen(false);
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Hakogaki File',
          extensions: ['hako', 'json'] // Allow reading both for compatibility
        }]
      });
      
      if (file) {
        // file is string if multiple is false
        const content = await readTextFile(file);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          setScenes(parsed);
          alert('読み込みました');
        } else {
          alert('ファイル形式が正しくありません');
        }
      }
    } catch (e) {
      console.error(e);
      alert('読み込みに失敗しました: ' + e);
    }
  };

  const handleDeploy = async () => {
    setIsFileMenuOpen(false);
    try {
      // 1. Select Output Directory
      const baseDir = await open({
        directory: true,
        multiple: false,
      });

      if (!baseDir) return;

      // Simple separator detection (not perfect but works for most cases provided by dialog)
      const isWindows = typeof baseDir === 'string' && baseDir.includes('\\');
      const sep = isWindows ? '\\' : '/';

      let chapterCount = 0;
      let lastChapterTitle = '';

      // We need to keep track of folder paths to avoid recreating existing ones in loop if contiguous
      // But requirement says: "Chapter name changes -> count up".
      // If chapter name is same as previous, we use the same folder.

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        // Check if chapter changed
        if (scene.chapter !== lastChapterTitle || i === 0) {
          chapterCount++;
          lastChapterTitle = scene.chapter;
        }

        // Create Chapter Folder Name: XX_ChapterName
        const numStr = chapterCount.toString().padStart(2, '0');
        // Sanitize folder name slightly to avoid illegal chars if possible, 
        // though user might want exact match. Just a precaution for invalid chars could be complex,
        // trusting user input for now or minimal replacement.
        const safeChapterTitle = scene.chapter.trim() || '無題の章';
        const folderName = `${numStr}_${safeChapterTitle}`;
        const folderPath = `${baseDir}${sep}${folderName}`;

        // Create Directory
        // ensure recursive false to error if we really messed up? 
        // Actually recursive: true is safer if it already exists it just succeeds.
        await mkdir(folderPath, { recursive: true });

        // Create File Name: (SceneNum)_(SceneName).txt
        // Scene number is current index + 1
        const sceneNum = (i + 1).toString().padStart(3, '0');
        const safeTitle = scene.title.trim() || '無題のシーン';
        const fileName = `${sceneNum}_${safeTitle}.txt`;
        const filePath = `${folderPath}${sep}${fileName}`;

        // Create Content
        const content = `**場所** ${scene.place}
**時間** ${scene.time}

**登場人物** ${scene.characters}

**狙いと役割** ${scene.aim}

**詳細なあらすじ** ${scene.summary}

**裏設定** ${scene.note}
`;

        await writeTextFile(filePath, content);
      }

      alert('書き出しが完了しました');

    } catch (e) {
      console.error(e);
      alert('書き出しに失敗しました: ' + e);
    }
  };

  const activeScene = activeId ? scenes.find(s => s.id === activeId) : null;

  return (
    <div className="container">
      <header>
        <div className="menu-container">
          <button 
            className="secondary" 
            onClick={() => setIsFileMenuOpen(!isFileMenuOpen)}
            style={{
              backgroundColor: isFileMenuOpen ? 'var(--bg-hover)' : 'transparent',
              border: 'none',
              color: 'var(--text-main)',
              padding: '0.5rem 0.75rem',
            }}
          >
            ファイル ▼
          </button>
          {isFileMenuOpen && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={handleSaveFile}>
                保存...
              </button>
              <button className="dropdown-item" onClick={handleLoadFile}>
                開く...
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={handleDeploy}>
                書き出し...
              </button>
            </div>
          )}
          {/* Click outside to close could be implemented with a global listener, 
              for now utilizing simple toggle */}
          {isFileMenuOpen && (
            <div 
              style={{ position: 'fixed', inset: 0, zIndex: 40 }} 
              onClick={() => setIsFileMenuOpen(false)}
            />
          )}
        </div>
        
        <div className="actions">
          <button className="primary" onClick={handleAddScene}>
            + シーン追加
          </button>
        </div>
      </header>

      <main>
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={scenes.map(s => s.id)}
            strategy={rectSortingStrategy}
          >
            <div className="scene-grid">
              {scenes.map(scene => (
                <SortableSceneCard 
                  key={scene.id} 
                  scene={scene} 
                  onClick={startEditing}
                />
              ))}
            </div>
          </SortableContext>
          
          <DragOverlay>
            {activeScene ? <SceneCardOverlay scene={activeScene} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Edit Modal */}
      {editingId && editForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>シーン編集</h2>
              <button className="close-btn" onClick={cancelEdit}>✕</button>
            </div>
            
            <div className="edit-form">
              <div className="row-2-col">
                {/* シーンNO入力削除、時間入力を単独行にしないためレイアウト調整 */}
                <div className="form-group">
                  <label>章タイトル</label>
                  <input 
                    value={editForm.chapter} 
                    onChange={e => handleInputChange('chapter', e.target.value)} 
                    placeholder="第1章..."
                  />
                </div>
                <div className="form-group">
                  <label>時間</label>
                  <input 
                    value={editForm.time} 
                    onChange={e => handleInputChange('time', e.target.value)} 
                    placeholder="昼、夕方など"
                  />
                </div>
                <div className="form-group">
                  <label>場所</label>
                  <input 
                    value={editForm.place || ''} 
                    onChange={e => handleInputChange('place', e.target.value)} 
                    placeholder="教室、公園など"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>シーンタイトル</label>
                <input 
                  value={editForm.title} 
                  onChange={e => handleInputChange('title', e.target.value)} 
                  placeholder="出会い"
                />
              </div>

              <div className="form-group">
                <label>登場人物</label>
                <input 
                  value={editForm.characters} 
                  onChange={e => handleInputChange('characters', e.target.value)} 
                  placeholder="A, B, C"
                />
              </div>

              <div className="form-group">
                <label>狙いと役割</label>
                <textarea 
                  value={editForm.aim} 
                  onChange={e => handleInputChange('aim', e.target.value)} 
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>詳細なあらすじ</label>
                <textarea 
                  value={editForm.summary} 
                  onChange={e => handleInputChange('summary', e.target.value)} 
                  rows={5}
                />
              </div>

              <div className="form-group">
                <label>裏設定</label>
                <textarea 
                  value={editForm.note} 
                  onChange={e => handleInputChange('note', e.target.value)} 
                  rows={3}
                  className="note-input"
                />
              </div>

              <div className="modal-actions">
                <button className="delete-btn" onClick={() => deleteScene(editingId)}>削除</button>
                <div className="right-actions">
                  <button onClick={cancelEdit}>キャンセル</button>
                  <button className="primary" onClick={saveScene}>保存</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
