import { writeTextFile, mkdir, readTextFile, exists, rename, remove } from '@tauri-apps/plugin-fs';

// Deployment tracking information
export interface DeploymentInfo {
  chapterId: string;      // 書き出し時の章ID
  lastFileName: string;   // 前回書き出し時のファイル名（リネーム検出用）
}

// Type definition for a Scene
export interface Scene {
  id: string;
  sceneNo: number;
  title: string;
  chapter: string;
  chapterId?: string;
  characters: string;
  characterIds?: string[];
  time: string;
  timeMode?: 'text' | 'datetime';
  place: string;
  aim: string;
  summary: string;
  note: string;
  isCompleted?: boolean;
  deploymentInfo?: DeploymentInfo;
}

export interface Character {
  id: string;
  name: string;
}

export interface Location {
  id: string;
  name: string;
}

export interface Chapter {
  id: string;
  title: string;
  color?: string;
  deploymentNumber?: number;
}

export interface AppSettings {
  language: 'en' | 'ja';
  timeInputMode: 'text' | 'datetime';
  placeInputMode: 'text' | 'select';
  autoSave: boolean;
  theme: 'system' | 'light' | 'dark';
  editorFontFamily?: string;
  editorFontSize?: number;
  sceneFontSize?: number;
  verticalWriting?: boolean;
  useTextureBackground?: boolean;
  enabledPlugins?: string[];
}


export interface DailyProgress {
  date: string;
  startingCounts: Record<string, number>;
}

export interface StoryData {
  scenes: Scene[];
  characters: Character[];
  locations?: Location[];
  chapters?: Chapter[];
  settings?: AppSettings;
  lastDeployPath?: string | null;
  nextSceneNo?: number;
  dailyProgress?: DailyProgress;
  currentFilePath?: string | null;
}

// Helper function to format datetime for display
export const formatTimeForDisplay = (time: string, mode?: 'text' | 'datetime', lang: 'en' | 'ja' = 'ja'): string => {
  if (!time) return '-';
  if (mode === 'datetime') {
    try {
      const date = new Date(time);
      return date.toLocaleString(lang === 'ja' ? 'ja-JP' : 'en-US', { 
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

/**
 * Gets the localized separator string
 */
export const getSeparator = (lang: 'en' | 'ja' = 'ja'): string => {
  const note = lang === 'en' 
    ? 'Delete after writing is complete' 
    : '本文執筆完了後に消してください';
  return `──────────────(${note})──────────────`;
};

/**
 * Legacy separators for backward compatibility
 */
export const LEGACY_SEPARATORS = [
  '────────────────────────────────',
];

/**
 * Splits file content into metadata (box writing) and body text
 */
export const splitContent = (content: string): { metadata: string; body: string; hasSeparator: boolean; separatorLine: string; separatorIndex?: number } => {
  // Specifically look for HakoGraph separator with parentheses content
  // We look for characters commonly used in the separator
  const pattern = /^[─ー-]{5,}\(.*\)[─ー-]{5,}$/m;
  let match = content.match(pattern);
  
  // Fallback to the generic dashed line if not found
  if (!match) {
    match = content.match(/^[─ー-]{10,}.*$/m);
  }
  
  if (!match) {
    return { metadata: '', body: content, hasSeparator: false, separatorLine: '' };
  }

  const index = match.index!;
  const line = match[0];
  
  const metadata = content.substring(0, index + line.length).trim();
  const body = content.substring(index + line.length).trim();

  return { metadata, body, hasSeparator: true, separatorLine: line, separatorIndex: index };
};

/**
 * Formats the scene metadata section (Box content)
 */
export const formatSceneMetadata = (scene: Scene, characters: Character[], lang: 'en' | 'ja' = 'ja'): string => {
  const i18n = {
    ja: {
      place: '場所',
      time: '時間',
      characters: '登場人物',
      aim: '狙いと役割',
      summary: '詳細なあらすじ',
      note: '裏設定',
    },
    en: {
      place: 'Place',
      time: 'Time',
      characters: 'Characters',
      aim: 'Aim & Role',
      summary: 'Summary',
      note: 'Note',
    }
  }[lang];

  const charNames = scene.characterIds?.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters;

  return `**${i18n.place}** ${scene.place}
**${i18n.time}** ${formatTimeForDisplay(scene.time, scene.timeMode, lang)}

**${i18n.characters}** ${charNames}

**${i18n.aim}** ${scene.aim}

**${i18n.summary}** ${scene.summary}

**${i18n.note}** ${scene.note}

${getSeparator(lang)}

`;
};

/**
 * Resolves the absolute path for a scene file
 */
export const getSceneFilePath = (scene: Scene, chapters: Chapter[], baseDir: string): string | null => {
  if (!scene.deploymentInfo?.chapterId || !scene.deploymentInfo?.lastFileName) return null;

  const chapter = chapters.find(c => c.id === scene.deploymentInfo?.chapterId);
  if (!chapter || chapter.deploymentNumber === undefined) return null;

  // Simple path separator detection
  const isWindows = baseDir.includes('\\\\') || (baseDir.length > 2 && baseDir[1] === ':');
  const sep = isWindows ? '\\\\' : '/';

  const safeChapterTitle = chapter.title.trim();
  const chapterFolder = `${String(chapter.deploymentNumber).padStart(2, '0')}_${safeChapterTitle}`;
  const fileName = scene.deploymentInfo.lastFileName;
  
  // Ensure we don't have double separators
  const cleanBaseDir = baseDir.endsWith('/') || baseDir.endsWith('\\\\') ? baseDir.slice(0, -1) : baseDir;

  return `${cleanBaseDir}${sep}${chapterFolder}${sep}${fileName}`;
};


/**
 * Executes the export (deploy) process for the project.
 * @param data The story data to export
 * @param baseDir The directory to export to
 * @returns Updated scenes and chapters with deployment info
 */
export const exportProject = async (data: StoryData, baseDir: string): Promise<{ scenes: Scene[]; chapters: Chapter[] }> => {
  const { scenes, chapters = [], characters = [] } = data;
  const lang = data.settings?.language || 'ja';
  
  // Simple separator detection
  const isWindows = baseDir.includes('\\\\') || (baseDir.length > 2 && baseDir[1] === ':');
  const sep = isWindows ? '\\\\' : '/';

  // Track chapters and assign deployment numbers
  const updatedChapters = [...chapters];
  let nextChapterDeploymentNumber = Math.max(...updatedChapters.map(c => c.deploymentNumber || 0), 0) + 1;
  
  const chapterDeploymentMap = new Map<string, number>();
  for (const chapter of updatedChapters) {
    if (chapter.deploymentNumber) {
      chapterDeploymentMap.set(chapter.id, chapter.deploymentNumber);
    }
  }
  
  const updatedScenes = [...scenes];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    
    // Get current chapter info
    const currentChapterId = scene.chapterId || '';
    const currentChapter = updatedChapters.find(c => c.id === currentChapterId);
    
    // File number is current position
    const fileNumberToUse = i + 1;

    // Determine chapter deployment number
    let chapterDeploymentNumber: number;
    let chapterIdToStore: string = currentChapterId;
    
    if (scene.deploymentInfo && scene.deploymentInfo.chapterId === currentChapterId) {
        // Already deployed in same chapter
        chapterDeploymentNumber = currentChapter?.deploymentNumber || chapterDeploymentMap.get(currentChapterId) || 0;
        
        // If it was 0 (not assigned), assign now
        if (chapterDeploymentNumber === 0 && currentChapterId) {
            chapterDeploymentNumber = nextChapterDeploymentNumber++;
            chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
            const idx = updatedChapters.findIndex(c => c.id === currentChapterId);
            if (idx !== -1) updatedChapters[idx] = { ...updatedChapters[idx], deploymentNumber: chapterDeploymentNumber };
        }
    } else {
        // New or changed chapter
        if (currentChapterId && chapterDeploymentMap.has(currentChapterId)) {
            chapterDeploymentNumber = chapterDeploymentMap.get(currentChapterId)!;
        } else if (currentChapterId) {
            chapterDeploymentNumber = nextChapterDeploymentNumber++;
            chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
            const idx = updatedChapters.findIndex(c => c.id === currentChapterId);
            if (idx !== -1) updatedChapters[idx] = { ...updatedChapters[idx], deploymentNumber: chapterDeploymentNumber };
        } else {
            chapterDeploymentNumber = 0;
        }
    }

    // Path generation
    const numStr = chapterDeploymentNumber.toString().padStart(2, '0');
    const safeChapterTitle = (currentChapter?.title || scene.chapter || (lang === 'ja' ? '無題の章' : 'Untitled Chapter')).trim();
    const folderName = `${numStr}_${safeChapterTitle}`;
    const folderPath = `${baseDir.replace(/[/\\]+$/, '')}${sep}${folderName}`;

    await mkdir(folderPath, { recursive: true });

    const fileNum = fileNumberToUse.toString().padStart(3, '0');
    const safeTitle = scene.title.trim() || (lang === 'ja' ? '無題のシーン' : 'Untitled Scene');
    const fileName = `${fileNum}_${safeTitle}.txt`;
    const filePath = `${folderPath}${sep}${fileName}`;
    
    // Rename/Move logic
    if (scene.deploymentInfo) {
      const oldPath = getSceneFilePath(scene, updatedChapters, baseDir);
      if (oldPath && oldPath !== filePath && await exists(oldPath)) {
        console.log(`Moving/Renaming from ${oldPath} to ${filePath}`);
        try {
          if (scene.deploymentInfo.chapterId !== currentChapterId) {
            // Chapter change
            const content = await readTextFile(oldPath);
            await writeTextFile(filePath, content);
            await remove(oldPath);
          } else {
            // Only title change
            await rename(oldPath, filePath);
          }
        } catch (e) {
          console.error(`File operation failed: ${e}`);
        }
      }
    }
    
    // Update deployment info
    updatedScenes[i] = {
      ...updatedScenes[i],
      deploymentInfo: {
        chapterId: chapterIdToStore,
        lastFileName: fileName
      }
    };
    
    // Prepare content
    const boxContent = formatSceneMetadata(updatedScenes[i], characters, lang);
    let finalContent = boxContent;
    let shouldWrite = true;

    if (await exists(filePath)) {
      try {
        const existingContent = await readTextFile(filePath);
        const { body, hasSeparator, separatorLine, separatorIndex } = splitContent(existingContent);
        
        if (!hasSeparator) {
          updatedScenes[i].isCompleted = true;
          shouldWrite = false;
        } else {
          updatedScenes[i].isCompleted = false;
          
          // Re-normalize for comparison
          const currentSeparator = getSeparator(lang);
          // separatorIndex is guaranteed to be present if hasSeparator is true
          const normalizedExistingMetadata = existingContent.substring(0, (separatorIndex ?? 0) + separatorLine.length)
                                              .replace(separatorLine, currentSeparator).trim();
          
          if (normalizedExistingMetadata === boxContent.trim()) {
            shouldWrite = false;
          } else {
            // boxContent already ends with \n\n, so we can just append body
            finalContent = boxContent + (body || '');
          }
        }
      } catch (e) {
        console.error(`Error reading existing file: ${fileName}`, e);
      }
    }

    if (shouldWrite) {
      await writeTextFile(filePath, finalContent);
    }
  }

  return { scenes: updatedScenes, chapters: updatedChapters };
};
