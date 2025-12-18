import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { useEffect } from 'react';
import { AppSettings } from '../pages/SceneListPage';

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  settings: AppSettings;
  placeholder?: string; // Kept in interface but unused for now
}

const textToHtml = (text: string) => {
  if (!text) return '';
  return text
    .split('\n')
    .map(p => `<p>${p}</p>`)
    .join('');
};

const TiptapEditor = ({ content, onChange, settings }: TiptapEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
    ],
    content: textToHtml(content),
    onUpdate: ({ editor }) => {
      onChange(editor.getText({ blockSeparator: '\n' }));
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-2xl mx-auto focus:outline-none',
        style: 'height: 100%; outline: none;',
      },
      handleKeyDown: (view, event) => {
        if (settings?.verticalWriting) {
          const { key } = event;
          const { state } = view;
          const { selection, doc } = state;
          
          if (key === 'ArrowUp') {
            event.preventDefault();
            const newPos = Math.max(0, selection.from - 1);
            const tr = state.tr.setSelection(TextSelection.near(doc.resolve(newPos)));
            view.dispatch(tr.scrollIntoView());
            return true;
          } else if (key === 'ArrowDown') {
            event.preventDefault();
            const newPos = Math.min(doc.content.size, selection.to + 1);
            const tr = state.tr.setSelection(TextSelection.near(doc.resolve(newPos)));
            view.dispatch(tr.scrollIntoView());
            return true;
          } else if (key === 'ArrowLeft') {
            const domSel = window.getSelection();
            if (domSel) {
               domSel.modify('move', 'forward', 'line');
               // Sync PM selection to DOM selection and scroll
               setTimeout(() => {
                 const { state, dispatch } = view;
                 // ProseMirror usually syncs automatically on the next tick, 
                 // but we force a scroll here if needed.
                 dispatch(state.tr.scrollIntoView());
               }, 0);
               event.preventDefault();
               return true;
            }
          } else if (key === 'ArrowRight') {
            const domSel = window.getSelection();
            if (domSel) {
               domSel.modify('move', 'backward', 'line');
               // Sync PM selection to DOM selection and scroll
               setTimeout(() => {
                 const { state, dispatch } = view;
                 dispatch(state.tr.scrollIntoView());
               }, 0);
               event.preventDefault();
               return true;
            }
          }
        }
        return false;
      }
    },
  });

  // Sync content updates
  useEffect(() => {
    if (editor && content !== editor.getText({ blockSeparator: '\n' })) {
       if (!editor.isFocused) {
          editor.commands.setContent(textToHtml(content));
       }
    }
  }, [content, editor]);

  // Apply vertical writing styles dynamically
  useEffect(() => {
    if (editor && editor.options.element) {
      const element = editor.options.element as HTMLElement;
      if (settings?.verticalWriting) {
        element.style.writingMode = 'vertical-rl';
        element.style.textOrientation = 'mixed';
        element.style.lineBreak = 'strict';
        element.style.overflowWrap = 'break-word';
        element.style.textAlign = 'justify';
        element.style.fontFeatureSettings = '"vpal"';
      } else {
        element.style.writingMode = '';
        element.style.textOrientation = '';
        element.style.lineBreak = '';
        element.style.overflowWrap = '';
        element.style.textAlign = '';
        element.style.fontFeatureSettings = '';
      }
    }
  }, [settings?.verticalWriting, editor]);
  
  // Font styles
  useEffect(() => {
      if (editor && editor.options.element) {
          const element = editor.options.element as HTMLElement;
          element.style.fontFamily = settings.editorFontFamily || 'inherit';
          element.style.fontSize = settings.editorFontSize ? `${settings.editorFontSize}px` : '16px';
          element.style.lineHeight = '1.8';
      }
  }, [settings.editorFontFamily, settings.editorFontSize, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div 
        style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden', // Let editor scroll
            backgroundColor: 'var(--bg-input)',
            color: 'var(--text-main)',
            border: '1px solid #ccc',
            borderRadius: '4px',
        }}
    >
      <EditorContent 
        editor={editor} 
        style={{ 
            flex: 1, 
            overflow: 'auto', 
            padding: '20px',
            height: '100%',
        }} 
      />
    </div>
  );
};

export default TiptapEditor;
