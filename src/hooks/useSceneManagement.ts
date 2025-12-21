import { useState, useCallback } from 'react';
import type { Scene, Chapter, Character, AppSettings } from '../utils/exportUtils';

interface UseSceneManagementProps {
  scenes: Scene[];
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
  characters: Character[];
  chapters: Chapter[];
  nextSceneNo: number;
  setNextSceneNo: React.Dispatch<React.SetStateAction<number>>;
  settings: AppSettings;
}

export function useSceneManagement({
  scenes,
  setScenes,
  characters,
  chapters,
  nextSceneNo,
  setNextSceneNo,
  settings,
}: UseSceneManagementProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Scene>>({});

  const startEditing = useCallback((scene: Scene) => {
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
  }, [settings.timeInputMode]);

  const saveScene = useCallback((shouldClose: boolean = true) => {
    if (!editForm || !editForm.id) return;
    setScenes(prev => prev.map(s => s.id === editForm.id ? { ...s, ...editForm } : s));
    if (shouldClose) {
      setEditingId(null);
      setEditForm({});
    }
  }, [editForm, setScenes]);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditForm({});
  }, []);

  const deleteScene = useCallback(async (id: string, confirmFn: () => Promise<boolean>) => {
    const confirmed = await confirmFn();
    if (confirmed) {
      setScenes(scenes.filter(s => s.id !== id));
      if (editingId === id) {
        setEditingId(null);
        setEditForm({});
      }
    }
  }, [scenes, setScenes, editingId]);

  const addScene = useCallback((startEditingFn: (scene: Scene) => void) => {
    const newScene: Scene = {
      id: crypto.randomUUID(),
      sceneNo: nextSceneNo,
      title: `シーン ${nextSceneNo}`,
      chapter: chapters[0]?.title || '',
      chapterId: chapters[0]?.id || '',
      characters: '',
      characterIds: [],
      time: '',
      place: '',
      aim: '',
      summary: '',
      note: '',
    };
    setScenes(prev => [...prev, newScene]);
    setNextSceneNo(prev => prev + 1);
    startEditingFn(newScene);
  }, [nextSceneNo, chapters, setScenes, setNextSceneNo]);

  const handleInputChange = useCallback((field: keyof Scene, value: any) => {
    setEditForm(prev => {
      if (!prev.id) return prev;
      return { ...prev, [field]: value };
    });
  }, []);

  const toggleCharacterInScene = useCallback((charId: string) => {
    setEditForm(prev => {
      if (!prev.id) return prev;
      const currentIds = prev.characterIds || [];
      let newIds;
      if (currentIds.includes(charId)) {
        newIds = currentIds.filter(id => id !== charId);
      } else {
        newIds = [...currentIds, charId];
      }
      
      // Also update legacy string for display
      const newString = newIds.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ');
      
      return {
        ...prev,
        characterIds: newIds,
        characters: newString
      };
    });
  }, [characters]);

  return {
    editingId,
    editForm,
    setEditForm,
    startEditing,
    saveScene,
    cancelEdit,
    deleteScene,
    addScene,
    handleInputChange,
    toggleCharacterInScene,
  };
}
