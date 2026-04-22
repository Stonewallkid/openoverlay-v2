/**
 * UI Module
 * Drawing toolbar with full controls
 */

import { signInWithGoogle, signOut, onAuthStateChanged, getCurrentUser } from '@/auth';
import { getUserProfile, followUser, unfollowUser, isFollowing, type UserProfile } from '@/db';
import { getBookmarks, type BookmarkedAnnotation } from '@/annotations';
import type { User } from 'firebase/auth';

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;
let isMenuOpen = false;
let currentMode: 'none' | 'draw' | 'text' | 'game' = 'none';
let currentBrush: string = 'solid';
let currentTextStyle: string = 'normal';
let currentShape: string = 'none'; // 'none' | 'rectangle' | 'circle' | 'line' | 'triangle' | 'star'
let shapeFilled: boolean = false;
let isEraser = false;
let drawLayer: 'normal' | 'background' | 'foreground' = 'normal';
let pendingText: string = '';
let gameSubMode: 'play' | 'build' = 'build';
let gameBuildTool: string = 'spawn';

// Auth state
let currentAuthUser: User | null = null;
let isProfileModalOpen = false;
let showOthersDrawings = true; // Toggle to show/hide other users' drawings

// Quick color presets - expanded palette
const QUICK_COLORS = [
  // Row 1: Vibrant
  '#ff3366', '#ff6b35', '#f59e0b', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  // Row 2: Classic + neutrals
  '#ef4444', '#000000', '#ffffff', '#6b7280',
];

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

// Shape tools
const SHAPE_TOOLS = [
  { id: 'none', label: '✏️', title: 'Freehand' },
  { id: 'line', label: '╱', title: 'Line' },
  { id: 'rectangle', label: '▢', title: 'Rectangle' },
  { id: 'circle', label: '○', title: 'Circle' },
  { id: 'triangle', label: '△', title: 'Triangle' },
  { id: 'star', label: '☆', title: 'Star' },
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
    touch-action: none;
  }

  .fab-container.dragging {
    opacity: 0.8;
  }

  .fab-container.dragging .fab {
    cursor: grabbing;
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
    padding: 10px;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    display: none;
    gap: 6px;
    align-items: center;
    pointer-events: auto;
    z-index: 2147483647;
  }

  .toolbar.game-mode {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-drag-handle {
    cursor: grab;
    padding: 2px 8px;
    color: #666;
    font-size: 12px;
    user-select: none;
  }

  .toolbar-drag-handle:hover {
    color: #999;
  }

  .toolbar-drag-handle:active {
    cursor: grabbing;
  }

  .toolbar.game-mode .toolbar-drag-handle {
    align-self: center;
    margin-bottom: -4px;
  }

  .toolbar.show {
    display: flex;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background: #333;
    flex-shrink: 0;
  }

  .toolbar label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toolbar input[type="color"] {
    width: 24px;
    height: 24px;
    border: 2px solid #333;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    background: none;
    flex-shrink: 0;
  }

  .toolbar input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .toolbar input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .toolbar input[type="range"] {
    width: 180px;
    height: 6px;
    -webkit-appearance: none;
    background: #333;
    border-radius: 3px;
  }

  .toolbar input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    background: #fff;
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .quick-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    max-width: 100px;
  }

  .quick-color {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .quick-color:hover {
    transform: scale(1.15);
  }

  .quick-color.active {
    border-color: #fff;
    box-shadow: 0 0 0 1px #000;
  }

  .quick-color[data-color="#ffffff"] {
    border-color: #ccc;
  }

  .quick-color[data-color="#000000"] {
    border-color: #333;
  }

  .toolbar.game-mode .quick-colors {
    max-width: 80px;
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

  .shape-tools {
    display: flex;
    gap: 2px;
  }

  .shape-btn {
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

  .shape-btn:hover {
    background: #333;
  }

  .shape-btn.active {
    background: #8b5cf6;
    color: white;
  }

  .fill-btn {
    width: 28px;
    height: 28px;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    margin-left: 4px;
  }

  .fill-btn:hover {
    background: #333;
  }

  .fill-btn.active {
    background: #f59e0b;
    color: white;
  }

  .toolbar button.action-btn {
    padding: 5px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
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
    flex-direction: column;
    gap: 8px;
  }

  .game-controls.active {
    display: flex;
  }

  .game-row {
    display: flex;
    align-items: center;
    gap: 6px;
    justify-content: center;
  }

  .game-actions {
    display: flex;
    gap: 4px;
    margin-left: auto;
  }

  .game-colors {
    display: flex;
    gap: 3px;
  }

  .toolbar.game-mode .drawing-only {
    display: none !important;
  }

  .toolbar.game-mode > .toolbar-section,
  .toolbar.game-mode > .toolbar-divider {
    display: none !important;
  }

  .toolbar.game-mode > .toolbar-drag-handle,
  .toolbar.game-mode > .game-controls {
    display: flex !important;
  }

  .char-style-toggle {
    display: flex;
    background: #222;
    border-radius: 4px;
    padding: 2px;
  }

  .char-style-btn {
    padding: 3px 6px;
    border: none;
    background: transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.1s;
  }

  .char-style-btn:hover {
    background: #333;
  }

  .char-style-btn.active {
    background: #22c55e;
  }

  .char-customize-select {
    background: #222;
    color: #fff;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 3px 4px;
    font-size: 14px;
    cursor: pointer;
    min-width: 36px;
    text-align: center;
  }

  .char-customize-select:hover {
    border-color: #555;
  }

  .char-customize-select:focus {
    outline: none;
    border-color: #22c55e;
  }

  .game-mode-toggle {
    display: flex;
    background: #222;
    border-radius: 6px;
    padding: 2px;
  }

  .game-mode-btn {
    padding: 4px 8px;
    border: none;
    background: transparent;
    color: #888;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background 0.1s, color 0.1s;
  }

  .game-mode-btn:hover {
    color: #fff;
  }

  .game-mode-btn.active {
    background: #22c55e;
    color: white;
  }

  .build-tools-section {
    display: flex;
    align-items: center;
  }

  .game-tools {
    display: flex;
    gap: 2px;
  }

  .game-tool-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: #222;
    color: #aaa;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
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

  /* Profile button */
  .mini.profile-btn {
    padding: 0;
    overflow: hidden;
  }

  .mini.profile-btn img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  /* Profile modal */
  .profile-modal {
    position: fixed;
    bottom: 80px;
    right: 20px;
    width: 320px;
    background: #111;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: none;
    flex-direction: column;
    overflow: hidden;
    z-index: 2147483647;
    pointer-events: auto;
  }

  .profile-modal.show {
    display: flex;
  }

  .profile-close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 28px;
    height: 28px;
    border: none;
    background: #333;
    color: #fff;
    border-radius: 50%;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .profile-close:hover {
    background: #444;
  }

  .profile-header {
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid #333;
  }

  .profile-avatar {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #3b82f6;
  }

  .profile-info {
    flex: 1;
  }

  .profile-name {
    font-size: 18px;
    font-weight: bold;
    color: #fff;
    margin: 0 0 4px 0;
  }

  .profile-email {
    font-size: 12px;
    color: #888;
    margin: 0;
  }

  .profile-stats {
    display: flex;
    gap: 20px;
    padding: 16px 20px;
    border-bottom: 1px solid #333;
  }

  .profile-stat {
    text-align: center;
    cursor: pointer;
  }

  .profile-stat:hover {
    opacity: 0.8;
  }

  .profile-stat-value {
    font-size: 20px;
    font-weight: bold;
    color: #fff;
  }

  .profile-stat-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
  }

  .profile-bio {
    padding: 16px 20px;
    color: #ccc;
    font-size: 14px;
    border-bottom: 1px solid #333;
  }

  .profile-bio-empty {
    color: #666;
    font-style: italic;
  }

  .profile-actions {
    padding: 16px 20px;
    display: flex;
    gap: 10px;
  }

  .profile-settings {
    padding: 12px 20px;
    border-bottom: 1px solid #333;
  }

  .profile-setting-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }

  .profile-setting-label {
    color: #ccc;
    font-size: 14px;
  }

  .toggle-switch {
    position: relative;
    width: 44px;
    height: 24px;
    background: #333;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .toggle-switch.active {
    background: #22c55e;
  }

  .toggle-switch::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
  }

  .toggle-switch.active::after {
    transform: translateX(20px);
  }

  .profile-bookmarks {
    padding: 12px 20px;
    border-bottom: 1px solid #333;
    max-height: 200px;
    overflow-y: auto;
  }

  .profile-bookmarks-header {
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .profile-bookmarks-count {
    background: #333;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
  }

  .bookmark-item {
    background: #222;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .bookmark-item:hover {
    background: #333;
  }

  .bookmark-quote {
    color: #fff;
    font-size: 13px;
    margin-bottom: 4px;
    font-style: italic;
  }

  .bookmark-meta {
    color: #888;
    font-size: 11px;
  }

  .no-bookmarks {
    color: #666;
    font-size: 13px;
    font-style: italic;
    text-align: center;
    padding: 20px;
  }

  .profile-btn {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  .profile-btn.primary {
    background: #3b82f6;
    color: white;
  }

  .profile-btn.primary:hover {
    background: #2563eb;
  }

  .profile-btn.secondary {
    background: #333;
    color: #fff;
  }

  .profile-btn.secondary:hover {
    background: #444;
  }

  .profile-btn.danger {
    background: #ef4444;
    color: white;
  }

  .profile-btn.danger:hover {
    background: #dc2626;
  }

  .login-prompt {
    padding: 40px 20px;
    text-align: center;
  }

  .login-prompt p {
    color: #888;
    margin: 0 0 20px 0;
  }

  .login-btn {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 24px;
    background: #fff;
    color: #333;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }

  .login-btn:hover {
    background: #f0f0f0;
  }

  .login-btn img {
    width: 20px;
    height: 20px;
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

  // Settings/Profile button (shows avatar when logged in)
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'mini profile-btn';
  settingsBtn.id = 'oo-profile-btn';
  settingsBtn.textContent = '⚙️';
  settingsBtn.title = 'Settings & Profile';
  settingsBtn.onclick = toggleProfileModal;
  container.appendChild(settingsBtn);

  shadowRoot.appendChild(container);

  // FAB drag functionality
  let fabDragging = false;
  let fabDragStartX = 0;
  let fabDragStartY = 0;
  let fabStartRight = 18;
  let fabStartBottom = 18;

  // Restore saved position
  const savedPos = localStorage.getItem('oo_fab_position');
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      container.style.right = pos.right + 'px';
      container.style.bottom = pos.bottom + 'px';
      fabStartRight = pos.right;
      fabStartBottom = pos.bottom;
    } catch {}
  }

  fab.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only start drag on long press or if shift is held
    if (e.shiftKey) {
      e.preventDefault();
      fabDragging = true;
      fabDragStartX = e.clientX;
      fabDragStartY = e.clientY;
      const style = getComputedStyle(container);
      fabStartRight = parseInt(style.right) || 18;
      fabStartBottom = parseInt(style.bottom) || 18;
      container.classList.add('dragging');
      fab.setPointerCapture(e.pointerId);
    }
  });

  fab.addEventListener('pointermove', (e: PointerEvent) => {
    if (!fabDragging) return;
    e.preventDefault();
    const dx = fabDragStartX - e.clientX;
    const dy = fabDragStartY - e.clientY;
    const newRight = Math.max(10, Math.min(window.innerWidth - 70, fabStartRight + dx));
    const newBottom = Math.max(10, Math.min(window.innerHeight - 70, fabStartBottom + dy));
    container.style.right = newRight + 'px';
    container.style.bottom = newBottom + 'px';
  });

  fab.addEventListener('pointerup', (e: PointerEvent) => {
    if (fabDragging) {
      fabDragging = false;
      container.classList.remove('dragging');
      fab.releasePointerCapture(e.pointerId);
      // Save position
      const style = getComputedStyle(container);
      localStorage.setItem('oo_fab_position', JSON.stringify({
        right: parseInt(style.right) || 18,
        bottom: parseInt(style.bottom) || 18,
      }));
    }
  });

  // Create profile modal
  const profileModal = document.createElement('div');
  profileModal.className = 'profile-modal';
  profileModal.id = 'oo-profile-modal';
  profileModal.innerHTML = `
    <button class="profile-close" id="profile-close-btn">&times;</button>
    <div class="login-prompt" id="login-prompt">
      <p>Sign in to save your drawings and follow other users</p>
      <button class="login-btn" id="google-login-btn">
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
    </div>
    <div class="profile-content" id="profile-content" style="display: none;">
      <div class="profile-header">
        <img class="profile-avatar" id="profile-avatar" src="" alt="Profile">
        <div class="profile-info">
          <h3 class="profile-name" id="profile-name">User Name</h3>
          <p class="profile-email" id="profile-email">email@example.com</p>
        </div>
      </div>
      <div class="profile-stats">
        <div class="profile-stat" id="followers-stat">
          <div class="profile-stat-value" id="followers-count">0</div>
          <div class="profile-stat-label">Followers</div>
        </div>
        <div class="profile-stat" id="following-stat">
          <div class="profile-stat-value" id="following-count">0</div>
          <div class="profile-stat-label">Following</div>
        </div>
      </div>
      <div class="profile-bio" id="profile-bio">
        <span class="profile-bio-empty">No bio yet</span>
      </div>
      <div class="profile-settings">
        <div class="profile-setting-row">
          <span class="profile-setting-label">Show others' drawings</span>
          <div class="toggle-switch active" id="toggle-others-drawings" title="Show or hide drawings from other users"></div>
        </div>
      </div>
      <div class="profile-bookmarks" id="profile-bookmarks">
        <div class="profile-bookmarks-header">
          Bookmarks <span class="profile-bookmarks-count" id="bookmarks-count">0</span>
        </div>
        <div id="bookmarks-list"></div>
      </div>
      <div class="profile-actions">
        <button class="profile-btn danger" id="signout-btn">Sign Out</button>
      </div>
    </div>
  `;
  shadowRoot.appendChild(profileModal);

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
        <button class="tool-btn" id="oo-layer-bg" title="Background layer (behind character)">⬇️</button>
        <button class="tool-btn" id="oo-layer-fg" title="Foreground layer (hides character - for secret passages)">⬆️</button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Shape Tools -->
      <div class="toolbar-section">
        <div class="shape-tools" id="oo-shapes">
          ${SHAPE_TOOLS.map(s => `
            <button class="shape-btn ${s.id === 'none' ? 'active' : ''}"
                    data-shape="${s.id}" title="${s.title}">${s.label}</button>
          `).join('')}
        </div>
        <button class="fill-btn" id="oo-fill-toggle" title="Toggle fill">◧</button>
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
      <!-- Row 1: Mode + Character -->
      <div class="game-row">
        <div class="game-mode-toggle">
          <button class="game-mode-btn" data-mode="play" data-playmode="explore" title="Explore">🚶</button>
          <button class="game-mode-btn" data-mode="play" data-playmode="race" title="Race">🏃</button>
          <button class="game-mode-btn active" data-mode="build" title="Build">🔨</button>
        </div>
        <div class="char-style-toggle">
          <button class="char-style-btn active" id="oo-char-boy" title="Boy">👦</button>
          <button class="char-style-btn" id="oo-char-girl" title="Girl">👧</button>
        </div>
        <select class="char-customize-select" id="oo-hat-select" title="Hat">
          <option value="none">🎩</option>
          <option value="cap">🧢</option>
          <option value="tophat">🎩</option>
          <option value="crown">👑</option>
          <option value="beanie">🧶</option>
          <option value="party">🎉</option>
        </select>
        <select class="char-customize-select" id="oo-accessory-select" title="Face">
          <option value="none">😊</option>
          <option value="glasses">👓</option>
          <option value="sunglasses">🕶️</option>
          <option value="mustache">🥸</option>
          <option value="beard">🧔</option>
          <option value="mask">🦸</option>
        </select>
      </div>

      <!-- Row 2: Build Tools -->
      <div class="game-row build-tools-section">
        <div class="game-tools" id="game-tools">
          <button class="game-tool-btn" data-tool="select" title="Select">✋</button>
          <button class="game-tool-btn active" data-tool="spawn" title="Spawn">👤</button>
          <button class="game-tool-btn" data-tool="start" title="Start">🏁</button>
          <button class="game-tool-btn" data-tool="finish" title="Finish">🏆</button>
          <button class="game-tool-btn" data-tool="checkpoint" title="Checkpoint">🚩</button>
          <button class="game-tool-btn" data-tool="trampoline" title="Bounce">🔶</button>
          <button class="game-tool-btn" data-tool="speedBoost" title="Speed">💨</button>
          <button class="game-tool-btn" data-tool="highJump" title="Jump">🦘</button>
          <button class="game-tool-btn" data-tool="spike" title="Spike">🔺</button>
        </div>
      </div>

      <!-- Row 3: Colors + Actions -->
      <div class="game-row">
        <input type="color" id="oo-game-color" value="#ff3366" title="Color">
        <div class="quick-colors game-colors" id="oo-game-quick-colors"></div>
        <div class="game-actions">
          <button class="action-btn btn-undo" id="oo-game-undo" title="Undo">↩</button>
          <button class="action-btn btn-clear" id="oo-game-clear" title="Clear">🗑</button>
          <button class="action-btn btn-cancel" id="oo-game-cancel">✕</button>
          <button class="action-btn btn-save" id="oo-game-save">✓</button>
        </div>
      </div>
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

    <!-- Size (hidden in game mode) -->
    <div class="toolbar-section drawing-only" id="oo-size-section">
      <label>Size</label>
      <input type="range" id="oo-size" min="1" max="150" value="24">
      <span class="size-display" id="oo-size-display">24</span>
    </div>

    <div class="toolbar-divider drawing-only"></div>

    <!-- Opacity (hidden in game mode) -->
    <div class="toolbar-section drawing-only" id="oo-opacity-section">
      <label>Opacity</label>
      <input type="range" id="oo-opacity" min="10" max="100" value="100">
      <span class="opacity-display" id="oo-opacity-display">100%</span>
    </div>

    <div class="toolbar-divider drawing-only"></div>

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

  // Shape tool buttons
  toolbar.querySelectorAll('.shape-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const shapeId = (btn as HTMLElement).dataset.shape || 'none';
      currentShape = shapeId;
      toolbar.querySelectorAll('.shape-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dispatchSettingsChange();
    });
  });

  // Fill toggle
  const fillToggle = toolbar.querySelector('#oo-fill-toggle');
  fillToggle?.addEventListener('click', () => {
    shapeFilled = !shapeFilled;
    fillToggle.classList.toggle('active', shapeFilled);
    (fillToggle as HTMLElement).textContent = shapeFilled ? '◼' : '◧';
    dispatchSettingsChange();
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

      // Also update Nib color in game mode
      if (currentMode === 'game') {
        document.dispatchEvent(new CustomEvent('oo:playercolor', { detail: { color } }));
      }
    });
  });

  // Color picker
  toolbar.querySelector('#oo-color')?.addEventListener('input', () => {
    const colorInput = toolbar.querySelector('#oo-color') as HTMLInputElement;
    toolbar.querySelectorAll('.quick-color').forEach(s => s.classList.remove('active'));
    dispatchSettingsChange();

    // Also update Nib color in game mode
    if (currentMode === 'game' && colorInput) {
      document.dispatchEvent(new CustomEvent('oo:playercolor', { detail: { color: colorInput.value } }));
    }
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

  // Layer toggles (background/foreground - both no collision)
  toolbar.querySelector('#oo-layer-bg')?.addEventListener('click', () => {
    if (drawLayer === 'background') {
      drawLayer = 'normal';
    } else {
      drawLayer = 'background';
    }
    toolbar.querySelector('#oo-layer-bg')?.classList.toggle('active', drawLayer === 'background');
    toolbar.querySelector('#oo-layer-fg')?.classList.remove('active');
    dispatchSettingsChange();
  });

  toolbar.querySelector('#oo-layer-fg')?.addEventListener('click', () => {
    if (drawLayer === 'foreground') {
      drawLayer = 'normal';
    } else {
      drawLayer = 'foreground';
    }
    toolbar.querySelector('#oo-layer-fg')?.classList.toggle('active', drawLayer === 'foreground');
    toolbar.querySelector('#oo-layer-bg')?.classList.remove('active');
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

  // Game build tools (only ones with data-tool attribute)
  toolbar.querySelectorAll('.game-tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = (btn as HTMLElement).dataset.tool || 'platform';
      gameBuildTool = tool;

      toolbar.querySelectorAll('.game-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Dispatch tool change
      document.dispatchEvent(new CustomEvent('oo:gamemode', {
        detail: { mode: gameSubMode, tool }
      }));
    });
  });

  // Character style toggle (boy/girl)
  const boyBtn = toolbar.querySelector('#oo-char-boy');
  const girlBtn = toolbar.querySelector('#oo-char-girl');

  boyBtn?.addEventListener('click', () => {
    boyBtn.classList.add('active');
    girlBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('oo:playerstyle', { detail: { isGirl: false } }));
    localStorage.setItem('oo_player_girl', 'false');
  });

  girlBtn?.addEventListener('click', () => {
    girlBtn.classList.add('active');
    boyBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('oo:playerstyle', { detail: { isGirl: true } }));
    localStorage.setItem('oo_player_girl', 'true');
  });

  // Restore character style from localStorage
  if (localStorage.getItem('oo_player_girl') === 'true') {
    boyBtn?.classList.remove('active');
    girlBtn?.classList.add('active');
  }

  // Hat selection
  const hatSelect = toolbar.querySelector('#oo-hat-select') as HTMLSelectElement;
  hatSelect?.addEventListener('change', () => {
    const hat = hatSelect.value;
    document.dispatchEvent(new CustomEvent('oo:playerhat', { detail: { hat } }));
  });

  // Restore saved hat
  const savedHat = localStorage.getItem('oo_player_hat');
  if (savedHat && hatSelect) {
    hatSelect.value = savedHat;
  }

  // Accessory selection
  const accessorySelect = toolbar.querySelector('#oo-accessory-select') as HTMLSelectElement;
  accessorySelect?.addEventListener('change', () => {
    const accessory = accessorySelect.value;
    document.dispatchEvent(new CustomEvent('oo:playeraccessory', { detail: { accessory } }));
  });

  // Restore saved accessory
  const savedAccessory = localStorage.getItem('oo_player_accessory');
  if (savedAccessory && accessorySelect) {
    accessorySelect.value = savedAccessory;
  }

  // Game mode color picker
  const gameColorInput = toolbar.querySelector('#oo-game-color') as HTMLInputElement;
  gameColorInput?.addEventListener('input', () => {
    document.dispatchEvent(new CustomEvent('oo:playercolor', { detail: { color: gameColorInput.value } }));
  });

  // Populate game colors
  const gameColorsContainer = toolbar.querySelector('#oo-game-quick-colors');
  if (gameColorsContainer) {
    const gameColors = ['#ff3366', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#fff', '#000'];
    gameColorsContainer.innerHTML = gameColors.map((c, i) => `
      <div class="quick-color ${i === 0 ? 'active' : ''}" data-color="${c}" style="background: ${c}" title="${c}"></div>
    `).join('');

    gameColorsContainer.querySelectorAll('.quick-color').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = (swatch as HTMLElement).dataset.color || '#ff3366';
        if (gameColorInput) gameColorInput.value = color;
        gameColorsContainer.querySelectorAll('.quick-color').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        document.dispatchEvent(new CustomEvent('oo:playercolor', { detail: { color } }));
      });
    });
  }

  // Game mode action buttons
  toolbar.querySelector('#oo-game-undo')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:undo'));
  });

  toolbar.querySelector('#oo-game-clear')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:clear'));
  });

  toolbar.querySelector('#oo-game-cancel')?.addEventListener('click', () => {
    setMode('none');
    document.dispatchEvent(new CustomEvent('oo:cancel'));
  });

  toolbar.querySelector('#oo-game-save')?.addEventListener('click', () => {
    setMode('none');
    document.dispatchEvent(new CustomEvent('oo:save'));
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

  // Profile modal event listeners
  const loginBtn = shadowRoot.querySelector('#google-login-btn');
  const signoutBtn = shadowRoot.querySelector('#signout-btn');
  const closeBtn = shadowRoot.querySelector('#profile-close-btn');

  closeBtn?.addEventListener('click', () => {
    isProfileModalOpen = false;
    const modal = shadowRoot?.querySelector('#oo-profile-modal');
    modal?.classList.remove('show');
  });

  loginBtn?.addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (error) {
      console.error('[OpenOverlay] Login failed:', error);
    }
  });

  signoutBtn?.addEventListener('click', async () => {
    try {
      await signOut();
      isProfileModalOpen = false;
      const modal = shadowRoot?.querySelector('#oo-profile-modal');
      modal?.classList.remove('show');
    } catch (error) {
      console.error('[OpenOverlay] Sign out failed:', error);
    }
  });

  // Toggle for showing/hiding other users' drawings
  const othersDrawingsToggle = shadowRoot.querySelector('#toggle-others-drawings');
  othersDrawingsToggle?.addEventListener('click', () => {
    showOthersDrawings = !showOthersDrawings;
    othersDrawingsToggle.classList.toggle('active', showOthersDrawings);
    // Dispatch event to canvas
    document.dispatchEvent(new CustomEvent('oo:toggleothers', {
      detail: { show: showOthersDrawings }
    }));
    // Save preference
    localStorage.setItem('oo_show_others', showOthersDrawings ? 'true' : 'false');
  });

  // Restore saved preference
  const savedShowOthers = localStorage.getItem('oo_show_others');
  if (savedShowOthers === 'false') {
    showOthersDrawings = false;
    othersDrawingsToggle?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('oo:toggleothers', {
      detail: { show: false }
    }));
  }

  // Listen for auth state changes
  onAuthStateChanged((user) => {
    currentAuthUser = user;
    updateProfileUI(user);
  });
}

/**
 * Update profile UI based on auth state
 */
function updateProfileUI(user: User | null): void {
  const profileBtn = shadowRoot?.querySelector('#oo-profile-btn') as HTMLElement;
  const loginPrompt = shadowRoot?.querySelector('#login-prompt') as HTMLElement;
  const profileContent = shadowRoot?.querySelector('#profile-content') as HTMLElement;

  if (!profileBtn || !loginPrompt || !profileContent) return;

  if (user) {
    // User is signed in - show avatar
    if (user.photoURL) {
      profileBtn.innerHTML = `<img src="${user.photoURL}" alt="Profile">`;
    } else {
      profileBtn.textContent = user.displayName?.charAt(0).toUpperCase() || '👤';
    }

    // Update profile content
    loginPrompt.style.display = 'none';
    profileContent.style.display = 'block';

    const avatar = shadowRoot?.querySelector('#profile-avatar') as HTMLImageElement;
    const name = shadowRoot?.querySelector('#profile-name') as HTMLElement;
    const email = shadowRoot?.querySelector('#profile-email') as HTMLElement;

    if (avatar) avatar.src = user.photoURL || '';
    if (name) name.textContent = user.displayName || 'Anonymous';
    if (email) email.textContent = user.email || '';

    // Fetch full profile for stats
    getUserProfile(user.uid).then(profile => {
      if (profile) {
        const followersCount = shadowRoot?.querySelector('#followers-count') as HTMLElement;
        const followingCount = shadowRoot?.querySelector('#following-count') as HTMLElement;
        const bio = shadowRoot?.querySelector('#profile-bio') as HTMLElement;

        if (followersCount) followersCount.textContent = String(profile.followersCount || 0);
        if (followingCount) followingCount.textContent = String(profile.followingCount || 0);
        if (bio) {
          bio.innerHTML = profile.bio
            ? profile.bio
            : '<span class="profile-bio-empty">No bio yet</span>';
        }
      }
    });
  } else {
    // User is signed out - show default icon
    profileBtn.textContent = '👤';
    loginPrompt.style.display = 'block';
    profileContent.style.display = 'none';
  }
}

/**
 * Toggle profile modal visibility
 */
function toggleProfileModal(): void {
  isProfileModalOpen = !isProfileModalOpen;
  const modal = shadowRoot?.querySelector('#oo-profile-modal');
  modal?.classList.toggle('show', isProfileModalOpen);

  if (isProfileModalOpen) {
    updateBookmarksList();
  }
}

/**
 * Update the bookmarks list in the profile modal
 */
function updateBookmarksList(): void {
  const bookmarksList = shadowRoot?.querySelector('#bookmarks-list');
  const bookmarksCount = shadowRoot?.querySelector('#bookmarks-count');

  if (!bookmarksList) return;

  const bookmarks = getBookmarks();
  if (bookmarksCount) bookmarksCount.textContent = String(bookmarks.length);

  if (bookmarks.length === 0) {
    bookmarksList.innerHTML = '<div class="no-bookmarks">No bookmarks yet</div>';
    return;
  }

  bookmarksList.innerHTML = bookmarks.slice(0, 10).map(b => `
    <div class="bookmark-item" data-url="${escapeHtml(b.pageUrl)}">
      <div class="bookmark-quote">"${escapeHtml(truncate(b.comment, 50))}"</div>
      <div class="bookmark-meta">${escapeHtml(truncate(b.pageTitle, 30))} • ${escapeHtml(b.authorName)}</div>
    </div>
  `).join('');

  // Add click handlers to navigate to bookmark
  bookmarksList.querySelectorAll('.bookmark-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = (item as HTMLElement).dataset.url;
      if (url) {
        window.open(url, '_blank');
      }
    });
  });
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
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
      layer: drawLayer,
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
  toolbar?.classList.toggle('game-mode', mode === 'game');

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
      sizeInput.max = '200';
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

export function getLayer(): 'normal' | 'background' | 'foreground' {
  return drawLayer;
}

export function getTextStyle(): string {
  return currentTextStyle;
}

export function getShape(): string {
  return currentShape;
}

export function getShapeFilled(): boolean {
  return shapeFilled;
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
