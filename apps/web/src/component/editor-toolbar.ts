import { select } from '../store/store.js';
import { html } from './component.js';
import { customElement } from './decorators.js';

const t = html`<div class="flex items-center w-full border-b py-2 px-4 space-x-4 h-12">
  <button
    class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-gray-400 bg-blue-500 text-white hover:bg-blue-600 px-3 py-1"
    ^click="save"
  >
    Save
  </button>
  <span class="font-bold text-sm text-gray-600 truncate flex-grow" :innerText="fileName"></span>
</div>`;

@customElement('js-editortoolbar', t)
export class EditorToolbar extends HTMLElement {
  fileName = select((s) => s.currentFile?.meta?.name || '');
}
