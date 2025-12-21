import { useEffect, useCallback } from 'react';
import { save, open, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { documentDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { Scene, Character, Location, Chapter, AppSettings, DailyProgress, StoryData, exportProject } from '../utils/exportUtils';
import { INITIAL_SCENE } from '../utils/constants';

interface UseFileManagementProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  characters: Character[];
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  locations: Location[];
  setLocations: React.Dispatch<React.SetStateAction<Location[]>>;
  chapters: Chapter[];
  setChapters: React.Dispatch<React.SetStateAction<Chapter[]>>;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  nextSceneNo: number;
  setNextSceneNo: React.Dispatch<React.SetStateAction<number>>;
  dailyProgress: DailyProgress | null;
  setDailyProgress: React.Dispatch<React.SetStateAction<DailyProgress | null>>;
  currentFilePath: string | null;
  setCurrentFilePath: React.Dispatch<React.SetStateAction<string | null>>;
  lastDeployPath: string | null;
  setLastDeployPath: React.Dispatch<React.SetStateAction<string | null>>;
  initialized: boolean;
  setInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  setIsFileMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useFileManagement({
  scenes,
  setScenes,
  characters,
  setCharacters,
  locations,
  setLocations,
  chapters,
  setChapters,
  settings,
  setSettings,
  nextSceneNo,
  setNextSceneNo,
  dailyProgress,
  setDailyProgress,
  currentFilePath,
  setCurrentFilePath,
  lastDeployPath,
  setLastDeployPath,
  initialized,
  setInitialized,
  setIsFileMenuOpen,
}: UseFileManagementProps) {
  const { t } = useTranslation();

  const handleSaveAs = useCallback(async () => {
    if (setIsFileMenuOpen) setIsFileMenuOpen(false);
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
  }, [scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo, setCurrentFilePath, setIsFileMenuOpen, t]);

  const handleOverwriteSave = useCallback(async (silent = false) => {
    if (setIsFileMenuOpen) setIsFileMenuOpen(false);
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
  }, [currentFilePath, handleSaveAs, scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo, dailyProgress, setIsFileMenuOpen, t]);

  const handleNewProject = useCallback(async () => {
    if (setIsFileMenuOpen) setIsFileMenuOpen(false);
    
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
  }, [setScenes, setCharacters, setLocations, setChapters, setCurrentFilePath, setLastDeployPath, setNextSceneNo, setDailyProgress, setIsFileMenuOpen, t]);

  const handleLoadFile = useCallback(async () => {
    if (setIsFileMenuOpen) setIsFileMenuOpen(false);
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
          // Migrate on load if needed
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
        }
      }
    } catch (e) {
      console.error(e);
      alert(t('messages.loadFailed') + ': ' + e);
    }
  }, [setScenes, setCharacters, setChapters, setLocations, setSettings, setLastDeployPath, setNextSceneNo, setDailyProgress, setCurrentFilePath, setIsFileMenuOpen, t]);

  const handleDeploy = useCallback(async () => {
    if (setIsFileMenuOpen) setIsFileMenuOpen(false);
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
          await mkdir(baseDir, { recursive: true });
        } catch (e) {
             console.error('Failed to get document dir:', e);
             alert(t('messages.deployFailed') + ': ' + e);
             return;
        }
      } else if (lastDeployPath) {
        baseDir = lastDeployPath;
      } else {
        const selected = await open({
          directory: true,
          multiple: false,
          title: t('menu.selectDeployFolder')
        });
        
        if (!selected) return;
        baseDir = selected as string;
      }

      const storyData: StoryData = {
        scenes,
        characters,
        locations,
        chapters,
        settings,
        lastDeployPath: baseDir,
        nextSceneNo,
        dailyProgress: dailyProgress ?? undefined,
        currentFilePath
      };

      const { scenes: updatedScenes, chapters: updatedChapters } = await exportProject(storyData, baseDir);
      
      setLastDeployPath(baseDir);
      setScenes(updatedScenes);
      setChapters(updatedChapters);

      alert(t('messages.deploySuccess') + `\n${baseDir}`);
    } catch (e) {
      console.error(e);
      alert(t('messages.deployFailed') + ': ' + e);
    }
  }, [scenes, characters, locations, chapters, settings, currentFilePath, lastDeployPath, setLastDeployPath, setScenes, setChapters, setIsFileMenuOpen, t, nextSceneNo, dailyProgress]);

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
            setDailyProgress(null);
          }
        }
      } catch (e) {
        console.error('Failed to load from localStorage:', e);
      }
    } else {
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
    
    setInitialized(true);
  }, []); 

  // Auto Save Effect
  useEffect(() => {
    if (!settings.autoSave || !currentFilePath) return;

    const timer = setTimeout(() => {
      handleOverwriteSave(true);
    }, 2000); 

    return () => clearTimeout(timer);
  }, [scenes, characters, locations, chapters, settings, currentFilePath]);

  // Save to localStorage for editor access
  useEffect(() => {
    if (!initialized) {
      return;
    }
    
    if (scenes.length === 0) {
      return;
    }

    const storyData: StoryData = {
      scenes,
      characters,
      locations,
      chapters,
      settings,
      lastDeployPath: lastDeployPath ?? undefined,
      nextSceneNo,
      dailyProgress: dailyProgress ?? undefined
    };
    
    localStorage.setItem('storyData', JSON.stringify(storyData));
  }, [scenes, characters, locations, chapters, settings, lastDeployPath, nextSceneNo, dailyProgress, initialized]);

  return {
    handleSaveAs,
    handleOverwriteSave,
    handleNewProject,
    handleLoadFile,
    handleDeploy,
  };
}
