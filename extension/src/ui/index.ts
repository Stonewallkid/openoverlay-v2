/**
 * UI Module
 * Drawing toolbar with full controls
 */

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isMenuOpen = false;
let currentMode: 'none' | 'draw' | 'text' | 'game' = 'none';
let currentBrush: string = 'solid';
let currentTextStyle: string = 'normal';
let isEraser = false;
let pendingText: string = '';
let gameSubMode: 'play' | 'build' = 'build';
let gameBuildTool: string = 'spawn';

// Quick color presets
const QUICK_COLORS = ['#ff3366', '#3b82f6', '#22c55e', '#f59e0b'];

// Brush styles
const BRUSH_STYLES = [
  { id: 'solid', label: '━', title: 'Solid' },
  { id: 'spray', label: '░', title: 'Spray' },
  { id: 'dots', label: '•••', title: 'Dots' },
  { id: 'square', label: '▬', title: 'Square' },
  { id: 'rainbow', label: '🌈', title: 'Rainbow' },
  { id: 'glow', label: '✦', title: 'Glow' },
];

// Text styles
const TEXT_STYLES = [
  { id: 'normal', label: 'A', title: 'Normal' },
  { id: 'rainbow', label: '🌈', title: 'Rainbow' },
  { id: 'aged', label: '🏚️', title: 'Aged' },
];

const STYLES = `
  * {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .fab-container {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column-reverse;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
  }

  .fab {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.95);
    color: #222;
    font-size: 20px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transition: transform 0.15s, background 0.15s;
  }

  .fab:hover {
    transform: scale(1.05);
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
    transform: scale(0.5);
    pointer-events: none;
  }

  .mini.show {
    opacity: 1;
    transform: scale(1);
    pointer-events: auto;
  }

  .mini:hover {
    transform: scale(1.1);
  }

  .mini.active {
    background: #22c55e;
    color: white;
  }

  .toolbar {
    position: fixed;
    right: 90px;
    bottom: 18px;
    background: #111;
    color: #fff;
    padding: 10px 14px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: none;
    gap: 10px;
    align-items: center;
    pointer-events: auto;
    flex-wrap: wrap;
    max-width: 500px;
    z-index: 2147483647;
  }

  .toolbar-drag-handle {
    cursor: grab;
    padding: 4px 8px;
    margin: -4px 0 -4px -8px;
    color: #666;
    font-size: 14px;
    user-select: none;
  }

  .toolbar-drag-handle:hover {
    color: #999;
  }

  .toolbar-drag-handle:active {
    cursor: grabbing;
  }

  .toolbar.show {
    display: flex;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .toolbar-divider {
    width: 1px;
    height: 24px;
    background: #333;
  }

  .toolbar label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toolbar input[type="color"] {
    width: 28px;
    height: 28px;
    border: 2px solid #333;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    background: none;
  }

  .toolbar input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .toolbar input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .toolbar input[type="range"] {
    width: 60px;
    height: 4px;
    -webkit-appearance: none;
    background: #333;
    border-radius: 2px;
  }

  .toolbar input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
  }

  .quick-colors {
    display: flex;
    gap: 4px;
  }

  .quick-color {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .quick-color:hover {
    transform: scale(1.2);
  }

  .quick-color.active {
    border-color: #fff;
  }

  .brush-styles {
    display: flex;
    gap: 2px;
  }

  .brush-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.1s;
  }

  .brush-btn:hover {
    background: #333;
  }

  .brush-btn.active {
    background: #22c55e;
    color: white;
  }

  .tool-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    transition: background 0.1s;
  }

  .tool-btn:hover {
    background: #333;
  }

  .tool-btn.active {
    background: #ef4444;
    color: white;
  }

  .toolbar button.action-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: background 0.1s;
  }

  .btn-undo {
    background: #333;
    color: #fff;
  }

  .btn-undo:hover {
    background: #444;
  }

  .btn-clear {
    background: #333;
    color: #fff;
  }

  .btn-clear:hover {
    background: #444;
  }

  .btn-save {
    background: #22c55e;
    color: white;
  }

  .btn-save:hover {
    background: #16a34a;
  }

  .btn-cancel {
    background: #333;
    color: white;
  }

  .btn-cancel:hover {
    background: #444;
  }

  .size-display {
    font-size: 11px;
    color: #888;
    min-width: 20px;
    text-align: center;
  }

  .opacity-display {
    font-size: 11px;
    color: #888;
    min-width: 28px;
    text-align: center;
  }

  .draw-controls, .text-controls {
    display: none;
    align-items: center;
    gap: 10px;
  }

  .draw-controls.active, .text-controls.active {
    display: flex;
  }

  .text-input {
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    padding: 8px 12px;
    font-size: 14px;
    width: 160px;
    font-family: inherit;
  }

  .text-input:focus {
    outline: none;
    border-color: #22c55e;
  }

  .text-input::placeholder {
    color: #666;
  }

  .text-styles {
    display: flex;
    gap: 2px;
  }

  .text-style-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.1s;
  }

  .text-style-btn:hover {
    background: #333;
  }

  .text-style-btn.active {
    background: #22c55e;
    color: white;
  }

  .place-hint {
    font-size: 11px;
    color: #666;
    font-style: italic;
  }

  .game-controls {
    display: none;
    align-items: center;
    gap: 10px;
  }

  .game-controls.active {
    display: flex;
  }

  .game-mode-toggle {
    display: flex;
    background: #222;
    border-radius: 8px;
    padding: 2px;
  }

  .game-mode-btn {
    padding: 6px 14px;
    border: none;
    background: transparent;
    color: #888;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: background 0.1s, color 0.1s;
  }

  .game-mode-btn:hover {
    color: #fff;
  }

  .game-mode-btn.active {
    background: #22c55e;
    color: white;
  }

  .game-tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
    max-width: 320px;
  }

  .game-tool-btn {
    padding: 4px 6px;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    transition: background 0.1s;
    white-space: nowrap;
  }

  .game-tool-btn:hover {
    background: #333;
  }

  .game-tool-btn.active {
    background: #3b82f6;
    color: white;
  }

  .mini.game-btn {
    background: #8b5cf6;
    color: white;
  }

  .mini.game-btn.active {
    background: #22c55e;
  }
`;

/**
 * Initialize the UI
 */
export function initUI(): void {
  console.log('[OpenOverlay] initUI starting...');

  if (!document.body) {
    console.error('[OpenOverlay] No document.body!');
    return;
  }

  // Create shadow host - must be above canvas
  shadowHost = document.createElement('div');
  shadowHost.id = 'openoverlay-ui';
  shadowHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    pointer-events: none;
  `;
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });

  // Add styles
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadowRoot.appendChild(style);

  // Create FAB container
  const container = document.createElement('div');
  container.className = 'fab-container';

  // Main FAB
  const fab = document.createElement('button');
  fab.className = 'fab';
  fab.textContent = '•••';
  fab.title = 'OpenOverlay';
  fab.onclick = toggleMenu;
  container.appendChild(fab);

  // Draw button
  const drawBtn = document.createElement('button');
  drawBtn.className = 'mini';
  drawBtn.textContent = '✏️';
  drawBtn.title = 'Draw';
  drawBtn.onclick = () => toggleMode('draw');
  container.appendChild(drawBtn);

  // Text button
  const textBtn = document.createElement('button');
  textBtn.className = 'mini';
  textBtn.textContent = 'T';
  textBtn.title = 'Text';
  textBtn.onclick = () => toggleMode('text');
  container.appendChild(textBtn);

  // Game button
  const gameBtn = document.createElement('button');
  gameBtn.className = 'mini game-btn';
  gameBtn.textContent = '🎮';
  gameBtn.title = 'Game';
  gameBtn.onclick = () => toggleMode('game');
  container.appendChild(gameBtn);

  // Settings button
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'mini';
  settingsBtn.textContent = '⚙️';
  settingsBtn.title = 'Settings';
  settingsBtn.onclick = () => console.log('Settings clicked');
  container.appendChild(settingsBtn);

  shadowRoot.appendChild(container);

  // Create toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.id = 'oo-toolbar';

  // Build toolbar HTML
  toolbar.innerHTML = `
    <!-- DRAG HANDLE -->
    <div class="toolbar-drag-handle" id="oo-drag-handle" title="Drag to move">⠿</div>

    <!-- DRAW MODE CONTROLS -->
    <div class="draw-controls active" id="draw-controls">
      <!-- Brush Styles -->
      <div class="toolbar-section">
        <div class="brush-styles" id="oo-brushes">
          ${BRUSH_STYLES.map(b => `
            <button class="brush-btn ${b.id === 'solid' ? 'active' : ''}"
                    data-brush="${b.id}" title="${b.title}">${b.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Tools -->
      <div class="toolbar-section">
        <button class="tool-btn" id="oo-eraser" title="Eraser">🧹</button>
      </div>

      <div class="toolbar-divider"></div>
    </div>

    <!-- TEXT MODE CONTROLS -->
    <div class="text-controls" id="text-controls">
      <!-- Text Input -->
      <div class="toolbar-section">
        <input type="text" class="text-input" id="oo-text-input" placeholder="Type text here...">
      </div>

      <div class="toolbar-divider"></div>

      <!-- Text Styles -->
      <div class="toolbar-section">
        <div class="text-styles" id="oo-text-styles">
          ${TEXT_STYLES.map(s => `
            <button class="text-style-btn ${s.id === 'normal' ? 'active' : ''}"
                    data-style="${s.id}" title="${s.title}">${s.label}</button>
          `).join('')}
        </div>
      </div>

      <div class="toolbar-divider"></div>

      <span class="place-hint">Click page to place</span>

      <div class="toolbar-divider"></div>
    </div>

    <!-- GAME MODE CONTROLS -->
    <div class="game-controls" id="game-controls">
      <!-- Play/Build Toggle -->
      <div class="toolbar-section">
        <div class="game-mode-toggle">
          <button class="game-mode-btn" data-mode="play" data-playmode="explore" title="Explore freely - no timer, unlimited lives">🚶 Explore</button>
          <button class="game-mode-btn" data-mode="play" data-playmode="race" title="Race mode - timer and 3 lives">🏃 Race</button>
          <button class="game-mode-btn active" data-mode="build" title="Build the course">🔨 Build</button>
        </div>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Build Tools (only shown in build mode) -->
      <div class="toolbar-section build-tools-section">
        <div class="game-tools" id="game-tools">
          <button class="game-tool-btn" data-tool="select" title="Select - drag to move, shift+click to delete">✋ Select</button>
          <button class="game-tool-btn active" data-tool="spawn" title="Place spawn point">👤 Spawn</button>
          <button class="game-tool-btn" data-tool="start" title="Place start flag">🏁 Start</button>
          <button class="game-tool-btn" data-tool="finish" title="Place finish flag">🏆 Finish</button>
          <button class="game-tool-btn" data-tool="checkpoint" title="Place checkpoint flag">🚩 Flag</button>
          <button class="game-tool-btn" data-tool="trampoline" title="Bouncy pad">🔶 Bounce</button>
          <button class="game-tool-btn" data-tool="speedBoost" title="Speed boost (3 sec)">💨 Speed</button>
          <button class="game-tool-btn" data-tool="highJump" title="Next jump is higher">🦘 Jump</button>
          <button class="game-tool-btn" data-tool="spike" title="Deadly spikes">🔺 Spike</button>
        </div>
      </div>

      <div class="toolbar-divider"></div>
    </div>

    <!-- SHARED CONTROLS -->
    <!-- Color -->
    <div class="toolbar-section">
      <input type="color" id="oo-color" value="#ff3366" title="Color">
      <div class="quick-colors" id="oo-quick-colors">
        ${QUICK_COLORS.map((c, i) => `
          <div class="quick-color ${i === 0 ? 'active' : ''}"
               data-color="${c}"
               style="background: ${c}"
               title="${c}"></div>
        `).join('')}
      </div>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Size -->
    <div class="toolbar-section">
      <label>Size</label>
      <input type="range" id="oo-size" min="1" max="200" value="24">
      <span class="size-display" id="oo-size-display">24</span>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Opacity -->
    <div class="toolbar-section">
      <label>Opacity</label>
      <input type="range" id="oo-opacity" min="10" max="100" value="100">
      <span class="opacity-display" id="oo-opacity-display">100%</span>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Actions -->
    <div class="toolbar-section">
      <button class="action-btn btn-undo" id="oo-undo" title="Undo">↩</button>
      <button class="action-btn btn-clear" id="oo-clear" title="Clear All">🗑</button>
    </div>

    <div class="toolbar-divider"></div>

    <!-- Save/Cancel -->
    <div class="toolbar-section">
      <button class="action-btn btn-cancel" id="oo-cancel">Cancel</button>
      <button class="action-btn btn-save" id="oo-save">Save</button>
    </div>
  `;

  shadowRoot.appendChild(toolbar);

  // Event listeners
  setupToolbarEvents(toolbar);

  document.body.appendChild(shadowHost);

  // Listen for toolbar hide event (from game when race starts)
  document.addEventListener('oo:hidetoolbar', () => {
    const toolbar = shadowRoot?.querySelector('.toolbar');
    toolbar?.classList.remove('show');
    // Reset currentMode so clicking game button again will re-open toolbar
    currentMode = 'none';
    // Reset game sub mode to build for next time
    gameSubMode = 'build';
    // Update button states
    const minis = shadowRoot?.querySelectorAll('.mini');
    minis?.forEach(mini => mini.classList.remove('active'));
  });

  console.log('[OpenOverlay] UI initialized');
}

function setupToolbarEvents(toolbar: HTMLElement): void {
  // Brush style buttons
  toolbar.querySelectorAll('.brush-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const brushId = (btn as HTMLElement).dataset.brush || 'solid';
      currentBrush = brushId;
      toolbar.querySelectorAll('.brush-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dispatchSettingsChange();
    });
  });

  // Text style buttons
  toolbar.querySelectorAll('.text-style-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const styleId = (btn as HTMLElement).dataset.style || 'normal';
      currentTextStyle = styleId;
      toolbar.querySelectorAll('.text-style-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dispatchSettingsChange();
    });
  });

  // Text input
  const textInput = toolbar.querySelector('#oo-text-input') as HTMLInputElement;
  textInput?.addEventListener('input', () => {
    pendingText = textInput.value;
    dispatchSettingsChange();
  });

  // Quick color swatches
  toolbar.querySelectorAll('.quick-color').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const color = (swatch as HTMLElement).dataset.color || '#ff3366';
      const colorInput = toolbar.querySelector('#oo-color') as HTMLInputElement;
      if (colorInput) colorInput.value = color;
      toolbar.querySelectorAll('.quick-color').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      dispatchSettingsChange();
    });
  });

  // Color picker
  toolbar.querySelector('#oo-color')?.addEventListener('input', () => {
    toolbar.querySelectorAll('.quick-color').forEach(s => s.classList.remove('active'));
    dispatchSettingsChange();
  });

  // Size slider
  const sizeInput = toolbar.querySelector('#oo-size') as HTMLInputElement;
  const sizeDisplay = toolbar.querySelector('#oo-size-display');
  sizeInput?.addEventListener('input', () => {
    if (sizeDisplay) sizeDisplay.textContent = sizeInput.value;
    dispatchSettingsChange();
  });

  // Opacity slider
  const opacityInput = toolbar.querySelector('#oo-opacity') as HTMLInputElement;
  const opacityDisplay = toolbar.querySelector('#oo-opacity-display');
  opacityInput?.addEventListener('input', () => {
    if (opacityDisplay) opacityDisplay.textContent = opacityInput.value + '%';
    dispatchSettingsChange();
  });

  // Eraser toggle
  toolbar.querySelector('#oo-eraser')?.addEventListener('click', () => {
    isEraser = !isEraser;
    toolbar.querySelector('#oo-eraser')?.classList.toggle('active', isEraser);
    dispatchSettingsChange();
  });

  // Undo
  toolbar.querySelector('#oo-undo')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:undo'));
  });

  // Clear
  toolbar.querySelector('#oo-clear')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:clear'));
  });

  // Cancel
  toolbar.querySelector('#oo-cancel')?.addEventListener('click', () => {
    setMode('none');
    document.dispatchEvent(new CustomEvent('oo:cancel'));
  });

  // Save
  toolbar.querySelector('#oo-save')?.addEventListener('click', () => {
    setMode('none');
    document.dispatchEvent(new CustomEvent('oo:save'));
  });

  // Game mode toggle (Explore/Race/Build)
  toolbar.querySelectorAll('.game-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as 'play' | 'build';
      const playmode = (btn as HTMLElement).dataset.playmode as 'explore' | 'race' | undefined;
      gameSubMode = mode;

      toolbar.querySelectorAll('.game-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/hide build tools
      const buildTools = toolbar.querySelector('.build-tools-section') as HTMLElement;
      if (buildTools) {
        buildTools.style.display = mode === 'build' ? 'flex' : 'none';
      }

      // Dispatch game mode change
      document.dispatchEvent(new CustomEvent('oo:gamemode', {
        detail: { mode, tool: gameBuildTool, playmode: playmode || 'explore' }
      }));
    });
  });

  // Game build tools
  toolbar.querySelectorAll('.game-tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = (btn as HTMLElement).dataset.tool || 'platform';
      gameBuildTool = tool;

      toolbar.querySelectorAll('.game-tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Dispatch tool change
      document.dispatchEvent(new CustomEvent('oo:gamemode', {
        detail: { mode: gameSubMode, tool }
      }));
    });
  });

  // Drag functionality
  const dragHandle = toolbar.querySelector('#oo-drag-handle');
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let toolbarStartX = 0;
  let toolbarStartY = 0;

  dragHandle?.addEventListener('pointerdown', (e: Event) => {
    const pe = e as PointerEvent;
    isDragging = true;
    dragStartX = pe.clientX;
    dragStartY = pe.clientY;

    const rect = toolbar.getBoundingClientRect();
    toolbarStartX = rect.left;
    toolbarStartY = rect.top;

    // Switch to position-based layout
    toolbar.style.right = 'auto';
    toolbar.style.bottom = 'auto';
    toolbar.style.left = `${rect.left}px`;
    toolbar.style.top = `${rect.top}px`;

    (dragHandle as HTMLElement).style.cursor = 'grabbing';
    pe.preventDefault();
  });

  document.addEventListener('pointermove', (e: PointerEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    toolbar.style.left = `${toolbarStartX + dx}px`;
    toolbar.style.top = `${toolbarStartY + dy}px`;
  });

  document.addEventListener('pointerup', () => {
    if (isDragging) {
      isDragging = false;
      if (dragHandle) {
        (dragHandle as HTMLElement).style.cursor = 'grab';
      }
    }
  });
}

function dispatchSettingsChange(): void {
  document.dispatchEvent(new CustomEvent('oo:settings', {
    detail: {
      color: getColor(),
      size: getSize(),
      opacity: getOpacity(),
      brush: getBrush(),
      textStyle: getTextStyle(),
      eraser: isEraser,
    }
  }));
}

function toggleMenu(): void {
  isMenuOpen = !isMenuOpen;

  const fab = shadowRoot?.querySelector('.fab');
  const minis = shadowRoot?.querySelectorAll('.mini');

  fab?.classList.toggle('open', isMenuOpen);
  minis?.forEach(mini => mini.classList.toggle('show', isMenuOpen));
}

function toggleMode(mode: 'draw' | 'text' | 'game'): void {
  if (currentMode === mode) {
    setMode('none');
  } else {
    setMode(mode);
  }
}

function setMode(mode: 'none' | 'draw' | 'text' | 'game'): void {
  const prevMode = currentMode;
  currentMode = mode;

  // Update button states
  const minis = shadowRoot?.querySelectorAll('.mini');
  minis?.forEach((mini, i) => {
    if (i === 0) mini.classList.toggle('active', mode === 'draw');
    if (i === 1) mini.classList.toggle('active', mode === 'text');
    if (i === 2) mini.classList.toggle('active', mode === 'game');
  });

  // Show/hide toolbar
  const toolbar = shadowRoot?.querySelector('.toolbar');
  toolbar?.classList.toggle('show', mode !== 'none');

  // Toggle draw/text/game controls
  const drawControls = shadowRoot?.querySelector('#draw-controls');
  const textControls = shadowRoot?.querySelector('#text-controls');
  const gameControls = shadowRoot?.querySelector('#game-controls');
  drawControls?.classList.toggle('active', mode === 'draw');
  textControls?.classList.toggle('active', mode === 'text');
  gameControls?.classList.toggle('active', mode === 'game');

  // Update size slider defaults based on mode
  const sizeInput = shadowRoot?.querySelector('#oo-size') as HTMLInputElement;
  const sizeDisplay = shadowRoot?.querySelector('#oo-size-display');
  if (sizeInput && sizeDisplay) {
    if (mode === 'text') {
      sizeInput.value = '32';
      sizeInput.max = '300';
      sizeDisplay.textContent = '32';
    } else if (mode === 'draw') {
      sizeInput.value = '4';
      sizeInput.max = '150';
      sizeDisplay.textContent = '4';
    }
  }

  // Reset eraser when entering mode
  if (mode !== 'none') {
    isEraser = false;
    shadowRoot?.querySelector('#oo-eraser')?.classList.remove('active');
  }

  // Clear pending text when leaving text mode
  if (mode !== 'text') {
    pendingText = '';
    const textInput = shadowRoot?.querySelector('#oo-text-input') as HTMLInputElement;
    if (textInput) textInput.value = '';
  }

  // Dispatch mode change event for canvas
  document.dispatchEvent(new CustomEvent('oo:mode', { detail: { mode } }));

  // Handle game mode
  if (mode === 'game') {
    // Always start in build mode when opening game toolbar
    gameSubMode = 'build';

    // Reset the game mode toggle buttons to show Build as active
    const gameModeButtons = shadowRoot?.querySelectorAll('.game-mode-btn');
    gameModeButtons?.forEach(btn => {
      const btnMode = (btn as HTMLElement).dataset.mode;
      btn.classList.toggle('active', btnMode === 'build');
    });

    // Show build tools
    const buildTools = shadowRoot?.querySelector('.build-tools-section') as HTMLElement;
    if (buildTools) buildTools.style.display = 'flex';

    // Dispatch build mode
    document.dispatchEvent(new CustomEvent('oo:gamemode', {
      detail: { mode: 'build', tool: gameBuildTool }
    }));
  } else if (prevMode === 'game') {
    // Exiting game mode
    document.dispatchEvent(new CustomEvent('oo:gamemode', { detail: { mode: 'none' } }));
  }

  console.log('[OpenOverlay] Mode:', mode);
}

export function getColor(): string {
  const input = shadowRoot?.querySelector('#oo-color') as HTMLInputElement;
  return input?.value || '#ff3366';
}

export function getSize(): number {
  const input = shadowRoot?.querySelector('#oo-size') as HTMLInputElement;
  return parseInt(input?.value || '4', 10);
}

export function getOpacity(): number {
  const input = shadowRoot?.querySelector('#oo-opacity') as HTMLInputElement;
  return parseInt(input?.value || '100', 10) / 100;
}

export function getBrush(): string {
  return currentBrush;
}

export function getEraser(): boolean {
  return isEraser;
}

export function getTextStyle(): string {
  return currentTextStyle;
}

export function getPendingText(): string {
  return pendingText;
}

export function clearPendingText(): void {
  pendingText = '';
  const textInput = shadowRoot?.querySelector('#oo-text-input') as HTMLInputElement;
  if (textInput) textInput.value = '';
}

export function getShadowRoot(): ShadowRoot | null {
  return shadowRoot;
}
