/**
 * Smudgy's Home Module
 *
 * A persistent floating "home" area that stays on all web pages.
 * Smudgy can hang out here, do idle behaviors, and users can customize it.
 */

// Home furniture/decoration types
export type HomeFurniture =
  | 'hammock'
  | 'bed'
  | 'couch'
  | 'beanbag'
  | 'campfire'
  | 'trampoline'
  | 'gym'
  | 'none';

// Home state
interface HomeState {
  isVisible: boolean;
  isMinimized: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  furniture: HomeFurniture;
  smudgyInHome: boolean;
  lastVisit: number;
}

// Storage keys
const STORAGE_KEY_STATE = 'oo_home_state';
const STORAGE_KEY_FURNITURE = 'oo_home_furniture';

// Default state
let homeState: HomeState = {
  isVisible: true,
  isMinimized: false,
  x: -1, // -1 means use default position
  y: -1,
  width: 150,
  height: 100,
  furniture: 'hammock',
  smudgyInHome: false,
  lastVisit: 0,
};

// DOM elements
let homeContainer: HTMLDivElement | null = null;
let homeCanvas: HTMLCanvasElement | null = null;
let homeCtx: CanvasRenderingContext2D | null = null;
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

// Callbacks
let onSmudgyEnterHome: (() => void) | null = null;
let onSmudgyExitHome: (() => void) | null = null;

/**
 * Load home state from localStorage
 */
function loadHomeState(): void {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_STATE);
    if (saved) {
      const parsed = JSON.parse(saved);
      homeState = { ...homeState, ...parsed };
    }
    const furniture = localStorage.getItem(STORAGE_KEY_FURNITURE);
    if (furniture) {
      homeState.furniture = furniture as HomeFurniture;
    }
  } catch (e) {
    console.warn('[SmudgyHome] Failed to load state:', e);
  }
}

/**
 * Save home state to localStorage
 */
function saveHomeState(): void {
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
      x: homeState.x,
      y: homeState.y,
      isMinimized: homeState.isMinimized,
      isVisible: homeState.isVisible,
    }));
    localStorage.setItem(STORAGE_KEY_FURNITURE, homeState.furniture);
  } catch (e) {
    console.warn('[SmudgyHome] Failed to save state:', e);
  }
}

/**
 * Initialize Smudgy's Home
 */
export function initHome(): void {
  loadHomeState();
  createHomeUI();
  console.log('[SmudgyHome] Initialized with furniture:', homeState.furniture);
}

/**
 * Create the home UI elements
 */
function createHomeUI(): void {
  // Create container
  homeContainer = document.createElement('div');
  homeContainer.id = 'smudgy-home';
  homeContainer.style.cssText = `
    position: fixed;
    z-index: 2147483640;
    pointer-events: auto;
    background: transparent;
    border-radius: 16px;
    overflow: visible;
    transition: opacity 0.3s, transform 0.3s;
    cursor: grab;
  `;

  // Set position
  const defaultX = window.innerWidth - homeState.width - 80;
  const defaultY = 20;
  homeContainer.style.left = `${homeState.x >= 0 ? homeState.x : defaultX}px`;
  homeContainer.style.top = `${homeState.y >= 0 ? homeState.y : defaultY}px`;
  homeContainer.style.width = `${homeState.width}px`;
  homeContainer.style.height = `${homeState.height}px`;

  // Create canvas for drawing the home
  homeCanvas = document.createElement('canvas');
  homeCanvas.width = homeState.width * 2; // 2x for retina
  homeCanvas.height = homeState.height * 2;
  homeCanvas.style.cssText = `
    width: 100%;
    height: 100%;
    display: block;
  `;
  homeContainer.appendChild(homeCanvas);
  homeCtx = homeCanvas.getContext('2d');

  // Create minimize button
  const minimizeBtn = document.createElement('button');
  minimizeBtn.textContent = '−';
  minimizeBtn.title = 'Minimize home';
  minimizeBtn.style.cssText = `
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background: #ff69b4;
    color: white;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    opacity: 0;
    transition: opacity 0.2s;
    z-index: 10;
  `;
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    toggleMinimize();
  };
  homeContainer.appendChild(minimizeBtn);

  // Show button on hover
  homeContainer.addEventListener('mouseenter', () => {
    minimizeBtn.style.opacity = '1';
  });
  homeContainer.addEventListener('mouseleave', () => {
    minimizeBtn.style.opacity = '0';
  });

  // Dragging
  homeContainer.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);

  // Add to page
  document.body.appendChild(homeContainer);

  // Initial draw
  drawHome();

  // Handle minimized state
  if (homeState.isMinimized) {
    applyMinimizedState();
  }
}

/**
 * Start dragging the home
 */
function startDrag(e: MouseEvent): void {
  if (!homeContainer) return;
  isDragging = true;
  homeContainer.style.cursor = 'grabbing';
  const rect = homeContainer.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
}

/**
 * Handle drag movement
 */
function onDrag(e: MouseEvent): void {
  if (!isDragging || !homeContainer) return;

  const newX = Math.max(0, Math.min(window.innerWidth - homeState.width, e.clientX - dragOffsetX));
  const newY = Math.max(0, Math.min(window.innerHeight - homeState.height, e.clientY - dragOffsetY));

  homeContainer.style.left = `${newX}px`;
  homeContainer.style.top = `${newY}px`;

  homeState.x = newX;
  homeState.y = newY;
}

/**
 * End dragging
 */
function endDrag(): void {
  if (!homeContainer) return;
  if (isDragging) {
    isDragging = false;
    homeContainer.style.cursor = 'grab';
    saveHomeState();
  }
}

/**
 * Toggle minimize state
 */
function toggleMinimize(): void {
  homeState.isMinimized = !homeState.isMinimized;
  if (homeState.isMinimized) {
    applyMinimizedState();
  } else {
    applyExpandedState();
  }
  saveHomeState();
}

/**
 * Apply minimized visual state
 */
function applyMinimizedState(): void {
  if (!homeContainer) return;
  homeContainer.style.transform = 'scale(0.3)';
  homeContainer.style.opacity = '0.5';
  homeContainer.style.transformOrigin = 'top right';
}

/**
 * Apply expanded visual state
 */
function applyExpandedState(): void {
  if (!homeContainer) return;
  homeContainer.style.transform = 'scale(1)';
  homeContainer.style.opacity = '1';
}

/**
 * Draw the home and its furniture
 */
function drawHome(): void {
  if (!homeCtx || !homeCanvas) return;

  const w = homeCanvas.width;
  const h = homeCanvas.height;
  const ctx = homeCtx;

  // Clear
  ctx.clearRect(0, 0, w, h);

  // Scale for retina
  ctx.save();
  ctx.scale(2, 2);

  const actualW = w / 2;
  const actualH = h / 2;

  // Draw background (cozy gradient)
  const gradient = ctx.createRadialGradient(
    actualW / 2, actualH / 2, 0,
    actualW / 2, actualH / 2, actualW
  );
  gradient.addColorStop(0, 'rgba(255, 182, 193, 0.3)'); // Light pink center
  gradient.addColorStop(1, 'rgba(255, 105, 180, 0.1)'); // Transparent pink edge
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(0, 0, actualW, actualH, 16);
  ctx.fill();

  // Dotted border
  ctx.strokeStyle = 'rgba(255, 105, 180, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.roundRect(2, 2, actualW - 4, actualH - 4, 14);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw furniture based on type
  drawFurniture(ctx, actualW, actualH, homeState.furniture);

  // Label
  ctx.fillStyle = 'rgba(255, 105, 180, 0.6)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("Smudgy's Home", actualW / 2, actualH - 6);

  ctx.restore();
}

/**
 * Draw furniture inside the home
 */
function drawFurniture(ctx: CanvasRenderingContext2D, w: number, h: number, furniture: HomeFurniture): void {
  const centerX = w / 2;
  const centerY = h / 2;

  switch (furniture) {
    case 'hammock':
      // Draw hammock
      ctx.strokeStyle = '#8B4513'; // Brown rope
      ctx.lineWidth = 2;

      // Left pole
      ctx.beginPath();
      ctx.moveTo(15, h - 10);
      ctx.lineTo(25, 25);
      ctx.stroke();

      // Right pole
      ctx.beginPath();
      ctx.moveTo(w - 15, h - 10);
      ctx.lineTo(w - 25, 25);
      ctx.stroke();

      // Hammock fabric (curved)
      ctx.fillStyle = 'rgba(144, 238, 144, 0.6)'; // Light green
      ctx.beginPath();
      ctx.moveTo(25, 28);
      ctx.quadraticCurveTo(centerX, 55, w - 25, 28);
      ctx.quadraticCurveTo(centerX, 65, 25, 28);
      ctx.fill();
      ctx.strokeStyle = '#228B22';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Rope connections
      ctx.strokeStyle = '#8B4513';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(25, 25);
      ctx.lineTo(25, 28);
      ctx.moveTo(w - 25, 25);
      ctx.lineTo(w - 25, 28);
      ctx.stroke();
      break;

    case 'bed':
      // Simple bed
      ctx.fillStyle = '#DEB887'; // Tan frame
      ctx.fillRect(20, h - 35, w - 40, 25);

      // Mattress
      ctx.fillStyle = '#F5F5DC'; // Beige
      ctx.fillRect(22, h - 33, w - 44, 18);

      // Pillow
      ctx.fillStyle = '#FFFAF0';
      ctx.beginPath();
      ctx.ellipse(35, h - 28, 12, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#DDD';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Blanket
      ctx.fillStyle = 'rgba(255, 182, 193, 0.8)';
      ctx.fillRect(50, h - 32, w - 75, 14);
      break;

    case 'couch':
      // Couch back
      ctx.fillStyle = '#4169E1';
      ctx.beginPath();
      ctx.roundRect(20, 30, w - 40, 20, 5);
      ctx.fill();

      // Couch seat
      ctx.fillStyle = '#6495ED';
      ctx.beginPath();
      ctx.roundRect(15, 45, w - 30, 25, 5);
      ctx.fill();

      // Armrests
      ctx.fillStyle = '#4169E1';
      ctx.beginPath();
      ctx.roundRect(15, 35, 12, 38, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(w - 27, 35, 12, 38, 4);
      ctx.fill();
      break;

    case 'beanbag':
      // Bean bag chair
      ctx.fillStyle = '#FF6347';
      ctx.beginPath();
      ctx.ellipse(centerX, h - 30, 35, 25, 0, 0, Math.PI * 2);
      ctx.fill();

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath();
      ctx.ellipse(centerX - 10, h - 40, 15, 10, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'campfire':
      // Logs
      ctx.fillStyle = '#8B4513';
      ctx.beginPath();
      ctx.ellipse(centerX - 15, h - 20, 20, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(centerX + 15, h - 20, 20, 6, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Fire
      const fireColors = ['#FF4500', '#FF6347', '#FFD700'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = fireColors[i];
        ctx.beginPath();
        ctx.moveTo(centerX - 10 + i * 5, h - 25);
        ctx.quadraticCurveTo(centerX - 5 + i * 5, h - 50 - i * 5, centerX + i * 5, h - 25);
        ctx.fill();
      }
      break;

    case 'trampoline':
      // Frame
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(centerX, h - 25, 45, 15, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Bouncy surface
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.beginPath();
      ctx.ellipse(centerX, h - 25, 42, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Legs
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 2;
      const legAngles = [0.3, 0.7, 1.3, 1.7];
      for (const angle of legAngles) {
        const legX = centerX + Math.cos(angle * Math.PI) * 40;
        ctx.beginPath();
        ctx.moveTo(legX, h - 15);
        ctx.lineTo(legX + (angle < 1 ? 5 : -5), h - 5);
        ctx.stroke();
      }
      break;

    case 'gym':
      // Pull-up bar
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(20, 20);
      ctx.lineTo(20, 50);
      ctx.moveTo(w - 20, 20);
      ctx.lineTo(w - 20, 50);
      ctx.moveTo(20, 25);
      ctx.lineTo(w - 20, 25);
      ctx.stroke();

      // Dumbbells
      ctx.fillStyle = '#333';
      ctx.fillRect(30, h - 25, 25, 5);
      ctx.beginPath();
      ctx.arc(30, h - 22, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(55, h - 22, 6, 0, Math.PI * 2);
      ctx.fill();

      // Yoga mat
      ctx.fillStyle = 'rgba(138, 43, 226, 0.5)';
      ctx.fillRect(w - 55, h - 20, 35, 12);
      break;

    case 'none':
    default:
      // Just empty space with a small rug
      ctx.fillStyle = 'rgba(255, 182, 193, 0.4)';
      ctx.beginPath();
      ctx.ellipse(centerX, h - 25, 40, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/**
 * Get the home bounds for collision detection
 */
export function getHomeBounds(): { x: number; y: number; width: number; height: number } | null {
  if (!homeContainer || homeState.isMinimized || !homeState.isVisible) {
    return null;
  }

  const rect = homeContainer.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Check if a position is inside the home
 */
export function isInsideHome(x: number, y: number): boolean {
  const bounds = getHomeBounds();
  if (!bounds) return false;

  return x >= bounds.x && x <= bounds.x + bounds.width &&
         y >= bounds.y && y <= bounds.y + bounds.height;
}

/**
 * Set the furniture type
 */
export function setFurniture(furniture: HomeFurniture): void {
  homeState.furniture = furniture;
  saveHomeState();
  drawHome();
}

/**
 * Get current furniture
 */
export function getFurniture(): HomeFurniture {
  return homeState.furniture;
}

/**
 * Get available furniture options
 */
export function getAvailableFurniture(): HomeFurniture[] {
  return ['hammock', 'bed', 'couch', 'beanbag', 'campfire', 'trampoline', 'gym', 'none'];
}

/**
 * Show the home
 */
export function showHome(): void {
  if (!homeContainer) {
    createHomeUI();
  } else {
    homeContainer.style.display = 'block';
  }
  homeState.isVisible = true;
  saveHomeState();
}

/**
 * Hide the home
 */
export function hideHome(): void {
  if (homeContainer) {
    homeContainer.style.display = 'none';
  }
  homeState.isVisible = false;
  saveHomeState();
}

/**
 * Toggle home visibility
 */
export function toggleHome(): void {
  if (homeState.isVisible) {
    hideHome();
  } else {
    showHome();
  }
}

/**
 * Check if home is visible
 */
export function isHomeVisible(): boolean {
  return homeState.isVisible && !homeState.isMinimized;
}

/**
 * Get the rest position in the home (where Smudgy should go to rest)
 */
export function getHomeRestPosition(): { x: number; y: number } | null {
  const bounds = getHomeBounds();
  if (!bounds) return null;

  // Position depends on furniture
  switch (homeState.furniture) {
    case 'hammock':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height * 0.45 };
    case 'bed':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 30 };
    case 'couch':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 25 };
    case 'beanbag':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 20 };
    case 'trampoline':
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 35 };
    default:
      return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 20 };
  }
}

/**
 * Notify that Smudgy entered the home
 */
export function smudgyEnteredHome(): void {
  homeState.smudgyInHome = true;
  homeState.lastVisit = Date.now();
  if (onSmudgyEnterHome) onSmudgyEnterHome();
}

/**
 * Notify that Smudgy left the home
 */
export function smudgyLeftHome(): void {
  homeState.smudgyInHome = false;
  if (onSmudgyExitHome) onSmudgyExitHome();
}

/**
 * Check if Smudgy is in the home
 */
export function isSmudgyInHome(): boolean {
  return homeState.smudgyInHome;
}

/**
 * Set callbacks for home events
 */
export function setHomeCallbacks(onEnter: () => void, onExit: () => void): void {
  onSmudgyEnterHome = onEnter;
  onSmudgyExitHome = onExit;
}

/**
 * Cleanup home
 */
export function cleanupHome(): void {
  if (homeContainer) {
    homeContainer.remove();
    homeContainer = null;
  }
  homeCanvas = null;
  homeCtx = null;
}
