/**
 * Canvas Module
 * Handles freehand drawing with multiple brush styles
 */

import { getColor, getSize, getOpacity, getBrush, getEraser, getTextStyle, getPendingText, clearPendingText } from '@/ui';

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let isDrawing = false;
let currentMode: 'none' | 'draw' | 'text' = 'none';

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

type DrawItem = Stroke | TextItem;

let items: DrawItem[] = [];
let currentStroke: { x: number; y: number }[] = [];
let currentAnchor: { element: Element; selector: string; bounds: DOMRect } | null = null;

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

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

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
  rainbowHue = 0;

  const anchor = findAnchorElement(e.clientX, e.clientY);
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    currentAnchor = {
      element: anchor,
      selector: getSelector(anchor),
      bounds: rect,
    };
  }

  currentStroke = [{ x: e.pageX, y: e.pageY }];
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
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = width * 2;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();

  // Draw again for stronger glow
  ctx.stroke();
}

function redraw(): void {
  if (!ctx || !canvas) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  for (const item of items) {
    let el: Element | null = null;

    try {
      el = document.querySelector(item.anchorSelector);
    } catch {
      // Invalid selector
    }

    if (!el) continue;

    const domRect = el.getBoundingClientRect();
    if (domRect.width === 0 || domRect.height === 0) continue;

    const rect = {
      x: domRect.left + scrollX,
      y: domRect.top + scrollY,
      width: domRect.width,
      height: domRect.height,
    };

    if (item.type === 'text') {
      drawTextSaved(item, rect);
      // Draw selection handles if selected
      if (item.id === selectedTextId) {
        drawTextSelection(item, rect);
      }
    } else {
      // Default to stroke (handles old items without type field)
      drawStrokeSaved(item as Stroke, rect);
    }
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
  if (items.length > 0) {
    items.pop();
    redraw();
    console.log('[OpenOverlay] Undo - items remaining:', items.length);
  }
}

function clearStrokes(): void {
  items = [];
  redraw();
  console.log('[OpenOverlay] Cleared all items');
}

function saveDrawing(): void {
  console.log('[OpenOverlay] Saving', items.length, 'items');

  // Clear text selection
  selectedTextId = null;

  const pageKey = getPageKey();
  const data = JSON.stringify(items);
  localStorage.setItem(`oo_drawing_${pageKey}`, data);

  redraw();
  console.log('[OpenOverlay] Drawing saved');
}

function cancelDrawing(): void {
  console.log('[OpenOverlay] Canceling drawing');
  loadDrawings();
}

function loadDrawings(): void {
  const pageKey = getPageKey();
  const data = localStorage.getItem(`oo_drawing_${pageKey}`);

  if (data) {
    try {
      items = JSON.parse(data);
      console.log('[OpenOverlay] Loaded', items.length, 'items');
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

/**
 * Get collision surfaces from all drawn items for game physics
 * Returns array of platform rectangles the player can land on
 */
export function getCollisionSurfaces(): { x: number; y: number; width: number; height: number }[] {
  const surfaces: { x: number; y: number; width: number; height: number }[] = [];
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;


  // First, collect all eraser stroke regions
  const erasedRegions: { x: number; y: number; radius: number }[] = [];
  for (const item of items) {
    if (item.type === 'text') continue;
    const stroke = item as Stroke;
    if (!stroke.eraser) continue;

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

    // Add erased points - use actual eraser radius, not inflated
    const eraserRadius = (stroke.width || 20) / 2;
    for (const p of stroke.points) {
      erasedRegions.push({
        x: rect.x + p.x * rect.width,
        y: rect.y + p.y * rect.height,
        radius: eraserRadius,
      });
    }
  }

  // Helper to check if a point is in an erased region
  const isErased = (px: number, py: number): boolean => {
    for (const region of erasedRegions) {
      const dist = Math.hypot(px - region.x, py - region.y);
      if (dist < region.radius) return true;
    }
    return false;
  };

  for (const item of items) {
    let el: Element | null = null;
    try {
      el = document.querySelector(item.anchorSelector);
    } catch { }

    if (!el) continue;

    const domRect = el.getBoundingClientRect();
    if (domRect.width === 0 || domRect.height === 0) continue;

    const rect = {
      x: domRect.left + scrollX,
      y: domRect.top + scrollY,
      width: domRect.width,
      height: domRect.height,
    };

    if (item.type === 'text') {
      // Text collision box
      const textItem = item as TextItem;
      const textX = rect.x + textItem.x * rect.width;
      const textY = rect.y + textItem.y * rect.height;

      // Skip if text center is in erased region
      if (ctx && !isErased(textX + 20, textY + textItem.size / 2)) {
        ctx.font = `bold ${textItem.size || 32}px Impact, Arial, sans-serif`;
        const metrics = ctx.measureText(textItem.text);
        surfaces.push({
          x: textX,
          y: textY,
          width: metrics.width,
          height: textItem.size,
        });
      }
    } else {
      // Strokes (including legacy items without type field)
      const stroke = item as Stroke;
      // Skip eraser strokes - they don't create collision
      if (stroke.eraser) continue;

      const strokeWidth = stroke.width || 4;

      // Convert relative points to absolute
      const pixelPoints = stroke.points.map(p => ({
        x: rect.x + p.x * rect.width,
        y: rect.y + p.y * rect.height,
      }));

      if (pixelPoints.length < 2) continue;

      // Create platforms along the stroke path
      // All brushes use the same collision (glow visual effect doesn't affect collision)
      // Width needs to be wide for solid collision
      // Height is thin - player walks on TOP of the stroke
      const platformWidth = Math.max(strokeWidth * 2.5, 35);
      const platformHeight = 10; // Thin platform at top of stroke

      // Calculate total path length
      let totalLength = 0;
      for (let i = 1; i < pixelPoints.length; i++) {
        const dx = pixelPoints[i].x - pixelPoints[i-1].x;
        const dy = pixelPoints[i].y - pixelPoints[i-1].y;
        totalLength += Math.sqrt(dx * dx + dy * dy);
      }

      // Space surfaces close together - must overlap to prevent gaps
      const spacing = 10;
      const numSurfaces = Math.max(3, Math.ceil(totalLength / spacing) + 1);

      // Interpolate along the path to place surfaces at regular intervals
      // This ensures straight lines get surfaces in the middle, not just at points
      for (let surfIdx = 0; surfIdx < numSurfaces; surfIdx++) {
        const targetDist = (surfIdx / (numSurfaces - 1)) * totalLength;

        // Find the point at this distance along the path
        let traveled = 0;
        let px = pixelPoints[0].x;
        let py = pixelPoints[0].y;

        for (let i = 1; i < pixelPoints.length; i++) {
          const dx = pixelPoints[i].x - pixelPoints[i-1].x;
          const dy = pixelPoints[i].y - pixelPoints[i-1].y;
          const segLen = Math.sqrt(dx * dx + dy * dy);

          if (traveled + segLen >= targetDist) {
            // Interpolate within this segment
            const t = segLen > 0 ? (targetDist - traveled) / segLen : 0;
            px = pixelPoints[i-1].x + dx * t;
            py = pixelPoints[i-1].y + dy * t;
            break;
          }
          traveled += segLen;
          px = pixelPoints[i].x;
          py = pixelPoints[i].y;
        }

        // Skip if this point was erased
        if (isErased(px, py)) continue;

        // Position platform at TOP of the visual stroke
        // py is the center of the stroke, stroke extends strokeWidth/2 above and below
        surfaces.push({
          x: px - platformWidth / 2,
          y: py - strokeWidth / 2,  // Top of visual stroke
          width: platformWidth,
          height: platformHeight,
        });
      }
    }
  }

  return surfaces;
}
