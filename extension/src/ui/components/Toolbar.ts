/**
 * Toolbar Component
 *
 * Drawing controls: brush size, color, style, opacity, etc.
 * Appears when draw or text mode is active.
 */

import { store } from '@/shared/state';

const STYLES = `
  :host {
    position: fixed;
    right: 90px;
    bottom: 18px;
    z-index: 2147483647;
    pointer-events: auto;
    display: none;
  }

  :host([visible]) {
    display: block;
  }

  .toolbar {
    background: #111;
    color: #fff;
    padding: 12px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 200px;
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  label {
    font-size: 12px;
    color: #aaa;
    min-width: 50px;
  }

  input[type="range"] {
    flex: 1;
    accent-color: #22c55e;
  }

  input[type="color"] {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
  }

  select {
    flex: 1;
    background: #222;
    color: #fff;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 6px;
    cursor: pointer;
  }

  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-primary {
    background: #22c55e;
    color: #fff;
  }

  .btn-secondary {
    background: #333;
    color: #fff;
  }

  .btn-danger {
    background: #ef4444;
    color: #fff;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
`;

const TEMPLATE = `
  <div class="toolbar">
    <div class="toolbar-row">
      <label>Color</label>
      <input type="color" id="color" value="#ff3366">
    </div>
    <div class="toolbar-row">
      <label>Size</label>
      <input type="range" id="size" min="1" max="20" value="3">
      <span id="size-value">3</span>
    </div>
    <div class="toolbar-row">
      <label>Style</label>
      <select id="style">
        <option value="solid">Solid</option>
        <option value="spray">Spray</option>
        <option value="dots">Dots</option>
        <option value="rainbow">Rainbow</option>
        <option value="glow">Glow</option>
      </select>
    </div>
    <div class="toolbar-row">
      <label>Opacity</label>
      <input type="range" id="opacity" min="10" max="100" value="100">
      <span id="opacity-value">100%</span>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="cancel">Cancel</button>
      <button class="btn btn-primary" id="save">Save</button>
    </div>
  </div>
`;

export class Toolbar extends HTMLElement {
  private shadow: ShadowRoot;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
  }

  connectedCallback(): void {
    this.render();
    this.attachEvents();
    this.subscribeToStore();
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
    const colorInput = this.shadow.getElementById('color') as HTMLInputElement;
    const sizeInput = this.shadow.getElementById('size') as HTMLInputElement;
    const styleSelect = this.shadow.getElementById('style') as HTMLSelectElement;
    const opacityInput = this.shadow.getElementById('opacity') as HTMLInputElement;
    const cancelBtn = this.shadow.getElementById('cancel');
    const saveBtn = this.shadow.getElementById('save');

    colorInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      store.setState({
        brush: { ...store.getState().brush, color },
      });
    });

    sizeInput?.addEventListener('input', (e) => {
      const width = parseInt((e.target as HTMLInputElement).value, 10);
      this.shadow.getElementById('size-value')!.textContent = String(width);
      store.setState({
        brush: { ...store.getState().brush, width },
      });
    });

    styleSelect?.addEventListener('change', (e) => {
      const style = (e.target as HTMLSelectElement).value as any;
      store.setState({
        brush: { ...store.getState().brush, style },
      });
    });

    opacityInput?.addEventListener('input', (e) => {
      const opacity = parseInt((e.target as HTMLInputElement).value, 10) / 100;
      this.shadow.getElementById('opacity-value')!.textContent = `${Math.round(opacity * 100)}%`;
      store.setState({
        brush: { ...store.getState().brush, opacity },
      });
    });

    cancelBtn?.addEventListener('click', () => {
      // Discard current drawing and exit mode
      store.setState({ mode: 'none', currentItems: [] });
    });

    saveBtn?.addEventListener('click', () => {
      // Save drawing and exit mode
      // TODO: Implement save logic
      store.setState({ mode: 'none' });
    });
  }

  private subscribeToStore(): void {
    // Show/hide based on mode
    store.subscribeKey('mode', (mode) => {
      const visible = mode === 'draw' || mode === 'text';
      this.toggleAttribute('visible', visible);
    });

    // Update controls when brush changes
    store.subscribeKey('brush', (brush) => {
      const colorInput = this.shadow.getElementById('color') as HTMLInputElement;
      const sizeInput = this.shadow.getElementById('size') as HTMLInputElement;
      const styleSelect = this.shadow.getElementById('style') as HTMLSelectElement;
      const opacityInput = this.shadow.getElementById('opacity') as HTMLInputElement;

      if (colorInput) colorInput.value = brush.color;
      if (sizeInput) sizeInput.value = String(brush.width);
      if (styleSelect) styleSelect.value = brush.style;
      if (opacityInput) opacityInput.value = String(brush.opacity * 100);
    });
  }
}
