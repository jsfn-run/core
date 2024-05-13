import './selector.js';
import { customElement } from './decorators.js';
import { html } from './component.js';
import { dispatch, select } from '../store/store.js';

const t = html`<div class="flex h-12 items-center px-3 border-b space-x-2">
  <js-selector placeholder="Select a lambda" class="w-full"></js-selector>
  <button
    ^click="signout"
    .hidden="!isLoggedIn"
    class="flex items-center ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 p-2"
  >
    <span class="material-icons">logout</span>
    <span class="sr-only">Sign Out</span>
  </button>
  <button
    ^click="signin"
    .hidden="isLoggedIn"
    class="flex items-center ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 p-2"
  >
    <span class="material-icons">person</span>
    <span class="sr-only">Sign In</span>
  </button>
</div>`;

@customElement('js-topbar', t)
export class Topbar extends HTMLElement {
  isLoggedIn = select((s) => !!s.profileId);

  onSignIn() {
    this.isLoggedIn.value ? dispatch('signout') : dispatch('signin');
  }
}
