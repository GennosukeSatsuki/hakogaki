import { useState, useCallback } from 'react';
import type { Character, Location, Chapter, Scene } from '../utils/exportUtils';

interface UseDataManagementProps {
  setScenes: React.Dispatch<React.SetStateAction<Scene[]>>;
}

export function useDataManagement({ setScenes }: UseDataManagementProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');

  // Character Management
  const addCharacter = useCallback(async () => {
    if (newCharacterName && newCharacterName.trim()) {
      setCharacters(prev => [...prev, { id: crypto.randomUUID(), name: newCharacterName.trim() }]);
      setNewCharacterName('');
    }
  }, [newCharacterName]);

  const updateCharacter = useCallback((id: string, newName: string) => {
    setCharacters(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
    setScenes(prev => prev.map(s => ({
      ...s,
      characters: s.characterIds?.map(cid => {
        const char = characters.find(c => c.id === cid);
        return char?.id === id ? newName : char?.name;
      }).filter(Boolean).join(', ') || s.characters
    })));
  }, [characters, setScenes]);

  const deleteCharacter = useCallback((id: string) => {
    setCharacters(prev => prev.filter(c => c.id !== id));
    setScenes(prev => prev.map(s => ({
      ...s,
      characterIds: s.characterIds?.filter(cid => cid !== id)
    })));
  }, [setScenes]);

  // Location Management
  const addLocation = useCallback(() => {
    if (newLocationName && newLocationName.trim()) {
      setLocations(prev => [...prev, { id: crypto.randomUUID(), name: newLocationName.trim() }]);
      setNewLocationName('');
    }
  }, [newLocationName]);

  const updateLocation = useCallback((id: string, newName: string) => {
    setLocations(prev => prev.map(l => l.id === id ? { ...l, name: newName } : l));
  }, []);

  const deleteLocation = useCallback((id: string) => {
    setLocations(prev => prev.filter(l => l.id !== id));
  }, []);

  // Chapter Management
  const addChapter = useCallback(() => {
    if (newChapterTitle && newChapterTitle.trim()) {
      setChapters(prev => [...prev, { id: crypto.randomUUID(), title: newChapterTitle.trim() }]);
      setNewChapterTitle('');
    }
  }, [newChapterTitle]);

  const updateChapter = useCallback((id: string, updates: Partial<Chapter>) => {
    setChapters(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const deleteChapter = useCallback((id: string) => {
    setChapters(prev => prev.filter(c => c.id !== id));
  }, []);

  return {
    // Characters
    characters,
    setCharacters,
    newCharacterName,
    setNewCharacterName,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    
    // Locations
    locations,
    setLocations,
    newLocationName,
    setNewLocationName,
    addLocation,
    updateLocation,
    deleteLocation,
    
    // Chapters
    chapters,
    setChapters,
    newChapterTitle,
    setNewChapterTitle,
    addChapter,
    updateChapter,
    deleteChapter,
  };
}
