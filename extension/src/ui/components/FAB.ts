/**
 * Floating Action Button (FAB) Component
 *
 * The main entry point for user interaction.
 * Displays a draggable button that opens the menu.
 */

import { store, OverlayMode } from '@/shared/state';

const STYLES = `
  :host {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    pointer-events: auto;
  }

  .fab-container {
    position: relative;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 8px;
  }

  .fab {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.95);
    color: #222;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.15s, box-shadow 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .fab:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .fab.open {
    background: #22c55e;
    color: white;
  }

  .mini {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: #fff;
    color: #222;
    font-size: 18px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    transition: transform 0.15s, opacity 0.15s;
    opacity: 0;
    transform: scale(0.8);
    pointer-events: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mini.show {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .mini.active {
    background: #22c55e;
    color: white;
  }

  .mini:hover {
    transform: scale(1.1);
  }
`;

const TEMPLATE = `
  <div class="fab-container">
    <button class="fab" title="OpenOverlay">
      <span class="fab-icon">•••</span>
    </button>
    <button class="mini mini-draw" title="Draw">
      <span>🖌</span>
    </button>
    <button class="mini mini-text" title="Text">
      <span>T</span>
    </button>
    <button class="mini mini-game" title="Game">
      <span>🏃</span>
    </button>
    <button class="mini mini-settings" title="Settings">
      <span>⚙</span>
    </button>
  </div>
`;

export class FAB extends HTMLElement {
  private shadow: ShadowRoot;
  private isOpen = false;
  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private position = { x: 0, y: 0 };

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.attachEvents();
    this.subscribeToStore();
  }

  disconnectedCallback(): void {
    // Cleanup if needed
  }

  private render(): void {
    const style = document.createElement('style');
    style.textContent = STYLES;

    const template = document.createElement('template');
    template.innerHTML = TEMPLATE;

    this.shadow.appendChild(style);
    this.shadow.appendChild(template.content.cloneNode(true));
  }

  private attachEvents(): void {
    const fab = this.shadow.querySelector('.fab');
    const miniDraw = this.shadow.querySelector('.mini-draw');
    const miniText = this.shadow.querySelector('.mini-text');
    const miniGame = this.shadow.querySelector('.mini-game');
    const miniSettings = this.shadow.querySelector('.mini-settings');

    // FAB click to toggle menu
    fab?.addEventListener('click', () => this.toggleMenu());

    // FAB drag support
    fab?.addEventListener('pointerdown', (e) => this.startDrag(e as PointerEvent));

    // Mini button clicks
    miniDraw?.addEventListener('click', () => this.setMode('draw'));
    miniText?.addEventListener('click', () => this.setMode('text'));
    miniGame?.addEventListener('click', () => this.setMode('game'));
    miniSettings?.addEventListener('click', () => this.togglePanel());
  }

  private subscribeToStore(): void {
    // Update UI when mode changes
    store.subscribeKey('mode', (mode) => {
      this.updateMiniButtons(mode);
    });

    // Update UI when panel opens/closes
    store.subscribeKey('panelOpen', (open) => {
      const settingsBtn = this.shadow.querySelector('.mini-settings');
      settingsBtn?.classList.toggle('active', open);
    });
  }

  private toggleMenu(): void {
    if (this.isDragging) return;

    this.isOpen = !this.isOpen;

    const fab = this.shadow.querySelector('.fab');
    const minis = this.shadow.querySelectorAll('.mini');

    fab?.classList.toggle('open', this.isOpen);
    minis.forEach((mini) => mini.classList.toggle('show', this.isOpen));
  }

  private setMode(mode: OverlayMode): void {
    const currentMode = store.getState().mode;

    if (currentMode === mode) {
      // Toggle off
      store.setState({ mode: 'none' });
    } else {
      store.setState({ mode });
    }
  }

  private togglePanel(): void {
    const { panelOpen } = store.getState();
    store.setState({ panelOpen: !panelOpen });
  }

  private updateMiniButtons(mode: OverlayMode): void {
    const miniDraw = this.shadow.querySelector('.mini-draw');
    const miniText = this.shadow.querySelector('.mini-text');
    const miniGame = this.shadow.querySelector('.mini-game');

    miniDraw?.classList.toggle('active', mode === 'draw');
    miniText?.classList.toggle('active', mode === 'text');
    miniGame?.classList.toggle('active', mode === 'game');
  }

  private startDrag(e: PointerEvent): void {
    if (e.button !== 0) return;

    this.dragStart = { x: e.clientX, y: e.clientY };
    this.isDragging = false;

    const rect = this.getBoundingClientRect();
    this.position = { x: rect.left, y: rect.top };

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - this.dragStart.x;
      const dy = moveEvent.clientY - this.dragStart.y;

      if (!this.isDragging && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
        this.isDragging = true;
      }

      if (this.isDragging) {
        this.style.left = `${this.position.x + dx}px`;
        this.style.top = `${this.position.y + dy}px`;
        this.style.right = 'auto';
        this.style.bottom = 'auto';
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);

      // Reset drag flag after a short delay to prevent click
      setTimeout(() => {
        this.isDragging = false;
      }, 50);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }
}
