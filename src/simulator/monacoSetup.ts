/*
 * Monaco wiring for Vite (offline — no CDN loader):
 *   - bundle the editor API + the language contributions (Java included),
 *   - point the web worker at the bundled editor worker,
 *   - tell @monaco-editor/react to use this monaco instead of its jsdelivr default.
 * Import once, before the first <Editor /> mounts.
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/basic-languages/monaco.contribution';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { loader } from '@monaco-editor/react';

declare global {
  interface Window {
    MonacoEnvironment?: { getWorker: () => Worker };
  }
}

window.MonacoEnvironment = {
  getWorker: () => new editorWorker(),
};

loader.config({ monaco });

export {};
