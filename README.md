# HakoGraph

[English] | [日本語](README.ja.md)

HakoGraph is a "Hakogaki" (plotting/outlining) editor built with Tauri, React, and TypeScript.

I created this tool because I wanted it for my own novel writing process.

## What's New in v1.0.2

- **Refactored Architecture**: Migrated to CSS Modules for better component isolation and maintainability.
- **Unified State Management**: Centralized all data including character count caches into Zustand Store, eliminating direct localStorage calls.
- **Codebase Cleanup**: Massive reduction of global CSS and inline styles for a modern, clean codebase.

Even if you create a plot in Excel, manual labor is required to turn each scene into a separate file! I wanted to escape that nightmare.

## Features

- **Scene Management**: Overview of scenes in a grid display.
![alt text](screenshot/app.png)

- **Detailed Editing**: Edit scene details via a modal.
![alt text](screenshot/add.png)

- **Drag and Drop**: Reorder scenes easily using drag and drop.

- **Export**: Choose an export location, and the tool will automatically create folders like "Number_ChapterTitle" and populate them with text files named after each scene.

![alt text](screenshot/folder.png)

The content of the text files looks like this:

![alt text](screenshot/txt.png)

- **Intelligent File Tracking** (v0.10.0+):
  - File numbers are automatically updated when scene order changes.
  - Files are automatically moved to new chapter folders when a scene's chapter is updated.
  - File names are automatically updated when titles change.
  - Your manuscript content is preserved through all operations.

- **Vertical Writing (Experimental)** (v0.20.0+):
- Basic vertical layout support for Japanese novels.
- Still experimental as vertical text can be tricky in Chromium-based environments.

## Tech Stack

This project is built with the following technologies:

- **Framework**: [Tauri](https://tauri.app/), [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **UI/Drag & Drop**: [dnd-kit](https://dndkit.com/)
- **i18n**: [i18next](https://www.i18next.com/)

## Requirements

- **Downloading the Installer**:

Just install and run.

**For MacOS "Unidentified Developer" or "Damaged" Warnings**:

Since the app is not currently signed with an official Apple Developer certificate, macOS security might block it or flag it as damaged.

- **Workaround**:
  1. Right-click (or Control + Click) the app.
  2. Select "Open" from the menu.
  3. Click "Open" again in the dialog that appears.

If that doesn't work, run this command in the terminal (assuming it's in Applications):

```bash
xattr -cr /Applications/HakoGraph.app
```

**Linux Version**:

Supported via Github Actions✨️

- **Running from Source**:
- Node.js (v16+)
- Rust (required for Tauri build)

## Development (Local Execution)

```bash
npm install
npm run dev
```

## Build (Creating Installers)

Run the following in your respective Windows or Mac environment:

```bash
npm run tauri build
```

- Mac: Generates a `.dmg` file (`src-tauri/target/release/bundle/dmg/`)
- Windows: Generates a `.msi` or `.exe` file (`src-tauri/target/release/bundle/msi/`)

## Data Structure

Data is stored as plain JSON, so you can edit it directly if needed.

Scenes include the following fields:

- Scene Title
- Chapter Title
- Characters
- Time
- Aim & Role
- Detailed Summary
- Backstory/Notes

## License

This project is licensed under the MIT License. See the LICENSE file for details.

### Libraries Used

This application uses the following open-source libraries:

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

Please refer to the respective repositories or the LICENSE files in `node_modules` for detailed license terms.
