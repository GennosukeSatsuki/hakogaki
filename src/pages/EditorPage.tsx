import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n/config';
import TiptapEditor from '../components/TiptapEditor';
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Scene } from '../utils/exportUtils';
import { useStoryStore } from '../stores/useStoryStore';

export default function EditorPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Store Access
  const settings = useStoryStore(state => state.settings);
  const scenes = useStoryStore(state => state.scenes);
  const chapters = useStoryStore(state => state.chapters);
  const lastDeployPath = useStoryStore(state => state.lastDeployPath);
  const dailyProgress = useStoryStore(state => state.dailyProgress);
  const setDailyProgress = useStoryStore(state => state.setDailyProgress);
  const updateSceneInStore = useStoryStore(state => state.updateScene);

  // Local States for Editor
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fileExists, setFileExists] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentScene, setCurrentScene] = useState<Scene | null>(null);

  // 文字数計算ヘルパー
  const getBodyCharCount = useCallback((text: string): number => {
    const separator = '──────────────(本文執筆完了後に消してください)──────────────';
    const oldSeparator = '────────────────────────────────';
    let separatorIndex = text.indexOf(separator);
    if (separatorIndex === -1) separatorIndex = text.indexOf(oldSeparator);
    
    if (separatorIndex !== -1) {
      const afterSeparator = text.substring(separatorIndex);
      const bodyStart = afterSeparator.indexOf('\n');
      if (bodyStart !== -1) {
        return afterSeparator.substring(bodyStart + 1).length;
      }
    }
    return text.length;
  }, []);

  // 今日の総進捗計算
  const totalTodayProgress = useMemo(() => {
    if (!dailyProgress) return 0;
    const today = new Date().toDateString();
    if (dailyProgress.date !== today) return 0;
    
    const startingCounts = dailyProgress.startingCounts || {};
    let progress = 0;
    
    scenes.forEach(s => {
      const startingCount = startingCounts[s.id];
      if (startingCount !== undefined) {
        if (s.id === id) {
          progress += getBodyCharCount(content) - startingCount;
        } else {
          const cached = localStorage.getItem(`sceneCharCount_${s.id}`);
          if (cached) {
            progress += parseInt(cached, 10) - startingCount;
          }
        }
      }
    });
    return progress;
  }, [dailyProgress, scenes, id, content, getBodyCharCount]);

  // 全文字数計算
  const totalChars = useMemo(() => {
    let count = 0;
    scenes.forEach(s => {
      if (s.id === id) {
        count += getBodyCharCount(content);
      } else {
        const cached = localStorage.getItem(`sceneCharCount_${s.id}`);
        if (cached) count += parseInt(cached, 10);
      }
    });
    return count;
  }, [scenes, id, content, getBodyCharCount]);

  // ファイル読み込み
  const loadSceneFile = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);

      const sceneData = scenes.find(s => s.id === id);
      if (!sceneData) {
        setError(t('messages.sceneNotFound'));
        setLoading(false);
        return;
      }
      setCurrentScene(sceneData);

      // 言語設定同期
      if (settings.language && i18n.language !== settings.language) {
        i18n.changeLanguage(settings.language);
      }

      if (!lastDeployPath || !sceneData.deploymentInfo) {
        setFileExists(false);
        setLoading(false);
        return;
      }

      const chapter = chapters.find(c => c.id === sceneData.deploymentInfo?.chapterId);
      if (!chapter || chapter.deploymentNumber === undefined) {
        setFileExists(false);
        setLoading(false);
        return;
      }

      const chapterFolder = `${String(chapter.deploymentNumber).padStart(2, '0')}_${chapter.title}`;
      const fileName = sceneData.deploymentInfo.lastFileName;
      const path = `${lastDeployPath}/${chapterFolder}/${fileName}`;
      setFilePath(path);

      const existsCheck = await exists(path);
      setFileExists(existsCheck);

      if (existsCheck) {
        const fileContent = await readTextFile(path);
        setContent(fileContent);
        setOriginalContent(fileContent);

        const currentCount = getBodyCharCount(fileContent);
        localStorage.setItem(`sceneCharCount_${id}`, currentCount.toString());

        // 進捗管理の更新
        const today = new Date().toDateString();
        if (!dailyProgress || dailyProgress.date !== today) {
          setDailyProgress({ date: today, startingCounts: { [id]: currentCount } });
        } else if (dailyProgress.startingCounts[id] === undefined) {
          setDailyProgress({
            ...dailyProgress,
            startingCounts: { ...dailyProgress.startingCounts, [id]: currentCount }
          });
        }

        // 完了状態の同期
        const isComp = !fileContent.includes('──────────────');
        if (sceneData.isCompleted !== isComp) {
          updateSceneInStore(id, { isCompleted: isComp });
        }
      }
      setLoading(false);
    } catch (e) {
      console.error('Load error:', e);
      setError(`${t('messages.fileLoadFailed')}: ${e}`);
      setLoading(false);
    }
  }, [id, scenes, chapters, lastDeployPath, settings.language, dailyProgress, setDailyProgress, updateSceneInStore, getBodyCharCount, t]);

  useEffect(() => {
    loadSceneFile();
  }, [id, loadSceneFile]);

  // 自動保存
  useEffect(() => {
    if (!settings.autoSave || !filePath || loading || !fileExists || content === originalContent) return;

    const timer = setTimeout(async () => {
      try {
        await writeTextFile(filePath, content);
        setOriginalContent(content);
        console.log('Auto saved');
      } catch (e) {
        console.error('Auto save failed:', e);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, settings.autoSave, filePath, loading, fileExists, originalContent]);

  const handleSave = async () => {
    if (!filePath) {
      alert(t('messages.filePathNotSet'));
      return;
    }
    try {
      await writeTextFile(filePath, content);
      setOriginalContent(content);
      
      const charCount = getBodyCharCount(content);
      localStorage.setItem(`sceneCharCount_${id}`, charCount.toString());

      const isComp = !content.includes('──────────────');
      updateSceneInStore(id!, { isCompleted: isComp });
      
      alert(t('messages.saved'));
    } catch (e) {
      alert(`${t('messages.saveFailed')}: ${e}`);
    }
  };

  const handleMarkComplete = async () => {
    if (!filePath || !id) return;

    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(t('messages.markCompleteConfirm'), { 
      title: t('messages.writingComplete'), 
      kind: 'warning',
      okLabel: t('messages.writingComplete'),
      cancelLabel: t('common.cancel')
    });
    
    if (!confirmed) return;

    try {
      const separator = '──────────────(本文執筆完了後に消してください)──────────────';
      const oldSeparator = '────────────────────────────────';
      let idx = content.indexOf(separator);
      if (idx === -1) idx = content.indexOf(oldSeparator);
      
      if (idx === -1) {
        alert(t('messages.separatorNotFound'));
        return;
      }

      const bodyText = content.substring(idx).split('\n').slice(1).join('\n');
      setContent(bodyText);
      await writeTextFile(filePath, bodyText);
      setOriginalContent(bodyText);
      
      localStorage.setItem(`sceneCharCount_${id}`, bodyText.length.toString());
      updateSceneInStore(id, { isCompleted: true });
      
      alert(t('messages.markedComplete'));
    } catch (e) {
      alert(`${t('messages.processFailed')}: ${e}`);
    }
  };

  const handleBackToList = async () => {
    if (content !== originalContent) {
      const shouldSave = confirm(t('messages.unsavedChangesConfirm'));
      if (shouldSave) {
        if (!filePath) {
          alert(t('messages.filePathNotSet'));
          return;
        }
        try {
          await writeTextFile(filePath, content);
          navigate('/');
        } catch (e) {
          alert(`${t('messages.saveFailed')}: ${e}`);
        }
        return;
      }
    }
    navigate('/');
  };

  if (loading) return <div className="loading-screen">{t('common.loading')}</div>;

  if (error) {
    return (
      <div className="error-screen">
        <div className="error-message">{error}</div>
        <button className="secondary-btn" onClick={handleBackToList}>{t('messages.backToList')}</button>
      </div>
    );
  }

  if (!fileExists) {
    return (
      <div className="export-needed-screen">
        <h2>📝 {t('messages.exportNeeded')}</h2>
        <p>{t('messages.exportNeededDesc').split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p>
        <button className="primary-btn" onClick={handleBackToList}>{t('messages.backToList')}</button>
      </div>
    );
  }

  return (
    <div className="editor-page-container">
      <header className="editor-header">
        <h1>{t('scene.sceneNo', { no: currentScene?.sceneNo })} {currentScene?.title || t('scene.noTitle')}</h1>
        <button className="secondary-btn" onClick={handleBackToList}>{t('messages.backToList')}</button>
      </header>
      
      <main className="editor-main">
        <TiptapEditor 
          content={content} 
          onChange={setContent} 
          settings={settings}
          placeholder={t('editor.placeholder')}
        />
      </main>
      
      <footer className="editor-footer">
        <div className="stats-container">
          <div className="total-stats">
            {t('editor.totalChars')}: <strong>{totalChars.toLocaleString()}</strong>{t('editor.charUnit')}
          </div>
          <div className="scene-stats">
            {t('editor.thisScene')}: {getBodyCharCount(content).toLocaleString()}{t('editor.charUnit')}
            <span className="daily-progress">
              （{t('editor.todayProgress')}: {totalTodayProgress >= 0 ? '+' : ''}{totalTodayProgress.toLocaleString()}{t('editor.charUnit')}）
            </span>
          </div>
        </div>
        <div className="editor-actions">
          <button className="complete-btn" onClick={handleMarkComplete}>✓ {t('messages.writingComplete')}</button>
          <button className="save-btn" onClick={handleSave}>{t('common.save')}</button>
        </div>
      </footer>
    </div>
  );
}
