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
} from '@dnd-kit/sortable';
import { save, open, ask } from '@tauri-apps/plugin-dialog';

import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { getVersion } from '@tauri-apps/api/app';
import { documentDir } from '@tauri-apps/api/path';

import '../App.css';

import { 
  Scene, 
  Character, 
  Chapter, 
  AppSettings, 
  DailyProgress, 
  StoryData, 
  exportProject
} from '../utils/exportUtils';



import { SortableSceneCard, SceneCardOverlay } from '../components/SceneCard';
import { 
  CharacterManagementModal, 
  LocationManagementModal, 
  ChapterManagementModal 
} from '../components/modals/ManagementModals';
import { SettingsModal, AboutModal } from '../components/modals/SettingsModal';
import { EditSceneModal } from '../components/modals/EditSceneModal';

// Custom Hooks (to be integrated)
import { useSceneManagement } from '../hooks/useSceneManagement';
import { useDataManagement } from '../hooks/useDataManagement';
// import { useDragAndDrop } from '../hooks/useDragAndDrop';
// import { useTimeInput } from '../hooks/useTimeInput';

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


export default function SceneListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  const [lastDeployPath, setLastDeployPath] = useState<string | null>(null);
  const [nextSceneNo, setNextSceneNo] = useState(1);

  const [isCharacterMenuOpen, setIsCharacterMenuOpen] = useState(false);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ language: 'ja', timeInputMode: 'text', placeInputMode: 'text', autoSave: false, theme: 'system', editorFontFamily: 'sans-serif', editorFontSize: 16, verticalWriting: false });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'outline' | 'editor'>('general');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress | null>(null);
  
  // Data Management Hook
  const {
    characters,
    setCharacters,
    newCharacterName,
    setNewCharacterName,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    locations,
    setLocations,
    newLocationName,
    setNewLocationName,
    addLocation,
    updateLocation,
    deleteLocation,
    chapters,
    setChapters,
    newChapterTitle,
    setNewChapterTitle,
    addChapter,
    updateChapter,
    deleteChapter,
  } = useDataManagement({ setScenes });

  // Scene Management Hook
  const sceneManagement = useSceneManagement({
    scenes,
    setScenes,
    characters,
    chapters,
    nextSceneNo,
    setNextSceneNo,
    settings,
  });

  const {
    editingId,
    editForm,
    setEditForm,
    startEditing,
    saveScene,
    deleteScene: deleteSceneFromHook,
    handleInputChange,
    toggleCharacterInScene,
  } = sceneManagement;
  
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

  // Wrapper for addScene from hook
  const handleAddScene = () => {
    sceneManagement.addScene(startEditing);
  };

  // Wrapper for deleteScene with confirmation
  const deleteScene = async (id: string) => {
    await deleteSceneFromHook(id, async () => {
      return await ask(t('messages.deleteConfirm'), { title: t('common.confirm'), kind: 'warning' });
    });
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
<EditSceneModal
  isOpen={!!(editingId && editForm)}
  editingId={editingId}
  editForm={editForm}
  chapters={chapters}
  locations={locations}
  characters={characters}
  settings={settings}
  onClose={() => saveScene(true)}
  onSave={closeAfterSave => saveScene(closeAfterSave)}
  onDelete={deleteScene}
  onChange={setEditForm}
  toggleCharacterInScene={toggleCharacterInScene}
  handleInputChange={handleInputChange}
  handleTimeButtonPress={handleTimeButtonPress}
  handleTimeButtonRelease={handleTimeButtonRelease}
  onOpenCharacterMenu={() => setIsCharacterMenuOpen(true)}
/>

      <CharacterManagementModal
        isOpen={isCharacterMenuOpen}
        characters={characters}
        newCharacterName={newCharacterName}
        onClose={() => setIsCharacterMenuOpen(false)}
        onUpdate={updateCharacter}
        onDelete={deleteCharacter}
        onAdd={addCharacter}
        onNewNameChange={setNewCharacterName}
      />

      <LocationManagementModal
        isOpen={isLocationMenuOpen}
        locations={locations}
        newLocationName={newLocationName}
        onClose={() => setIsLocationMenuOpen(false)}
        onUpdate={updateLocation}
        onDelete={deleteLocation}
        onAdd={addLocation}
        onNewNameChange={setNewLocationName}
      />

      <ChapterManagementModal
        isOpen={isChapterMenuOpen}
        chapters={chapters}
        newChapterTitle={newChapterTitle}
        onClose={() => setIsChapterMenuOpen(false)}
        onUpdate={updateChapter}
        onDelete={deleteChapter}
        onAdd={addChapter}
        onNewTitleChange={setNewChapterTitle}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        systemFonts={systemFonts}
        activeTab={activeSettingsTab}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={setSettings}
        onTabChange={setActiveSettingsTab}
      />

      <AboutModal
        isOpen={isAboutOpen}
        appVersion={appVersion}
        onClose={() => setIsAboutOpen(false)}
      />

    </div>
  );
}
