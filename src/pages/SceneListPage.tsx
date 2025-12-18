import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { save, open, ask } from '@tauri-apps/plugin-dialog';

import { writeTextFile, readTextFile, mkdir, exists, rename, remove } from '@tauri-apps/plugin-fs';
import { getVersion } from '@tauri-apps/api/app';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { documentDir } from '@tauri-apps/api/path';

import '../App.css';

// Deployment tracking information
interface DeploymentInfo {
  chapterId: string;      // 書き出し時の章ID
  lastFileName: string;   // 前回書き出し時のファイル名（リネーム検出用）
}

// Type definition for a Scene
interface Scene {
  id: string;
  sceneNo: number; // 絶対的なシーン番号（削除されても欠番になる）
  title: string; // シーンタイトル
  chapter: string; // 章タイトル (Deprecated: for display/compatibility)
  chapterId?: string; // 章ID (New)
  characters: string; // 登場人物 (Deprecated: for display/compatibility)
  characterIds?: string[]; // 登場人物IDリスト (New)
  time: string; // 時間 (text or ISO datetime)
  timeMode?: 'text' | 'datetime'; // How time was entered
  place: string; // 場所
  aim: string; // 狙いと役割
  summary: string; // 詳細なあらすじ
  note: string; // 裏設定
  deploymentInfo?: DeploymentInfo; // 書き出し情報（初回書き出し時に設定）
}

interface Character {
  id: string;
  name: string;
}

interface Location {
  id: string;
  name: string;
}

interface Chapter {
  id: string;
  title: string;
  deploymentNumber?: number; // 書き出し時の章番号（初回書き出し時に割り当て）
}

interface AppSettings {
  timeInputMode: 'text' | 'datetime';
  placeInputMode: 'text' | 'select';
  autoSave: boolean;
  theme: 'system' | 'light' | 'dark';
  editorFontFamily?: string;
  editorFontSize?: number;
}

// Data structure for saving/loading
interface StoryData {
  scenes: Scene[];
  characters: Character[];
  locations?: Location[];
  chapters?: Chapter[];
  settings?: AppSettings;
  lastDeployPath?: string; // Last directory path used for deployment
  nextSceneNo?: number; // 次に割り当てるシーン番号
}

const INITIAL_SCENE: Scene = {
  id: '1',
  sceneNo: 1,
  title: '物語の始まり',
  chapter: '第1章',
  chapterId: '1',
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
  chapterList: Chapter[];
  onClick: (scene: Scene) => void;
  onEdit: (sceneId: string) => void;  // 追加: エディタに遷移
  isHiddenFull?: boolean; // For DragOverlay
}

function SortableSceneCard({ scene, chapterList, onClick, onEdit, isHiddenFull }: SortableSceneCardProps) {
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
    >
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="scene-title" onClick={() => onClick(scene)} style={{ cursor: 'pointer', flex: 1 }}>
          {scene.title || '(無題)'}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(scene.id);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            padding: '0.25rem 0.75rem',
            fontSize: '0.85rem',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            flexShrink: 0
          }}
        >
          執筆
        </button>
      </div>
      
      <div className="card-row">
        <span className="value strong" style={{ fontSize: '0.95em' }}>
          {scene.chapterId ? chapterList.find(c => c.id === scene.chapterId)?.title : (scene.chapter || '-')}
        </span>
      </div>

      <div className="card-row">
        <span className="value" style={{ fontSize: '0.9em', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
          {scene.summary ? (scene.summary.length > 80 ? scene.summary.substring(0, 80) + '...' : scene.summary) : 'あらすじなし'}
        </span>
      </div>
    </div>
  );
}

// Plain component for DragOverlay
function SceneCardOverlay({ scene, chapterList }: { scene: Scene, chapterList: Chapter[] }) {
  return (
    <SortableSceneCard 
      scene={scene} 
      chapterList={chapterList}
      onClick={() => {}}
      onEdit={() => {}}
      isHiddenFull 
    />
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

export default function SceneListPage() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [lastDeployPath, setLastDeployPath] = useState<string | null>(null);
  const [nextSceneNo, setNextSceneNo] = useState(1);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Scene | null>(null);
  const [isCharacterMenuOpen, setIsCharacterMenuOpen] = useState(false); // For character management modal
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false); // For location management modal
  const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false); // For chapter management modal
  const [newCharacterName, setNewCharacterName] = useState(''); // For adding new character
  const [newLocationName, setNewLocationName] = useState(''); // For adding new location
  const [newChapterTitle, setNewChapterTitle] = useState(''); // For adding new chapter
  const [settings, setSettings] = useState<AppSettings>({ timeInputMode: 'text', placeInputMode: 'text', autoSave: false, theme: 'system', editorFontFamily: 'sans-serif', editorFontSize: 16 });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'outline' | 'editor'>('general');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  
  // For long-press time picker
  const longPressTimer = useRef<number | null>(null);
  const repeatInterval = useRef<number | null>(null);

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

  const handleEditScene = (sceneId: string) => {
    navigate(`/editor/${sceneId}`);
  };

  const handleAddScene = () => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      sceneNo: nextSceneNo,
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
    setNextSceneNo(nextSceneNo + 1); // 次のシーン番号をインクリメント
    startEditing(newScene);
  };

  const startEditing = (scene: Scene) => {
    setEditingId(scene.id);
    let editableScene = { ...scene };
    
    // If in datetime mode and time is not in ISO format, try to convert or set to current time
    if (settings.timeInputMode === 'datetime' && editableScene.time) {
      // Check if already in ISO format (contains 'T')
      if (!editableScene.time.includes('T')) {
        // Not in ISO format, set to current time as default
        const now = new Date();
        editableScene.time = now.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:mm
        editableScene.timeMode = 'datetime';
      }
    }
    
    setEditForm(editableScene);
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

  // Location Management Handlers
  const addLocation = async () => {
    if (newLocationName && newLocationName.trim()) {
      setLocations(prev => [...prev, { id: crypto.randomUUID(), name: newLocationName.trim() }]);
      setNewLocationName(''); // Clear input
    }
  };

  const updateLocation = (id: string, name: string) => {
    setLocations(locations.map(l => l.id === id ? { ...l, name } : l));
  };
  
  const deleteLocation = async (id: string) => {
    const confirmed = await ask('この場所を削除しますか？', { title: '確認', kind: 'warning' });
    if (confirmed) {
      setLocations(locations.filter(l => l.id !== id));
    }
  };

  // Chapter Management Handlers
  const addChapter = async () => {
    if (newChapterTitle && newChapterTitle.trim()) {
      setChapters(prev => [...prev, { id: crypto.randomUUID(), title: newChapterTitle.trim() }]);
      setNewChapterTitle(''); // Clear input
    }
  };

  const updateChapter = (id: string, title: string) => {
    setChapters(chapters.map(c => c.id === id ? { ...c, title } : c));
  };
  
  const deleteChapter = async (id: string) => {
    const confirmed = await ask('この章を削除しますか？\n（使用中のシーンの章設定は解除されます）', { title: '確認', kind: 'warning' });
    if (confirmed) {
      setChapters(chapters.filter(c => c.id !== id));
      // Remove from scenes as well
      setScenes(scenes.map(s => s.chapterId === id ? { ...s, chapterId: undefined, chapter: '' } : s));
    }
  };

  // Helper functions for time picker long-press
  const clearTimers = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (repeatInterval.current) {
      clearInterval(repeatInterval.current);
      repeatInterval.current = null;
    }
  };

  const handleTimeButtonPress = (action: () => void) => {
    // Execute once immediately
    action();
    
    // Start long-press timer (500ms delay before repeat starts)
    longPressTimer.current = setTimeout(() => {
      // Start repeating every 100ms
      repeatInterval.current = setInterval(() => {
        action();
      }, 100);
    }, 500);
  };

  const handleTimeButtonRelease = () => {
    clearTimers();
  };

  const handleSaveAs = async () => {
    setIsFileMenuOpen(false);
    try {
      const path = await save({
        filters: [{
          name: 'Hakogaki Data (JSON)',
          extensions: ['json']
        }]
      });
      
      if (path) {
        const data: StoryData = { 
          scenes, 
          characters, 
          locations, 
          chapters, 
          settings, 
          lastDeployPath: lastDeployPath ?? undefined,
          nextSceneNo 
        };
        await writeTextFile(path, JSON.stringify(data, null, 2));
        setCurrentFilePath(path);
        alert('保存しました');
      }
    } catch (e) {
      console.error(e);
      alert('保存に失敗しました: ' + e);
    }
  };

  const handleOverwriteSave = async (silent = false) => {
    setIsFileMenuOpen(false);
    if (!currentFilePath) {
      if (!silent) handleSaveAs();
      return;
    }

    try {
      const data: StoryData = { 
        scenes, 
        characters, 
        locations, 
        chapters, 
        settings, 
        lastDeployPath: lastDeployPath ?? undefined,
        nextSceneNo 
      };
      await writeTextFile(currentFilePath, JSON.stringify(data, null, 2));
      if (!silent) alert('上書き保存しました');
      else console.log('Auto saved');
    } catch (e) {
      console.error(e);
      if (!silent) alert('保存に失敗しました: ' + e);
    }
  };

  // Load from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('storyData');
    console.log('Loading from localStorage:', savedData ? 'Data found' : 'No data');
    
    if (savedData) {
      try {
        const data = JSON.parse(savedData);
        console.log('Parsed data:', data);
        if (data.scenes) setScenes(data.scenes);
        if (data.characters) setCharacters(data.characters);
        if (data.locations) setLocations(data.locations);
        if (data.chapters) setChapters(data.chapters);
        if (data.settings) setSettings(data.settings);
        if (data.lastDeployPath) setLastDeployPath(data.lastDeployPath);
        if (data.nextSceneNo) setNextSceneNo(data.nextSceneNo);
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
      }
    } else {
      // 初回起動時のデフォルト値を設定
      console.log('Setting default values');
      setScenes([INITIAL_SCENE]);
      setCharacters([
        { id: '1', name: '主人公' },
        { id: '2', name: 'ヒロイン' },
      ]);
      setLocations([
        { id: '1', name: '通学路' },
      ]);
      setChapters([
        { id: '1', title: '第1章' },
      ]);
      setNextSceneNo(2);
    }
    
    // 初期化完了
    setInitialized(true);
  }, []); // Run only once on mount

  // Auto Save Effect
  useEffect(() => {
    if (!settings.autoSave || !currentFilePath) return;

    const timer = setTimeout(() => {
      handleOverwriteSave(true);
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(timer);
  }, [scenes, characters, locations, chapters, settings, currentFilePath]);

  const handleNewProject = async () => {
    setIsFileMenuOpen(false);
    
    // 確認ダイアログ
    const confirmed = await ask(
      '新規プロジェクトを作成しますか？\n\n現在のプロジェクトは保存されていない場合、失われます。',
      { 
        title: '新規プロジェクト', 
        kind: 'warning',
        okLabel: '新規作成',
        cancelLabel: 'キャンセル'
      }
    );
    
    if (!confirmed) return;
    
    // 初期データを設定（サンプルデータ付き）
    setScenes([INITIAL_SCENE]);
    setCharacters([
      { id: '1', name: '主人公' },
      { id: '2', name: 'ヒロイン' },
    ]);
    setLocations([
      { id: '1', name: '通学路' },
    ]);
    setChapters([
      { id: '1', title: '第1章' },
    ]);
    setCurrentFilePath(null);
    setLastDeployPath(null);
    setNextSceneNo(2);
    
    // localStorageもクリア
    localStorage.removeItem('storyData');
  };

  const handleLoadFile = async () => {
    setIsFileMenuOpen(false);
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [{
          name: 'Hakogaki Data (JSON)',
          extensions: ['json', 'hako']
        }]
      });
      
      if (file) {
        // file is string if multiple is false
        setCurrentFilePath(file);
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

          // Map scenes to character IDs and assign sceneNo
          newScenes.forEach((s, index) => {
             s.characterIds = [];
             if (s.characters) {
               const names = s.characters.split(/[,、]/).map(c => c.trim());
               names.forEach(n => {
                 const found = newCharacters.find(c => c.name === n);
                 if (found) s.characterIds?.push(found.id);
               });
             }
             // Assign sceneNo if not present (legacy migration)
             if (!s.sceneNo) {
               s.sceneNo = index + 1;
             }
          });

          setScenes(newScenes);
          setCharacters(newCharacters);

          // Extract chapters from legacy string
          const uniqueChapters = new Set<string>();
          newScenes.forEach(s => {
             if (s.chapter) uniqueChapters.add(s.chapter.trim());
          });
          const newChapters: Chapter[] = Array.from(uniqueChapters).filter(Boolean).map(title => ({
             id: crypto.randomUUID(),
             title
          }));
          
          // Map scenes to chapter IDs
          setScenes(prev => prev.map(s => {
            const found = newChapters.find(c => c.title === s.chapter?.trim());
            return found ? { ...s, chapterId: found.id } : s;
          }));
          
          setChapters(newChapters);
          
          // Set nextSceneNo to the next available number
          const maxSceneNo = Math.max(...newScenes.map(s => s.sceneNo || 0), 0);
          setNextSceneNo(maxSceneNo + 1);

          alert('読み込みました (旧形式変換済み)');
        } else if (parsed.scenes && parsed.characters) {
          // New format
          // Legacy migration for files that have scenes/chars but no explicit chapter objects yet (if any?)
          // If loading a file saved before this update but after the last update (has scenes/chars/locs but no chapters)
          let loadedScenes = parsed.scenes as Scene[];
          let loadedChapters = parsed.chapters as Chapter[] || [];

          if (loadedChapters.length === 0) {
              // Migration from intermediate format (v0.5.1) to v0.6.0 (with chapters)
              const uniqueChapters = new Set<string>();
              loadedScenes.forEach(s => {
                if (s.chapter) uniqueChapters.add(s.chapter.trim());
              });
              loadedChapters = Array.from(uniqueChapters).filter(Boolean).map(title => ({
                id: crypto.randomUUID(),
                title
              }));
              
              // Apply IDs to scenes
              loadedScenes = loadedScenes.map(s => {
                const found = loadedChapters.find(c => c.title === s.chapter?.trim());
                return found ? { ...s, chapterId: found.id } : s;
              });
          }

          // Assign sceneNo to scenes that don't have it (backward compatibility)
          loadedScenes.forEach((s, index) => {
            if (!s.sceneNo) {
              s.sceneNo = index + 1;
            }
          });

          setScenes(loadedScenes);
          setCharacters(parsed.characters);
          setChapters(loadedChapters);
          if (parsed.locations) {
            setLocations(parsed.locations);
          }
          if (parsed.settings) {
            setSettings(parsed.settings);
          }
          if (parsed.lastDeployPath) {
            setLastDeployPath(parsed.lastDeployPath);
          }
          
          // Restore nextSceneNo or calculate it from existing scenes
          if (parsed.nextSceneNo) {
            setNextSceneNo(parsed.nextSceneNo);
          } else {
            const maxSceneNo = Math.max(...loadedScenes.map(s => s.sceneNo || 0), 0);
            setNextSceneNo(maxSceneNo + 1);
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

  // Initial Load & Version Check
  useEffect(() => {
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('Unknown'));
  }, []);

  // Theme Application
  useEffect(() => {
    const applyTheme = () => {
      if (settings.theme === 'system') {
        // Check system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', settings.theme);
      }
    };

    applyTheme();

    // Listen for system theme changes when in system mode
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyTheme();
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [settings.theme]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+S or Command+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault(); // Prevent browser default save
        handleOverwriteSave(true); // Silent save for keyboard shortcut
      }
    };


    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleOverwriteSave]); // Re-bind when save handler changes (which depends on state)

  // Save to localStorage for editor access
  useEffect(() => {
    // 初期化が完了していない場合は保存しない
    if (!initialized) {
      console.log('Skipping save: not initialized yet');
      return;
    }
    
    // 空のデータは保存しない（初期化中の可能性があるため）
    if (scenes.length === 0) {
      console.log('Skipping save: scenes array is empty');
      return;
    }
    
    const storyData = {
      scenes,
      characters,
      locations,
      chapters,
      settings,
      lastDeployPath,
      nextSceneNo
    };
    console.log('Saving to localStorage:', storyData);
    localStorage.setItem('storyData', JSON.stringify(storyData));
  }, [scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo]); // initializedは依存配列に含めない

  // Handle window close event
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlistenFn: (() => void) | null = null;
    
    appWindow.onCloseRequested(async (event) => {
      // Prevent the window from closing immediately
      event.preventDefault();
      
      // Ask user if they want to save before closing
      const shouldSave = await ask('アプリを終了する前に保存しますか？', {
        title: '終了確認',
        kind: 'info',
        okLabel: '保存して終了',
        cancelLabel: '保存せずに終了'
      });
      
      if (shouldSave) {
        try {
          // Save JSON file if path exists
          if (currentFilePath) {
            const data: StoryData = { 
              scenes, 
              characters, 
              locations, 
              chapters, 
              settings, 
              lastDeployPath: lastDeployPath ?? undefined,
              nextSceneNo 
            };
            await writeTextFile(currentFilePath, JSON.stringify(data, null, 2));
            console.log('JSON保存完了');
          }
          
          // Deploy if there's a last deploy path
          if (lastDeployPath) {
            console.log('書き出し開始:', lastDeployPath);
            const isWindows = typeof lastDeployPath === 'string' && lastDeployPath.includes('\\\\');
            const sep = isWindows ? '\\\\' : '/';
            
            for (let i = 0; i < scenes.length; i++) {
              const scene = scenes[i];
              const currentChapterId = scene.chapterId || '';
              const currentChapter = chapters?.find(c => c.id === currentChapterId);
              const currentChapterTitle = currentChapter?.title || scene.chapter || '無題の章';
              
              const chapterDeploymentNumber = currentChapter?.deploymentNumber || 1;
              const numStr = chapterDeploymentNumber.toString().padStart(2, '0');
              const safeChapterTitle = currentChapterTitle.trim();
              const folderName = `${numStr}_${safeChapterTitle}`;
              const folderPath = `${lastDeployPath}${sep}${folderName}`;
              
              await mkdir(folderPath, { recursive: true });
              
              const fileNum = (i + 1).toString().padStart(3, '0');
              const safeTitle = scene.title.trim() || '無題のシーン';
              const fileName = `${fileNum}_${safeTitle}.txt`;
              const filePath = `${folderPath}${sep}${fileName}`;
              
              const content = `タイトル: ${scene.title}
章: ${currentChapterTitle}
登場人物: ${scene.characters}
時間: ${formatTimeForDisplay(scene.time, scene.timeMode)}
場所: ${scene.place}
狙いと役割: ${scene.aim}

【あらすじ】
${scene.summary}

【裏設定・メモ】
${scene.note}`;
              
              await writeTextFile(filePath, content);
            }
            console.log('書き出し完了');
          }
        } catch (e) {
          console.error('保存に失敗しました:', e);
          // エラーが発生しても終了は続行
        }
      }
      
      // Remove the event listener before closing to prevent infinite loop
      console.log('イベントリスナーを解除します');
      if (unlistenFn) {
        unlistenFn();
      }
      
      // Close the window
      console.log('ウィンドウを閉じます');
      await appWindow.close();
    }).then(fn => {
      unlistenFn = fn;
    });
    
    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo, currentFilePath]);

  const handleDeploy = async () => {
    setIsFileMenuOpen(false);
    try {
      let baseDir: string;
      
      // Check if we're on mobile (Android/iOS)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      if (isMobile) {
        // On mobile, use app's document directory
        try {
          const docDir = await documentDir();
          baseDir = `${docDir}/HakogakiExport`;
          // Create the export directory if it doesn't exist
          await mkdir(baseDir, { recursive: true });
          alert(`モバイル版では、ファイルは以下のディレクトリに書き出されます:\n${baseDir}`);
        } catch (e) {
          console.error('Failed to get document directory:', e);
          alert('書き出しディレクトリの取得に失敗しました');
          return;
        }
      } else {
        // On desktop, use folder picker
        const selectedDir = await open({
          directory: true,
          multiple: false,
        });
        
        if (!selectedDir) return;
        baseDir = selectedDir;
      }

      // Remember the deploy path for future use
      setLastDeployPath(baseDir);

      // Simple separator detection (not perfect but works for most cases provided by dialog)
      const isWindows = typeof baseDir === 'string' && baseDir.includes('\\\\');
      const sep = isWindows ? '\\\\' : '/';

      // Track chapters and assign deployment numbers
      const updatedChapters = [...chapters];
      let nextChapterDeploymentNumber = Math.max(...chapters.map(c => c.deploymentNumber || 0), 0) + 1;
      
      // Assign deployment numbers to chapters that don't have them yet
      const chapterDeploymentMap = new Map<string, number>();
      for (const chapter of updatedChapters) {
        if (chapter.deploymentNumber) {
          chapterDeploymentMap.set(chapter.id, chapter.deploymentNumber);
        }
      }
      
      // Track scenes that need deployment info updates
      const updatedScenes = [...scenes];

      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        
        // Get current chapter info
        const currentChapterId = scene.chapterId || '';
        const currentChapter = chapters?.find(c => c.id === currentChapterId);
        const currentChapterTitle = currentChapter?.title || scene.chapter || '無題の章';
        
        // File number is always current position
        const fileNumberToUse = i + 1;

        // Determine chapter deployment number
        let chapterDeploymentNumber: number;
        let chapterIdToStore: string = currentChapterId;
        
        if (scene.deploymentInfo) {
          // Already deployed - get chapter deployment number
          const deployedChapterId = scene.deploymentInfo.chapterId;
          
          if (deployedChapterId === currentChapterId) {
            // Same chapter - use existing chapter deployment number
            const deployedChapter = chapters?.find(c => c.id === deployedChapterId);
            chapterDeploymentNumber = deployedChapter?.deploymentNumber || chapterDeploymentMap.get(deployedChapterId) || 0;
          } else {
            // Chapter changed - get new chapter's deployment number
            if (currentChapterId && chapterDeploymentMap.has(currentChapterId)) {
              chapterDeploymentNumber = chapterDeploymentMap.get(currentChapterId)!;
            } else if (currentChapterId && currentChapter?.deploymentNumber) {
              chapterDeploymentNumber = currentChapter.deploymentNumber;
              chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
            } else {
              // Assign new deployment number to this chapter
              chapterDeploymentNumber = nextChapterDeploymentNumber++;
              if (currentChapterId) {
                chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
                const chapterIndex = updatedChapters.findIndex(c => c.id === currentChapterId);
                if (chapterIndex !== -1) {
                  updatedChapters[chapterIndex] = {
                    ...updatedChapters[chapterIndex],
                    deploymentNumber: chapterDeploymentNumber
                  };
                }
              }
            }
          }
        } else {
          // First deployment
          if (currentChapterId && chapterDeploymentMap.has(currentChapterId)) {
            chapterDeploymentNumber = chapterDeploymentMap.get(currentChapterId)!;
          } else if (currentChapterId && currentChapter?.deploymentNumber) {
            chapterDeploymentNumber = currentChapter.deploymentNumber;
            chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
          } else {
            // Assign new deployment number to this chapter
            chapterDeploymentNumber = nextChapterDeploymentNumber++;
            if (currentChapterId) {
              chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
              const chapterIndex = updatedChapters.findIndex(c => c.id === currentChapterId);
              if (chapterIndex !== -1) {
                updatedChapters[chapterIndex] = {
                  ...updatedChapters[chapterIndex],
                  deploymentNumber: chapterDeploymentNumber
                };
              }
            }
          }
        }

        // Create Chapter Folder Name: XX_ChapterName
        const numStr = chapterDeploymentNumber.toString().padStart(2, '0');
        const safeChapterTitle = currentChapterTitle.trim();
        const folderName = `${numStr}_${safeChapterTitle}`;
        const folderPath = `${baseDir}${sep}${folderName}`;

        // Create Directory
        await mkdir(folderPath, { recursive: true });

        // Create File Name: (FileNum)_(SceneName).txt
        const fileNum = fileNumberToUse.toString().padStart(3, '0');
        const safeTitle = scene.title.trim() || '無題のシーン';
        const fileName = `${fileNum}_${safeTitle}.txt`;
        const filePath = `${folderPath}${sep}${fileName}`;
        
        // Check if chapter changed (need to move file)
        if (scene.deploymentInfo && scene.deploymentInfo.chapterId !== chapterIdToStore) {
          // Chapter changed - need to move file from old chapter folder to new chapter folder
          const oldChapterId = scene.deploymentInfo.chapterId;
          const oldChapter = chapters?.find(c => c.id === oldChapterId);
          const oldChapterDeploymentNumber = oldChapter?.deploymentNumber || chapterDeploymentMap.get(oldChapterId) || 0;
          const oldChapterTitle = oldChapter?.title || '無題の章';
          
          const oldNumStr = oldChapterDeploymentNumber.toString().padStart(2, '0');
          const oldFolderName = `${oldNumStr}_${oldChapterTitle.trim()}`;
          const oldFolderPath = `${baseDir}${sep}${oldFolderName}`;
          const oldFileName = scene.deploymentInfo.lastFileName || fileName;
          const oldFilePath = `${oldFolderPath}${sep}${oldFileName}`;
          
          // Read old file content if it exists
          if (await exists(oldFilePath)) {
            console.log(`Moving file from ${oldFolderName}/${oldFileName} to ${folderName}/${fileName}`);
            try {
              const fileContent = await readTextFile(oldFilePath);
              // Write to new location
              await writeTextFile(filePath, fileContent);
              // Delete old file
              await remove(oldFilePath);
            } catch (e) {
              console.error(`Failed to move file: ${e}`);
              // Continue anyway - will create new file if move fails
            }
          }
        }
        // Check if file needs to be renamed (title changed, same chapter)
        else if (scene.deploymentInfo && scene.deploymentInfo.lastFileName && scene.deploymentInfo.lastFileName !== fileName) {
          const oldFilePath = `${folderPath}${sep}${scene.deploymentInfo.lastFileName}`;
          if (await exists(oldFilePath)) {
            console.log(`Renaming: ${scene.deploymentInfo.lastFileName} -> ${fileName}`);
            try {
              await rename(oldFilePath, filePath);
            } catch (e) {
              console.error(`Failed to rename file: ${e}`);
              // Continue anyway - will create new file if rename fails
            }
          }
        }
        
        // Update deployment info with current file name
        if (!scene.deploymentInfo) {
          updatedScenes[i] = {
            ...updatedScenes[i],
            deploymentInfo: {
              chapterId: chapterIdToStore,
              lastFileName: fileName
            }
          };
        } else {
          updatedScenes[i] = {
            ...updatedScenes[i],
            deploymentInfo: {
              chapterId: chapterIdToStore,
              lastFileName: fileName
            }
          };
        }
        
        // Create box-writing metadata content with separator note
        const separator = '──────────────(本文執筆完了後に消してください)──────────────';
        const boxContent = `**場所** ${scene.place}
**時間** ${formatTimeForDisplay(scene.time, scene.timeMode)}

**登場人物** ${scene.characterIds?.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters}

**狙いと役割** ${scene.aim}

**詳細なあらすじ** ${scene.summary}

**裏設定** ${scene.note}

${separator}

`;

        let shouldWrite = true;
        let finalContent = boxContent;

        // If file already exists, read existing content and compare
        if (await exists(filePath)) {
          console.log(`File exists: ${fileName}`);
          try {
            const existingContent = await readTextFile(filePath);
            
            // Find separator line (check for both old and new format)
            const oldSeparator = '────────────────────────────────';
            const newSeparatorPattern = /──────────────\(本文執筆完了後に消してください\)──────────────/;
            
            let separatorIndex = existingContent.search(newSeparatorPattern);
            let foundSeparator = separator;
            
            if (separatorIndex === -1) {
              // Try old separator format
              separatorIndex = existingContent.indexOf(oldSeparator);
              if (separatorIndex !== -1) {
                foundSeparator = oldSeparator;
              }
            }
            
            if (separatorIndex !== -1) {
              // Separator found - file is still in draft mode
              // Extract existing box-writing section (before separator)
              const existingBoxContent = existingContent.substring(0, separatorIndex + foundSeparator.length + 1);
              
              // Extract body content (after separator)
              const bodyContent = existingContent.substring(separatorIndex).replace(new RegExp(`^${foundSeparator.replace(/[()]/g, '\\\\$&')}\\s*\\n+`), '');
              
              // Compare box-writing sections (normalize separator for comparison)
              const normalizedExisting = existingBoxContent.replace(oldSeparator, separator).trim();
              const normalizedNew = boxContent.trim();
              
              if (normalizedExisting === normalizedNew) {
                console.log(`Box content unchanged, skipping: ${fileName}`);
                shouldWrite = false;
              } else {
                console.log(`Box content changed, updating: ${fileName}`);
                finalContent = boxContent + bodyContent;
              }
            } else {
              // No separator found - writing is complete, skip updating
              console.log(`No separator found (writing complete), skipping: ${fileName}`);
              shouldWrite = false;
            }
          } catch (e) {
            console.error(`Error reading existing file: ${fileName}`, e);
            // If read fails, write new content
          }
        }

        // Only write if needed
        if (shouldWrite) {
          await writeTextFile(filePath, finalContent);
        }
      }

      // Update scenes with deployment info
      setScenes(updatedScenes);
      
      // Update chapters with deployment numbers
      setChapters(updatedChapters);

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
              <button className="dropdown-item" onClick={handleNewProject}>
                ✨ 新規プロジェクト
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => handleOverwriteSave(false)}>
                💾 プロジェクトを保存
              </button>
              <button className="dropdown-item" onClick={handleSaveAs}>
                📄 名前を付けて保存...
              </button>
              <button className="dropdown-item" onClick={handleLoadFile}>
                📂 プロジェクトを開く...
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={handleDeploy}>
                📝 テキストファイルに書き出し...
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => { setIsFileMenuOpen(false); setIsSettingsOpen(true); }}>
                ⚙️ 設定...
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => { setIsFileMenuOpen(false); setIsAboutOpen(true); }}>
                ℹ️ バージョン情報...
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
            onClick={() => setIsCharacterMenuOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            登場人物設定
          </button>
          <button 
            className="secondary" 
            onClick={() => setIsChapterMenuOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            章設定
          </button>
          {settings.placeInputMode === 'select' && (
            <button 
              className="secondary" 
              onClick={() => setIsLocationMenuOpen(true)}
              style={{ marginRight: '0.5rem' }}
            >
              場所設定
            </button>
          )}
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
                chapterList={chapters}
                onClick={startEditing}
                onEdit={handleEditScene}
              />
              ))}
            </div>
          </SortableContext>
          
          <DragOverlay>
            {activeScene ? <SceneCardOverlay scene={activeScene} chapterList={chapters} /> : null}
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
                  <select
                    value={editForm.chapterId || ''}
                    onChange={e => {
                        const newId = e.target.value;
                        const newTitle = chapters.find(c => c.id === newId)?.title || '';
                        setEditForm({ ...editForm, chapterId: newId, chapter: newTitle });
                    }}
                    style={{ 
                      width: '100%', 
                      padding: '0.5rem',
                      backgroundColor: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)'
                    }}
                  >
                    <option value="">-- 選択してください --</option>
                    {chapters.map(c => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>時間</label>
                  {settings.timeInputMode === 'datetime' ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
                      <input 
                        type="date"
                        value={editForm.time ? editForm.time.split('T')[0] : ''} 
                        onChange={e => {
                          const currentTime = editForm.time?.includes('T') ? editForm.time.split('T')[1] : '12:00';
                          const newDateTime = e.target.value ? `${e.target.value}T${currentTime}` : '';
                          setEditForm({
                            ...editForm,
                            time: newDateTime,
                            timeMode: 'datetime'
                          });
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
                                setEditForm(prev => {
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
                                setEditForm(prev => {
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
                        
                        <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-main)', fontSize: '1.2rem' }}>:</div>
                        
                        {/* Minutes */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button 
                            type="button"
                            onMouseDown={() => {
                              handleTimeButtonPress(() => {
                                setEditForm(prev => {
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
                                setEditForm(prev => {
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
                      value={editForm.time || ''} 
                      onChange={e => {
                        setEditForm({
                          ...editForm,
                          time: e.target.value,
                          timeMode: 'text'
                        });
                      }} 
                      placeholder="昼、夕方など"
                    />
                  )}
                </div>
                <div className="form-group">
                  <label>場所</label>
                  {settings.placeInputMode === 'select' ? (
                    <select
                      value={editForm.place || ''}
                      onChange={e => handleInputChange('place', e.target.value)}
                      style={{
                        backgroundColor: 'var(--bg-input)',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        width: '100%'
                      }}
                    >
                      <option value="">選択してください</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      value={editForm.place || ''} 
                      onChange={e => handleInputChange('place', e.target.value)} 
                      placeholder="教室、公園など"
                    />
                  )}
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

      {/* Location Management Modal */}
      {isLocationMenuOpen && (
        <div className="modal-overlay" onClick={() => setIsLocationMenuOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>場所設定</h2>
              <button className="close-btn" onClick={() => setIsLocationMenuOpen(false)}>✕</button>
            </div>
            <div className="edit-form">
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {locations.map(loc => (
                  <li key={loc.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input 
                      value={loc.name}
                      onChange={(e) => updateLocation(loc.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="delete-btn" onClick={() => deleteLocation(loc.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>削除</button>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLocation(); }}
                  placeholder="新しい場所の名前"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => addLocation()}>追加</button>
                <button type="button" className="primary" onClick={() => setIsLocationMenuOpen(false)}>閉じる</button>
              </div>
           </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isChapterMenuOpen && (
        <div className="modal-overlay" onClick={() => setIsChapterMenuOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>章設定</h2>
              <button className="close-btn" onClick={() => setIsChapterMenuOpen(false)}>✕</button>
            </div>
            <div className="edit-form">
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {chapters.map(chap => (
                  <li key={chap.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input 
                      value={chap.title}
                      onChange={(e) => updateChapter(chap.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="delete-btn" onClick={() => deleteChapter(chap.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>削除</button>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChapter(); }}
                  placeholder="新しい章のタイトル"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => addChapter()}>追加</button>
                <button type="button" className="primary" onClick={() => setIsChapterMenuOpen(false)}>閉じる</button>
              </div>
           </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="modal-overlay" onClick={() => setIsSettingsOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '500px', padding: '0' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '1.5rem 1.5rem 1rem' }}>
              <h2>設定</h2>
              <button className="close-btn" onClick={() => setIsSettingsOpen(false)}>✕</button>
            </div>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 1.5rem' }}>
              <button
                style={{
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderBottom: activeSettingsTab === 'general' ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'none',
                  color: activeSettingsTab === 'general' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeSettingsTab === 'general' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  marginRight: '1rem'
                }}
                onClick={() => setActiveSettingsTab('general')}
              >
                基本設定
              </button>
              <button
                style={{
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderBottom: activeSettingsTab === 'outline' ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'none',
                  color: activeSettingsTab === 'outline' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeSettingsTab === 'outline' ? 'bold' : 'normal',
                  cursor: 'pointer',
                  marginRight: '1rem'
                }}
                onClick={() => setActiveSettingsTab('outline')}
              >
                箱書き
              </button>
              <button
                style={{
                  padding: '0.75rem 1rem',
                  border: 'none',
                  borderBottom: activeSettingsTab === 'editor' ? '2px solid var(--primary)' : '2px solid transparent',
                  background: 'none',
                  color: activeSettingsTab === 'editor' ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: activeSettingsTab === 'editor' ? 'bold' : 'normal',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveSettingsTab('editor')}
              >
                エディター
              </button>
            </div>

            <div className="edit-form" style={{ padding: '1.5rem' }}>
              {activeSettingsTab === 'general' && (
                <>
                  <div className="form-group">
                    <label>テーマ</label>
                    <select 
                      value={settings.theme}
                      onChange={(e) => setSettings({ ...settings, theme: e.target.value as 'system' | 'light' | 'dark' })}
                      style={{ 
                        backgroundColor: 'var(--bg-input)', 
                        color: 'var(--text-main)', 
                        border: '1px solid var(--border-subtle)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        width: '100%'
                      }}
                    >
                      <option value="system">システムに従う</option>
                      <option value="light">ライトモード</option>
                      <option value="dark">ダークモード</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label style={{ margin: 0 }}>自動保存</label>
                      <label className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={settings.autoSave}
                          onChange={(e) => setSettings({ ...settings, autoSave: e.target.checked })}
                        />
                        <span className="slider round"></span>
                      </label>
                    </div>
                    <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                      ファイルが開かれている場合、変更を自動的に上書き保存します（入力停止2秒後）。
                    </small>
                  </div>
                </>
              )}

              {activeSettingsTab === 'outline' && (
                <>
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
                  <div className="form-group">
                    <label>場所入力モード</label>
                    <select 
                      value={settings.placeInputMode}
                      onChange={(e) => setSettings({ ...settings, placeInputMode: e.target.value as 'text' | 'select' })}
                      style={{ 
                        backgroundColor: 'var(--bg-input)', 
                        color: 'var(--text-main)', 
                        border: '1px solid var(--border-subtle)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        width: '100%'
                      }}
                    >
                      <option value="text">テキスト入力（自由入力）</option>
                      <option value="select">リストから選択</option>
                    </select>
                    <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                      リスト選択モードでは、「場所設定」で登録した場所から選択できます。
                    </small>
                  </div>
                </>
              )}

              {activeSettingsTab === 'editor' && (
                <>
                  <div className="form-group">
                    <label>フォント</label>
                    <select 
                      value={settings.editorFontFamily || 'sans-serif'}
                      onChange={(e) => setSettings({ ...settings, editorFontFamily: e.target.value })}
                      style={{ 
                        backgroundColor: 'var(--bg-input)', 
                        color: 'var(--text-main)', 
                        border: '1px solid var(--border-subtle)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        width: '100%'
                      }}
                    >
                      <option value="sans-serif">ゴシック体 (標準)</option>
                      <option value="serif">明朝体</option>
                      <option value="monospace">等幅フォント</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>フォントサイズ (px)</label>
                    <input 
                      type="number" 
                      min="10" 
                      max="72"
                      value={settings.editorFontSize || 16}
                      onChange={(e) => setSettings({ ...settings, editorFontSize: parseInt(e.target.value) || 16 })}
                      style={{ 
                        backgroundColor: 'var(--bg-input)', 
                        color: 'var(--text-main)', 
                        border: '1px solid var(--border-subtle)',
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        width: '100%'
                      }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="primary-btn" onClick={() => setIsSettingsOpen(false)}>閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* About Modal */}
      {isAboutOpen && (
        <div className="modal-overlay" onClick={() => setIsAboutOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '400px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ justifyContent: 'center', borderBottom: 'none', paddingBottom: 0 }}>
              {/* Logo placeholder or Icon could go here */}
            </div>
            <div style={{ padding: '2rem 1rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>箱書きエディタ</h2>
              <p style={{ color: 'var(--text-sub)', marginBottom: '1.5rem' }}>Version {appVersion}</p>
              
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                シンプルで使いやすい<br/>
                小説・脚本構成作成ツール
              </p>
              
              <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                &copy; 2025 Gennosuke Satsuki
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="primary" onClick={() => setIsAboutOpen(false)} style={{ minWidth: '120px' }}>閉じる</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
