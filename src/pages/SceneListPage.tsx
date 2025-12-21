import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import { DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { ask } from '@tauri-apps/plugin-dialog';

import { getVersion } from '@tauri-apps/api/app';

import styles from './SceneListPage.module.css';



import { SortableSceneCard, SceneCardOverlay } from '../components/SceneCard';
import { 
  CharacterManagementModal, 
  LocationManagementModal, 
  ChapterManagementModal 
} from '../components/modals/ManagementModals';
import { SettingsModal, AboutModal } from '../components/modals/SettingsModal';
import { EditSceneModal } from '../components/modals/EditSceneModal';

// Custom Hooks
import { useSceneManagement } from '../hooks/useSceneManagement';
import { useDataManagement } from '../hooks/useDataManagement';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { useTimeInput } from '../hooks/useTimeInput';
import { useFileManagement } from '../hooks/useFileManagement';
import { useStoryStore } from '../stores/useStoryStore';

export default function SceneListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Store States
  const scenes = useStoryStore(state => state.scenes);
  const setScenes = useStoryStore(state => state.setScenes);
  const nextSceneNo = useStoryStore(state => state.nextSceneNo);
  const setNextSceneNo = useStoryStore(state => state.setNextSceneNo);
  const settings = useStoryStore(state => state.settings);
  const setSettings = useStoryStore(state => state.setSettings);

  // UI States
  const [isCharacterMenuOpen, setIsCharacterMenuOpen] = useState(false);
  const [isLocationMenuOpen, setIsLocationMenuOpen] = useState(false);
  const [isChapterMenuOpen, setIsChapterMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'outline' | 'editor' | 'plugins'>('general');
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  
  // Data Management Hook
  const {
    characters,
    newCharacterName,
    setNewCharacterName,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    locations,
    newLocationName,
    setNewLocationName,
    addLocation,
    updateLocation,
    deleteLocation,
    chapters,
    newChapterTitle,
    setNewChapterTitle,
    addChapter,
    updateChapter,
    deleteChapter,
  } = useDataManagement();

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

  // Drag and Drop Hook
  const {
    sensors,
    activeScene,
    handleDragStart,
    handleDragEnd,
  } = useDragAndDrop({ scenes, setScenes });

  // Time Input Hook
  const {
    handleTimeButtonPress,
    handleTimeButtonRelease,
  } = useTimeInput();

  // File Management Hook
  const {
    handleSaveAs,
    handleOverwriteSave,
    handleNewProject,
    handleLoadFile,
    handleDeploy,
  } = useFileManagement({
    setIsFileMenuOpen,
  });

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

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.menuContainer}>
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
            <div className={styles.dropdownMenu}>
              <button className={styles.dropdownItem} onClick={handleNewProject}>
                {t('menu.newProject')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className={styles.dropdownItem} onClick={() => handleOverwriteSave(false)}>
                {t('menu.saveProject')}
              </button>
              <button className={styles.dropdownItem} onClick={handleSaveAs}>
                {t('menu.saveAs')}
              </button>
              <button className={styles.dropdownItem} onClick={handleLoadFile}>
                {t('menu.openProject')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className={styles.dropdownItem} onClick={handleDeploy}>
                {t('menu.export')}
              </button>
              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className={styles.dropdownItem} onClick={() => { setIsFileMenuOpen(false); setIsSettingsOpen(true); }}>
                {t('menu.settings')}
              </button>

              <div style={{ height: 1, backgroundColor: 'var(--border-subtle)', margin: '0.25rem 0' }} />
              <button className={styles.dropdownItem} onClick={() => { setIsFileMenuOpen(false); setIsAboutOpen(true); }}>
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
        
        <div className={styles.headerLeft}>
          <h1 className={styles.headerTitle}>HakoGraph</h1>
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

        <div className={styles.actions}>
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

      <main className={`${styles.main} ${settings.useTextureBackground ? styles.textured : ''}`}>
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
            <div className={styles.sceneGrid}>
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
