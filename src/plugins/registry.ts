export interface PluginMetadata {
  id: string;
  name: { [key: string]: string };
  description: { [key: string]: string };
}

export const AVAILABLE_PLUGINS: PluginMetadata[] = [
  {
    id: 'vertical-writing',
    name: { ja: '縦書き機能', en: 'Vertical Writing' },
    description: { 
      ja: 'エディタおよびプレビューで日本語の縦書き表示を可能にします。', 
      en: 'Enables vertical writing layout in the editor and preview.' 
    }
  },
  {
    id: 'texture-background',
    name: { ja: 'テクスチャ背景', en: 'Texture Background' },
    description: {
      ja: 'アプリ全体の背景に紙や黒板のテクスチャを適用します。',
      en: 'Applies paper or chalkboard textures to the application background.'
    }
  }
];
