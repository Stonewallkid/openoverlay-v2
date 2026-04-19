/**
 * Canvas Module
 *
 * Handles all drawing operations: freehand, text, rendering.
 * Uses two canvas layers: base (persistent) and temp (preview).
 */

import { store } from '@/shared/state';
import type { Point, Stroke, TextItem, DrawingItem, BrushStyle } from '@shared/types';

// Canvas elements
let baseCanvas: HTMLCanvasElement | null = null;
let tempCanvas: HTMLCanvasElement | null = null;
let baseCtx: CanvasRenderingContext2D | null = null;
let tempCtx: CanvasRenderingContext2D | null = null;

// Current stroke being drawn
let currentStroke: Point[] = [];
let isDrawing = false;

// Device pixel ratio for crisp rendering
const DPR = window.devicePixelRatio || 1;

/**
 * Initialize the canvas system.
 */
export function initCanvas(): void {
  createCanvases();
  attachEvents();
  subscribeToStore();
  resizeCanvases();

  window.addEventListener('resize', debounce(resizeCanvases, 200));

  console.log('[OpenOverlay] Canvas initialized');
}

/**
 * Create the base and temp canvas elements.
 */
function createCanvases(): void {
  // Base canvas: shows saved drawings
  baseCanvas = document.createElement('canvas');
  baseCanvas.id = 'oo-canvas-base';
  baseCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483645;
    pointer-events: none;
  `;
  document.documentElement.appendChild(baseCanvas);
  baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });

  // Temp canvas: shows current drawing in progress
  tempCanvas = document.createElement('canvas');
  tempCanvas.id = 'oo-canvas-temp';
  tempCanvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    z-index: 2147483646;
    pointer-events: none;
    cursor: crosshair;
    display: none;
  `;
  document.documentElement.appendChild(tempCanvas);
  tempCtx = tempCanvas.getContext('2d');
}

/**
 * Resize canvases to match document size.
 */
function resizeCanvases(): void {
  if (!baseCanvas || !tempCanvas || !baseCtx) return;

  // Base canvas covers entire document
  const docWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body?.scrollWidth || 0,
    window.innerWidth
  );
  const docHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body?.scrollHeight || 0,
    window.innerHeight
  );

  // Preserve existing content
  const imageData = baseCtx.getImageData(0, 0, baseCanvas.width, baseCanvas.height);

  baseCanvas.width = docWidth * DPR;
  baseCanvas.height = docHeight * DPR;
  baseCanvas.style.width = `${docWidth}px`;
  baseCanvas.style.height = `${docHeight}px`;
  baseCtx.scale(DPR, DPR);

  // Restore content
  baseCtx.putImageData(imageData, 0, 0);

  // Temp canvas covers viewport
  tempCanvas.width = window.innerWidth * DPR;
  tempCanvas.height = window.innerHeight * DPR;
  tempCanvas.style.width = `${window.innerWidth}px`;
  tempCanvas.style.height = `${window.innerHeight}px`;
  tempCtx?.scale(DPR, DPR);

  // Redraw from state
  redrawBase();
}

/**
 * Attach pointer events for drawing.
 */
function attachEvents(): void {
  if (!tempCanvas) return;

  tempCanvas.addEventListener('pointerdown', onPointerDown);
  tempCanvas.addEventListener('pointermove', onPointerMove);
  tempCanvas.addEventListener('pointerup', onPointerUp);
  tempCanvas.addEventListener('pointerleave', onPointerUp);

  // Keyboard shortcuts
  document.addEventListener('keydown', onKeyDown);
}

/**
 * Subscribe to store changes.
 */
function subscribeToStore(): void {
  // Show/hide temp canvas based on mode
  store.subscribeKey('mode', (mode) => {
    if (!tempCanvas) return;

    if (mode === 'draw' || mode === 'text') {
      tempCanvas.style.display = 'block';
      tempCanvas.style.pointerEvents = 'auto';
    } else {
      tempCanvas.style.display = 'none';
      tempCanvas.style.pointerEvents = 'none';
    }
  });

  // Redraw when drawings change
  store.subscribeKey('drawings', () => {
    redrawBase();
  });
}

/**
 * Handle pointer down - start drawing.
 */
function onPointerDown(e: PointerEvent): void {
  const { mode } = store.getState();
  if (mode !== 'draw') return;

  isDrawing = true;
  currentStroke = [{ x: e.clientX, y: e.clientY }];

  store.setState({ isDrawing: true });
}

/**
 * Handle pointer move - continue drawing.
 */
function onPointerMove(e: PointerEvent): void {
  if (!isDrawing || !tempCtx) return;

  currentStroke.push({ x: e.clientX, y: e.clientY });
  drawTempStroke();
}

/**
 * Handle pointer up - finish drawing.
 */
function onPointerUp(): void {
  if (!isDrawing) return;

  isDrawing = false;

  if (currentStroke.length > 1) {
    const { brush, currentItems } = store.getState();

    // Convert viewport coordinates to document coordinates
    const docStroke: Point[] = currentStroke.map((p) => ({
      x: p.x + window.scrollX,
      y: p.y + window.scrollY,
    }));

    const stroke: Stroke = {
      id: generateId(),
      type: 'stroke',
      points: docStroke,
      color: brush.color,
      width: brush.width,
      style: brush.style,
      opacity: brush.opacity,
    };

    store.setState({
      currentItems: [...currentItems, stroke],
      isDrawing: false,
    });

    // Draw to base canvas immediately for preview
    drawStrokeToBase(stroke);
  }

  currentStroke = [];
  clearTemp();
}

/**
 * Handle keyboard shortcuts.
 */
function onKeyDown(e: KeyboardEvent): void {
  const { mode } = store.getState();

  // Escape to cancel current mode
  if (e.key === 'Escape' && mode !== 'none') {
    store.setState({ mode: 'none', currentItems: [] });
    redrawBase();
  }

  // Enter to save
  if (e.key === 'Enter' && mode !== 'none') {
    saveCurrentDrawing();
  }
}

/**
 * Draw current stroke to temp canvas.
 */
function drawTempStroke(): void {
  if (!tempCtx || currentStroke.length < 2) return;

  const { brush } = store.getState();

  clearTemp();

  tempCtx.beginPath();
  tempCtx.strokeStyle = brush.color;
  tempCtx.lineWidth = brush.width;
  tempCtx.lineCap = 'round';
  tempCtx.lineJoin = 'round';
  tempCtx.globalAlpha = brush.opacity;

  tempCtx.moveTo(currentStroke[0].x, currentStroke[0].y);

  for (let i = 1; i < currentStroke.length; i++) {
    tempCtx.lineTo(currentStroke[i].x, currentStroke[i].y);
  }

  tempCtx.stroke();
}

/**
 * Clear the temp canvas.
 */
function clearTemp(): void {
  if (!tempCtx || !tempCanvas) return;
  tempCtx.clearRect(0, 0, tempCanvas.width / DPR, tempCanvas.height / DPR);
}

/**
 * Redraw base canvas from state.
 */
function redrawBase(): void {
  if (!baseCtx || !baseCanvas) return;

  baseCtx.clearRect(0, 0, baseCanvas.width / DPR, baseCanvas.height / DPR);

  const { drawings, currentItems } = store.getState();

  // Draw all saved drawings
  for (const drawing of drawings) {
    for (const item of drawing.items) {
      drawItemToBase(item);
    }
  }

  // Draw current unsaved items
  for (const item of currentItems) {
    drawItemToBase(item);
  }
}

/**
 * Draw a single item to the base canvas.
 */
function drawItemToBase(item: DrawingItem): void {
  if (item.type === 'stroke') {
    drawStrokeToBase(item);
  } else if (item.type === 'text') {
    drawTextToBase(item);
  }
}

/**
 * Draw a stroke to the base canvas.
 */
function drawStrokeToBase(stroke: Stroke): void {
  if (!baseCtx || stroke.points.length < 2) return;

  baseCtx.beginPath();
  baseCtx.strokeStyle = stroke.color;
  baseCtx.lineWidth = stroke.width;
  baseCtx.lineCap = 'round';
  baseCtx.lineJoin = 'round';
  baseCtx.globalAlpha = stroke.opacity;

  baseCtx.moveTo(stroke.points[0].x, stroke.points[0].y);

  for (let i = 1; i < stroke.points.length; i++) {
    baseCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
  }

  baseCtx.stroke();
  baseCtx.globalAlpha = 1;
}

/**
 * Draw text to the base canvas.
 */
function drawTextToBase(text: TextItem): void {
  if (!baseCtx) return;

  baseCtx.font = `${text.size}px Impact, Arial, sans-serif`;
  baseCtx.fillStyle = text.color;
  baseCtx.globalAlpha = text.opacity;
  baseCtx.fillText(text.text, text.x, text.y);
  baseCtx.globalAlpha = 1;
}

/**
 * Save current drawing to API.
 */
async function saveCurrentDrawing(): Promise<void> {
  const { currentItems, pageUrl } = store.getState();

  if (currentItems.length === 0) return;

  // TODO: Call API to save
  console.log('[Canvas] Saving drawing:', currentItems);

  // Clear current items after save
  store.setState({ currentItems: [], mode: 'none' });
}

// Utility functions
function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  }) as T;
}
