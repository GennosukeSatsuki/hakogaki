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
  deploymentNumber?: number;
}

export interface AppSettings {
  timeInputMode: 'text' | 'datetime';
  placeInputMode: 'text' | 'select';
  autoSave: boolean;
  theme: 'system' | 'light' | 'dark';
  editorFontFamily?: string;
  editorFontSize?: number;
  verticalWriting?: boolean;
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
export const formatTimeForDisplay = (time: string, mode?: 'text' | 'datetime'): string => {
  if (!time) return '-';
  if (mode === 'datetime') {
    try {
      const date = new Date(time);
      return date.toLocaleString('ja-JP', { 
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
 * Executes the export (deploy) process for the project.
 * @param data The story data to export
 * @param baseDir The directory to export to
 * @returns Updated scenes and chapters with deployment info
 */
export const exportProject = async (data: StoryData, baseDir: string): Promise<{ scenes: Scene[]; chapters: Chapter[] }> => {
  const { scenes, chapters = [], characters = [] } = data;
  
  // Simple separator detection (not perfect but works for most cases provided by dialog)
  const isWindows = typeof baseDir === 'string' && baseDir.includes('\\\\');
  const sep = isWindows ? '\\\\' : '/';

  // Track chapters and assign deployment numbers
  const updatedChapters = [...chapters];
  let nextChapterDeploymentNumber = Math.max(...updatedChapters.map(c => c.deploymentNumber || 0), 0) + 1;
  
  // Assign deployment numbers to chapters that don't have them yet
  const chapterDeploymentMap = new Map<string, number>();
  for (const chapter of updatedChapters) {
    if (chapter.deploymentNumber) {
      chapterDeploymentMap.set(chapter.id, chapter.deploymentNumber);
    }
  }
  
  // Track scenes that need deployment info updates
  const updatedScenes = [...scenes];

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    
    // Get current chapter info
    const currentChapterId = scene.chapterId || '';
    const currentChapter = updatedChapters.find(c => c.id === currentChapterId);
    const currentChapterTitle = currentChapter?.title || scene.chapter || '無題の章';
    
    // File number is always current position
    const fileNumberToUse = i + 1;

    // Determine chapter deployment number
    let chapterDeploymentNumber: number;
    let chapterIdToStore: string = currentChapterId;
    
    if (scene.deploymentInfo) {
      // Already deployed - get chapter deployment number
      const deployedChapterId = scene.deploymentInfo.chapterId;
      
      if (deployedChapterId === currentChapterId) {
        // Same chapter - use existing chapter deployment number
        const deployedChapter = updatedChapters.find(c => c.id === deployedChapterId);
        chapterDeploymentNumber = deployedChapter?.deploymentNumber || chapterDeploymentMap.get(deployedChapterId) || 0;
      } else {
        // Chapter changed - get new chapter's deployment number
        if (currentChapterId && chapterDeploymentMap.has(currentChapterId)) {
          chapterDeploymentNumber = chapterDeploymentMap.get(currentChapterId)!;
        } else if (currentChapterId && currentChapter?.deploymentNumber) {
          chapterDeploymentNumber = currentChapter.deploymentNumber;
          chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
        } else {
          // Assign new deployment number to this chapter
          chapterDeploymentNumber = nextChapterDeploymentNumber++;
          if (currentChapterId) {
            chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
            const chapterIndex = updatedChapters.findIndex(c => c.id === currentChapterId);
            if (chapterIndex !== -1) {
              updatedChapters[chapterIndex] = {
                ...updatedChapters[chapterIndex],
                deploymentNumber: chapterDeploymentNumber
              };
            }
          }
        }
      }
    } else {
      // First deployment
      if (currentChapterId && chapterDeploymentMap.has(currentChapterId)) {
        chapterDeploymentNumber = chapterDeploymentMap.get(currentChapterId)!;
      } else if (currentChapterId && currentChapter?.deploymentNumber) {
        chapterDeploymentNumber = currentChapter.deploymentNumber;
        chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
      } else {
        // Assign new deployment number to this chapter
        chapterDeploymentNumber = nextChapterDeploymentNumber++;
        if (currentChapterId) {
          chapterDeploymentMap.set(currentChapterId, chapterDeploymentNumber);
          const chapterIndex = updatedChapters.findIndex(c => c.id === currentChapterId);
          if (chapterIndex !== -1) {
            updatedChapters[chapterIndex] = {
              ...updatedChapters[chapterIndex],
              deploymentNumber: chapterDeploymentNumber
            };
          }
        }
      }
    }

    // Create Chapter Folder Name: XX_ChapterName
    const numStr = chapterDeploymentNumber.toString().padStart(2, '0');
    const safeChapterTitle = currentChapterTitle.trim();
    const folderName = `${numStr}_${safeChapterTitle}`;
    const folderPath = `${baseDir}${sep}${folderName}`;

    // Create Directory
    await mkdir(folderPath, { recursive: true });

    // Create File Name: (FileNum)_(SceneName).txt
    const fileNum = fileNumberToUse.toString().padStart(3, '0');
    const safeTitle = scene.title.trim() || '無題のシーン';
    const fileName = `${fileNum}_${safeTitle}.txt`;
    const filePath = `${folderPath}${sep}${fileName}`;
    
    // Check if chapter changed (need to move file)
    if (scene.deploymentInfo && scene.deploymentInfo.chapterId !== chapterIdToStore) {
      // Chapter changed - need to move file from old chapter folder to new chapter folder
      const oldChapterId = scene.deploymentInfo.chapterId;
      const oldChapter = updatedChapters.find(c => c.id === oldChapterId);
      const oldChapterDeploymentNumber = oldChapter?.deploymentNumber || chapterDeploymentMap.get(oldChapterId) || 0;
      const oldChapterTitle = oldChapter?.title || '無題の章';
      
      const oldNumStr = oldChapterDeploymentNumber.toString().padStart(2, '0');
      const oldFolderName = `${oldNumStr}_${oldChapterTitle.trim()}`;
      const oldFolderPath = `${baseDir}${sep}${oldFolderName}`;
      const oldFileName = scene.deploymentInfo.lastFileName || fileName;
      const oldFilePath = `${oldFolderPath}${sep}${oldFileName}`;
      
      // Read old file content if it exists
      if (await exists(oldFilePath)) {
        console.log(`Moving file from ${oldFolderName}/${oldFileName} to ${folderName}/${fileName}`);
        try {
          const fileContent = await readTextFile(oldFilePath);
          // Write to new location
          await writeTextFile(filePath, fileContent);
          // Delete old file
          await remove(oldFilePath);
        } catch (e) {
          console.error(`Failed to move file: ${e}`);
          // Continue anyway - will create new file if move fails
        }
      }
    }
    // Check if file needs to be renamed (title changed, same chapter)
    else if (scene.deploymentInfo && scene.deploymentInfo.lastFileName && scene.deploymentInfo.lastFileName !== fileName) {
      const oldFilePath = `${folderPath}${sep}${scene.deploymentInfo.lastFileName}`;
      if (await exists(oldFilePath)) {
        console.log(`Renaming: ${scene.deploymentInfo.lastFileName} -> ${fileName}`);
        try {
          await rename(oldFilePath, filePath);
        } catch (e) {
          console.error(`Failed to rename file: ${e}`);
          // Continue anyway - will create new file if rename fails
        }
      }
    }
    
    // Update deployment info with current file name
    updatedScenes[i] = {
      ...updatedScenes[i],
      deploymentInfo: {
        chapterId: chapterIdToStore,
        lastFileName: fileName
      }
    };
    
    // Create box-writing metadata content with separator note
    const separator = '──────────────(本文執筆完了後に消してください)──────────────';
    const boxContent = `**場所** ${scene.place}
**時間** ${formatTimeForDisplay(scene.time, scene.timeMode)}

**登場人物** ${scene.characterIds?.map(id => characters.find(c => c.id === id)?.name).filter(Boolean).join(', ') || scene.characters}

**狙いと役割** ${scene.aim}

**詳細なあらすじ** ${scene.summary}

**裏設定** ${scene.note}

${separator}

`;

    let shouldWrite = true;
    let finalContent = boxContent;

    // If file already exists, read existing content and compare
    if (await exists(filePath)) {
      try {
        const existingContent = await readTextFile(filePath);
        
        // Find separator line (check for both old and new format)
        const oldSeparator = '────────────────────────────────';
        const newSeparatorPattern = /──────────────\(本文執筆完了後に消してください\)──────────────/;
        
        let separatorIndex = existingContent.search(newSeparatorPattern);
        let foundSeparator = separator;
        
        if (separatorIndex === -1) {
          // Try old separator format
          separatorIndex = existingContent.indexOf(oldSeparator);
          if (separatorIndex !== -1) {
            foundSeparator = oldSeparator;
          }
        }
        
        if (separatorIndex !== -1) {
          // Separator found - file is still in draft mode
          // Extract existing box-writing section (before separator)
          const existingBoxContent = existingContent.substring(0, separatorIndex + foundSeparator.length + 1);
          
          // Extract body content (after separator)
          const bodyContent = existingContent.substring(separatorIndex).replace(new RegExp(`^${foundSeparator.replace(/[()]/g, '\\\\$&')}\\s*\\n+`), '');
          
          // Compare box-writing sections (normalize separator for comparison)
          const normalizedExisting = existingBoxContent.replace(oldSeparator, separator).trim();
          const normalizedNew = boxContent.trim();
          
          if (normalizedExisting === normalizedNew) {
            shouldWrite = false;
          } else {
            finalContent = boxContent + bodyContent;
          }
        } else {
          // No separator found - writing is complete, skip updating
          shouldWrite = false;
        }
      } catch (e) {
        console.error(`Error reading existing file: ${fileName}`, e);
        // If read fails, write new content
      }
    }

    // Only write if needed
    if (shouldWrite) {
      await writeTextFile(filePath, finalContent);
    }
  }

  return { scenes: updatedScenes, chapters: updatedChapters };
};
