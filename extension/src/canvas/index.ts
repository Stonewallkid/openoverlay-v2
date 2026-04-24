/**
 * Canvas Module
 * Handles freehand drawing with multiple brush styles
 */

import { getColor, getSize, getOpacity, getBrush, getEraser, getLayer, getTextStyle, getPendingText, clearPendingText, getShape, getShapeFilled } from '@/ui';
import { saveDrawingToCloud, loadDrawingsFromCloud, deleteDrawingFromCloud, subscribeToDrawings, unsubscribeFromDrawings, isFirestoreAvailable, isLoggedIn, getFollowing } from '@/db';
import { onAuthStateChanged, getCurrentUser } from '@/auth';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
// Separate canvas for collision detection (only normal layer items)
let collisionCanvas: HTMLCanvasElement | null = null;
let collisionCtx: CanvasRenderingContext2D | null = null;
// Background canvas renders BEHIND game character (lower z-index)
let backgroundCanvas: HTMLCanvasElement | null = null;
let backgroundCtx: CanvasRenderingContext2D | null = null;
let isDrawing = false;
let currentMode: 'none' | 'draw' | 'text' = 'none';
let isGameMode = false;

// Stroke with element-relative coordinates
interface Stroke {
  type: 'stroke';
  anchorSelector: string;
  points: { x: number; y: number }[];
  anchorBounds: { x: number; y: number; width: number; height: number };
  color: string;
  width: number;
  opacity: number;
  brush: string;
  eraser: boolean;
  layer?: 'normal' | 'background' | 'foreground'; // Layer for render order & collision
}

// Text item with element-relative position
interface TextItem {
  type: 'text';
  id: string;
  anchorSelector: string;
  // Position relative to anchor (0-1 range)
  x: number;
  y: number;
  anchorBounds: { x: number; y: number; width: number; height: number };
  text: string;
  color: string;
  size: number;
  opacity: number;
  style: string; // 'normal' | 'rainbow' | 'aged'
  rotation?: number; // Rotation in radians
}

// Shape item
interface ShapeItem {
  type: 'shape';
  id: string;
  anchorSelector: string;
  // Start and end positions relative to anchor (0-1 range)
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  anchorBounds: { x: number; y: number; width: number; height: number };
  shape: 'rectangle' | 'circle' | 'line' | 'triangle' | 'star';
  color: string;
  width: number;
  opacity: number;
  filled: boolean;
  layer?: 'normal' | 'background' | 'foreground'; // Layer for render order & collision
}

type DrawItem = Stroke | TextItem | ShapeItem;

// Current user's items (editable)
let items: DrawItem[] = [];
// Other users' items (read-only, rendered in background)
let otherUsersItems: DrawItem[] = [];

// Drawing visibility controls
interface DrawingVisibility {
  showAll: boolean;           // Master toggle (hides everything if false)
  showMine: boolean;          // Show my own drawings
  showFollowing: boolean;     // Show drawings from users I follow (when true, only followed users shown)
  hiddenUsers: Set<string>;   // Individual user IDs to hide
}

let drawingVisibility: DrawingVisibility = {
  showAll: true,
  showMine: true,
  showFollowing: false,  // Default: show everyone, not just following
  hiddenUsers: new Set(),
};

// Cache of followed user IDs (fetched once per page load)
let followingCache: Set<string> | null = null;

// Contributors on this page (for UI display)
let pageContributors: { userId: string; displayName: string; photoURL: string }[] = [];

let currentStroke: { x: number; y: number }[] = [];
let currentAnchor: { element: Element; selector: string; bounds: DOMRect } | null = null;

// Shape drawing
let currentShape: 'none' | 'rectangle' | 'circle' | 'line' | 'triangle' | 'star' = 'none';
let shapeStart: { x: number; y: number } | null = null;
let shapeEnd: { x: number; y: number } | null = null;
let shapeFilled = false;

// Rainbow hue tracking
let rainbowHue = 0;

// Text editing
let selectedTextId: string | null = null;
let dragOffset = { x: 0, y: 0 };

// Interaction modes for selected text
type InteractionMode = 'none' | 'move' | 'resize' | 'rotate';
let interactionMode: InteractionMode = 'none';
let interactionStart = { x: 0, y: 0, size: 0, rotation: 0 };

// Handle positions (for hit detection)
const HANDLE_SIZE = 10;
const ROTATION_HANDLE_DISTANCE = 30;

/**
 * Generate a unique CSS selector for an element
 */
function getSelector(el: Element): string {
  // Handle body/html directly
  if (el === document.body || el === document.documentElement) {
    return 'body';
  }

  if (el.id) {
    return `#${CSS.escape(el.id)}`;
  }

  const path: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.body && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();

    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 2);
      if (classes.length > 0 && classes[0]) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
    }

    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    if (path.length >= 4) break;
    current = current.parentElement;
  }

  return path.join(' > ') || 'body';
}

/**
 * Find the best anchor element at a point
 */
function findAnchorElement(x: number, y: number): Element | null {
  if (canvas) canvas.style.pointerEvents = 'none';
  const elements = document.elementsFromPoint(x, y);
  if (canvas) canvas.style.pointerEvents = currentMode === 'draw' ? 'auto' : 'none';

  for (const el of elements) {
    if (el.id === 'oo-canvas' || el.id === 'openoverlay-ui') continue;
    if (el === document.body || el === document.documentElement) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) continue;

    return el;
  }

  return document.body;
}

/**
 * Initialize the canvas
 */
export function initCanvas(): void {
  console.log('[OpenOverlay] initCanvas starting...');

  canvas = document.createElement('canvas');
  canvas.id = 'oo-canvas';
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483640;
    pointer-events: none;
  `;

  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');

  // Create offscreen collision canvas (only collidable items)
  collisionCanvas = document.createElement('canvas');
  collisionCtx = collisionCanvas.getContext('2d');

  // Create visible background canvas (BEHIND game character)
  // Game canvas is at z-index 2147483638, so we use 2147483635
  backgroundCanvas = document.createElement('canvas');
  backgroundCanvas.id = 'oo-background-canvas';
  backgroundCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483635;
    pointer-events: none;
  `;
  document.body.appendChild(backgroundCanvas);
  backgroundCtx = backgroundCanvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Redraw on scroll to keep collision canvas in sync
  let scrollTimeout: number | null = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = window.setTimeout(() => {
      if (!isDrawing) redraw();
    }, 50);
  }, { passive: true });

  const resizeObserver = new ResizeObserver(resizeCanvas);
  resizeObserver.observe(document.body);

  // Watch for DOM changes
  let mutationTimeout: number | null = null;
  const mutationObserver = new MutationObserver(() => {
    if (mutationTimeout) clearTimeout(mutationTimeout);
    mutationTimeout = window.setTimeout(() => {
      if (!isDrawing) redraw();
    }, 100);
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Mode changes
  document.addEventListener('oo:mode', ((e: CustomEvent) => {
    currentMode = e.detail.mode;
    if (canvas) {
      canvas.style.pointerEvents = (currentMode === 'draw' || currentMode === 'text') ? 'auto' : 'none';
      canvas.style.cursor = currentMode === 'draw' ? 'crosshair' : currentMode === 'text' ? 'text' : 'default';
    }
  }) as EventListener);

  // Events
  document.addEventListener('oo:save', saveDrawing);
  document.addEventListener('oo:cancel', cancelDrawing);
  document.addEventListener('oo:undo', undoStroke);
  document.addEventListener('oo:clear', clearStrokes);

  // Visibility toggles
  document.addEventListener('oo:visibility:all', ((e: CustomEvent) => {
    drawingVisibility.showAll = e.detail.show;
    saveVisibilityPrefs();
    redraw();
    console.log('[OpenOverlay] Visibility - show all:', e.detail.show);
  }) as EventListener);

  document.addEventListener('oo:visibility:mine', ((e: CustomEvent) => {
    drawingVisibility.showMine = e.detail.show;
    saveVisibilityPrefs();
    redraw();
    console.log('[OpenOverlay] Visibility - show mine:', e.detail.show);
  }) as EventListener);

  document.addEventListener('oo:visibility:following', ((e: CustomEvent) => {
    drawingVisibility.showFollowing = e.detail.show;
    saveVisibilityPrefs();
    redraw();
    console.log('[OpenOverlay] Visibility - following only:', e.detail.show);
  }) as EventListener);

  document.addEventListener('oo:visibility:user', ((e: CustomEvent) => {
    const { userId, show } = e.detail;
    if (show) {
      drawingVisibility.hiddenUsers.delete(userId);
    } else {
      drawingVisibility.hiddenUsers.add(userId);
    }
    saveVisibilityPrefs();
    redraw();
    console.log('[OpenOverlay] Visibility - user', userId, ':', show ? 'shown' : 'hidden');
  }) as EventListener);

  // Legacy toggle support (for backward compatibility)
  document.addEventListener('oo:toggleothers', ((e: CustomEvent) => {
    drawingVisibility.showAll = e.detail.show;
    saveVisibilityPrefs();
    redraw();
  }) as EventListener);

  // Load saved visibility preferences
  loadVisibilityPrefs();

  // Track game mode to avoid canvas undo/clear when in game
  document.addEventListener('oo:gamemode', ((e: CustomEvent) => {
    isGameMode = e.detail.mode === 'build';
  }) as EventListener);

  // Listen for settings changes to update selected text
  document.addEventListener('oo:settings', ((e: CustomEvent) => {
    if (selectedTextId && currentMode === 'text') {
      const textItem = items.find(i => i.type === 'text' && i.id === selectedTextId) as TextItem | undefined;
      if (textItem) {
        // Update selected text properties
        textItem.size = e.detail.size;
        textItem.color = e.detail.color;
        textItem.opacity = e.detail.opacity;
        textItem.style = e.detail.textStyle;
        redraw();
      }
    }
  }) as EventListener);

  // Drawing events
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);


  loadDrawings();

  // Listen for auth changes to reload cloud drawings
  setupAuthListener();

  console.log('[OpenOverlay] Canvas initialized');
}

function resizeCanvas(): void {
  if (!canvas || !ctx) return;

  const docWidth = Math.max(
    document.body.scrollWidth,
    document.body.offsetWidth,
    document.documentElement.scrollWidth,
    document.documentElement.offsetWidth
  );
  const docHeight = Math.max(
    document.body.scrollHeight,
    document.body.offsetHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight
  );

  const dpr = window.devicePixelRatio || 1;

  canvas.style.width = `${docWidth}px`;
  canvas.style.height = `${docHeight}px`;
  canvas.width = docWidth * dpr;
  canvas.height = docHeight * dpr;
  ctx.scale(dpr, dpr);

  // Resize collision canvas to match
  if (collisionCanvas && collisionCtx) {
    collisionCanvas.width = docWidth * dpr;
    collisionCanvas.height = docHeight * dpr;
    // Reset transform before applying scale (setting width/height resets it, but be explicit)
    collisionCtx.setTransform(1, 0, 0, 1, 0, 0);
    collisionCtx.scale(dpr, dpr);
  }

  // Resize background canvas to match
  if (backgroundCanvas && backgroundCtx) {
    backgroundCanvas.style.width = `${docWidth}px`;
    backgroundCanvas.style.height = `${docHeight}px`;
    backgroundCanvas.width = docWidth * dpr;
    backgroundCanvas.height = docHeight * dpr;
    backgroundCtx.scale(dpr, dpr);
  }

  redraw();
}

function onPointerDown(e: PointerEvent): void {
  // Handle text mode
  if (currentMode === 'text') {
    handleTextPlacement(e);
    return;
  }

  if (currentMode !== 'draw') return;

  isDrawing = true;
  // Don't reset rainbowHue - let it continue cycling across strokes

  const anchor = findAnchorElement(e.clientX, e.clientY);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    currentAnchor = {
      element: anchor,
      selector: getSelector(anchor),
      bounds: rect,
    };
  }

  // Check if we're drawing a shape
  const shapeType = getShape();
  if (shapeType !== 'none') {
    currentShape = shapeType as any;
    shapeStart = { x: e.pageX, y: e.pageY };
    shapeEnd = { x: e.pageX, y: e.pageY };
    shapeFilled = getShapeFilled();
  } else {
    currentStroke = [{ x: e.pageX, y: e.pageY }];
  }
}

function getTextBounds(item: TextItem): { x: number; y: number; width: number; height: number; centerX: number; centerY: number } | null {
  if (!ctx) return null;

  const pos = getTextPosition(item);
  if (!pos) return null;

  ctx.font = `bold ${item.size || 32}px Impact, Arial, sans-serif`;
  const metrics = ctx.measureText(item.text);
  const width = metrics.width;
  const height = item.size;

  return {
    x: pos.x,
    y: pos.y,
    width,
    height,
    centerX: pos.x + width / 2,
    centerY: pos.y + height / 2,
  };
}

function getHandleAtPoint(x: number, y: number, item: TextItem): InteractionMode {
  const bounds = getTextBounds(item);
  if (!bounds) return 'none';

  const padding = 8;
  const rotation = item.rotation || 0;

  // Define handle positions (corners + rotation handle)
  const handles = [
    // Bottom-right corner = resize
    { x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding, mode: 'resize' as InteractionMode },
  ];

  // Rotation handle (above the selection box)
  const rotHandleX = bounds.centerX;
  const rotHandleY = bounds.y - padding - ROTATION_HANDLE_DISTANCE;

  // Check rotation handle first (with rotation transform)
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);

  // Transform rotation handle position
  const relRotX = rotHandleX - bounds.centerX;
  const relRotY = rotHandleY - bounds.centerY;
  const rotatedRotX = bounds.centerX + relRotX * cosR - relRotY * sinR;
  const rotatedRotY = bounds.centerY + relRotX * sinR + relRotY * cosR;

  if (Math.abs(x - rotatedRotX) < HANDLE_SIZE && Math.abs(y - rotatedRotY) < HANDLE_SIZE) {
    return 'rotate';
  }

  // Check resize handle (bottom-right corner)
  const relResizeX = handles[0].x - bounds.centerX;
  const relResizeY = handles[0].y - bounds.centerY;
  const rotatedResizeX = bounds.centerX + relResizeX * cosR - relResizeY * sinR;
  const rotatedResizeY = bounds.centerY + relResizeX * sinR + relResizeY * cosR;

  if (Math.abs(x - rotatedResizeX) < HANDLE_SIZE && Math.abs(y - rotatedResizeY) < HANDLE_SIZE) {
    return 'resize';
  }

  return 'none';
}

function updateCursor(e: PointerEvent): void {
  if (!canvas || currentMode !== 'text') return;

  // Check if over selected text's handles
  if (selectedTextId) {
    const textItem = items.find(i => i.type === 'text' && i.id === selectedTextId) as TextItem | undefined;
    if (textItem) {
      const handle = getHandleAtPoint(e.pageX, e.pageY, textItem);
      if (handle === 'resize') {
        canvas.style.cursor = 'nwse-resize';
        return;
      } else if (handle === 'rotate') {
        canvas.style.cursor = 'crosshair';
        return;
      }
    }
  }

  // Check if over any text
  const textAtPoint = findTextAtPoint(e.pageX, e.pageY);
  if (textAtPoint) {
    canvas.style.cursor = 'grab';
  } else {
    canvas.style.cursor = 'default';
  }
}

function handleTextPlacement(e: PointerEvent): void {
  // First check if clicking on a handle of selected text
  if (selectedTextId) {
    const textItem = items.find(i => i.type === 'text' && i.id === selectedTextId) as TextItem | undefined;
    if (textItem) {
      const handle = getHandleAtPoint(e.pageX, e.pageY, textItem);
      if (handle !== 'none') {
        interactionMode = handle;
        const bounds = getTextBounds(textItem);
        if (bounds) {
          interactionStart = {
            x: e.pageX,
            y: e.pageY,
            size: textItem.size,
            rotation: textItem.rotation || 0,
          };
        }
        return;
      }
    }
  }

  // Check if clicking on existing text to select/drag it
  const clickedText = findTextAtPoint(e.pageX, e.pageY);

  if (clickedText) {
    // Select this text for dragging
    selectedTextId = clickedText.id;
    interactionMode = 'move';

    // Calculate drag offset (where within the text we clicked)
    const textPos = getTextPosition(clickedText);
    if (textPos) {
      dragOffset = {
        x: e.pageX - textPos.x,
        y: e.pageY - textPos.y,
      };
    }

    if (canvas) canvas.style.cursor = 'grabbing';
    redraw(); // Show selection
    return;
  }

  // If no text input, just deselect
  const text = getPendingText();
  if (!text || !text.trim()) {
    if (selectedTextId) {
      selectedTextId = null;
      interactionMode = 'none';
      redraw();
    }
    return;
  }

  // Place new text
  const anchor = findAnchorElement(e.clientX, e.clientY);
  if (!anchor) {
    return;
  }

  const rect = anchor.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const elemPageX = rect.left + scrollX;
  const elemPageY = rect.top + scrollY;

  const relX = (e.pageX - elemPageX) / rect.width;
  const relY = (e.pageY - elemPageY) / rect.height;

  const textItem: TextItem = {
    type: 'text',
    id: generateId(),
    anchorSelector: getSelector(anchor),
    x: relX,
    y: relY,
    anchorBounds: {
      x: elemPageX,
      y: elemPageY,
      width: rect.width,
      height: rect.height,
    },
    text: text,
    color: getColor(),
    size: getSize(),
    opacity: getOpacity(),
    style: getTextStyle(),
    rotation: 0,
  };

  items.push(textItem);
  selectedTextId = textItem.id;
  clearPendingText();
  redraw();
}

function getTextPosition(item: TextItem): { x: number; y: number } | null {
  let el: Element | null = null;
  try {
    el = document.querySelector(item.anchorSelector);
  } catch { }

  if (!el) return null;

  const domRect = el.getBoundingClientRect();
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  return {
    x: domRect.left + scrollX + item.x * domRect.width,
    y: domRect.top + scrollY + item.y * domRect.height,
  };
}

function onPointerMove(e: PointerEvent): void {
  // Update cursor in text mode
  if (currentMode === 'text' && interactionMode === 'none') {
    updateCursor(e);
  }

  // Handle text interactions
  if (selectedTextId && currentMode === 'text' && interactionMode !== 'none') {
    const textItem = items.find(i => i.type === 'text' && i.id === selectedTextId) as TextItem | undefined;
    if (!textItem) return;

    if (interactionMode === 'move') {
      // Moving text
      let el: Element | null = null;
      try {
        el = document.querySelector(textItem.anchorSelector);
      } catch { }

      if (el) {
        const domRect = el.getBoundingClientRect();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        const newX = e.pageX - dragOffset.x;
        const newY = e.pageY - dragOffset.y;

        textItem.x = (newX - domRect.left - scrollX) / domRect.width;
        textItem.y = (newY - domRect.top - scrollY) / domRect.height;

        redraw();
      }
    } else if (interactionMode === 'resize') {
      // Resizing text - scale based on drag distance from start
      const bounds = getTextBounds(textItem);
      if (bounds) {
        const dx = e.pageX - interactionStart.x;
        const dy = e.pageY - interactionStart.y;
        const delta = (dx + dy) / 2; // Average of x and y movement
        const newSize = Math.max(12, Math.min(200, interactionStart.size + delta));
        textItem.size = newSize;
        redraw();
      }
    } else if (interactionMode === 'rotate') {
      // Rotating text
      const bounds = getTextBounds(textItem);
      if (bounds) {
        // Calculate angle from center to current mouse position
        const angle = Math.atan2(e.pageY - bounds.centerY, e.pageX - bounds.centerX);
        // Offset by 90 degrees since handle is above the text
        textItem.rotation = angle + Math.PI / 2;
        redraw();
      }
    }
    return;
  }

  if (!isDrawing || !ctx) return;

  // Handle shape drawing
  if (currentShape !== 'none' && shapeStart) {
    shapeEnd = { x: e.pageX, y: e.pageY };
    redraw();
    drawShapeLive();
    return;
  }

  currentStroke.push({ x: e.pageX, y: e.pageY });

  // Draw current stroke live
  redraw();
  drawStrokeLive(currentStroke, getColor(), getSize(), getOpacity(), getBrush(), getEraser());
}

function onPointerUp(): void {
  // Handle text interaction end
  if (interactionMode !== 'none') {
    interactionMode = 'none';
    if (canvas) canvas.style.cursor = 'grab';
    // Keep text selected after interaction
    return;
  }

  if (!isDrawing) return;

  isDrawing = false;

  // Handle shape finalization
  if (currentShape !== 'none' && shapeStart && shapeEnd && currentAnchor) {
    const freshRect = currentAnchor.element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const elemPageX = freshRect.left + scrollX;
    const elemPageY = freshRect.top + scrollY;

    // Convert to relative coordinates
    const x1 = (shapeStart.x - elemPageX) / freshRect.width;
    const y1 = (shapeStart.y - elemPageY) / freshRect.height;
    const x2 = (shapeEnd.x - elemPageX) / freshRect.width;
    const y2 = (shapeEnd.y - elemPageY) / freshRect.height;

    items.push({
      type: 'shape',
      id: 'shape_' + Date.now(),
      anchorSelector: currentAnchor.selector,
      x1, y1, x2, y2,
      anchorBounds: {
        x: elemPageX,
        y: elemPageY,
        width: freshRect.width,
        height: freshRect.height,
      },
      shape: currentShape as any,
      color: getColor(),
      width: getSize(),
      opacity: getOpacity(),
      filled: shapeFilled,
      layer: getLayer(),
    });

    shapeStart = null;
    shapeEnd = null;
    currentShape = 'none';
    currentAnchor = null;
    redraw();
    return;
  }

  if (currentStroke.length > 1 && currentAnchor) {
    const freshRect = currentAnchor.element.getBoundingClientRect();
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const elemPageX = freshRect.left + scrollX;
    const elemPageY = freshRect.top + scrollY;

    const relativePoints = currentStroke.map(p => ({
      x: (p.x - elemPageX) / freshRect.width,
      y: (p.y - elemPageY) / freshRect.height,
    }));

    items.push({
      type: 'stroke',
      anchorSelector: currentAnchor.selector,
      points: relativePoints,
      anchorBounds: {
        x: elemPageX,
        y: elemPageY,
        width: freshRect.width,
        height: freshRect.height,
      },
      color: getColor(),
      width: getSize(),
      opacity: getOpacity(),
      brush: getBrush(),
      eraser: getEraser(),
      layer: getLayer(),
    });
  }

  currentStroke = [];
  currentAnchor = null;
  redraw();
}

function findTextAtPoint(x: number, y: number): TextItem | null {
  // Find text item at the given point
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== 'text') continue;

    let el: Element | null = null;
    try {
      el = document.querySelector(item.anchorSelector);
    } catch { }

    if (!el) continue;

    const domRect = el.getBoundingClientRect();
    const rect = {
      x: domRect.left + scrollX,
      y: domRect.top + scrollY,
      width: domRect.width,
      height: domRect.height,
    };

    const textX = rect.x + item.x * rect.width;
    const textY = rect.y + item.y * rect.height;

    // Text bounds - textBaseline is 'top' so text goes DOWN from y
    const textWidth = item.text.length * item.size * 0.6;
    const textHeight = item.size;
    const padding = 10; // Extra padding for easier clicking

    if (x >= textX - padding && x <= textX + textWidth + padding &&
        y >= textY - padding && y <= textY + textHeight + padding) {
      return item;
    }
  }

  return null;
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Draw a stroke with the specified brush style (for live preview)
 */
function drawStrokeLive(
  points: { x: number; y: number }[],
  color: string,
  width: number,
  opacity: number,
  brush: string,
  eraser: boolean
): void {
  if (!ctx || points.length < 2) return;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
  }

  switch (brush) {
    case 'spray':
      drawSpray(ctx, points, color, width);
      break;
    case 'dots':
      drawDots(ctx, points, color, width);
      break;
    case 'square':
      drawSquare(ctx, points, color, width);
      break;
    case 'rainbow':
      drawRainbow(ctx, points, width);
      break;
    case 'glow':
      drawGlow(ctx, points, color, width);
      break;
    default:
      drawSolid(ctx, points, color, width);
  }

  ctx.restore();
}

/**
 * Draw a saved stroke (converts from relative to absolute coords)
 */
function drawStrokeSaved(stroke: Stroke, rect: { x: number; y: number; width: number; height: number }): void {
  if (!ctx || stroke.points.length < 2) return;

  const pixelPoints = stroke.points.map(p => ({
    x: rect.x + p.x * rect.width,
    y: rect.y + p.y * rect.height,
  }));

  ctx.save();
  ctx.globalAlpha = stroke.opacity;

  if (stroke.eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
  }

  switch (stroke.brush) {
    case 'spray':
      drawSpray(ctx, pixelPoints, stroke.color, stroke.width);
      break;
    case 'dots':
      drawDots(ctx, pixelPoints, stroke.color, stroke.width);
      break;
    case 'square':
      drawSquare(ctx, pixelPoints, stroke.color, stroke.width);
      break;
    case 'rainbow':
      drawRainbowStatic(ctx, pixelPoints, stroke.width);
      break;
    case 'glow':
      drawGlow(ctx, pixelPoints, stroke.color, stroke.width);
      break;
    default:
      drawSolid(ctx, pixelPoints, stroke.color, stroke.width);
  }

  ctx.restore();
}

/**
 * Draw shape preview while dragging
 */
function drawShapeLive(): void {
  if (!ctx || !shapeStart || !shapeEnd) return;

  const color = getColor();
  const width = getSize();
  const opacity = getOpacity();
  const filled = getShapeFilled();

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const x1 = shapeStart.x;
  const y1 = shapeStart.y;
  const x2 = shapeEnd.x;
  const y2 = shapeEnd.y;

  drawShapeAtCoords(ctx, currentShape, x1, y1, x2, y2, filled);

  ctx.restore();
}

/**
 * Draw a saved shape
 */
function drawShapeSaved(shape: ShapeItem, rect: { x: number; y: number; width: number; height: number }): void {
  if (!ctx) return;

  // Convert relative to absolute coords
  const x1 = rect.x + shape.x1 * rect.width;
  const y1 = rect.y + shape.y1 * rect.height;
  const x2 = rect.x + shape.x2 * rect.width;
  const y2 = rect.y + shape.y2 * rect.height;

  ctx.save();
  ctx.globalAlpha = shape.opacity;
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = shape.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  drawShapeAtCoords(ctx, shape.shape, x1, y1, x2, y2, shape.filled);

  ctx.restore();
}

/**
 * Draw a shape at the given coordinates
 */
function drawShapeAtCoords(
  ctx: CanvasRenderingContext2D,
  shapeType: string,
  x1: number, y1: number,
  x2: number, y2: number,
  filled: boolean
): void {
  const minX = Math.min(x1, x2);
  const minY = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  ctx.beginPath();

  switch (shapeType) {
    case 'line':
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      break;

    case 'rectangle':
      if (filled) {
        ctx.fillRect(minX, minY, w, h);
      }
      ctx.strokeRect(minX, minY, w, h);
      break;

    case 'circle':
      const radius = Math.sqrt(w * w + h * h) / 2;
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      if (filled) ctx.fill();
      ctx.stroke();
      break;

    case 'triangle':
      ctx.moveTo(cx, minY); // Top
      ctx.lineTo(minX, minY + h); // Bottom left
      ctx.lineTo(minX + w, minY + h); // Bottom right
      ctx.closePath();
      if (filled) ctx.fill();
      ctx.stroke();
      break;

    case 'star':
      const outerR = Math.min(w, h) / 2;
      const innerR = outerR * 0.4;
      const points = 5;
      for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / points) * i - Math.PI / 2;
        const px = cx + r * Math.cos(angle);
        const py = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (filled) ctx.fill();
      ctx.stroke();
      break;
  }
}

// === Brush Implementations ===

function drawSolid(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawSpray(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  ctx.fillStyle = color;
  const density = Math.max(10, width * 2);

  for (const point of points) {
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * width;
      const x = point.x + Math.cos(angle) * radius;
      const y = point.y + Math.sin(angle) * radius;

      ctx.beginPath();
      ctx.arc(x, y, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDots(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  ctx.fillStyle = color;
  const spacing = Math.max(width * 0.8, 4);
  let accumulatedDistance = 0;

  for (let i = 0; i < points.length; i++) {
    if (i === 0) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    accumulatedDistance += dist;

    if (accumulatedDistance >= spacing) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      accumulatedDistance = 0;
    }
  }
}

function drawSquare(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'bevel';

  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawRainbow(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], width: number): void {
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 1; i < points.length; i++) {
    const color = `hsl(${rainbowHue}, 100%, 50%)`;
    ctx.beginPath();
    ctx.strokeStyle = color;
    // Matching color glow at 40% strength
    ctx.shadowColor = color;
    ctx.shadowBlur = width * 0.8;
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    rainbowHue = (rainbowHue + 2) % 360;
  }

  ctx.shadowBlur = 0;
}

function drawRainbowStatic(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], width: number): void {
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let hue = 0;
  for (let i = 1; i < points.length; i++) {
    const color = `hsl(${hue}, 100%, 50%)`;
    ctx.beginPath();
    ctx.strokeStyle = color;
    // Matching color glow at 40% strength
    ctx.shadowColor = color;
    ctx.shadowBlur = width * 0.8;
    ctx.moveTo(points[i - 1].x, points[i - 1].y);
    ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    hue = (hue + 2) % 360;
  }

  ctx.shadowBlur = 0;
}

function drawGlow(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], color: string, width: number): void {
  // To avoid overlapping glow issues, we draw to an offscreen canvas first
  // This prevents the glow from stacking when the stroke crosses itself

  // Calculate bounds of the stroke with padding for glow
  const padding = width * 3;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  const offWidth = Math.ceil(maxX - minX + padding * 2);
  const offHeight = Math.ceil(maxY - minY + padding * 2);

  // Create offscreen canvas
  const offCanvas = document.createElement('canvas');
  offCanvas.width = offWidth;
  offCanvas.height = offHeight;
  const offCtx = offCanvas.getContext('2d');
  if (!offCtx) return;

  // Translate points to offscreen canvas space
  const offsetX = minX - padding;
  const offsetY = minY - padding;

  // Draw glow layers (multiple passes for richer glow)
  offCtx.strokeStyle = color;
  offCtx.lineWidth = width;
  offCtx.lineCap = 'round';
  offCtx.lineJoin = 'round';
  offCtx.shadowColor = color;
  offCtx.shadowBlur = width * 2.5;

  offCtx.beginPath();
  offCtx.moveTo(points[0].x - offsetX, points[0].y - offsetY);
  for (let i = 1; i < points.length; i++) {
    offCtx.lineTo(points[i].x - offsetX, points[i].y - offsetY);
  }
  offCtx.stroke();

  // Second pass for stronger center
  offCtx.shadowBlur = width;
  offCtx.stroke();

  // Composite the offscreen canvas to main canvas
  ctx.drawImage(offCanvas, offsetX, offsetY);
}

/**
 * Filter drawings based on visibility settings
 */
function filterDrawingsByVisibility(): { item: DrawItem; isOtherUser: boolean }[] {
  const { showAll, showMine, showFollowing, hiddenUsers } = drawingVisibility;

  // Master toggle - hide everything
  if (!showAll) return [];

  const result: { item: DrawItem; isOtherUser: boolean }[] = [];

  // My drawings
  if (showMine) {
    result.push(...items.map(item => ({ item, isOtherUser: false })));
  }

  // Other users' drawings
  for (const item of otherUsersItems) {
    const ownerId = (item as any)._ownerId as string | undefined;

    // Skip if no owner ID (shouldn't happen but be safe)
    if (!ownerId) continue;

    // Skip if user is individually hidden
    if (hiddenUsers.has(ownerId)) continue;

    // If "following only" is enabled, check if user is followed
    if (showFollowing) {
      const isFollowed = followingCache?.has(ownerId) ?? false;
      if (!isFollowed) continue;
    }

    result.push({ item, isOtherUser: true });
  }

  return result;
}

/**
 * Save visibility preferences to localStorage
 */
function saveVisibilityPrefs(): void {
  const prefs = {
    showAll: drawingVisibility.showAll,
    showMine: drawingVisibility.showMine,
    showFollowing: drawingVisibility.showFollowing,
    hiddenUsers: Array.from(drawingVisibility.hiddenUsers),
  };
  localStorage.setItem('oo_visibility_prefs', JSON.stringify(prefs));
}

/**
 * Load visibility preferences from localStorage
 */
function loadVisibilityPrefs(): void {
  try {
    const saved = localStorage.getItem('oo_visibility_prefs');
    if (saved) {
      const prefs = JSON.parse(saved);
      drawingVisibility = {
        showAll: prefs.showAll ?? true,
        showMine: prefs.showMine ?? true,
        showFollowing: prefs.showFollowing ?? false,
        hiddenUsers: new Set(prefs.hiddenUsers ?? []),
      };
      console.log('[OpenOverlay] Loaded visibility prefs:', drawingVisibility);
    }
  } catch {
    // Use defaults
  }
}

/**
 * Load following list cache
 */
async function loadFollowingCache(): Promise<void> {
  const user = getCurrentUser();
  if (!user) {
    followingCache = new Set();
    return;
  }

  try {
    const following = await getFollowing(user.uid);
    followingCache = new Set(following.map(u => u.uid));
    console.log('[OpenOverlay] Loaded following cache:', followingCache.size, 'users');
  } catch (err) {
    console.warn('[OpenOverlay] Failed to load following cache:', err);
    followingCache = new Set();
  }
}

/**
 * Get current visibility state (for UI)
 */
export function getVisibilityState(): {
  showAll: boolean;
  showMine: boolean;
  showFollowing: boolean;
  hiddenUsers: string[];
} {
  return {
    showAll: drawingVisibility.showAll,
    showMine: drawingVisibility.showMine,
    showFollowing: drawingVisibility.showFollowing,
    hiddenUsers: Array.from(drawingVisibility.hiddenUsers),
  };
}

/**
 * Get contributors on current page (for UI)
 */
export function getPageContributors(): { userId: string; displayName: string; photoURL: string }[] {
  return pageContributors;
}

function redraw(): void {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Also clear collision canvas
  if (collisionCanvas && collisionCtx) {
    collisionCtx.clearRect(0, 0, collisionCanvas.width, collisionCanvas.height);
  }

  // Clear background canvas
  if (backgroundCanvas && backgroundCtx) {
    backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Helper to render a single item to a specific canvas context
  const renderItemTo = (targetCtx: CanvasRenderingContext2D, item: DrawItem, isOtherUser: boolean = false) => {
    let el: Element | null = null;

    try {
      el = document.querySelector(item.anchorSelector);
    } catch {
      // Invalid selector
    }

    if (!el) return;

    const domRect = el.getBoundingClientRect();
    if (domRect.width === 0 || domRect.height === 0) return;

    const rect = {
      x: domRect.left + scrollX,
      y: domRect.top + scrollY,
      width: domRect.width,
      height: domRect.height,
    };

    // Temporarily switch context for drawing functions
    const saveCtx = ctx;
    ctx = targetCtx;

    if (item.type === 'text') {
      drawTextSaved(item, rect);
      // Draw selection handles if selected (only for own items, only on main canvas)
      if (!isOtherUser && item.id === selectedTextId && targetCtx === saveCtx) {
        drawTextSelection(item, rect);
      }
    } else if (item.type === 'shape') {
      drawShapeSaved(item as ShapeItem, rect);
    } else {
      // Default to stroke (handles old items without type field)
      drawStrokeSaved(item as Stroke, rect);
    }

    ctx = saveCtx;
  };

  // Helper to render a single item to the collision canvas (only normal layer items)
  const renderItemCollision = (item: DrawItem) => {
    if (!collisionCtx) return;

    let el: Element | null = null;
    try {
      el = document.querySelector(item.anchorSelector);
    } catch {
      return;
    }

    if (!el) return;

    const domRect = el.getBoundingClientRect();
    if (domRect.width === 0 || domRect.height === 0) return;

    const rect = {
      x: domRect.left + scrollX,
      y: domRect.top + scrollY,
      width: domRect.width,
      height: domRect.height,
    };

    const saveCtx = ctx;
    ctx = collisionCtx;

    if (item.type === 'shape') {
      drawShapeSaved(item as ShapeItem, rect);
    } else if (item.type === 'stroke' || !item.type) {
      drawStrokeSaved(item as Stroke, rect);
    }

    ctx = saveCtx;
  };

  // Combine all items for layer sorting with visibility filtering
  const allItems = filterDrawingsByVisibility();

  // Separate items by layer
  const backgroundItems = allItems.filter(({ item }) => (item as any).layer === 'background');
  const normalItems = allItems.filter(({ item }) => {
    const layer = (item as any).layer;
    return !layer || layer === 'normal';
  });
  const foregroundItems = allItems.filter(({ item }) => (item as any).layer === 'foreground');

  // Draw background items to the background canvas (behind game character)
  if (backgroundCtx) {
    for (const { item, isOtherUser } of backgroundItems) {
      renderItemTo(backgroundCtx, item, isOtherUser);
    }
  }

  // Draw normal layer items to main canvas (character collides with these)
  console.log('[OpenOverlay] Rendering', normalItems.length, 'normal items to collision canvas');
  for (const { item, isOtherUser } of normalItems) {
    renderItemTo(ctx!, item, isOtherUser);
    renderItemCollision(item);
  }

  // Draw foreground items to main canvas (on top of everything including character)
  for (const { item, isOtherUser } of foregroundItems) {
    renderItemTo(ctx!, item, isOtherUser);
  }
}


function drawTextSelection(item: TextItem, rect: { x: number; y: number; width: number; height: number }): void {
  if (!ctx) return;

  const x = rect.x + item.x * rect.width;
  const y = rect.y + item.y * rect.height;

  // Measure text to get bounds
  ctx.font = `bold ${item.size || 32}px Impact, Arial, sans-serif`;
  const metrics = ctx.measureText(item.text);
  const textWidth = metrics.width;
  const textHeight = item.size;

  const padding = 8;
  const centerX = x + textWidth / 2;
  const centerY = y + textHeight / 2;
  const rotation = item.rotation || 0;

  ctx.save();

  // Apply rotation around center
  ctx.translate(centerX, centerY);
  ctx.rotate(rotation);
  ctx.translate(-centerX, -centerY);

  // Draw selection rectangle
  ctx.strokeStyle = '#22c55e';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(
    x - padding,
    y - padding,
    textWidth + padding * 2,
    textHeight + padding * 2
  );

  // Draw corner handles
  ctx.setLineDash([]);
  ctx.fillStyle = '#22c55e';
  const handleSize = 8;

  // Only bottom-right for resize
  ctx.fillRect(x + textWidth + padding - handleSize / 2, y + textHeight + padding - handleSize / 2, handleSize, handleSize);

  // Draw rotation handle (circle above the box)
  const rotHandleY = y - padding - ROTATION_HANDLE_DISTANCE;
  ctx.beginPath();
  ctx.arc(centerX, rotHandleY, 6, 0, Math.PI * 2);
  ctx.fill();

  // Draw line connecting to rotation handle
  ctx.beginPath();
  ctx.strokeStyle = '#22c55e';
  ctx.setLineDash([]);
  ctx.lineWidth = 2;
  ctx.moveTo(centerX, y - padding);
  ctx.lineTo(centerX, rotHandleY + 6);
  ctx.stroke();

  ctx.restore();
}

function drawTextSaved(item: TextItem, rect: { x: number; y: number; width: number; height: number }): void {
  if (!ctx) return;

  const x = rect.x + item.x * rect.width;
  const y = rect.y + item.y * rect.height;

  ctx.save();
  ctx.globalAlpha = item.opacity || 1;
  ctx.font = `bold ${item.size || 32}px Impact, Arial, sans-serif`;
  ctx.textBaseline = 'top';

  // Apply rotation around text center
  const rotation = item.rotation || 0;
  if (rotation !== 0) {
    const metrics = ctx.measureText(item.text);
    const centerX = x + metrics.width / 2;
    const centerY = y + item.size / 2;
    ctx.translate(centerX, centerY);
    ctx.rotate(rotation);
    ctx.translate(-centerX, -centerY);
  }

  switch (item.style) {
    case 'rainbow':
      drawTextRainbow(ctx, item.text, x, y, item.size);
      break;
    case 'aged':
      drawTextAged(ctx, item.text, x, y, item.size, item.color);
      break;
    default:
      drawTextNormal(ctx, item.text, x, y, item.color);
  }

  ctx.restore();
}

function drawTextNormal(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  // Outline
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);

  // Fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawTextRainbow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number): void {
  const textWidth = ctx.measureText(text).width;

  // Create rainbow gradient across the text
  const gradient = ctx.createLinearGradient(x, y, x + textWidth, y);
  gradient.addColorStop(0, 'hsl(0, 100%, 50%)');
  gradient.addColorStop(0.17, 'hsl(60, 100%, 50%)');
  gradient.addColorStop(0.33, 'hsl(120, 100%, 50%)');
  gradient.addColorStop(0.5, 'hsl(180, 100%, 50%)');
  gradient.addColorStop(0.67, 'hsl(240, 100%, 50%)');
  gradient.addColorStop(0.83, 'hsl(300, 100%, 50%)');
  gradient.addColorStop(1, 'hsl(360, 100%, 50%)');

  // Draw each character with matching color glow
  let offsetX = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charWidth = ctx.measureText(char).width;

    // Calculate position ratio and corresponding hue
    const ratio = (offsetX + charWidth / 2) / textWidth;
    const hue = ratio * 360;

    // Glow in matching rainbow color (40% strength)
    ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
    ctx.shadowBlur = size * 0.2;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Fill with gradient
    ctx.fillStyle = gradient;
    ctx.fillText(char, x + offsetX, y);

    offsetX += charWidth;
  }

  // Dark outline for contrast
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeText(text, x, y);

  // Final fill with gradient
  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);
}

function drawTextAged(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, baseColor: string): void {
  // Create aged/weathered look

  // Shadow for depth
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Dark outline
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 4;
  ctx.strokeText(text, x, y);

  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Create gradient for aged look
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, adjustColor(baseColor, 20));
  gradient.addColorStop(0.5, baseColor);
  gradient.addColorStop(1, adjustColor(baseColor, -30));

  ctx.fillStyle = gradient;
  ctx.fillText(text, x, y);

  // Add some noise/texture effect by drawing faint scratches
  ctx.globalAlpha = 0.3;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1;

  const textWidth = ctx.measureText(text).width;
  for (let i = 0; i < 5; i++) {
    const scratchX = x + Math.random() * textWidth;
    const scratchY = y + Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(scratchX, scratchY);
    ctx.lineTo(scratchX + Math.random() * 10 - 5, scratchY + Math.random() * 10);
    ctx.stroke();
  }
}

function adjustColor(color: string, amount: number): string {
  // Simple brightness adjustment
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substr(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substr(2, 2), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substr(4, 2), 16) + amount));
  return `rgb(${r},${g},${b})`;
}

function undoStroke(): void {
  // Skip if game mode is active - game handles its own undo
  if (isGameMode) return;

  if (items.length > 0) {
    items.pop();
    redraw();
    console.log('[OpenOverlay] Undo - items remaining:', items.length);
  }
}

async function clearStrokes(): Promise<void> {
  // Skip if game mode is active - game handles its own clear
  if (isGameMode) return;

  // Only clear current user's items (others' items stay)
  items = [];

  // Clear from localStorage
  const pageKey = getPageKey();
  localStorage.removeItem(`oo_drawing_${pageKey}`);

  // Clear from cloud if logged in
  if (isLoggedIn()) {
    await deleteDrawingFromCloud(pageKey);
  }

  redraw();
  console.log('[OpenOverlay] Cleared your items (others\' items preserved)');
}

async function saveDrawing(): Promise<void> {
  console.log('[OpenOverlay] Saving', items.length, 'items');

  // Clear text selection
  selectedTextId = null;

  const pageKey = getPageKey();
  const data = JSON.stringify(items);

  // Always save to localStorage (fast, works offline)
  localStorage.setItem(`oo_drawing_${pageKey}`, data);

  // Also save to cloud if logged in (makes it public)
  if (isLoggedIn()) {
    await saveDrawingToCloud(pageKey, window.location.href, items);
  }

  redraw();
  console.log('[OpenOverlay] Drawing saved');
}

function cancelDrawing(): void {
  console.log('[OpenOverlay] Canceling drawing');
  loadDrawings();
}

async function loadDrawings(): Promise<void> {
  const pageKey = getPageKey();

  // Try to subscribe to real-time drawing updates
  if (isFirestoreAvailable()) {
    const unsubscribe = subscribeToDrawings(pageKey, (cloudData) => {
      // My items are editable
      items = cloudData.myItems;
      // Others' items are read-only (rendered in background)
      otherUsersItems = cloudData.otherItems;
      // Store contributors for visibility UI
      pageContributors = cloudData.contributors;

      // Update localStorage with my items
      localStorage.setItem(`oo_drawing_${pageKey}`, JSON.stringify(items));

      console.log('[OpenOverlay] Real-time update:', items.length, 'mine,', otherUsersItems.length, 'from others');
      if (cloudData.contributors.length > 0) {
        console.log('[OpenOverlay] Contributors:', cloudData.contributors.map(c => c.displayName).join(', '));
      }

      // Notify UI of contributors update
      document.dispatchEvent(new CustomEvent('oo:contributors', {
        detail: { contributors: pageContributors }
      }));

      redraw(); // This also updates collision canvas
    });

    if (unsubscribe) {
      console.log('[OpenOverlay] Subscribed to real-time drawing updates');
      return;
    }

    // Fallback to one-time fetch if subscription failed
    console.log('[OpenOverlay] Real-time subscription failed, trying one-time fetch');
    const cloudData = await loadDrawingsFromCloud(pageKey);
    if (cloudData !== null) {
      items = cloudData.myItems;
      otherUsersItems = cloudData.otherItems;
      pageContributors = cloudData.contributors;
      localStorage.setItem(`oo_drawing_${pageKey}`, JSON.stringify(items));
      console.log('[OpenOverlay] Loaded from cloud:', items.length, 'mine,', otherUsersItems.length, 'from others');

      // Notify UI of contributors
      document.dispatchEvent(new CustomEvent('oo:contributors', {
        detail: { contributors: pageContributors }
      }));

      redraw();
      return;
    }
  }

  // Fall back to localStorage (offline or no cloud data)
  otherUsersItems = []; // No other users' items when offline
  const data = localStorage.getItem(`oo_drawing_${pageKey}`);

  if (data) {
    try {
      items = JSON.parse(data);
      console.log('[OpenOverlay] Loaded', items.length, 'items from localStorage');
      redraw();
    } catch (e) {
      console.warn('[OpenOverlay] Failed to load drawings');
      items = [];
    }
  } else {
    items = [];
  }
}

function getPageKey(): string {
  return btoa(window.location.href).slice(0, 32);
}

// Reload drawings when auth state changes
function setupAuthListener(): void {
  onAuthStateChanged((user) => {
    if (user) {
      console.log('[OpenOverlay] User logged in, reloading drawings from cloud');
      // Load following cache for visibility filtering
      loadFollowingCache();
    } else {
      console.log('[OpenOverlay] User logged out, reloading public drawings');
      followingCache = null;
    }
    // Always reload to get current state (public drawings visible even when logged out)
    loadDrawings();
  });
}

/**
 * Get collision surfaces from all drawn items for game physics
 * Returns array of platform rectangles the player can land on
 */
/**
 * Check if there are solid (drawn) pixels at the given position
 * Uses actual canvas pixel data for pixel-perfect collision
 */
export function checkPixelCollision(x: number, y: number, width: number, height: number, movingRight?: boolean): {
  floor: boolean;
  floorY: number;
  ceiling: boolean;
  ceilingY: number;
  leftWall: boolean;
  leftWallX: number;
  rightWall: boolean;
  rightWallX: number;
  slopeAngle: number; // Angle in degrees (0 = flat, positive = uphill in movement direction)
  slopeAheadY: number; // Y position of ground ahead of player
} {
  // Use collision canvas which excludes background items
  if (!collisionCanvas || !collisionCtx) {
    return { floor: false, floorY: 0, ceiling: false, ceilingY: 0, leftWall: false, leftWallX: 0, rightWall: false, rightWallX: 0, slopeAngle: 0, slopeAheadY: 0 };
  }

  const dpr = window.devicePixelRatio || 1;
  // Note: collision canvas is drawn in page coordinates, so use page coordinates directly
  // (don't subtract scroll offset)

  let floor = false;
  let floorY = 0;
  let ceiling = false;
  let ceilingY = 0;
  let leftWall = false;
  let leftWallX = 0;
  let rightWall = false;
  let rightWallX = 0;
  let slopeAngle = 0;
  let slopeAheadY = 0;

  // Use center of player for checks, with some width
  const checkWidth = Math.max(1, Math.floor(width * 0.5 * dpr));
  const centerX = Math.floor((x + width / 2) * dpr);
  const checkStartX = Math.max(0, centerX - Math.floor(checkWidth / 2));

  try {
    // FLOOR CHECK: Check a region around feet level
    // Start checking from 5px above feet to 15px below
    const feetPageY = y + height;
    const scanStartY = Math.floor((feetPageY - 5) * dpr);
    const scanHeight = Math.floor(20 * dpr);

    if (checkStartX >= 0 && scanStartY >= 0 &&
        checkStartX + checkWidth <= collisionCanvas.width &&
        scanStartY + scanHeight <= collisionCanvas.height) {

      const footData = collisionCtx.getImageData(checkStartX, scanStartY, checkWidth, scanHeight);

      // Find the first row with solid pixels (top of surface)
      for (let row = 0; row < scanHeight; row++) {
        let hasPixel = false;
        for (let col = 0; col < checkWidth; col++) {
          const idx = (row * checkWidth + col) * 4;
          const alpha = footData.data[idx + 3];
          if (alpha > 30) {
            hasPixel = true;
            break;
          }
        }
        if (hasPixel) {
          // Found solid pixels - this is the floor surface
          // Convert back to page coordinates
          const surfaceY = scanStartY / dpr + row / dpr;
          // Only count as floor if surface is at or below feet level (within tolerance)
          if (surfaceY >= feetPageY - 8) {
            floor = true;
            floorY = surfaceY;
          }
          break;
        }
      }
    }

    // CEILING CHECK: Check above head
    const headPageY = y;
    const ceilScanStart = Math.max(0, Math.floor((headPageY - 15) * dpr));
    const ceilScanHeight = Math.floor(15 * dpr);

    if (checkStartX >= 0 && ceilScanStart >= 0 &&
        checkStartX + checkWidth <= collisionCanvas.width &&
        ceilScanStart + ceilScanHeight <= collisionCanvas.height) {

      const headData = collisionCtx.getImageData(checkStartX, ceilScanStart, checkWidth, ceilScanHeight);

      // Find the lowest row with solid pixels (bottom of ceiling)
      for (let row = ceilScanHeight - 1; row >= 0; row--) {
        let hasPixel = false;
        for (let col = 0; col < checkWidth; col++) {
          const idx = (row * checkWidth + col) * 4;
          const alpha = headData.data[idx + 3];
          if (alpha > 30) {
            hasPixel = true;
            break;
          }
        }
        if (hasPixel) {
          const surfaceY = ceilScanStart / dpr + (row + 1) / dpr;
          // Only count as ceiling if it's above head
          if (surfaceY <= headPageY + 5) {
            ceiling = true;
            ceilingY = surfaceY;
          }
          break;
        }
      }
    }
    // WALL CHECKS: Check sides of player body (full height from head to near feet)
    // Check from top of player to 90% down (includes head, excludes feet for slope walking)
    const wallCheckTop = Math.floor(y * dpr);
    const wallCheckHeight = Math.floor(height * 0.85 * dpr);
    const wallScanWidth = Math.floor(10 * dpr); // Check 10px to each side

    // LEFT WALL CHECK
    const leftScanX = Math.max(0, Math.floor(x * dpr) - wallScanWidth);
    if (leftScanX >= 0 && wallCheckTop >= 0 &&
        leftScanX + wallScanWidth <= collisionCanvas.width &&
        wallCheckTop + wallCheckHeight <= collisionCanvas.height) {

      const leftData = collisionCtx.getImageData(leftScanX, wallCheckTop, wallScanWidth, wallCheckHeight);

      // Scan from right to left to find rightmost solid pixel (closest wall edge)
      outerLeft: for (let col = wallScanWidth - 1; col >= 0; col--) {
        for (let row = 0; row < wallCheckHeight; row++) {
          const idx = (row * wallScanWidth + col) * 4;
          const alpha = leftData.data[idx + 3];
          if (alpha > 30) {
            // Found a wall pixel - the wall edge is at this X
            leftWall = true;
            leftWallX = (leftScanX + col + 1) / dpr;
            break outerLeft;
          }
        }
      }
    }

    // RIGHT WALL CHECK
    const rightScanX = Math.floor((x + width) * dpr);
    if (rightScanX >= 0 && wallCheckTop >= 0 &&
        rightScanX + wallScanWidth <= collisionCanvas.width &&
        wallCheckTop + wallCheckHeight <= collisionCanvas.height) {

      const rightData = collisionCtx.getImageData(rightScanX, wallCheckTop, wallScanWidth, wallCheckHeight);

      // Scan from left to right to find leftmost solid pixel (closest wall edge)
      outerRight: for (let col = 0; col < wallScanWidth; col++) {
        for (let row = 0; row < wallCheckHeight; row++) {
          const idx = (row * wallScanWidth + col) * 4;
          const alpha = rightData.data[idx + 3];
          if (alpha > 30) {
            // Found a wall pixel
            rightWall = true;
            rightWallX = (rightScanX + col) / dpr;
            break outerRight;
          }
        }
      }
    }
    // SLOPE DETECTION: Sample ground ahead to calculate slope angle
    // This helps determine if we're approaching a walkable slope or a wall
    const feetY = y + height;
    const aheadDistance = 20; // Check 20px ahead
    const aheadX = movingRight !== false ? x + width + aheadDistance : x - aheadDistance;
    const sampleX = Math.floor(aheadX * dpr);
    const sampleStartY = Math.floor((feetY - 30) * dpr); // Start 30px above feet
    const sampleHeight = Math.floor(50 * dpr); // Scan 50px range

    if (sampleX >= 0 && sampleX < collisionCanvas.width &&
        sampleStartY >= 0 && sampleStartY + sampleHeight <= collisionCanvas.height) {

      const slopeData = collisionCtx.getImageData(sampleX, sampleStartY, 1, sampleHeight);

      // Find the first solid pixel from top (ground level ahead)
      for (let row = 0; row < sampleHeight; row++) {
        const alpha = slopeData.data[row * 4 + 3];
        if (alpha > 30) {
          slopeAheadY = sampleStartY / dpr + row / dpr;

          // Calculate slope angle based on height difference
          const currentGroundY = floor ? floorY : feetY;
          const heightDiff = currentGroundY - slopeAheadY; // Positive = uphill
          const horizontalDist = aheadDistance;

          // Angle in degrees (atan2 gives radians)
          slopeAngle = Math.atan2(heightDiff, horizontalDist) * (180 / Math.PI);
          break;
        }
      }
    }
  } catch (e) {
    // getImageData can fail
  }

  return { floor, floorY, ceiling, ceilingY, leftWall, leftWallX, rightWall, rightWallX, slopeAngle, slopeAheadY };
}

// Legacy function for compatibility - now returns empty since we use pixel collision
export function getCollisionSurfaces(): { x: number; y: number; width: number; height: number }[] {
  return [];
}
