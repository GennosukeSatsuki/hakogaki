import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeTextFile, mkdir } from '@tauri-apps/plugin-fs';
import SceneListPage from './pages/SceneListPage';
import EditorPage from './pages/EditorPage';

// Helper function to format datetime for display
const formatTimeForDisplay = (time: string, mode?: 'text' | 'datetime'): string => {
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

export default function App() {
  useEffect(() => {
    const appWindow = getCurrentWindow();
    let unlistenFn: (() => void) | null = null;

    const setupCloseHandler = async () => {
      unlistenFn = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();

        try {
          const savedData = localStorage.getItem('storyData');
          if (savedData) {
            const data = JSON.parse(savedData);
            // 1. JSONプロジェクトファイルの保存
            if (data.currentFilePath) {
              await writeTextFile(data.currentFilePath, JSON.stringify(data, null, 2));
              console.log('Project JSON saved on close');
            }
            
            // 2. 書き出し（デプロイ）
            if (data.lastDeployPath && data.scenes) {
              const { lastDeployPath, scenes, chapters } = data;
              const isWindows = typeof lastDeployPath === 'string' && lastDeployPath.includes('\\\\');
              const sep = isWindows ? '\\\\' : '/';

              for (let i = 0; i < scenes.length; i++) {
                const scene = scenes[i];
                const currentChapterId = scene.chapterId || '';
                const currentChapter = chapters?.find((c: any) => c.id === currentChapterId);
                const currentChapterTitle = currentChapter?.title || scene.chapter || '無題の章';
                
                const chapterDeploymentNumber = currentChapter?.deploymentNumber || 1;
                const numStr = chapterDeploymentNumber.toString().padStart(2, '0');
                const safeChapterTitle = currentChapterTitle.trim();
                const folderName = `${numStr}_${safeChapterTitle}`;
                const folderPath = `${lastDeployPath}${sep}${folderName}`;
                
                await mkdir(folderPath, { recursive: true });
                
                const fileNum = (i + 1).toString().padStart(3, '0');
                const safeTitle = scene.title.trim() || '無題のシーン';
                const fileName = `${fileNum}_${safeTitle}.txt`;
                const filePath = `${folderPath}${sep}${fileName}`;
                
                const content = `タイトル: ${scene.title}
章: ${currentChapterTitle}
登場人物: ${scene.characters}
時間: ${formatTimeForDisplay(scene.time, scene.timeMode)}
場所: ${scene.place}
狙いと役割: ${scene.aim}

【あらすじ】
${scene.summary}

【裏設定・メモ】
${scene.note}`;
                
                await writeTextFile(filePath, content);
              }
            }
          }
        } catch (e) {
          console.error('Auto-save on close failed:', e);
        }

        if (unlistenFn) unlistenFn();
        await appWindow.close();
      });
    };

    setupCloseHandler();

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SceneListPage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  );
}
