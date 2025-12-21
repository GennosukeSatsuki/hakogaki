import { useState } from 'react';
import { useStoryStore } from '../stores/useStoryStore';

export function useDataManagement() {
  // Store Selectors
  const characters = useStoryStore(state => state.characters);
  const setCharacters = useStoryStore(state => state.setCharacters);
  const locations = useStoryStore(state => state.locations);
  const setLocations = useStoryStore(state => state.setLocations);
  const chapters = useStoryStore(state => state.chapters);
  const setChapters = useStoryStore(state => state.setChapters);
  
  const addCharacterFromStore = useStoryStore(state => state.addCharacter);
  const updateCharacter = useStoryStore(state => state.updateCharacter);
  const deleteCharacter = useStoryStore(state => state.deleteCharacter);
  
  const addLocationFromStore = useStoryStore(state => state.addLocation);
  const updateLocation = useStoryStore(state => state.updateLocation);
  const deleteLocation = useStoryStore(state => state.deleteLocation);
  
  const addChapterFromStore = useStoryStore(state => state.addChapter);
  const updateChapter = useStoryStore(state => state.updateChapter);
  const deleteChapter = useStoryStore(state => state.deleteChapter);

  // Local UI State
  const [newCharacterName, setNewCharacterName] = useState('');
  const [newLocationName, setNewLocationName] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');

  // Wrappers
  const addCharacter = () => {
    addCharacterFromStore(newCharacterName);
    setNewCharacterName('');
  };

  const addLocation = () => {
    addLocationFromStore(newLocationName);
    setNewLocationName('');
  };

  const addChapter = () => {
    addChapterFromStore(newChapterTitle);
    setNewChapterTitle('');
  };

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
