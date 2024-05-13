import { customElement } from './decorators.js';
import { dispatch, select } from '../store/store.js';
import { html } from './component.js';
import './preview.js';

const t = html`<div class="flex h-screen w-screen">
  <aside class="w-72 border-r overflow-y-auto" .hidden="notLoggedIn">
    <js-header></js-header>
    <js-filelist .hidden="noFunctionSelected"></js-filelist>
  </aside>
  <main class="flex-1 flex flex-col items-stretch shadow-lg">
    <js-topbar></js-topbar>
    <div class="w-full flex-grow text-sm flex flex-col">
      <js-editortoolbar .hidden="noFileOpen"></js-editortoolbar>
      <js-editor .hidden="noFileOpen" class="flex-grow overflow-y-auto"></js-editor>
      <js-preview .hidden="noPreview"></js-preview>
    </div>
  </main>
</div>`;

@customElement('js-app', t)
export class App extends HTMLElement {
  noFileOpen = select((s) => !s.currentFile?.meta?.id);
  noFunctionSelected = select((s) => !s.currentFunction?.id);
  noPreview = select((s) => !!s.currentFile || !s.fileList.find((f) => f.meta?.name === 'readme.md'));
  notLoggedIn = select((s) => !s.profileId);

  connectedCallback() {
    dispatch('startup');
  }
}
