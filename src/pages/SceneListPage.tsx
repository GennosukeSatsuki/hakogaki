import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
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

import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { getVersion } from '@tauri-apps/api/app';
import { documentDir } from '@tauri-apps/api/path';

import '../App.css';

import { 
  Scene, 
  Character, 
  Location, 
  Chapter, 
  AppSettings, 
  DailyProgress, 
  StoryData, 
  exportProject
} from '../utils/exportUtils';



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
  settings: AppSettings;
  isHiddenFull?: boolean; // For DragOverlay
}

function SortableSceneCard({ scene, chapterList, onClick, onEdit, settings, isHiddenFull }: SortableSceneCardProps) {
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

  // If used in DragOverlay, we want full opacity and 'grabbing' cursor
  if (isHiddenFull) {
    // This prop means we are just rendering for overlay, logic handled by parent mostly
    // But actually, DragOverlay renders a clone.
  }

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

// Plain component for DragOverlay
function SceneCardOverlay({ scene, chapterList, settings }: { scene: Scene, chapterList: Chapter[], settings: AppSettings }) {
  return (
    <SortableSceneCard 
      scene={scene} 
      chapterList={chapterList}
      settings={settings}
      onClick={() => {}} 
      onEdit={() => {}} 
      isHiddenFull={true}
    />
  );
}



export default function SceneListPage() {
  const { t } = useTranslation();
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
  const [settings, setSettings] = useState<AppSettings>({ language: 'ja', timeInputMode: 'text', placeInputMode: 'text', autoSave: false, theme: 'system', editorFontFamily: 'sans-serif', editorFontSize: 16, verticalWriting: false });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'outline' | 'editor'>('general');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  
  // For long-press time picker
  const longPressTimer = useRef<number | null>(null);
  const repeatInterval = useRef<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 10, // Avoid triggering drag on simple clicks
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 6,
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

  const saveScene = (shouldClose: boolean = true) => {
    if (!editForm) return;
    setScenes(prev => prev.map(s => s.id === editForm.id ? editForm : s));
    if (shouldClose) {
      setEditingId(null);
      setEditForm(null);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const deleteScene = async (id: string) => {
  const confirmed = await ask(t('messages.deleteConfirm'), { title: t('common.confirm'), kind: 'warning' });
  if (confirmed) {
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
    const confirmed = await ask(t('messages.deleteConfirm'), { title: t('common.confirm'), kind: 'warning' });
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
    const confirmed = await ask(t('messages.deleteConfirm'), { title: t('common.confirm'), kind: 'warning' });
    if (confirmed) {
      setLocations(locations.filter(l => l.id !== id));
    }
  };

  // Chapter Management Handlers
  const addChapter = async () => {
    if (newChapterTitle && newChapterTitle.trim()) {
      setChapters(prev => [...prev, { 
        id: crypto.randomUUID(), 
        title: newChapterTitle.trim(),
        color: '#5468ff' // Default color
      }]);
      setNewChapterTitle(''); // Clear input
    }
  };

  const updateChapter = (id: string, updates: Partial<Chapter>) => {
    setChapters(chapters.map(c => c.id === id ? { ...c, ...updates } : c));
  };
  
  const deleteChapter = async (id: string) => {
    const confirmed = await ask(`${t('messages.deleteConfirm')}\n${t('messages.deleteChapterDesc')}`, { title: t('common.confirm'), kind: 'warning' });
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
          name: 'HakoGraph Data (JSON)',
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
        alert(t('messages.saved'));
      }
    } catch (e) {
      console.error(e);
      alert(t('messages.saveFailed') + ': ' + e);
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
        nextSceneNo,
        dailyProgress: dailyProgress ?? undefined
      };
      await writeTextFile(currentFilePath, JSON.stringify(data, null, 2));
      if (!silent) alert(t('messages.saved'));
      else console.log('Auto saved');
    } catch (e) {
      console.error(e);
      if (!silent) alert(t('messages.saveFailed') + ': ' + e);
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
        if (data.dailyProgress) {
          const today = new Date().toDateString();
          if (data.dailyProgress.date === today) {
            setDailyProgress(data.dailyProgress);
          } else {
            // 日付が変わっていれば破棄
            setDailyProgress(null);
          }
        }
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
      t('messages.newProjectConfirm'),
      { 
        title: t('menu.newProject'), 
        kind: 'warning',
        okLabel: t('common.add'),
        cancelLabel: t('common.cancel')
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
    setDailyProgress(null);
    
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
          name: 'HakoGraph Data (JSON)',
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

          alert(t('messages.migrationSuccess'));
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

          // 進捗データの処理
          if (parsed.dailyProgress) {
            const today = new Date().toDateString();
            if (parsed.dailyProgress.date === today) {
              setDailyProgress(parsed.dailyProgress);
            } else {
              setDailyProgress(null);
            }
          } else {
            setDailyProgress(null);
          }
          
          alert('読み込みました');
        } else {
          alert('ファイル形式が正しくありません');
        }
      }
    } catch (e) {
      console.error(e);
      alert(t('messages.fileLoadFailed') + ': ' + e);
    }
  };

  // Initial Load & Version Check
  useEffect(() => {
    getVersion().then(v => setAppVersion(v)).catch(() => setAppVersion('Unknown'));
    
    // Fetch system fonts
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string[]>('get_system_fonts')
        .then(fonts => setSystemFonts(fonts))
        .catch(err => console.error('Failed to load system fonts:', err));
    });
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

  // Language Sync
  useEffect(() => {
    if (settings.language && i18n.language !== settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language]);


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
    const storyData: StoryData = {
      scenes,
      characters,
      locations,
      chapters,
      settings,
      lastDeployPath,
      nextSceneNo,
      dailyProgress: dailyProgress ?? undefined,
      currentFilePath
    };
    console.log('Saving to localStorage:', storyData);
    localStorage.setItem('storyData', JSON.stringify(storyData));
  }, [scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo, dailyProgress]);




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
          
          let projectName = 'HakoGraphExport';
          if (currentFilePath) {
            const fileName = currentFilePath.split(/[/\\]/).pop() || '';
            projectName = fileName.replace(/\.json$/i, '') || 'HakoGraphExport';
          }

          baseDir = `${docDir}/${projectName}`;
          // Create the export directory if it doesn't exist
          await mkdir(baseDir, { recursive: true });
          alert(t('messages.mobileExportWarning', { dir: baseDir }));
        } catch (e) {
          console.error('Failed to get document directory:', e);
          alert(t('messages.exportDirFailed'));
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

      const storyData: StoryData = {
        scenes,
        characters,
        locations,
        chapters,
        settings,
        lastDeployPath: baseDir,
        nextSceneNo,
        dailyProgress: dailyProgress ?? undefined
      };

      const { scenes: updatedScenes, chapters: updatedChapters } = await exportProject(storyData, baseDir);

      // Update state with deployment results
      setScenes(updatedScenes);
      setChapters(updatedChapters);

      alert(t('messages.exportSuccess'));

    } catch (e) {
      console.error(e);
      alert(`${t('messages.exportFailed', { error: e })}`);
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
            {t('menu.file')} ▼
          </button>
          {isFileMenuOpen && (
            <div className="dropdown-menu">
              <button className="dropdown-item" onClick={handleNewProject}>
                {t('menu.newProject')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => handleOverwriteSave(false)}>
                {t('menu.saveProject')}
              </button>
              <button className="dropdown-item" onClick={handleSaveAs}>
                {t('menu.saveAs')}
              </button>
              <button className="dropdown-item" onClick={handleLoadFile}>
                {t('menu.openProject')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={handleDeploy}>
                {t('menu.export')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => { setIsFileMenuOpen(false); setIsSettingsOpen(true); }}>
                {t('menu.settings')}
              </button>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className="dropdown-item" onClick={() => { setIsFileMenuOpen(false); setIsAboutOpen(true); }}>
                {t('menu.about')}
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
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--primary)' }}>HakoGraph</h1>
          <button 
            className="secondary-btn" 
            onClick={() => setIsAboutOpen(true)}
            style={{ 
              backgroundColor: 'transparent',
              border: 'none',
              padding: '0.25rem 0.5rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            <span style={{ fontSize: '1.1rem' }}>ⓘ</span>
          </button>
        </div>

        <div className="actions">
          <button 
            className="secondary" 
            onClick={() => setIsCharacterMenuOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            {t('actions.characterSettings')}
          </button>
          <button 
            className="secondary" 
            onClick={() => setIsChapterMenuOpen(true)}
            style={{ marginRight: '0.5rem' }}
          >
            {t('actions.chapterSettings')}
          </button>
          {settings.placeInputMode === 'select' && (
            <button 
              className="secondary" 
              onClick={() => setIsLocationMenuOpen(true)}
              style={{ marginRight: '0.5rem' }}
            >
              {t('actions.locationSettings')}
            </button>
          )}
          <button className="primary" onClick={handleAddScene}>
            {t('actions.addScene')}
          </button>
        </div>
      </header>

      <main className={settings.useTextureBackground ? 'textured' : ''}>
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
                settings={settings}
              />
              ))}
            </div>
          </SortableContext>
          
          <DragOverlay>
            {activeScene ? <SceneCardOverlay scene={activeScene} chapterList={chapters} settings={settings} /> : null}
          </DragOverlay>
        </DndContext>
      </main>

      {/* Edit Modal */}
      {editingId && editForm && (
        <div className="modal-overlay" onClick={() => saveScene(true)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('modals.editScene.title')}</h2>
              <button className="close-btn" onClick={() => saveScene(true)}>✕</button>
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
                      value={editForm.time} 
                      onChange={e => handleInputChange('time', e.target.value)} 
                    />
                  )}
                </div>

                <div className="form-group">
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

              <div className="form-group">
                <label>{t('scene.characters')}</label>
                <div className="character-tags">
                  {characters.map(char => (
                    <button
                      key={char.id}
                      className={`character-tag ${editForm.characterIds?.includes(char.id) ? 'active' : ''}`}
                      onClick={() => toggleCharacterInScene(char.id)}
                    >
                      {char.name}
                    </button>
                  ))}
                  <button className="add-tag-btn" onClick={() => setIsCharacterMenuOpen(true)}>+</button>
                </div>
              </div>

              <div className="form-group">
                <label>{t('scene.aim')}</label>
                <textarea 
                  value={editForm.aim} 
                  onChange={e => handleInputChange('aim', e.target.value)} 
                  rows={2}
                />
              </div>

              <div className="form-group">
                <label>{t('scene.summary')}</label>
                <textarea 
                  value={editForm.summary} 
                  onChange={e => handleInputChange('summary', e.target.value)} 
                  rows={5}
                  placeholder={t('scene.placeholder.summary')}
                />
              </div>

              <div className="form-group">
                <label>{t('scene.note')}</label>
                <textarea 
                  value={editForm.note} 
                  onChange={e => handleInputChange('note', e.target.value)} 
                  rows={3}
                  className="note-input"
                  placeholder={t('scene.placeholder.note')}
                />
              </div>

              <div className="modal-actions">
                <button className="delete-btn" onClick={() => deleteScene(editingId)}>{t('common.delete')}</button>
                <div className="right-actions">
                  <button onClick={() => saveScene(false)}>{t('common.save')}</button>
                  <button className="primary" onClick={() => saveScene(true)}>{t('common.close')}</button>
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
              <h2>{t('modals.character.title')}</h2>
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
                     <button type="button" className="delete-btn" onClick={() => deleteCharacter(char.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>{t('common.delete')}</button>
                   </li>
                 ))}
               </ul>
               <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                 <input 
                   type="text"
                   value={newCharacterName}
                   onChange={(e) => setNewCharacterName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') addCharacter(); }}
                   placeholder={t('modals.character.placeholder')}
                   style={{ flex: 1 }}
                 />
                 <button type="button" onClick={() => addCharacter()}>{t('common.add')}</button>
                 <button type="button" className="primary" onClick={() => setIsCharacterMenuOpen(false)}>{t('common.close')}</button>
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
              <h2>{t('modals.location.title')}</h2>
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
                    <button type="button" className="delete-btn" onClick={() => deleteLocation(loc.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>{t('common.delete')}</button>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addLocation(); }}
                  placeholder={t('modals.location.placeholder')}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => addLocation()}>{t('common.add')}</button>
                <button type="button" className="primary" onClick={() => setIsLocationMenuOpen(false)}>{t('common.close')}</button>
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
              <h2>{t('modals.chapter.title')}</h2>
              <button className="close-btn" onClick={() => setIsChapterMenuOpen(false)}>✕</button>
            </div>
            <div className="edit-form">
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {chapters.map(chap => (
                  <li key={chap.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <input 
                      type="color"
                      value={chap.color || '#5468ff'}
                      onChange={(e) => updateChapter(chap.id, { color: e.target.value })}
                      style={{ width: '40px', height: '30px', padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                    <input 
                      value={chap.title}
                      onChange={(e) => updateChapter(chap.id, { title: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 1 }}
                    />
                    <button type="button" className="delete-btn" onClick={() => deleteChapter(chap.id)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>{t('common.delete')}</button>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input 
                  type="text"
                  value={newChapterTitle}
                  onChange={(e) => setNewChapterTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addChapter(); }}
                  placeholder={t('modals.chapter.placeholder')}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={() => addChapter()}>{t('common.add')}</button>
                <button type="button" className="primary" onClick={() => setIsChapterMenuOpen(false)}>{t('common.close')}</button>
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
              <h2>{t('modals.settings.title')}</h2>
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
                {t('settings.tabs.general')}
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
                {t('settings.tabs.outline')}
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
                {t('settings.tabs.editor')}
              </button>
            </div>

            <div className="edit-form" style={{ padding: '1.5rem' }}>
              {activeSettingsTab === 'general' && (
                <div className="settings-section">
                    <div className="form-group">
                      <label>{t('settings.language')}</label>
                      <select 
                        value={settings.language || 'ja'}
                        onChange={(e) => {
                          const lang = e.target.value as 'en' | 'ja';
                          setSettings(prev => ({ 
                            ...prev, 
                            language: lang,
                            // Opt-out vertical writing for English
                            verticalWriting: lang === 'en' ? false : prev.verticalWriting
                          }));
                        }}
                        style={{ 
                          backgroundColor: 'var(--bg-input)', 
                          color: 'var(--text-main)', 
                          border: '1px solid var(--border-subtle)',
                          padding: '0.5rem',
                          borderRadius: 'var(--radius-sm)',
                          width: '100%'
                        }}
                      >
                        <option value="ja">日本語 (Japanese)</option>
                        <option value="en">English</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>{t('settings.theme.label')}</label>
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
                        <option value="system">{t('settings.theme.system')}</option>
                        <option value="light">{t('settings.theme.light')}</option>
                        <option value="dark">{t('settings.theme.dark')}</option>
                      </select>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ margin: 0 }}>{t('settings.autoSave.label')}</label>
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
                        {t('settings.autoSave.description')}
                      </small>
                    </div>

                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ margin: 0 }}>{t('settings.textureBackground.label')}</label>
                        <label className="toggle-switch">
                          <input 
                            type="checkbox" 
                            checked={settings.useTextureBackground}
                            onChange={(e) => setSettings({ ...settings, useTextureBackground: e.target.checked })}
                          />
                          <span className="slider round"></span>
                        </label>
                      </div>
                      <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                        {t('settings.textureBackground.description')}
                      </small>
                    </div>
                  </div>
              )}

              {activeSettingsTab === 'outline' && (
                <>
                  <div className="form-group">
                    <label>{t('settings.timeInput.label')}</label>
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
                      <option value="text">{t('settings.timeInput.text')}</option>
                      <option value="datetime">{t('settings.timeInput.datetime')}</option>
                    </select>
                    <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                      {t('settings.timeInput.description')}
                    </small>
                  </div>
                  <div className="form-group">
                    <label>{t('settings.placeInput.label')}</label>
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
                      <option value="text">{t('settings.placeInput.text')}</option>
                      <option value="select">{t('settings.placeInput.select')}</option>
                    </select>
                    <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                      {t('settings.placeInput.description')}
                    </small>
                  </div>
                </>
              )}

              {activeSettingsTab === 'editor' && (
                <>
                  <div className="form-group">
                    <label>{t('settings.editor.font')}</label>
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
                      <option value="sans-serif">{t('settings.editor.gothic')}</option>
                      <option value="serif">{t('settings.editor.mincho')}</option>
                      <option value='"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "MS PMincho", "MS Mincho", serif'>游明朝 ({t('settings.editor.verticalWriting')})</option>
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
                  <div className="form-group">
                    <label>{t('settings.editor.fontSize')}</label>
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
                  {settings.language !== 'en' && (
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label style={{ margin: 0 }}>{t('settings.editor.verticalWriting')}</label>
                        <label className="toggle-switch">
                          <input 
                            type="checkbox"
                            checked={settings.verticalWriting || false}
                            onChange={(e) => setSettings({ ...settings, verticalWriting: e.target.checked })}
                          />
                          <span className="slider round"></span>
                        </label>
                      </div>
                      <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                        {t('settings.editor.verticalWritingDesc')}
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <button className="primary-btn" onClick={() => setIsSettingsOpen(false)}>{t('common.close')}</button>
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
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>HakoGraph</h2>
              <p style={{ color: 'var(--text-sub)', marginBottom: '1.5rem' }}>Version {appVersion}</p>
              
              <p style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '2rem' }}>
                {t('modals.about.description').split('\n').map((line, i) => (
                  <span key={i}>{line}<br/></span>
                ))}
              </p>
              
              <p style={{ fontSize: '0.8rem', color: 'var(--text-sub)' }}>
                &copy; 2025 Gennosuke Satsuki
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button className="primary" onClick={() => setIsAboutOpen(false)} style={{ minWidth: '120px' }}>{t('common.close')}</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
