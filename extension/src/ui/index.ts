/**
 * UI Module
 *
 * Handles all UI components: FAB, toolbar, panels, tooltips.
 * Uses Web Components for encapsulation.
 */

import { store } from '@/shared/state';
import { FAB } from './components/FAB';
import { Toolbar } from './components/Toolbar';
import { Panel } from './components/Panel';

// CSS that gets injected into the page
const GLOBAL_CSS = `
  .oo-highlight {
    background: linear-gradient(transparent 30%, rgba(255, 235, 59, 0.9) 30%, rgba(255, 235, 59, 0.9) 70%, transparent 70%);
    border-radius: 2px;
    padding: 0 2px;
    cursor: pointer;
  }
  .oo-highlight.oo-hidden {
    background: transparent !important;
  }
`;

// Shadow host for all UI components
let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

/**
 * Initialize the UI system.
 */
export function initUI(): void {
  // Inject global CSS
  injectGlobalCSS();

  // Create shadow host for UI components
  createShadowHost();

  // Register custom elements
  registerComponents();

  // Create and mount components
  mountComponents();

  // Subscribe to state changes
  subscribeToState();

  console.log('[OpenOverlay] UI initialized');
}

/**
 * Inject global CSS into the page.
 */
function injectGlobalCSS(): void {
  const style = document.createElement('style');
  style.id = 'openoverlay-global-css';
  style.textContent = GLOBAL_CSS;
  document.head.appendChild(style);
}

/**
 * Create the shadow host for UI isolation.
 */
function createShadowHost(): void {
  shadowHost = document.createElement('div');
  shadowHost.id = 'openoverlay-ui';
  shadowHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 2147483647;
    pointer-events: none;
  `;

  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Add base styles to shadow root
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      font-family: system-ui, -apple-system, sans-serif;
    }
    * {
      box-sizing: border-box;
    }
  `;
  shadowRoot.appendChild(style);

  document.body.appendChild(shadowHost);
}

/**
 * Register custom element components.
 */
function registerComponents(): void {
  // Only register if not already defined
  if (!customElements.get('oo-fab')) {
    customElements.define('oo-fab', FAB);
  }
  if (!customElements.get('oo-toolbar')) {
    customElements.define('oo-toolbar', Toolbar);
  }
  if (!customElements.get('oo-panel')) {
    customElements.define('oo-panel', Panel);
  }
}

/**
 * Mount UI components to the shadow root.
 */
function mountComponents(): void {
  if (!shadowRoot) return;

  // Create FAB
  const fab = document.createElement('oo-fab');
  shadowRoot.appendChild(fab);

  // Create toolbar (hidden by default)
  const toolbar = document.createElement('oo-toolbar');
  shadowRoot.appendChild(toolbar);

  // Create panel (hidden by default)
  const panel = document.createElement('oo-panel');
  shadowRoot.appendChild(panel);
}

/**
 * Subscribe to state changes for UI updates.
 */
function subscribeToState(): void {
  // Example: update UI when mode changes
  store.subscribeKey('mode', (mode, prevMode) => {
    console.log(`[UI] Mode changed: ${prevMode} -> ${mode}`);
  });

  store.subscribeKey('panelOpen', (open) => {
    console.log(`[UI] Panel ${open ? 'opened' : 'closed'}`);
  });
}

/**
 * Get the shadow root for component access.
 */
export function getShadowRoot(): ShadowRoot | null {
  return shadowRoot;
}

/**
 * Show a toast notification.
 */
export function showToast(message: string, duration = 3000): void {
  if (!shadowRoot) return;

  const toast = document.createElement('div');
  toast.className = 'oo-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 100px;
    left: 50%;
    transform: translateX(-50%);
    background: #111;
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    pointer-events: auto;
    animation: oo-toast-in 0.2s ease-out;
  `;

  shadowRoot.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'oo-toast-out 0.2s ease-in';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
