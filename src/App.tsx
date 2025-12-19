import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import SceneListPage from './pages/SceneListPage';
import EditorPage from './pages/EditorPage';
import { exportProject } from './utils/exportUtils';

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
            let data = JSON.parse(savedData);
            
            // 1. 書き出し（自動追跡保存）
            if (data.lastDeployPath) {
              const { scenes, chapters } = await exportProject(data, data.lastDeployPath);
              // 書き出し結果（deploymentInfoなど）を反映
              data = { ...data, scenes, chapters };
            }

            // 2. JSONプロジェクトファイルの保存
            if (data.currentFilePath) {
              await writeTextFile(data.currentFilePath, JSON.stringify(data, null, 2));
              console.log('Project JSON saved on close');
            }
            
            // 最新の状態をlocalStorageにも保存（次回の起動用）
            localStorage.setItem('storyData', JSON.stringify(data));
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
