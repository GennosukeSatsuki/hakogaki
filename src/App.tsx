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
import { save, open, message, ask } from '@tauri-apps/plugin-dialog';

import { writeTextFile, readTextFile, mkdir, exists } from '@tauri-apps/plugin-fs';

import './App.css';

// Type definition for a Scene
// Scene No removed from type as it is derived from order
interface Scene {
  id: string;
  title: string; // シーンタイトル
  chapter: string; // 章タイトル
  characters: string; // 登場人物 (Deprecated: for display/compatibility)
  characterIds?: string[]; // 登場人物IDリスト (New)
  time: string; // 時間 (text or ISO datetime)
  timeMode?: 'text' | 'datetime'; // How time was entered
  place: string; // 場所
  aim: string; // 狙いと役割
  summary: string; // 詳細なあらすじ
  note: string; // 裏設定
}

interface Character {
  id: string;
  name: string;
}

interface AppSettings {
  timeInputMode: 'text' | 'datetime';
}

// Data structure for saving/loading
interface StoryData {
  scenes: Scene[];
  characters: Character[];
  settings?: AppSettings;
}

const INITIAL_SCENE: Scene = {
  id: '1',
  title: '物語の始まり',
  chapter: '第1章',
  characters: '主人公, ヒロイン',
  characterIds: ['1', '2'],
  time: '夕方',
  place: '通学路',
  aim: '主人公の日常と、非日常への入り口を描写する',
  summary: '主人公は学校からの帰り道、不思議な光を目撃する。好奇心から近づくと、そこで倒れているヒロインを発見する。',
  note: '実はこの時すでに敵組織に見つかっている',
};

// Sortable Scene Card Component
// Sortable Scene Card Component
interface SortableSceneCardProps {
  scene: Scene;
  characterList: Character[];
  onClick: (scene: Scene) => void;
  isHiddenFull?: boolean; // For DragOverlay
}

function SortableSceneCard({ scene, characterList, onClick, isHiddenFull }: SortableSceneCardProps) {
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
        <span className="value">
          {scene.characterIds?.map(id => characterList.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters || '-'}
        </span>
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
function SceneCardOverlay({ scene, characterList }: { scene: Scene, characterList: Character[] }) {
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
        <span className="value">
          {scene.characterIds?.map(id => characterList.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters || '-'}
        </span>
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


// Helper function to format datetime for display
const formatTimeForDisplay = (time: string, mode?: 'text' | 'datetime'): string => {
  if (!time) return '-';
  if (mode === 'datetime') {
    try {
      const date = new Date(time);
      return date.toLocaleString('ja-JP', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return time;
    }
  }
  return time;
};

function App() {
  const [scenes, setScenes] = useState<Scene[]>([INITIAL_SCENE]);
  const [characters, setCharacters] = useState<Character[]>([
    { id: '1', name: '主人公' },
    { id: '2', name: 'ヒロイン' },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Scene | null>(null);
  const [isCharacterMenuOpen, setIsCharacterMenuOpen] = useState(false); // For character management modal
  const [newCharacterName, setNewCharacterName] = useState(''); // For adding new character
  const [settings, setSettings] = useState<AppSettings>({ timeInputMode: 'text' });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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

  const handleInputChange = (field: keyof Scene, value: any) => {
    if (editForm) {
      setEditForm({ ...editForm, [field]: value });
    }
  };

  // Character Management Handlers
  const addCharacter = async () => {
    if (newCharacterName && newCharacterName.trim()) {
      setCharacters(prev => [...prev, { id: crypto.randomUUID(), name: newCharacterName.trim() }]);
      setNewCharacterName(''); // Clear input
    }
  };

  const updateCharacter = (id: string, name: string) => {
    setCharacters(characters.map(c => c.id === id ? { ...c, name } : c));
  };
  
  const deleteCharacter = async (id: string) => {
    const confirmed = await ask('この登場人物を削除しますか？', { title: '確認', kind: 'warning' });
    if (confirmed) {
      setCharacters(characters.filter(c => c.id !== id));
      // Remove from scenes as well
      setScenes(scenes.map(s => ({
        ...s,
        characterIds: s.characterIds?.filter(cid => cid !== id)
      })));
    }
  };

  const toggleCharacterInScene = (charId: string) => {
    if (!editForm) return;
    const currentIds = editForm.characterIds || [];
    let newIds;
    if (currentIds.includes(charId)) {
      newIds = currentIds.filter(id => id !== charId);
    } else {
      newIds = [...currentIds, charId];
    }
    
    // Also update legacy string for display
    const newString = newIds.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ');
    
    setEditForm({
      ...editForm,
      characterIds: newIds,
      characters: newString
    });
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
        const data: StoryData = { scenes, characters, settings };
        await writeTextFile(path, JSON.stringify(data, null, 2));
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
          // Legacy format: Scene[]
          // Migrate on load if needed, or just set scenes.
          // For characters, we might need to extract unique strings if we want to be fancy,
          // but for now, let's keep existing characters state or maybe reset it?
          // Let's extract characters from strings for migration
          const newScenes = parsed as Scene[];
          const uniqueChars = new Set<string>();
          newScenes.forEach(s => {
             if (s.characters) {
               s.characters.split(/[,、]/).map(c => c.trim()).filter(Boolean).forEach(c => uniqueChars.add(c));
             }
          });
          
          const newCharacters: Character[] = Array.from(uniqueChars).map(name => ({
             id: crypto.randomUUID(),
             name
          }));

          // Map scenes to character IDs
          newScenes.forEach(s => {
             s.characterIds = [];
             if (s.characters) {
               const names = s.characters.split(/[,、]/).map(c => c.trim());
               names.forEach(n => {
                 const found = newCharacters.find(c => c.name === n);
                 if (found) s.characterIds?.push(found.id);
               });
             }
          });

          setScenes(newScenes);
          setCharacters(newCharacters);
          alert('読み込みました (旧形式変換済み)');
        } else if (parsed.scenes && parsed.characters) {
          // New format
          setScenes(parsed.scenes);
          setCharacters(parsed.characters);
          if (parsed.settings) {
            setSettings(parsed.settings);
          }
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
        
        // Skip if file already exists
        if (await exists(filePath)) {
          console.log(`Skipping existing file: ${fileName}`);
          continue;
        }

        // Create Content
        const content = `**場所** ${scene.place}
**時間** ${formatTimeForDisplay(scene.time, scene.timeMode)}

**登場人物** ${scene.characterIds?.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters}

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
          <button 
            className="secondary" 
            onClick={() => setIsSettingsOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            ⚙️ 設定
          </button>
          <button 
            className="secondary" 
            onClick={() => setIsCharacterMenuOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            登場人物設定
          </button>
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
                  characterList={characters}
                  onClick={startEditing}
                />
              ))}
            </div>
          </SortableContext>
          
          <DragOverlay>
            {activeScene ? <SceneCardOverlay scene={activeScene} characterList={characters} /> : null}
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
                  {settings.timeInputMode === 'datetime' ? (
                    <input 
                      type="datetime-local"
                      value={editForm.time} 
                      onChange={e => {
                        handleInputChange('time', e.target.value);
                        handleInputChange('timeMode', 'datetime');
                      }} 
                    />
                  ) : (
                    <input 
                      value={editForm.time} 
                      onChange={e => {
                        handleInputChange('time', e.target.value);
                        handleInputChange('timeMode', 'text');
                      }} 
                      placeholder="昼、夕方など"
                    />
                  )}
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
                <div className="character-checkbox-list" style={{ 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '4px', 
                  padding: '0.5rem',
                  maxHeight: '150px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}>
                  {characters.map(char => (
                    <label key={char.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.9rem' }}>
                      <input 
                        type="checkbox" 
                        checked={editForm.characterIds?.includes(char.id) || false}
                        onChange={() => toggleCharacterInScene(char.id)}
                      />
                      {char.name}
                    </label>
                  ))}
                  {characters.length === 0 && <span style={{ color: 'var(--text-sub)' }}>登場人物が登録されていません</span>}
                </div>
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

      {/* Character Management Modal */}
      {isCharacterMenuOpen && (
        <div className="modal-overlay" onClick={() => setIsCharacterMenuOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>登場人物設定</h2>
              <button className="close-btn" onClick={() => setIsCharacterMenuOpen(false)}>✕</button>
            </div>
            <div className="edit-form">
               <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '400px', overflowY: 'auto' }}>
                 {characters.map(char => (
                   <li key={char.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem', gap: '0.5rem' }}>
                     <input 
                       value={char.name}
                       onChange={(e) => updateCharacter(char.id, e.target.value)}
                       onClick={(e) => e.stopPropagation()}
                       style={{ flex: 1 }}
                     />
                     <button type="button" className="delete-btn" onClick={() => deleteCharacter(char.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>削除</button>
                   </li>
                 ))}
               </ul>
               <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                 <input 
                   type="text"
                   value={newCharacterName}
                   onChange={(e) => setNewCharacterName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') addCharacter(); }}
                   placeholder="新しい登場人物の名前"
                   style={{ flex: 1 }}
                 />
                 <button type="button" onClick={() => addCharacter()}>追加</button>
                 <button type="button" className="primary" onClick={() => setIsCharacterMenuOpen(false)}>閉じる</button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>設定</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>
            <div className="edit-form">
              <div className="form-group">
                <label>時間入力モード</label>
                <select 
                  value={settings.timeInputMode}
                  onChange={(e) => setSettings({ ...settings, timeInputMode: e.target.value as 'text' | 'datetime' })}
                  style={{ 
                    backgroundColor: 'var(--bg-input)', 
                    color: 'var(--text-main)', 
                    border: '1px solid var(--border-subtle)',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    width: '100%'
                  }}
                >
                  <option value="text">テキスト入力（例：昼、夕方）</option>
                  <option value="datetime">日時選択（カレンダー＋時計）</option>
                </select>
                <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                  日時選択モードでは、カレンダーと時計で正確な日時を設定できます。
                  書き出し時は読みやすい形式に変換されます。
                </small>
              </div>
              <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="primary" onClick={() => setIsSettingsOpen(false)}>閉じる</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
