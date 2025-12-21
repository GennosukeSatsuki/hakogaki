import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Scene, Character, Location, Chapter, AppSettings, DailyProgress } from '../utils/exportUtils';
import { INITIAL_SCENE } from '../utils/constants';

interface StoryState {
  scenes: Scene[];
  characters: Character[];
  locations: Location[];
  chapters: Chapter[];
  settings: AppSettings;
  nextSceneNo: number;
  dailyProgress: DailyProgress | null;
  currentFilePath: string | null;
  lastDeployPath: string | null;

  setScenes: (scenes: Scene[] | ((prev: Scene[]) => Scene[])) => void;
  setCharacters: (characters: Character[] | ((prev: Character[]) => Character[])) => void;
  setLocations: (locations: Location[] | ((prev: Location[]) => Location[])) => void;
  setChapters: (chapters: Chapter[] | ((prev: Chapter[]) => Chapter[])) => void;
  setSettings: (settings: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  setNextSceneNo: (no: number | ((prev: number) => number)) => void;
  setDailyProgress: (progress: DailyProgress | null | ((prev: DailyProgress | null) => DailyProgress | null)) => void;
  setCurrentFilePath: (path: string | null) => void;
  setLastDeployPath: (path: string | null) => void;
  
  // Specific Actions
  addCharacter: (name: string) => void;
  updateCharacter: (id: string, name: string) => void;
  deleteCharacter: (id: string) => void;
  
  addLocation: (name: string) => void;
  updateLocation: (id: string, name: string) => void;
  deleteLocation: (id: string) => void;

  addChapter: (title: string) => void;
  updateChapter: (id: string, updates: Partial<Chapter>) => void;
  deleteChapter: (id: string) => void;
  
  updateScene: (id: string, updates: Partial<Scene>) => void;
  resetProject: () => void;
}

const DEFAULT_SETTINGS: AppSettings = { 
  language: 'ja', 
  timeInputMode: 'text', 
  placeInputMode: 'text', 
  autoSave: false, 
  theme: 'system', 
  editorFontFamily: 'sans-serif', 
  editorFontSize: 16, 
  verticalWriting: false,
  enabledPlugins: ['vertical-writing', 'texture-background'] 
};

export const useStoryStore = create<StoryState>()(
  persist(
    (set) => ({
      scenes: [INITIAL_SCENE],
      characters: [{ id: '1', name: '主人公' }, { id: '2', name: 'ヒロイン' }],
      locations: [{ id: '1', name: '通学路' }],
      chapters: [{ id: '1', title: '第1章' }],
      settings: DEFAULT_SETTINGS,
      nextSceneNo: 2,
      dailyProgress: null,
      currentFilePath: null,
      lastDeployPath: null,

      setScenes: (input) => set((state) => ({ scenes: typeof input === 'function' ? input(state.scenes) : input })),
      setCharacters: (input) => set((state) => ({ characters: typeof input === 'function' ? input(state.characters) : input })),
      setLocations: (input) => set((state) => ({ locations: typeof input === 'function' ? input(state.locations) : input })),
      setChapters: (input) => set((state) => ({ chapters: typeof input === 'function' ? input(state.chapters) : input })),
      setSettings: (input) => set((state) => ({ settings: typeof input === 'function' ? input(state.settings) : input })),
      setNextSceneNo: (input) => set((state) => ({ nextSceneNo: typeof input === 'function' ? input(state.nextSceneNo) : input })),
      setDailyProgress: (input) => set((state) => ({ dailyProgress: typeof input === 'function' ? input(state.dailyProgress) : input })),
      setCurrentFilePath: (path) => set({ currentFilePath: path }),
      setLastDeployPath: (path) => set({ lastDeployPath: path }),

      addCharacter: (name) => {
        if (name && name.trim()) {
           set((state) => ({ characters: [...state.characters, { id: crypto.randomUUID(), name: name.trim() }] }));
        }
      },
      updateCharacter: (id, newName) => {
         set((state) => {
           const newChars = state.characters.map(c => c.id === id ? { ...c, name: newName } : c);
           const newScenes = state.scenes.map(s => ({
              ...s,
              characters: s.characterIds?.map(cid => {
                const char = newChars.find(c => c.id === cid);
                return char?.id === id ? newName : char?.name;
              }).filter(Boolean).join(', ') || s.characters
           }));
           return { characters: newChars, scenes: newScenes };
         });
      },
      deleteCharacter: (id) => {
         set((state) => ({
           characters: state.characters.filter(c => c.id !== id),
           scenes: state.scenes.map(s => ({
             ...s,
             characterIds: s.characterIds?.filter(cid => cid !== id)
           }))
         }));
      },

      addLocation: (name) => {
        if (name && name.trim()) {
          set(state => ({ locations: [...state.locations, { id: crypto.randomUUID(), name: name.trim() }] }));
        }
      },
      updateLocation: (id, newName) => set(state => ({ 
        locations: state.locations.map(l => l.id === id ? { ...l, name: newName } : l) 
      })),
      deleteLocation: (id) => set(state => ({ 
         locations: state.locations.filter(l => l.id !== id) 
      })),

      addChapter: (title) => {
        if (title && title.trim()) {
           set(state => ({ chapters: [...state.chapters, { id: crypto.randomUUID(), title: title.trim() }] }));
        }
      },
      updateChapter: (id, updates) => set(state => ({
         chapters: state.chapters.map(c => c.id === id ? { ...c, ...updates } : c)
      })),
      deleteChapter: (id) => set(state => ({
         chapters: state.chapters.filter(c => c.id !== id)
      })),

      updateScene: (id, updates) => set(state => ({
         scenes: state.scenes.map(s => s.id === id ? { ...s, ...updates } : s)
      })),

      resetProject: () => set({
        scenes: [INITIAL_SCENE],
        characters: [{ id: '1', name: '主人公' }, { id: '2', name: 'ヒロイン' }],
        locations: [{ id: '1', name: '通学路' }],
        chapters: [{ id: '1', title: '第1章' }],
        // settings: DEFAULT_SETTINGS, // Keep settings?
        nextSceneNo: 2,
        dailyProgress: null,
        currentFilePath: null,
        lastDeployPath: null,
      }),
    }),
    {
      name: 'storyData',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
