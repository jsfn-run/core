import { getZipUrl } from 'https://bin.homebots.io/index.mjs';
import { customElement } from './decorators.js';
import { select } from '../store/store.js';
import { html } from './component.js';

const t = html`
  <header class="flex h-12 items-center px-4 border-b space-x-2">
    <a href="#" ^click="reload">
      <img class="w-6 h-6 rounded" src="https://avatars.githubusercontent.com/u/69599650?s=24&v=4" alt="" />
    </a>

    <div class="flex items-center text-sm flex-grow ml-2">
      <span class="font-bold" :innerText="fnName"></span>
      <span class="text-gray-700">.jsfn.run</span>
    </div>

    <a title="Copy download link" .hidden="!downloadUrl" :href="downloadUrl" @click="onLinkCopy($event)">
      <span class="material-icons text-base">content_copy</span>
    </a>
    <button ^click="deploy" .hidden="!fnName" title="Deploy">
      <span class="material-icons text-base">arrow_circle_up</span>
      <span class="sr-only">Deploy</span>
    </button>
  </header>
`;

@customElement('js-header', t)
export class Header extends HTMLElement {
  fnName = select((s) => s.currentFunction?.name || '');
  downloadUrl = select((s) => (s.binId ? getZipUrl(s.binId) : ''));

  onLinkCopy(e) {
    e.preventDefault();
    navigator.clipboard.writeText(this.downloadUrl.value);
  }
}
