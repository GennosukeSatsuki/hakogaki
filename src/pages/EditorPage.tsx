import { useParams, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

export default function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState(''); // 変更検知用
  const [startCharCount, setStartCharCount] = useState<number>(0); // 今日の開始時点の文字数
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
        const today = new Date().toDateString(); // YYYY-MM-DD形式でローカル依存だが、日毎の識別に十分
        const progressKey = `dailyProgress_${id}`;
        const savedProgress = localStorage.getItem(progressKey);
        
        const currentBodyCount = getBodyCharCount(fileContent);
        let initialCount = currentBodyCount;

        if (savedProgress) {
          const { date, count } = JSON.parse(savedProgress);
          if (date === today) {
            // 今日すで記録があればそれを使う
            initialCount = count;
          } else {
            // 日付が変わっていれば現在の文字数を開始文字数としてリセット
            localStorage.setItem(progressKey, JSON.stringify({ date: today, count: currentBodyCount }));
          }
        } else {
          // データがない場合は現在の文字数を開始文字数として保存
          localStorage.setItem(progressKey, JSON.stringify({ date: today, count: currentBodyCount }));
        }
        setStartCharCount(initialCount);
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
      alert('保存しました');
    } catch (e) {
      alert(`保存に失敗しました: ${e}`);
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
        const bodyText = afterSeparator.substring(bodyStart + 1).trim();
        return bodyText.length;
      }
    }
    
    // セパレーターが見つからない場合は全体をカウント
    return text.length;
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
      
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="ここに本文を書いてください..."
        style={{
          flex: 1,
          padding: '20px',
          fontSize: settings?.editorFontSize ? `${settings.editorFontSize}px` : '16px',
          lineHeight: '1.8',
          border: '1px solid #ccc',
          borderRadius: '4px',
          resize: 'none',
          fontFamily: settings?.editorFontFamily || 'inherit'
        }}
      />
      
      <div style={{ 
        marginTop: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          本文文字数: {getBodyCharCount(content).toLocaleString()}文字
          <span style={{ marginLeft: '1rem', color: 'var(--text-sub)', fontSize: '0.9em' }}>
            （進捗: {(getBodyCharCount(content) - startCharCount) >= 0 ? '+' : ''}{(getBodyCharCount(content) - startCharCount).toLocaleString()}文字）
          </span>
        </div>
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
  );
}
