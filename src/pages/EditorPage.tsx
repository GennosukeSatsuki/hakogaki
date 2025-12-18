import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import TiptapEditor from '../components/TiptapEditor';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState(''); // 変更検知用

  const [loading, setLoading] = useState(true);
  const [fileExists, setFileExists] = useState(false);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    loadSceneFile();
  }, [id]);

  // 自動保存の監視
  useEffect(() => {
    if (!settings?.autoSave || !filePath || loading || !fileExists) return;

    // 前回のタイマーをクリア
    const timer = setTimeout(async () => {
      // 変更がある場合のみ保存
      if (content !== originalContent) {
        try {
          await writeTextFile(filePath, content);
          setOriginalContent(content);
          // 文字数カウントの更新などは自動保存時には通知不要だが、
          // 本当はここでトースト通知などを出すと親切（今は実装しない）
          console.log('Auto saved');
        } catch (e) {
          console.error('Auto save failed:', e);
        }
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [content, settings, filePath, loading, fileExists, originalContent]); // originalContentも含めることで、保存直後のループを防ぐ（content===originalContentになるため）

  const loadSceneFile = async () => {
    try {
      setLoading(true);
      setError(null);

      // ローカルストレージからシーンデータを取得
      const savedData = localStorage.getItem('storyData');
      if (!savedData) {
        setError('プロジェクトデータが見つかりません。箱書き一覧に戻ってファイルを開いてください。');
        setLoading(false);
        return;
      }

      const data = JSON.parse(savedData);
      
      // 設定を読み込む
      if (data.settings) {
        setSettings(data.settings);
      }

      const sceneData = data.scenes?.find((s: any) => s.id === id);
      
      if (!sceneData) {
        setError('シーンが見つかりません。');
        setLoading(false);
        return;
      }

      // シーン情報を保存
      setScene(sceneData);

      // 書き出しパスとdeploymentInfoをチェック
      if (!data.lastDeployPath || !sceneData.deploymentInfo) {
        setFileExists(false);
        setLoading(false);
        return;
      }

      // ファイルパスを構築
      const chapter = data.chapters?.find((c: any) => c.id === sceneData.deploymentInfo.chapterId);
      if (!chapter || chapter.deploymentNumber === undefined) {
        setFileExists(false);
        setLoading(false);
        return;
      }

      const chapterFolder = `${String(chapter.deploymentNumber).padStart(2, '0')}_${chapter.title}`;
      const fileName = sceneData.deploymentInfo.lastFileName;
      const path = `${data.lastDeployPath}/${chapterFolder}/${fileName}`;
      
      setFilePath(path);

      // ファイルが存在するかチェック
      const fileExistsCheck = await exists(path);
      setFileExists(fileExistsCheck);

      if (fileExistsCheck) {
        // ファイルを読み込む
        const fileContent = await readTextFile(path);
        setContent(fileContent);
        setOriginalContent(fileContent); // 元の内容を保存

        // 進捗管理（今日の開始文字数を取得・設定）
        const today = new Date().toDateString();
        const currentBodyCount = getBodyCharCount(fileContent);
        
        // 文字数をキャッシュ（総文字数計算用）
        localStorage.setItem(`sceneCharCount_${id}`, currentBodyCount.toString());

        // プロジェクトデータ内の進捗情報を更新
        if (!data.dailyProgress || data.dailyProgress.date !== today) {
          data.dailyProgress = { date: today, startingCounts: {} };
        }
        
        if (data.dailyProgress.startingCounts[id!] === undefined) {
          data.dailyProgress.startingCounts[id!] = currentBodyCount;
        }
        
        // localStorageを更新（SceneListPageと共有するため）
        localStorage.setItem('storyData', JSON.stringify(data));
      }

      setLoading(false);
    } catch (e) {
      console.error('ファイル読み込みエラー:', e);
      setError(`ファイルの読み込みに失敗しました: ${e}`);
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!filePath) {
      alert('ファイルパスが設定されていません');
      return;
    }

    try {
      await writeTextFile(filePath, content);
      setOriginalContent(content); // 保存後、元の内容を更新
      
      // 文字数をキャッシュ（総文字数計算用）
      const charCount = getBodyCharCount(content);
      localStorage.setItem(`sceneCharCount_${id}`, charCount.toString());
      
      alert('保存しました');
    } catch (e) {
      alert(`保存に失敗しました: ${e}`);
    }
  };

  const handleMarkComplete = async () => {
    if (!filePath) {
      alert('ファイルパスが設定されていません');
      return;
    }

    // 確認ダイアログ（Tauriのaskを使用）
    const { ask } = await import('@tauri-apps/plugin-dialog');
    const confirmed = await ask(
      '箱書き部分（セパレーターより上）が削除され、本文のみになります。\nこの操作は元に戻せません。',
      { 
        title: '執筆完了', 
        kind: 'warning',
        okLabel: '執筆完了',
        cancelLabel: 'キャンセル'
      }
    );
    
    if (!confirmed) return;

    try {
      const separator = '──────────────(本文執筆完了後に消してください)──────────────';
      const oldSeparator = '────────────────────────────────';
      
      // 新しいセパレーターを探す
      let separatorIndex = content.indexOf(separator);

      
      // 見つからない場合は古いセパレーターを探す
      if (separatorIndex === -1) {
        separatorIndex = content.indexOf(oldSeparator);
      }
      
      if (separatorIndex === -1) {
        alert('セパレーターが見つかりません。既に執筆完了済みの可能性があります。');
        return;
      }

      // セパレーター以降の本文のみを抽出
      const afterSeparator = content.substring(separatorIndex);
      const bodyStart = afterSeparator.indexOf('\n');
      if (bodyStart === -1) {
        alert('本文が見つかりません。');
        return;
      }
      
      const bodyText = afterSeparator.substring(bodyStart + 1);
      
      // 本文のみに更新
      setContent(bodyText);
      
      // ファイルに保存
      await writeTextFile(filePath, bodyText);
      setOriginalContent(bodyText);
      
      // 文字数をキャッシュ（trim()しない - 空白も含めて正確にカウント）
      const charCount = bodyText.length;
      localStorage.setItem(`sceneCharCount_${id}`, charCount.toString());
      
      // 進捗管理: startCharCountは更新しない（進捗を維持）
      // 箱書き部分が削除されても、今日書いた文字数はそのまま維持される
      
      alert('執筆完了としてマークしました。箱書き部分を削除しました。');
    } catch (e) {
      alert(`処理に失敗しました: ${e}`);
    }
  };

  // セパレーター以降の本文のみの文字数をカウント
  const getBodyCharCount = (text: string): number => {
    const separator = '──────────────(本文執筆完了後に消してください)──────────────';
    const oldSeparator = '────────────────────────────────';
    
    // 新しいセパレーターを探す
    let separatorIndex = text.indexOf(separator);
    
    // 見つからない場合は古いセパレーターを探す
    if (separatorIndex === -1) {
      separatorIndex = text.indexOf(oldSeparator);
    }
    
    // セパレーターが見つかった場合、その後の本文のみカウント
    if (separatorIndex !== -1) {
      const afterSeparator = text.substring(separatorIndex);
      // セパレーター行自体を除外（次の改行以降）
      const bodyStart = afterSeparator.indexOf('\n');
      if (bodyStart !== -1) {
        const bodyText = afterSeparator.substring(bodyStart + 1);
        return bodyText.length;
      }
    }
    
    // セパレーターが見つからない場合は全体をカウント
    return text.length;
  };

  // 全シーンの今日の進捗を計算
  const getTotalTodayProgress = (): number => {
    const savedData = localStorage.getItem('storyData');
    if (!savedData) return 0;
    
    const data = JSON.parse(savedData);
    if (!data.dailyProgress) return 0;
    
    const today = new Date().toDateString();
    if (data.dailyProgress.date !== today) return 0;
    
    const startingCounts = data.dailyProgress.startingCounts || {};
    let totalProgress = 0;
    
    data.scenes?.forEach((s: any) => {
      const startingCount = startingCounts[s.id];
      if (startingCount !== undefined) {
        if (s.id === id) {
          // 現在編集中のシーンは最新の文字数を使用
          totalProgress += getBodyCharCount(content) - startingCount;
        } else {
          // 他のシーンはキャッシュされた文字数を使用
          const cached = localStorage.getItem(`sceneCharCount_${s.id}`);
          if (cached) {
            totalProgress += parseInt(cached, 10) - startingCount;
          }
        }
      }
    });
    return totalProgress;
  };

  // 箱書き一覧に戻る処理
  const handleBackToList = async () => {
    // 変更があるかチェック
    const hasChanges = content !== originalContent;
    
    if (hasChanges) {
      const shouldSave = confirm('変更が保存されていません。保存してから戻りますか？\n\n「OK」: 変更を保存\n「Cancel」: 変更を破棄');
      
      if (shouldSave) {
        // 保存してから戻る
        if (!filePath) {
          alert('ファイルパスが設定されていません');
          return;
        }
        
        try {
          await writeTextFile(filePath, content);
          navigate('/');
        } catch (e) {
          alert(`保存に失敗しました: ${e}`);
        }
      } else {
        // 保存せずに戻る
        navigate('/');
      }
    } else {
      // 変更がない場合はそのまま戻る
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '18px'
      }}>
        読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        padding: '20px'
      }}>
        <div style={{ 
          color: '#d32f2f', 
          fontSize: '18px',
          marginBottom: '20px',
          textAlign: 'center'
        }}>
          {error}
        </div>
        <button 
          onClick={handleBackToList}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          箱書き一覧に戻る
        </button>
      </div>
    );
  }

  if (!fileExists) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        padding: '40px',
        textAlign: 'center'
      }}>
        <h2 style={{ marginBottom: '20px' }}>📝 書き出しが必要です</h2>
        <p style={{ 
          fontSize: '16px', 
          lineHeight: '1.8',
          marginBottom: '30px',
          maxWidth: '500px',
          color: 'var(--text-sub)'
        }}>
          このシーンはまだ書き出されていません。<br />
          箱書き一覧に戻って、「ファイル」メニューから<br />
          「書き出し...」を実行してください。
        </p>
        <button 
          onClick={handleBackToList}
          style={{
            padding: '12px 30px',
            fontSize: '16px',
            backgroundColor: 'var(--primary)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          箱書き一覧に戻る
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h1>シーン{scene?.sceneNo} {scene?.title || '(無題)'}</h1>
        <button 
          onClick={handleBackToList}
          style={{
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          箱書き一覧に戻る
        </button>
      </div>
      
      <TiptapEditor 
        content={content} 
        onChange={setContent} 
        settings={settings}
        placeholder="ここに本文を書いてください..."
      />
      
      <div style={{ 
        marginTop: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ fontSize: '1.1em', fontWeight: 'bold' }}>
            総文字数: {(() => {
              // 全シーンの文字数を計算
              const savedData = localStorage.getItem('storyData');
              if (!savedData) return 0;
              const data = JSON.parse(savedData);
              
              let totalChars = 0;
              data.scenes?.forEach((s: any) => {
                if (s.deploymentInfo?.lastFileName && data.lastDeployPath) {
                  const chapter = data.chapters?.find((c: any) => c.id === s.deploymentInfo.chapterId);
                  if (chapter?.deploymentNumber !== undefined) {


                    
                    // localStorageから各シーンの文字数を取得（キャッシュ）
                    const cacheKey = `sceneCharCount_${s.id}`;
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                      totalChars += parseInt(cached, 10);
                    }
                  }
                }
              });
              
              // 現在編集中のシーンの文字数を加算（キャッシュより最新）
              const currentSceneCache = localStorage.getItem(`sceneCharCount_${id}`);
              if (currentSceneCache) {
                totalChars -= parseInt(currentSceneCache, 10);
              }
              totalChars += getBodyCharCount(content);
              
              return totalChars.toLocaleString();
            })()}字
          </div>
          <div>
            このシーン: {getBodyCharCount(content).toLocaleString()}字
            <span style={{ marginLeft: '1rem', color: 'var(--text-sub)', fontSize: '0.9em' }}>
              （今日の執筆: {getTotalTodayProgress() >= 0 ? '+' : ''}{getTotalTodayProgress().toLocaleString()}字）
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleMarkComplete}
            style={{
              padding: '10px 30px',
              fontSize: '16px',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            ✓ 執筆完了
          </button>
          <button 
            onClick={handleSave}
            style={{
              padding: '10px 30px',
              fontSize: '16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
