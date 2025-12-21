# HakoGraph

[English](README.md) | [日本語]

Tauri + React + TypeScript で構築された箱書きエディタ「HakoGraph」です。

## v1.0.2 の新機能・改善

- **アーキテクチャの刷新**: 全コンポーネントを CSS Modules へ移行し、スタイルの堅牢性とメンテナンス性を向上させました。
- **データ管理の一元化**: 文字数キャッシュなどを含むすべてのデータを Zustand Store へ集約し、localStorage の直接操作を排除しました。
- **コードベースのクリーンアップ**: グローバル CSS とインラインスタイルを大幅に削減し、モダンで読みやすいコードに整理しました。

Excelで箱書きを作っても、シーンごとのファイルにするのは手動！

こんな地獄からは抜け出したかった。

## 機能

- **シーン管理**: グリッド表示でのシーン一覧確認
![alt text](screenshot/app.png)

- **詳細編集**: モーダルによる詳細項目の編集
![alt text](screenshot/add.png)

- **シーンの入れ替え**: シーンの入れ替えはドラッグアンドドロップで行えます。

- **書き出し**: 書き出しを選んで、フォルダを選ぶとそこに「数字_章タイトルフォルダ」が作られ、シーン名のついたテキストファイルが作成されます。

![alt text](screenshot/folder.png)

テキストファイルの中身は以下のようになります。

![alt text](screenshot/txt.png)

- **インテリジェントなファイル追跡** (v0.10.0+):
  - シーンの順序を変更すると、ファイル番号が自動的に更新されます
  - 章を変更すると、ファイルが自動的に新しい章フォルダに移動します
  - タイトルを変更すると、ファイル名が自動的に更新されます
  - すべての操作で執筆中の本文が保持されます

- **縦書き機能（実験的実装）** (v0.20.0+):
- 実験的に搭載してみました。
- Chromium系で縦書きは鬼門なのでまだおまけ程度です。

## 技術スタック

このプロジェクトは以下の技術で構築されています：

- **フレームワーク**: [Tauri](https://tauri.app/), [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/)
- **ビルドツール**: [Vite](https://vitejs.dev/)
- **状態管理**: [Zustand](https://github.com/pmndrs/zustand)
- **UI/ドラッグ＆ドロップ**: [dnd-kit](https://dndkit.com/)
- **多言語対応**: [i18next](https://www.i18next.com/)

## 必要環境

- **インストーラーをダウンロードする場合**:

インストールするだけで普通に使えます。

**MacOSで「開発元が未確認」の警告が出る（もしくは壊れていると言われる）場合**:

現在は正式なAppleの電子署名を行っていないため、ダウンロードして開こうとすると、macOSのセキュリティ機能により「開発元が未確認のため開けません」や「ファイルが壊れています」といった警告が出ることがあります。

- **回避方法**:
  1. 右クリック（またはControlキー + クリック）する。
  2. メニューから「開く」を選択する。
  3. 出てきたダイアログで再度「開く」ボタンを押す。

これでうまくいかないときは
ターミナルから（パスは普通にApplicationsに入れたときのものです）

```bash
xattr -cr /Applications/HakoGraph.app
```

**Linux版**:

Github Actionsで解決済✨️

- **そのままで動かすなら**:
- Node.js (v16+)
- Rust (Tauriのビルドに必要)

## 開発（ローカル実行）

```bash
npm install
npm run dev
```

## ビルド（インストーラー作成）

WindowsまたMacそれぞれの環境で以下を実行してください。

```bash
npm run tauri build
```

- Mac: `.dmg` ファイルが生成されます (`src-tauri/target/release/bundle/dmg/`)
- Windows: `.msi` または `.exe` が生成されます (`src-tauri/target/release/bundle/msi/`)

## データ構造

ただのjsonなのでそちらから編集することも可能です。

シーンには以下の項目が含まれます：

- シーンタイトル
- 章タイトル
- 登場人物
- 時間
- 狙いと役割
- 詳細なあらすじ
- 裏設定

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細はLICENSEファイルをご覧ください。

### 使用している外部ライブラリ

このアプリケーションは以下のオープンソースライブラリを使用しています：

#### MIT License

- **React** (Copyright (c) Meta Platforms, Inc. and affiliates)
  - <https://github.com/facebook/react>
- **TipTap** (Copyright (c) 2024 überdosis GbR)
  - @tiptap/react, @tiptap/pm, @tiptap/starter-kit
  - <https://github.com/ueberdosis/tiptap>
- **dnd-kit** (Copyright (c) 2021, Claudéric Demers)
  - @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities
  - <https://github.com/clauderic/dnd-kit>
- **i18next** (Copyright (c) 2024 i18next)
  - i18next, react-i18next, i18next-browser-languagedetector
  - <https://github.com/i18next/react-i18next>

#### MIT OR Apache-2.0 License

- **Tauri** (Copyright (c) 2017 - Present Tauri Programme within The Commons Conservancy)
  - @tauri-apps/api, @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs, @tauri-apps/plugin-opener
  - <https://github.com/tauri-apps/tauri>

#### 0BSD License

- **tslib** (Copyright (c) Microsoft Corporation)
  - <https://github.com/Microsoft/tslib>

各ライブラリの詳細なライセンス条文は、それぞれのリポジトリまたは`node_modules`内のLICENSEファイルをご参照ください。
