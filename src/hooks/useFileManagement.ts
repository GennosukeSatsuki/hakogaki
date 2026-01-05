import { useEffect, useCallback } from 'react';
import { save, open, ask } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile, mkdir } from '@tauri-apps/plugin-fs';
import { documentDir } from '@tauri-apps/api/path';
import { useTranslation } from 'react-i18next';
import { Scene, Character, Chapter, StoryData, exportProject } from '../utils/exportUtils';
import { useStoryStore } from '../stores/useStoryStore';

export function useFileManagement({
  setIsFileMenuOpen,
}: {
  setIsFileMenuOpen?: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { t } = useTranslation();

  // Store Access
  const scenes = useStoryStore(state => state.scenes);
  const characters = useStoryStore(state => state.characters);
  const locations = useStoryStore(state => state.locations);
  const chapters = useStoryStore(state => state.chapters);
  const settings = useStoryStore(state => state.settings);
  const nextSceneNo = useStoryStore(state => state.nextSceneNo);
  const dailyProgress = useStoryStore(state => state.dailyProgress);
  const currentFilePath = useStoryStore(state => state.currentFilePath);
  const lastDeployPath = useStoryStore(state => state.lastDeployPath);
  
  const setScenes = useStoryStore(state => state.setScenes);
  const setCharacters = useStoryStore(state => state.setCharacters);
  const setLocations = useStoryStore(state => state.setLocations);
  const setChapters = useStoryStore(state => state.setChapters);
  const setSettings = useStoryStore(state => state.setSettings);
  const setNextSceneNo = useStoryStore(state => state.setNextSceneNo);
  const setDailyProgress = useStoryStore(state => state.setDailyProgress);
  const setCurrentFilePath = useStoryStore(state => state.setCurrentFilePath);
  const setLastDeployPath = useStoryStore(state => state.setLastDeployPath);
  const resetProject = useStoryStore(state => state.resetProject);

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
    
    resetProject();
    
    // localStorageはZustand persistが自動更新するので手動クリア不要（resetProjectでデータがリセットされるため）
    // もし完全に消したいなら useStoryStore.persist.clearStorage() だが、
    // resetProjectで初期状態になるのでそれで十分。
  }, [resetProject, setIsFileMenuOpen, t]);

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
        setCurrentFilePath(file);
        const content = await readTextFile(file);
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          // Legacy format migration
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

          newScenes.forEach((s, index) => {
             s.characterIds = [];
             if (s.characters) {
               const names = s.characters.split(/[,、]/).map(c => c.trim());
               names.forEach(n => {
                 const found = newCharacters.find(c => c.name === n);
                 if (found) s.characterIds?.push(found.id);
               });
             }
             if (!s.sceneNo) {
               s.sceneNo = index + 1;
             }
          });

          setScenes(newScenes);
          setCharacters(newCharacters);

          const uniqueChapters = new Set<string>();
          newScenes.forEach(s => {
             if (s.chapter) uniqueChapters.add(s.chapter.trim());
          });
          const newChapters: Chapter[] = Array.from(uniqueChapters).filter(Boolean).map(title => ({
             id: crypto.randomUUID(),
             title
          }));
          
          setScenes(prev => prev.map(s => {
            const found = newChapters.find(c => c.title === s.chapter?.trim());
            return found ? { ...s, chapterId: found.id } : s;
          }));
          
          setChapters(newChapters);
          const maxSceneNo = Math.max(...newScenes.map(s => s.sceneNo || 0), 0);
          setNextSceneNo(maxSceneNo + 1);
          setLastDeployPath(null);

          alert(t('messages.migrationSuccess'));
        } else if (parsed.scenes && parsed.characters) {
          // New format
          let loadedScenes = parsed.scenes as Scene[];
          let loadedChapters = parsed.chapters as Chapter[] || [];

          if (loadedChapters.length === 0) {
              const uniqueChapters = new Set<string>();
              loadedScenes.forEach(s => {
                if (s.chapter) uniqueChapters.add(s.chapter.trim());
              });
              loadedChapters = Array.from(uniqueChapters).filter(Boolean).map(title => ({
                id: crypto.randomUUID(),
                title
              }));
              
              loadedScenes = loadedScenes.map(s => {
                const found = loadedChapters.find(c => c.title === s.chapter?.trim());
                return found ? { ...s, chapterId: found.id } : s;
              });
          }

          loadedScenes.forEach((s, index) => {
            if (!s.sceneNo) {
              s.sceneNo = index + 1;
            }
          });

          setScenes(loadedScenes);
          setCharacters(parsed.characters);
          setChapters(loadedChapters);
          if (parsed.locations) setLocations(parsed.locations);
          if (parsed.settings) setSettings(parsed.settings);
          setLastDeployPath(parsed.lastDeployPath || null);
          
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
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      
      if (isMobile) {
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

  // Auto Save Effect
  useEffect(() => {
    if (!settings.autoSave || !currentFilePath) return;

    const timer = setTimeout(() => {
      handleOverwriteSave(true);
    }, 2000); 

    return () => clearTimeout(timer);
  }, [scenes, characters, locations, chapters, settings, currentFilePath, handleOverwriteSave]);

  return {
    handleSaveAs,
    handleOverwriteSave,
    handleNewProject,
    handleLoadFile,
    handleDeploy,
  };
}
