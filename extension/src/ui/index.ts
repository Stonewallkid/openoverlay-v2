/**
 * UI Module
 * Drawing toolbar with full controls
 */

import { signInWithGoogle, signOut, onAuthStateChanged, getCurrentUser } from '@/auth';
import { getUserProfile, followUser, unfollowUser, isFollowing, submitFeedback, getFollowers, subscribeToFollowers, updateBio, type UserProfile } from '@/db';
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
let gameSubMode: 'play' | 'build' = 'play';
let gameBuildTool: string = 'spawn';
let toolbarJustOpened = false; // Prevents click-outside from firing on same click that opened toolbar

// Auth state
let currentAuthUser: User | null = null;
let isProfileModalOpen = false;
let followerUnsubscribe: (() => void) | null = null;
let newFollowerCount = 0;
let isFollowersPanelOpen = false;

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

// Emoji stickers - organized by category
const EMOJI_STICKERS = [
  // Faces
  '😀', '😂', '🤣', '😍', '🥰', '😎', '🤩', '😜',
  '😭', '😤', '🤯', '🥺', '😱', '🤮', '💀', '👻',
  // Gestures
  '👍', '👎', '👏', '🙌', '🤝', '✌️', '🤟', '👋',
  '💪', '🫶', '🙏', '👀', '🧠', '💅', '🦾', '🫡',
  // Hearts & symbols
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '💔',
  '⭐', '✨', '🔥', '💯', '💥', '💫', '🎯', '🏆',
  // Animals
  '🐶', '🐱', '🐻', '🦊', '🐸', '🐵', '🦄', '🐝',
  // Food & objects
  '🍕', '🍔', '🌮', '🍩', '☕', '🎂', '🍿', '🥤',
  // Activities
  '⚽', '🏀', '🎮', '🎸', '🎤', '🎬', '📸', '💻',
  // Misc
  '🚀', '💎', '🎁', '🎈', '🎉', '🪄', '⚡', '🌈',
];

const STYLES = `
  * {
    box-sizing: border-box;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .fab-container {
    all: initial;
    position: fixed !important;
    right: 18px !important;
    bottom: 18px !important;
    z-index: 2147483647 !important;
    display: flex !important;
    flex-direction: column-reverse !important;
    align-items: center !important;
    gap: 8px !important;
    pointer-events: auto !important;
    touch-action: none !important;
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  }

  .fab-container.dragging {
    opacity: 0.8;
  }

  .fab-container.dragging .fab {
    cursor: grabbing;
  }

  .fab {
    all: initial;
    width: 56px !important;
    height: 56px !important;
    min-width: 56px !important;
    min-height: 56px !important;
    border-radius: 50% !important;
    border: none !important;
    background: rgba(255, 255, 255, 0.95) !important;
    color: #222 !important;
    font-size: 20px !important;
    cursor: pointer !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15) !important;
    transition: transform 0.15s, background 0.15s !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    visibility: visible !important;
    opacity: 1 !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  }

  .fab:hover {
    transform: scale(1.05);
  }

  .fab.open {
    background: #22c55e;
    color: white;
  }

  .quick-explore {
    position: absolute;
    bottom: -8px;
    left: -8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    background: #ff69b4;
    color: white;
    font-size: 12px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s, opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 1;
  }

  .quick-explore:hover {
    transform: scale(1.15);
  }

  .fab-container.open .quick-explore {
    display: none;
  }

  .quick-visibility {
    position: absolute;
    bottom: -8px;
    right: -8px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid white;
    background: #3b82f6;
    color: white;
    font-size: 11px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s, opacity 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 1;
  }

  .quick-visibility:hover {
    transform: scale(1.15);
  }

  .quick-visibility.hidden {
    background: #64748b;
    opacity: 0.7;
  }

  .quick-visibility.hidden::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 2px;
    background: #ef4444;
    transform: rotate(-45deg);
    border-radius: 1px;
  }

  .fab-container.open .quick-visibility {
    display: none;
  }

  .dismiss-smudgy {
    position: absolute;
    top: -8px;
    left: -8px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid white;
    background: #ef4444;
    color: white;
    font-size: 10px;
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
    transition: transform 0.15s, opacity 0.15s;
    display: none;
    align-items: center;
    justify-content: center;
    font-weight: bold;
  }

  .dismiss-smudgy:hover {
    transform: scale(1.15);
  }

  .dismiss-smudgy.show {
    display: flex;
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
    flex-direction: column;
    gap: 8px;
    align-items: stretch;
    pointer-events: auto;
    z-index: 2147483647;
    max-width: 320px;
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
    text-align: center;
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

  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .toolbar-section {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-divider {
    display: none;
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
    display: grid;
    grid-template-columns: repeat(4, 14px);
    gap: 2px;
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
    grid-template-columns: repeat(4, 14px);
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

  .eraser-btn {
    width: 36px;
    height: 32px;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    font-size: 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .eraser-btn:hover {
    background: #333;
  }

  .eraser-btn.active {
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
    flex-direction: column;
    gap: 6px;
  }

  .draw-controls.active, .text-controls.active {
    display: flex;
  }

  .text-input {
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    padding: 6px 10px;
    font-size: 13px;
    flex: 1;
    min-width: 100px;
    font-family: inherit;
  }

  .text-input:focus {
    outline: none;
    border-color: #22c55e;
  }

  .text-input::placeholder {
    color: #666;
  }

  .emoji-btn {
    width: 36px;
    height: 32px;
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-btn:hover {
    background: #333;
  }

  .emoji-picker {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    margin-bottom: 8px;
    background: #1a1a1a;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 100;
  }

  .emoji-picker.show {
    display: block;
  }

  .emoji-picker-header {
    font-size: 10px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 6px;
    padding-bottom: 4px;
    border-bottom: 1px solid #333;
  }

  .emoji-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 2px;
  }

  .emoji-item {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    cursor: pointer;
    border-radius: 4px;
    background: transparent;
    border: none;
  }

  .emoji-item:hover {
    background: #333;
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

  .toolbar.game-mode > .toolbar-row,
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

  .screen-name-section {
    margin: 16px 0;
    padding: 12px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-radius: 10px;
    border: 2px solid #0f3460;
  }

  .screen-name-label {
    display: block;
    font-size: 13px;
    color: #e94560;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: bold;
    text-align: center;
  }

  .screen-name-input {
    width: 100%;
    background: #0a0a15;
    color: #fff;
    border: 2px solid #e94560;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 18px;
    font-family: "Comic Sans MS", "Chalkboard SE", cursive;
    text-align: center;
    box-sizing: border-box;
  }

  .screen-name-input::placeholder {
    color: #666;
    font-style: italic;
  }

  .screen-name-input:focus {
    outline: none;
    border-color: #22c55e;
    background: #111;
    box-shadow: 0 0 10px rgba(233, 69, 96, 0.3);
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

  .multiplayer-btn {
    padding: 4px 8px;
    border: none;
    background: #7c3aed;
    color: #fff;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    transition: background 0.1s;
  }

  .multiplayer-btn:hover {
    background: #6d28d9;
  }

  .multiplayer-btn.active {
    background: #22c55e;
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
    max-height: calc(100vh - 100px);
    background: #111;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: none;
    flex-direction: column;
    overflow-y: auto;
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

  .profile-stat {
    position: relative;
  }

  .notification-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #ef4444;
    color: white;
    font-size: 10px;
    font-weight: bold;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }

  .followers-panel {
    display: none;
    padding: 12px 20px;
    border-bottom: 1px solid #333;
    background: rgba(34, 197, 94, 0.1);
  }

  .followers-panel.show {
    display: block;
  }

  .followers-panel-header {
    font-size: 12px;
    font-weight: bold;
    color: #22c55e;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .follower-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #333;
  }

  .follower-item:last-child {
    border-bottom: none;
  }

  .follower-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    object-fit: cover;
    background: #333;
  }

  .follower-info {
    flex: 1;
  }

  .follower-name {
    font-size: 14px;
    color: #fff;
    font-weight: 500;
  }

  .follower-time {
    font-size: 11px;
    color: #888;
  }

  .no-followers {
    color: #666;
    font-size: 13px;
    font-style: italic;
    padding: 8px 0;
  }

  .profile-bio {
    padding: 16px 20px;
    border-bottom: 1px solid #333;
  }

  .profile-bio-label {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  .profile-bio-content {
    color: #ccc;
    font-size: 14px;
    cursor: pointer;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .profile-bio-content:hover {
    background: rgba(255,255,255,0.05);
  }

  .profile-bio-empty {
    color: #666;
    font-style: italic;
  }

  .profile-bio-input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #444;
    border-radius: 6px;
    padding: 8px;
    color: #fff;
    font-size: 14px;
    resize: none;
    font-family: inherit;
  }

  .profile-bio-input:focus {
    outline: none;
    border-color: #3b82f6;
  }

  .profile-bio-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .profile-bio-save {
    background: #22c55e;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .profile-bio-cancel {
    background: #666;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
  }

  .profile-actions {
    padding: 16px 20px;
    display: flex;
    gap: 10px;
  }

  .feedback-section {
    padding: 12px 20px;
    border-bottom: 1px solid #333;
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
  }

  .feedback-header {
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .beta-badge {
    background: linear-gradient(135deg, #22c55e, #3b82f6);
    color: white;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }

  .feedback-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .feedback-select {
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
    cursor: pointer;
  }

  .feedback-select:focus {
    outline: none;
    border-color: #22c55e;
  }

  .feedback-textarea {
    background: #222;
    border: 1px solid #333;
    border-radius: 6px;
    color: #fff;
    padding: 8px 10px;
    font-size: 13px;
    resize: none;
    font-family: inherit;
  }

  .feedback-textarea:focus {
    outline: none;
    border-color: #22c55e;
  }

  .feedback-textarea::placeholder {
    color: #666;
  }

  .feedback-submit {
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  .feedback-submit:hover {
    background: #16a34a;
  }

  .feedback-submit:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
  }

  .feedback-success {
    color: #22c55e;
    font-size: 13px;
    text-align: center;
    padding: 10px;
  }

  .profile-settings {
    padding: 12px 20px;
    border-bottom: 1px solid #333;
  }

  .profile-settings-header {
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
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

  .profile-contributors {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid #333;
  }

  .profile-contributors-header {
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }

  .contributors-list {
    max-height: 150px;
    overflow-y: auto;
  }

  .no-contributors {
    color: #666;
    font-size: 13px;
    font-style: italic;
    padding: 8px 0;
  }

  .contributor-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 0;
    gap: 10px;
  }

  .contributor-info {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .contributor-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #333;
    object-fit: cover;
    flex-shrink: 0;
  }

  .contributor-name {
    color: #ddd;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .contributor-toggle {
    flex-shrink: 0;
  }

  .contributor-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .follow-btn {
    padding: 4px 10px;
    border-radius: 12px;
    border: none;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .follow-btn.follow {
    background: #3b82f6;
    color: white;
  }

  .follow-btn.follow:hover {
    background: #2563eb;
  }

  .follow-btn.following {
    background: #333;
    color: #aaa;
  }

  .follow-btn.following:hover {
    background: #ef4444;
    color: white;
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

  .toggle-switch.small {
    width: 32px;
    height: 18px;
    border-radius: 9px;
  }

  .toggle-switch.small::after {
    width: 14px;
    height: 14px;
  }

  .toggle-switch.small.active::after {
    transform: translateX(14px);
  }

  .char-toggle-profile {
    display: flex;
    gap: 4px;
  }

  .char-btn-profile {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: 2px solid #333;
    background: #222;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .char-btn-profile:hover {
    border-color: #555;
  }

  .char-btn-profile.active {
    border-color: #22c55e;
    background: #22c55e22;
  }

  .body-part-toggles {
    display: flex;
    gap: 4px;
  }

  .part-toggle {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #444;
    background: #222;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .part-toggle:hover {
    border-color: #666;
    transform: scale(1.05);
  }

  .part-toggle.active {
    border-color: #22c55e;
    background: #22c55e22;
  }

  .profile-color-picker {
    display: flex;
    align-items: center;
  }

  .profile-color-swatches {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .profile-color-swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #333;
    cursor: pointer;
    transition: all 0.15s;
  }

  .profile-color-swatch:hover {
    transform: scale(1.1);
    border-color: #555;
  }

  .profile-color-swatch.active {
    border-color: #fff;
    box-shadow: 0 0 0 2px #22c55e;
  }

  .profile-select {
    background: #222;
    color: #fff;
    border: 1px solid #333;
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    cursor: pointer;
  }

  .profile-select:focus {
    outline: none;
    border-color: #22c55e;
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

  .help-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: transparent;
    color: #ff69b4;
    border: 2px solid #ff69b4;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    margin-top: 12px;
    transition: all 0.2s;
  }

  .help-btn:hover {
    background: #ff69b4;
    color: white;
  }

  .help-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.85);
    z-index: 10000;
    display: none;
    padding: 20px;
  }

  .help-modal.show {
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }

  .help-content {
    position: relative;
    max-width: 600px;
    width: 100%;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    background: #1a1a2e;
    border-radius: 16px;
    padding: 24px;
    padding-top: 50px;
    padding-bottom: 40px;
    color: white;
    font-family: system-ui, sans-serif;
    margin-top: 20px;
  }

  .help-close {
    position: absolute;
    top: 12px;
    right: 12px;
    background: #333;
    border: none;
    color: white;
    font-size: 24px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
  }

  .help-close:hover {
    background: #ff69b4;
  }

  .help-title {
    font-size: 24px;
    font-weight: bold;
    color: #ff69b4;
    margin: 0 0 20px 0;
    text-align: center;
  }

  .help-section {
    margin-bottom: 24px;
  }

  .help-section-title {
    font-size: 16px;
    font-weight: bold;
    color: #ff69b4;
    margin: 0 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .help-section-content {
    font-size: 14px;
    line-height: 1.6;
    color: #ccc;
  }

  .help-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px 16px;
    margin-top: 8px;
  }

  .help-key {
    font-weight: bold;
    color: white;
    background: #333;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 13px;
  }

  .help-value {
    color: #aaa;
  }

  .help-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }

  .help-button-item {
    background: #2a2a3e;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 13px;
  }

  .help-button-icon {
    margin-right: 4px;
  }
`;

// Sign-in reminder constants
const SIGNIN_REMINDER_KEY = 'oo_signin_reminder_last';
const SIGNIN_REMINDER_INTERVAL = 4 * 60 * 60 * 1000; // 4 hours in ms

/**
 * Show a sign-in reminder notification
 */
function showSignInReminder(message: string): void {
  // Create a temporary notification element
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: linear-gradient(135deg, #ff6b6b, #ee5a5a);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    animation: slideDown 0.3s ease;
  `;
  notification.textContent = message + ' - Click the profile button to sign in';
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

/**
 * Check if we should show a periodic sign-in reminder
 */
function checkPeriodicSignInReminder(): void {
  const user = getCurrentUser();
  if (user) return; // Already signed in

  const lastReminder = localStorage.getItem(SIGNIN_REMINDER_KEY);
  const now = Date.now();

  if (!lastReminder || (now - parseInt(lastReminder, 10)) > SIGNIN_REMINDER_INTERVAL) {
    // Show reminder after a short delay so it doesn't appear immediately on page load
    setTimeout(() => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        showSignInReminder('Sign in to share drawings with others');
        localStorage.setItem(SIGNIN_REMINDER_KEY, now.toString());
      }
    }, 10000); // 10 second delay
  }
}

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
    all: initial;
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    overflow: visible !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
    margin: 0 !important;
    padding: 0 !important;
    border: none !important;
    box-sizing: border-box !important;
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
  fab.onclick = () => {
    // Close profile modal if open
    if (isProfileModalOpen) {
      isProfileModalOpen = false;
      shadowRoot?.querySelector('#oo-profile-modal')?.classList.remove('show');
    }
    toggleMenu();
  };
  container.appendChild(fab);

  // Quick explore button - drops Smudgy without opening menu (toggle on/off)
  const quickExplore = document.createElement('button');
  quickExplore.className = 'quick-explore';
  quickExplore.textContent = '🏃';
  quickExplore.title = 'Quick drop Smudgy';
  let isExploring = false;
  quickExplore.onclick = (e) => {
    e.stopPropagation();
    if (!isExploring) {
      // Start exploring - drop Smudgy without opening menu
      isExploring = true;
      currentMode = 'game';
      quickExplore.style.background = '#22c55e'; // Green when active
      document.dispatchEvent(new CustomEvent('oo:gamemode', { detail: { mode: 'play', playmode: 'explore' } }));
    } else {
      // Stop exploring - dismiss Smudgy
      isExploring = false;
      currentMode = 'none';
      quickExplore.style.background = '#ff69b4'; // Back to pink
      document.dispatchEvent(new CustomEvent('oo:gamemode', { detail: { mode: 'none' } }));
    }
  };
  // Listen for game mode ending from other sources (like toolbar X)
  document.addEventListener('oo:gamemode', ((e: CustomEvent) => {
    if (e.detail.mode === 'none') {
      isExploring = false;
      quickExplore.style.background = '#ff69b4';
    } else if (e.detail.mode === 'play' && e.detail.playmode === 'explore') {
      isExploring = true;
      quickExplore.style.background = '#22c55e';
    }
  }) as EventListener);
  container.appendChild(quickExplore);

  // Quick visibility toggle - hide/show all drawings (eye icon with slash when hidden)
  const quickVisibility = document.createElement('button');
  quickVisibility.className = 'quick-visibility';
  quickVisibility.innerHTML = '👁';
  quickVisibility.title = 'Hide drawings';
  let drawingsVisible = true;
  const updateVisibilityIcon = () => {
    quickVisibility.classList.toggle('hidden', !drawingsVisible);
    quickVisibility.title = drawingsVisible ? 'Hide drawings' : 'Show drawings';
  };
  quickVisibility.onclick = (e) => {
    e.stopPropagation();
    drawingsVisible = !drawingsVisible;
    updateVisibilityIcon();
    // Update visibilityState and dispatch event (same as profile toggle)
    visibilityState.showAll = drawingsVisible;
    // Also update the toggle in profile if visible
    shadowRoot?.querySelector('#toggle-all-drawings')?.classList.toggle('active', drawingsVisible);
    document.dispatchEvent(new CustomEvent('oo:visibility:all', { detail: { show: drawingsVisible } }));
  };
  // Listen for visibility changes from profile settings
  document.addEventListener('oo:visibility:all', ((e: CustomEvent) => {
    drawingsVisible = e.detail.show;
    updateVisibilityIcon();
  }) as EventListener);
  container.appendChild(quickVisibility);

  // Dismiss Smudgy button (shown when Smudgy is doing ambient behavior)
  const dismissSmudgy = document.createElement('button');
  dismissSmudgy.className = 'dismiss-smudgy';
  dismissSmudgy.textContent = '✕';
  dismissSmudgy.title = 'Dismiss Smudgy';
  dismissSmudgy.onclick = (e) => {
    e.stopPropagation();
    // Dispatch event to dismiss Smudgy's ambient behavior
    document.dispatchEvent(new CustomEvent('oo:dismisssmudgy'));
    dismissSmudgy.classList.remove('show');
  };
  container.appendChild(dismissSmudgy);

  // Listen for ambient behavior starting (show dismiss button)
  document.addEventListener('oo:ambientstart', () => {
    dismissSmudgy.classList.add('show');
  });

  // Listen for ambient behavior ending (hide dismiss button)
  document.addEventListener('oo:ambientend', () => {
    dismissSmudgy.classList.remove('show');
  });

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
      <p>Sign in to save your drawings and follow other users +many more features</p>
      <button class="help-btn" id="help-btn-login">📖 How to Use</button>
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
      <div class="screen-name-section">
        <label class="screen-name-label">Your Game Name</label>
        <input type="text" class="screen-name-input" id="oo-screen-name" placeholder="Pick a nickname!" maxlength="12">
      </div>
      <div class="profile-stats">
        <div class="profile-stat" id="followers-stat" title="Click to view followers">
          <div class="profile-stat-value" id="followers-count">0</div>
          <div class="profile-stat-label">Followers</div>
        </div>
        <div class="profile-stat" id="following-stat" title="Click to view following">
          <div class="profile-stat-value" id="following-count">0</div>
          <div class="profile-stat-label">Following</div>
        </div>
      </div>
      <div class="followers-panel" id="followers-panel">
        <div class="followers-panel-header">Your Followers</div>
        <div id="followers-list">
          <div class="no-followers">Loading followers...</div>
        </div>
      </div>
      <div class="profile-bio" id="profile-bio">
        <div class="profile-bio-label">Bio (click to edit)</div>
        <div class="profile-bio-content" id="profile-bio-content">
          <span class="profile-bio-empty">Click to add a bio...</span>
        </div>
        <div class="profile-bio-edit" id="profile-bio-edit" style="display:none;">
          <textarea class="profile-bio-input" id="profile-bio-input" placeholder="Tell others about yourself..." maxlength="150" rows="3"></textarea>
          <div class="profile-bio-actions">
            <button class="profile-bio-save" id="profile-bio-save">Save</button>
            <button class="profile-bio-cancel" id="profile-bio-cancel">Cancel</button>
          </div>
        </div>
      </div>
      <div class="profile-settings" id="character-settings">
        <div class="profile-settings-header">Character Settings</div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Character</span>
          <div class="char-toggle-profile">
            <button class="char-btn-profile active" id="profile-char-boy" title="Boy">👦</button>
            <button class="char-btn-profile" id="profile-char-girl" title="Girl">👧</button>
          </div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Part</span>
          <div class="body-part-toggles" id="body-part-toggles">
            <button class="part-toggle active" data-part="body" title="Body">🦴</button>
            <button class="part-toggle" data-part="head" title="Head">⚪</button>
            <button class="part-toggle" data-part="face" title="Face">🩷</button>
            <button class="part-toggle" data-part="hair" title="Hair">💇</button>
            <button class="part-toggle" data-part="dress" title="Dress">👗</button>
          </div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Color</span>
          <div class="profile-color-picker" id="profile-color-picker">
            <div class="profile-color-swatches" id="profile-color-swatches"></div>
          </div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Hat</span>
          <select class="profile-select" id="profile-hat-select">
            <option value="none">None</option>
            <option value="cap">🧢 Cap</option>
            <option value="tophat">🎩 Top Hat</option>
            <option value="crown">👑 Crown</option>
            <option value="beanie">🧶 Beanie</option>
            <option value="party">🎉 Party</option>
          </select>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Face</span>
          <select class="profile-select" id="profile-accessory-select">
            <option value="none">None</option>
            <option value="glasses">👓 Glasses</option>
            <option value="sunglasses">🕶️ Sunglasses</option>
            <option value="mustache">🥸 Mustache</option>
            <option value="beard">🧔 Beard</option>
            <option value="mask">😷 Mask</option>
          </select>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Respawn in explore</span>
          <div class="toggle-switch active" id="toggle-respawn" title="Respawn when falling off screen"></div>
        </div>
      </div>
      <div class="profile-settings">
        <div class="profile-settings-header">Smudgy's Home</div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Show home</span>
          <div class="toggle-switch active" id="toggle-home" title="Show or hide Smudgy's home"></div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Furniture</span>
          <select class="profile-select" id="profile-furniture-select">
            <option value="hammock">🌴 Hammock</option>
            <option value="bed">🛏️ Bed</option>
            <option value="couch">🛋️ Couch</option>
            <option value="beanbag">🫘 Beanbag</option>
            <option value="campfire">🔥 Campfire</option>
            <option value="trampoline">🤸 Trampoline</option>
            <option value="gym">💪 Gym</option>
            <option value="none">🏠 Empty</option>
          </select>
        </div>
      </div>
      <div class="profile-settings">
        <div class="profile-settings-header">Drawing Visibility</div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Show all drawings</span>
          <div class="toggle-switch active" id="toggle-all-drawings" title="Master toggle - hide all drawings"></div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">My drawings</span>
          <div class="toggle-switch active" id="toggle-my-drawings" title="Show or hide your own drawings"></div>
        </div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Only people I follow</span>
          <div class="toggle-switch" id="toggle-following-only" title="Show only drawings from users you follow"></div>
        </div>
        <div class="profile-contributors" id="contributors-section">
          <div class="profile-contributors-header">Contributors on this page</div>
          <div id="contributors-list" class="contributors-list">
            <div class="no-contributors">No other contributors yet</div>
          </div>
        </div>
      </div>
      <div class="profile-settings" id="race-course-settings" style="display: none;">
        <div class="profile-settings-header">Race Course</div>
        <div class="profile-setting-row">
          <span class="profile-setting-label">Select course</span>
          <select class="profile-select" id="race-course-select">
            <option value="mine">My Course</option>
          </select>
        </div>
      </div>
      <div class="profile-bookmarks" id="profile-bookmarks">
        <div class="profile-bookmarks-header">
          Bookmarks <span class="profile-bookmarks-count" id="bookmarks-count">0</span>
        </div>
        <div id="bookmarks-list"></div>
      </div>
      <div class="feedback-section">
        <div class="feedback-header">
          <span class="beta-badge">BETA</span>
          Send Feedback
        </div>
        <div class="feedback-form" id="feedback-form">
          <select id="feedback-type" class="feedback-select">
            <option value="bug">🐛 Bug Report</option>
            <option value="feature">💡 Feature Request</option>
            <option value="other">💬 Other Feedback</option>
          </select>
          <textarea id="feedback-text" class="feedback-textarea" placeholder="Describe the issue or suggestion..." rows="3"></textarea>
          <button class="feedback-submit" id="feedback-submit">Send Feedback</button>
        </div>
        <div class="feedback-success" id="feedback-success" style="display:none;">
          ✓ Thanks for your feedback!
        </div>
      </div>
      <div class="profile-actions">
        <button class="help-btn" id="help-btn-profile">📖 How to Use</button>
        <button class="profile-btn danger" id="signout-btn">Sign Out</button>
      </div>
    </div>
  `;
  shadowRoot.appendChild(profileModal);

  // Create help modal (outside Shadow DOM for proper event handling)
  const helpModal = document.createElement('div');
  helpModal.id = 'oo-help-modal';
  helpModal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.9);
    z-index: 2147483647;
    display: none;
    justify-content: center;
    align-items: flex-start;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
  `;
  helpModal.innerHTML = `
    <div id="oo-help-content" style="
      position: relative;
      max-width: 600px;
      width: 100%;
      max-height: calc(100vh - 80px);
      overflow-y: auto;
      background: #1a1a2e;
      border-radius: 16px;
      padding: 24px;
      padding-top: 50px;
      padding-bottom: 40px;
      color: white;
      margin-top: 20px;
    ">
      <button id="oo-help-close" style="
        position: absolute;
        top: 12px;
        right: 12px;
        background: #444;
        border: none;
        color: white;
        font-size: 20px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      ">&times;</button>
      <h1 style="font-size: 24px; font-weight: bold; color: #ff69b4; margin: 0 0 20px 0; text-align: center;">📖 How to Use OpenOverlay</h1>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">🎯 Getting Started</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Click the pink Smudgy button in the bottom-right corner to open the menu. You'll see 4 buttons for different features.
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">✏️ Draw Mode</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Draw on any webpage! Your drawings become platforms your character can walk on.
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">● Solid</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">○ Outline</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">••• Dots</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">≋ Spray</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">～ Glow</span>
          </div>
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin-top: 12px;">
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🧹</span><span style="color: #aaa;">Eraser</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">⬇️</span><span style="color: #aaa;">Draw behind character</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">⬆️</span><span style="color: #aaa;">Draw in front of character</span>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">📝 Text Mode</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Add text stickers and emojis to any page! Click anywhere to place your text.
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin-top: 8px;">
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">😀</span><span style="color: #aaa;">Open emoji picker</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">B / I</span><span style="color: #aaa;">Bold / Italic text</span>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">🎮 Game Mode</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Spawn your character and play! Walk on the drawings you create.
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin-top: 8px;">
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">A / ←</span><span style="color: #aaa;">Move left</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">D / →</span><span style="color: #aaa;">Move right</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">W / Space</span><span style="color: #aaa;">Jump</span>
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px;">
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">👥 Multiplayer</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">🏷️ Tag Game</span>
            <span style="background: #2a2a3e; padding: 6px 12px; border-radius: 6px; font-size: 13px;">🏃 Race Mode</span>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">🏗️ Build Race Courses</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Create custom race tracks with obstacles!
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; margin-top: 8px;">
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🏁</span><span style="color: #aaa;">Start line</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🏆</span><span style="color: #aaa;">Finish line</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🚩</span><span style="color: #aaa;">Checkpoints</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🔶</span><span style="color: #aaa;">Trampolines</span>
            <span style="font-weight: bold; color: white; background: #333; padding: 2px 8px; border-radius: 4px; font-size: 13px;">🔺</span><span style="color: #aaa;">Spikes (hazard!)</span>
          </div>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ff69b4; margin: 0 0 12px 0;">👤 Profile Features</h2>
        <div style="font-size: 14px; line-height: 1.6; color: #ccc;">
          Sign in to save drawings, customize your character, and play multiplayer!
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(helpModal);

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
      <!-- Row 1: Brushes + Tools -->
      <div class="toolbar-row">
        <div class="brush-styles" id="oo-brushes">
          ${BRUSH_STYLES.map(b => `
            <button class="brush-btn ${b.id === 'solid' ? 'active' : ''}"
                    data-brush="${b.id}" title="${b.title}">${b.label}</button>
          `).join('')}
        </div>
        <button class="eraser-btn" id="oo-eraser" title="Eraser">🧹</button>
        <button class="tool-btn" id="oo-layer-bg" title="Background">⬇️</button>
        <button class="tool-btn" id="oo-layer-fg" title="Foreground">⬆️</button>
      </div>
      <!-- Row 2: Shapes -->
      <div class="toolbar-row">
        <div class="shape-tools" id="oo-shapes">
          ${SHAPE_TOOLS.map(s => `
            <button class="shape-btn ${s.id === 'none' ? 'active' : ''}"
                    data-shape="${s.id}" title="${s.title}">${s.label}</button>
          `).join('')}
        </div>
        <button class="fill-btn" id="oo-fill-toggle" title="Toggle fill">◧</button>
      </div>
    </div>

    <!-- TEXT MODE CONTROLS -->
    <div class="text-controls" id="text-controls" style="position: relative;">
      <div class="emoji-picker" id="oo-emoji-picker">
        <div class="emoji-picker-header">Emojis & Stickers</div>
        <div class="emoji-grid" id="oo-emoji-grid"></div>
      </div>
      <div class="toolbar-row">
        <button class="emoji-btn" id="oo-emoji-btn" title="Add emoji">😀</button>
        <input type="text" class="text-input" id="oo-text-input" placeholder="Type or pick emoji...">
        <div class="text-styles" id="oo-text-styles">
          ${TEXT_STYLES.map(s => `
            <button class="text-style-btn ${s.id === 'normal' ? 'active' : ''}"
                    data-style="${s.id}" title="${s.title}">${s.label}</button>
          `).join('')}
        </div>
        <button class="tool-btn" id="oo-text-layer-bg" title="Background (behind character)">⬇️</button>
        <button class="tool-btn" id="oo-text-layer-fg" title="Foreground (in front of character)">⬆️</button>
      </div>
      <span class="place-hint">Click page to place (default: regular layer)</span>
    </div>

    <!-- GAME MODE CONTROLS -->
    <div class="game-controls" id="game-controls">
      <!-- Row 1: Play Mode Buttons -->
      <div class="game-row">
        <div class="game-mode-toggle">
          <button class="game-mode-btn" id="oo-multiplayer-setup" data-mode="play" data-playmode="explore" title="Multiplayer Explore">👥 MP</button>
          <button class="game-mode-btn" id="oo-tag-game" data-mode="play" data-playmode="explore" title="Tag Game">🏷️ Tag</button>
          <button class="game-mode-btn" data-mode="play" data-playmode="race" title="Race">🏃 Race</button>
        </div>
      </div>

      <!-- Row 2: Build Tools (shown by default in build mode) -->
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

      <!-- Row 3: Actions -->
      <div class="game-row">
        <div class="game-actions">
          <button class="action-btn btn-undo" id="oo-game-undo" title="Undo">↩</button>
          <button class="action-btn btn-clear" id="oo-game-clear" title="Clear">🗑</button>
          <button class="action-btn btn-cancel" id="oo-game-cancel">✕</button>
          <button class="action-btn btn-save" id="oo-game-save">✓</button>
        </div>
      </div>
    </div>

    <!-- SHARED CONTROLS -->
    <!-- Color Row -->
    <div class="toolbar-row">
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

    <!-- Size/Opacity Row (hidden in game mode) -->
    <div class="toolbar-row drawing-only">
      <label>Size</label>
      <input type="range" id="oo-size" min="1" max="150" value="24" style="width: 80px;">
      <span class="size-display" id="oo-size-display">24</span>
      <label style="margin-left: 8px;">Op</label>
      <input type="range" id="oo-opacity" min="10" max="100" value="100" style="width: 60px;">
      <span class="opacity-display" id="oo-opacity-display">100%</span>
    </div>

    <!-- Actions Row -->
    <div class="toolbar-row">
      <button class="action-btn btn-undo" id="oo-undo" title="Undo">↩</button>
      <button class="action-btn btn-clear" id="oo-clear" title="Clear All">🗑</button>
      <div style="flex: 1;"></div>
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
    // Reset game sub mode to explore for next time
    gameSubMode = 'play';
    // Update button states
    const minis = shadowRoot?.querySelectorAll('.mini');
    minis?.forEach(mini => mini.classList.remove('active'));
  });

  console.log('[OpenOverlay] UI initialized');

  // Check if we should show a periodic sign-in reminder
  checkPeriodicSignInReminder();
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

  // Emoji picker setup
  const emojiBtn = toolbar.querySelector('#oo-emoji-btn') as HTMLButtonElement;
  const emojiPicker = toolbar.querySelector('#oo-emoji-picker') as HTMLElement;
  const emojiGrid = toolbar.querySelector('#oo-emoji-grid') as HTMLElement;

  // Populate emoji grid
  if (emojiGrid) {
    emojiGrid.innerHTML = EMOJI_STICKERS.map(emoji =>
      `<button class="emoji-item" data-emoji="${emoji}">${emoji}</button>`
    ).join('');
  }

  // Toggle emoji picker
  emojiBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    emojiPicker?.classList.toggle('show');
  });

  // Handle emoji selection
  emojiGrid?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const emoji = target.dataset.emoji;
    if (emoji) {
      const textInput = toolbar.querySelector('#oo-text-input') as HTMLInputElement;
      if (textInput) {
        // Insert emoji at cursor position or append
        const start = textInput.selectionStart || textInput.value.length;
        const end = textInput.selectionEnd || textInput.value.length;
        const before = textInput.value.substring(0, start);
        const after = textInput.value.substring(end);
        textInput.value = before + emoji + after;
        textInput.focus();
        // Trigger input event to create/update text
        textInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      emojiPicker?.classList.remove('show');
    }
  });

  // Close emoji picker when clicking outside
  document.addEventListener('click', (e) => {
    if (emojiPicker?.classList.contains('show')) {
      const target = e.target as Node;
      if (!emojiPicker.contains(target) && target !== emojiBtn) {
        emojiPicker.classList.remove('show');
      }
    }
  });

  // Text input - auto-place text in center when user starts typing
  const textInput = toolbar.querySelector('#oo-text-input') as HTMLInputElement;
  let liveTextId: string | null = null; // Track the text we're currently editing

  textInput?.addEventListener('input', () => {
    const newText = textInput.value;
    pendingText = newText;

    console.log('[OpenOverlay] Text input:', newText, 'liveTextId:', liveTextId);

    if (newText.trim() && !liveTextId) {
      // First character typed - create text in center of screen
      console.log('[OpenOverlay] Creating text in center');
      document.dispatchEvent(new CustomEvent('oo:textcreate', {
        detail: { text: newText }
      }));
    } else if (newText.trim() && liveTextId) {
      // Update existing text as user types
      document.dispatchEvent(new CustomEvent('oo:textupdate', {
        detail: { text: newText }
      }));
    } else if (!newText.trim() && liveTextId) {
      // Text cleared - delete the text item
      document.dispatchEvent(new CustomEvent('oo:textdelete', {
        detail: { id: liveTextId }
      }));
      liveTextId = null;
    }

    dispatchSettingsChange();
  });

  // Track when text is created
  document.addEventListener('oo:textcreated', ((e: CustomEvent) => {
    console.log('[OpenOverlay] Text created with id:', e.detail.id);
    liveTextId = e.detail.id;
    // Don't blur - let user finish typing. They can click elsewhere to drag.
  }) as EventListener);

  // Reset when text is saved/cleared
  document.addEventListener('oo:textsaved', () => {
    console.log('[OpenOverlay] Text saved, resetting');
    liveTextId = null;
    if (textInput) textInput.value = '';
    pendingText = '';
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
  const eraserBtn = toolbar.querySelector('#oo-eraser') as HTMLButtonElement;
  eraserBtn?.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
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

  // Text layer toggles (same behavior, separate buttons for text mode)
  toolbar.querySelector('#oo-text-layer-bg')?.addEventListener('click', () => {
    if (drawLayer === 'background') {
      drawLayer = 'normal';
    } else {
      drawLayer = 'background';
    }
    toolbar.querySelector('#oo-text-layer-bg')?.classList.toggle('active', drawLayer === 'background');
    toolbar.querySelector('#oo-text-layer-fg')?.classList.remove('active');
    dispatchSettingsChange();
  });

  toolbar.querySelector('#oo-text-layer-fg')?.addEventListener('click', () => {
    if (drawLayer === 'foreground') {
      drawLayer = 'normal';
    } else {
      drawLayer = 'foreground';
    }
    toolbar.querySelector('#oo-text-layer-fg')?.classList.toggle('active', drawLayer === 'foreground');
    toolbar.querySelector('#oo-text-layer-bg')?.classList.remove('active');
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

  // Game mode toggle (Race button only - MP and Tag have their own handlers)
  toolbar.querySelectorAll('.game-mode-btn').forEach(btn => {
    // Skip buttons with specific IDs (they have their own handlers)
    const btnId = (btn as HTMLElement).id;
    if (btnId === 'oo-multiplayer-setup' || btnId === 'oo-tag-game') return;

    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.mode as 'play' | 'build';
      const playmode = (btn as HTMLElement).dataset.playmode as 'explore' | 'race' | undefined;
      gameSubMode = mode;

      toolbar.querySelectorAll('.game-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Hide build tools when playing
      const buildTools = toolbar.querySelector('.build-tools-section') as HTMLElement;
      if (buildTools) {
        buildTools.style.display = 'none';
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

  // Game mode action buttons
  toolbar.querySelector('#oo-game-undo')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:undo'));
  });

  toolbar.querySelector('#oo-game-clear')?.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('oo:clear'));
  });

  toolbar.querySelector('#oo-game-cancel')?.addEventListener('click', () => {
    // Just close the toolbar without removing character
    // Save first to preserve any changes
    document.dispatchEvent(new CustomEvent('oo:save'));
    // Hide toolbar but keep game/character active
    toolbar.classList.remove('show');
    currentMode = 'none'; // Reset so clicking game button reopens toolbar
  });

  toolbar.querySelector('#oo-game-save')?.addEventListener('click', () => {
    // Save and close toolbar, but keep game active
    document.dispatchEvent(new CustomEvent('oo:save'));
    // Switch to explore mode (not build) so drawing undo works
    // This keeps the game active but allows drawing mode to function properly
    document.dispatchEvent(new CustomEvent('oo:gamemode', {
      detail: { mode: 'play', playmode: 'explore' }
    }));
    // Hide toolbar but don't exit game mode
    toolbar.classList.remove('show');
    currentMode = 'none'; // Reset so clicking game button reopens toolbar
  });

  // Click outside toolbar to save and close (only in game play mode, not build mode)
  document.addEventListener('click', (e) => {
    // Skip if toolbar was just opened (prevents closing on the same click that opened it)
    if (toolbarJustOpened) {
      toolbarJustOpened = false;
      return;
    }

    if (currentMode !== 'game') return;
    if (!toolbar.classList.contains('show')) return;

    // Don't close toolbar in build mode - clicks on page are for placing elements
    if (gameSubMode === 'build') return;

    // Check if click is inside our shadow DOM using composedPath
    // This properly handles clicks across shadow DOM boundaries
    const path = e.composedPath();
    const shadowHostEl = shadowRoot?.host;

    // If click path includes the shadow host, it was inside our UI
    if (shadowHostEl && path.includes(shadowHostEl)) return;

    // Click was outside - save and close
    document.dispatchEvent(new CustomEvent('oo:save'));
    // Switch to explore mode (not build) so drawing undo works
    document.dispatchEvent(new CustomEvent('oo:gamemode', {
      detail: { mode: 'play', playmode: 'explore' }
    }));
    toolbar.classList.remove('show');
    currentMode = 'none';
  });

  // Click outside profile modal to close it
  document.addEventListener('click', (e) => {
    if (!isProfileModalOpen) return;

    // Check if click is inside our shadow DOM using composedPath
    const path = e.composedPath();
    const shadowHostEl = shadowRoot?.host;

    // If click path includes the shadow host, it was inside our UI
    if (shadowHostEl && path.includes(shadowHostEl)) return;

    // Click was outside - close profile modal
    isProfileModalOpen = false;
    shadowRoot?.querySelector('#oo-profile-modal')?.classList.remove('show');
  });

  // Multiplayer setup button - resize window and start explore mode
  const mpButton = toolbar.querySelector('#oo-multiplayer-setup');
  mpButton?.addEventListener('click', async () => {
    // Check if signed in
    const user = getCurrentUser();
    if (!user) {
      showSignInReminder('Multiplayer requires sign-in');
      return;
    }

    const btn = mpButton as HTMLButtonElement;
    btn.textContent = '⏳';
    btn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SETUP_MULTIPLAYER' });
      if (response?.success) {
        btn.textContent = '✓ Ready';
        // Set active state and clear others
        toolbar.querySelectorAll('.game-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Hide build tools
        const buildTools = toolbar.querySelector('.build-tools-section') as HTMLElement;
        if (buildTools) buildTools.style.display = 'none';
        // Start explore mode (skip tag game - MP is just for window sync)
        gameSubMode = 'play';
        document.dispatchEvent(new CustomEvent('oo:gamemode', {
          detail: { mode: 'play', playmode: 'explore', skipTagGame: true }
        }));
        setTimeout(() => {
          btn.textContent = '👥 MP';
          btn.disabled = false;
        }, 1500);
      } else {
        btn.textContent = '❌ Error';
        setTimeout(() => {
          btn.textContent = '👥 MP';
          btn.disabled = false;
          btn.classList.remove('active');
        }, 2000);
      }
    } catch (err) {
      console.error('[OpenOverlay] Multiplayer setup error:', err);
      btn.textContent = '👥 MP';
      btn.disabled = false;
    }
  });

  // Tag game button - starts multiplayer setup first, then tag game
  const tagButton = toolbar.querySelector('#oo-tag-game') as HTMLButtonElement;
  let tagModeActive = false;

  tagButton?.addEventListener('click', async () => {
    // Check if signed in
    const user = getCurrentUser();
    if (!user) {
      showSignInReminder('Tag game requires sign-in');
      return;
    }

    if (tagModeActive) {
      // Leave tag game
      document.dispatchEvent(new CustomEvent('oo:toggletag'));
      return;
    }

    // Starting tag game - first setup multiplayer window
    tagButton.textContent = '⏳';
    tagButton.disabled = true;

    try {
      // Resize window for consistent coordinates
      const response = await chrome.runtime.sendMessage({ type: 'SETUP_MULTIPLAYER' });
      if (response?.success) {
        console.log('[OpenOverlay UI] Multiplayer setup complete, starting tag game');
        // Set active state and clear others
        toolbar.querySelectorAll('.game-mode-btn').forEach(b => b.classList.remove('active'));
        tagButton.classList.add('active');
        // Hide build tools
        const buildTools = toolbar.querySelector('.build-tools-section') as HTMLElement;
        if (buildTools) buildTools.style.display = 'none';
        gameSubMode = 'play';
        // Now start the tag game
        document.dispatchEvent(new CustomEvent('oo:toggletag'));
      } else {
        console.error('[OpenOverlay UI] Multiplayer setup failed:', response?.error);
        tagButton.textContent = '❌';
        setTimeout(() => {
          tagButton.textContent = '🏷️ Tag';
          tagButton.disabled = false;
        }, 1500);
      }
    } catch (err) {
      console.error('[OpenOverlay UI] Error setting up multiplayer:', err);
      tagButton.textContent = '❌';
      setTimeout(() => {
        tagButton.textContent = '🏷️ Tag';
        tagButton.disabled = false;
      }, 1500);
    }
  });

  // Listen for tag state changes from game
  document.addEventListener('oo:tagstatechange', ((e: CustomEvent) => {
    const { isTagMode, isIt } = e.detail;
    tagModeActive = isTagMode;
    tagButton.disabled = false;

    if (!isTagMode) {
      tagButton.textContent = '🏷️ Tag';
      tagButton.classList.remove('active');
    } else if (isIt) {
      tagButton.textContent = '🏷️ IT!';
      tagButton.classList.add('active');
    } else {
      tagButton.textContent = '🏷️ Run!';
      tagButton.classList.add('active');
    }
  }) as EventListener);

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

  // Help modal handlers (modal is outside Shadow DOM on document.body)
  const helpModalEl = document.getElementById('oo-help-modal');
  const helpCloseEl = document.getElementById('oo-help-close');
  const helpContentEl = document.getElementById('oo-help-content');
  const helpBtnLogin = shadowRoot.querySelector('#help-btn-login');
  const helpBtnProfile = shadowRoot.querySelector('#help-btn-profile');

  const openHelpModal = () => {
    if (helpModalEl) {
      helpModalEl.style.display = 'flex';
    }
  };

  const closeHelpModal = () => {
    if (helpModalEl) {
      helpModalEl.style.display = 'none';
    }
  };

  helpBtnLogin?.addEventListener('click', (e) => {
    e.stopPropagation();
    openHelpModal();
  });
  helpBtnProfile?.addEventListener('click', (e) => {
    e.stopPropagation();
    openHelpModal();
  });
  helpCloseEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeHelpModal();
  });

  // Close help modal when clicking outside content
  helpModalEl?.addEventListener('click', (e) => {
    if (e.target === helpModalEl) {
      closeHelpModal();
    }
  });

  // Prevent scroll from propagating to underlying page
  // Allow scrolling inside content, but prevent page scroll when at edges
  helpContentEl?.addEventListener('wheel', (e) => {
    const el = e.currentTarget as HTMLElement;
    const atTop = el.scrollTop <= 0;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
    const scrollingUp = e.deltaY < 0;
    const scrollingDown = e.deltaY > 0;

    // Only prevent default at edges to stop page scroll
    if ((atTop && scrollingUp) || (atBottom && scrollingDown)) {
      e.preventDefault();
    }
    e.stopPropagation();
  }, { passive: false });

  // Clicking on modal background (not content) closes it
  helpModalEl?.addEventListener('wheel', (e) => {
    if (e.target === helpModalEl) {
      e.preventDefault();
    }
    e.stopPropagation();
  }, { passive: false });

  // Screen name input
  const screenNameInput = shadowRoot.querySelector('#oo-screen-name') as HTMLInputElement;
  if (screenNameInput) {
    // Restore saved screen name
    const savedScreenName = localStorage.getItem('oo_screen_name');
    if (savedScreenName) {
      screenNameInput.value = savedScreenName;
    }

    screenNameInput.addEventListener('change', () => {
      const name = screenNameInput.value.trim();
      localStorage.setItem('oo_screen_name', name);
      document.dispatchEvent(new CustomEvent('oo:screenname', { detail: { name } }));
    });

    screenNameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        screenNameInput.blur();
      }
    });
  }

  // Bio editing
  const bioContent = shadowRoot.querySelector('#profile-bio-content') as HTMLElement;
  const bioEdit = shadowRoot.querySelector('#profile-bio-edit') as HTMLElement;
  const bioInput = shadowRoot.querySelector('#profile-bio-input') as HTMLTextAreaElement;
  const bioSaveBtn = shadowRoot.querySelector('#profile-bio-save') as HTMLButtonElement;
  const bioCancelBtn = shadowRoot.querySelector('#profile-bio-cancel') as HTMLButtonElement;

  bioContent?.addEventListener('click', () => {
    // Show edit mode
    const currentBio = bioContent.dataset.bio || '';
    bioInput.value = currentBio;
    bioContent.style.display = 'none';
    bioEdit.style.display = 'block';
    bioInput.focus();
  });

  bioInput?.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent keyboard shortcuts
  });

  bioSaveBtn?.addEventListener('click', async () => {
    const newBio = bioInput.value.trim();
    bioSaveBtn.disabled = true;
    bioSaveBtn.textContent = 'Saving...';

    try {
      await updateBio(newBio);
      bioContent.innerHTML = newBio ? escapeHtml(newBio) : '<span class="profile-bio-empty">Click to add a bio...</span>';
      bioContent.dataset.bio = newBio;
      bioEdit.style.display = 'none';
      bioContent.style.display = 'block';
    } catch (error) {
      console.error('[OpenOverlay] Failed to save bio:', error);
    } finally {
      bioSaveBtn.disabled = false;
      bioSaveBtn.textContent = 'Save';
    }
  });

  bioCancelBtn?.addEventListener('click', () => {
    bioEdit.style.display = 'none';
    bioContent.style.display = 'block';
  });

  // Feedback form submission
  const feedbackTextArea = shadowRoot.querySelector('#feedback-text') as HTMLTextAreaElement;
  feedbackTextArea?.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent page keyboard shortcuts while typing
  });

  const feedbackSubmitBtn = shadowRoot.querySelector('#feedback-submit');
  feedbackSubmitBtn?.addEventListener('click', async () => {
    const typeSelect = shadowRoot?.querySelector('#feedback-type') as HTMLSelectElement;
    const textArea = shadowRoot?.querySelector('#feedback-text') as HTMLTextAreaElement;
    const form = shadowRoot?.querySelector('#feedback-form') as HTMLElement;
    const success = shadowRoot?.querySelector('#feedback-success') as HTMLElement;

    const type = typeSelect?.value as 'bug' | 'feature' | 'other';
    const message = textArea?.value?.trim();

    if (!message) {
      textArea?.focus();
      return;
    }

    // Disable button while submitting
    const btn = feedbackSubmitBtn as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'Sending...';

    const result = await submitFeedback(type, message);

    if (result) {
      // Show success message
      form.style.display = 'none';
      success.style.display = 'block';

      // Reset and show form again after 3 seconds
      setTimeout(() => {
        textArea.value = '';
        typeSelect.selectedIndex = 0;
        form.style.display = 'block';
        success.style.display = 'none';
        btn.disabled = false;
        btn.textContent = 'Send Feedback';
      }, 3000);
    } else {
      btn.disabled = false;
      btn.textContent = 'Send Feedback';
      alert('Failed to send feedback. Please try again.');
    }
  });

  // Visibility toggles
  setupVisibilityToggles(shadowRoot);

  // Listen for contributors updates from canvas
  document.addEventListener('oo:contributors', ((e: CustomEvent) => {
    renderContributorsList(shadowRoot, e.detail.contributors);
  }) as EventListener);

  // Character settings in profile (boy/girl toggle)
  const profileBoyBtn = shadowRoot.querySelector('#profile-char-boy');
  const profileGirlBtn = shadowRoot.querySelector('#profile-char-girl');
  const profileHatSelect = shadowRoot.querySelector('#profile-hat-select') as HTMLSelectElement;
  const respawnToggle = shadowRoot.querySelector('#toggle-respawn') as HTMLElement;

  profileBoyBtn?.addEventListener('click', () => {
    profileBoyBtn.classList.add('active');
    profileGirlBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('oo:playerstyle', { detail: { isGirl: false } }));
    localStorage.setItem('oo_player_girl', 'false');
  });

  profileGirlBtn?.addEventListener('click', () => {
    profileGirlBtn.classList.add('active');
    profileBoyBtn?.classList.remove('active');
    document.dispatchEvent(new CustomEvent('oo:playerstyle', { detail: { isGirl: true } }));
    localStorage.setItem('oo_player_girl', 'true');
  });

  // Restore character style from localStorage
  if (localStorage.getItem('oo_player_girl') === 'true') {
    profileBoyBtn?.classList.remove('active');
    profileGirlBtn?.classList.add('active');
  }

  // Hat selection in profile
  profileHatSelect?.addEventListener('change', () => {
    const hat = profileHatSelect.value;
    document.dispatchEvent(new CustomEvent('oo:playerhat', { detail: { hat } }));
    localStorage.setItem('oo_player_hat', hat);
  });

  // Restore saved hat
  const savedHatProfile = localStorage.getItem('oo_player_hat');
  if (savedHatProfile && profileHatSelect) {
    profileHatSelect.value = savedHatProfile;
  }

  // Accessory selection in profile
  const profileAccessorySelect = shadowRoot.querySelector('#profile-accessory-select') as HTMLSelectElement;
  profileAccessorySelect?.addEventListener('change', () => {
    const accessory = profileAccessorySelect.value;
    document.dispatchEvent(new CustomEvent('oo:playeraccessory', { detail: { accessory } }));
    localStorage.setItem('oo_player_accessory', accessory);
  });

  // Restore saved accessory
  const savedAccessory = localStorage.getItem('oo_player_accessory');
  if (savedAccessory && profileAccessorySelect) {
    profileAccessorySelect.value = savedAccessory;
  }

  // Respawn toggle in profile
  const savedRespawn = localStorage.getItem('oo_explore_respawn') !== 'false'; // Default true
  if (!savedRespawn) {
    respawnToggle?.classList.remove('active');
  }

  respawnToggle?.addEventListener('click', () => {
    respawnToggle.classList.toggle('active');
    const shouldRespawn = respawnToggle.classList.contains('active');
    localStorage.setItem('oo_explore_respawn', shouldRespawn ? 'true' : 'false');
    document.dispatchEvent(new CustomEvent('oo:respawnsetting', { detail: { respawn: shouldRespawn } }));
  });

  // Smudgy's Home settings
  const homeToggle = shadowRoot.querySelector('#toggle-home') as HTMLElement;
  const furnitureSelect = shadowRoot.querySelector('#profile-furniture-select') as HTMLSelectElement;

  // Restore home visibility from localStorage
  const savedHomeVisible = localStorage.getItem('oo_home_visible') !== 'false'; // Default true
  if (!savedHomeVisible) {
    homeToggle?.classList.remove('active');
  }

  homeToggle?.addEventListener('click', () => {
    homeToggle.classList.toggle('active');
    const showHome = homeToggle.classList.contains('active');
    localStorage.setItem('oo_home_visible', showHome ? 'true' : 'false');
    document.dispatchEvent(new CustomEvent('oo:togglehome'));
  });

  // Furniture selection
  furnitureSelect?.addEventListener('change', () => {
    const furniture = furnitureSelect.value;
    document.dispatchEvent(new CustomEvent('oo:homefurniture', { detail: { furniture } }));
  });

  // Restore saved furniture
  const savedFurniture = localStorage.getItem('oo_home_furniture');
  if (savedFurniture && furnitureSelect) {
    furnitureSelect.value = savedFurniture;
  }

  // Body part color picker in profile
  const colorSwatchesContainer = shadowRoot.querySelector('#profile-color-swatches');
  const bodyPartToggles = shadowRoot.querySelector('#body-part-toggles');

  // Track which body part is currently selected for color changes
  let selectedBodyPart = 'body'; // Default to body

  // Helper to get saved color for a body part
  const getPartColor = (part: string): string => {
    if (part === 'face') {
      return localStorage.getItem('oo_color_face') || '#ff69b4';
    }
    const partColor = localStorage.getItem(`oo_color_${part}`);
    if (partColor) return partColor;
    return localStorage.getItem('oo_player_color') || '#ffffff';
  };

  // Helper to update active swatch based on selected part
  const updateActiveSwatchForPart = (part: string) => {
    const partColor = getPartColor(part);
    colorSwatchesContainer?.querySelectorAll('.profile-color-swatch').forEach(s => {
      s.classList.toggle('active', (s as HTMLElement).dataset.color === partColor);
    });
  };

  if (colorSwatchesContainer) {
    const colors = ['#ff3366', '#22c55e', '#3b82f6', '#f59e0b', '#8b5cf6', '#ff69b4', '#fff', '#000'];
    const savedColor = getPartColor(selectedBodyPart);

    colorSwatchesContainer.innerHTML = colors.map((c) => `
      <div class="profile-color-swatch ${c === savedColor ? 'active' : ''}" data-color="${c}" style="background: ${c}" title="${c}"></div>
    `).join('');

    colorSwatchesContainer.querySelectorAll('.profile-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        const color = (swatch as HTMLElement).dataset.color || '#ff3366';
        colorSwatchesContainer.querySelectorAll('.profile-color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        // Save and dispatch for the selected body part
        localStorage.setItem(`oo_color_${selectedBodyPart}`, color);
        document.dispatchEvent(new CustomEvent('oo:partcolor', { detail: { part: selectedBodyPart, color } }));

        // Also update legacy player color if body is selected (for backwards compatibility)
        if (selectedBodyPart === 'body') {
          localStorage.setItem('oo_player_color', color);
          document.dispatchEvent(new CustomEvent('oo:playercolor', { detail: { color } }));
        }
      });
    });
  }

  // Body part toggle handlers
  if (bodyPartToggles) {
    bodyPartToggles.querySelectorAll('.part-toggle').forEach(toggle => {
      toggle.addEventListener('click', () => {
        // Update active state on toggles
        bodyPartToggles.querySelectorAll('.part-toggle').forEach(t => t.classList.remove('active'));
        toggle.classList.add('active');

        // Update selected part
        selectedBodyPart = (toggle as HTMLElement).dataset.part || 'body';

        // Update active swatch to show current color for this part
        updateActiveSwatchForPart(selectedBodyPart);
      });
    });
  }

  // Race course selector
  const raceCourseSettings = shadowRoot.querySelector('#race-course-settings') as HTMLElement;
  const raceCourseSelect = shadowRoot.querySelector('#race-course-select') as HTMLSelectElement;

  // Listen for course updates from game module
  document.addEventListener('oo:coursesupdate', ((e: CustomEvent) => {
    const { myCourse, otherCourses } = e.detail;
    const allCourses = [
      { id: 'mine', name: 'My Course', hasElements: myCourse?.checkpoints?.length > 0 },
      ...otherCourses.map((c: { userId: string; displayName: string; checkpoints: unknown[] }) => ({
        id: c.userId,
        name: c.displayName || 'Unknown',
        hasElements: c.checkpoints?.length > 0
      }))
    ].filter(c => c.hasElements);

    // Only show section if there are courses
    if (raceCourseSettings) {
      raceCourseSettings.style.display = allCourses.length > 0 ? 'block' : 'none';
    }

    // Update select options
    if (raceCourseSelect && allCourses.length > 0) {
      const currentValue = raceCourseSelect.value;
      raceCourseSelect.innerHTML = allCourses.map(c =>
        `<option value="${c.id}">${c.name}</option>`
      ).join('');

      // Restore previous selection if still valid, otherwise default to first
      if (allCourses.some(c => c.id === currentValue)) {
        raceCourseSelect.value = currentValue;
      } else {
        raceCourseSelect.value = allCourses[0].id;
        // Notify game of default selection
        document.dispatchEvent(new CustomEvent('oo:selectcourse', {
          detail: { courseId: allCourses[0].id }
        }));
      }
    }
  }) as EventListener);

  // Handle course selection change
  raceCourseSelect?.addEventListener('change', () => {
    document.dispatchEvent(new CustomEvent('oo:selectcourse', {
      detail: { courseId: raceCourseSelect.value }
    }));
  });

  // Listen for auth state changes
  onAuthStateChanged((user) => {
    currentAuthUser = user;
    updateProfileUI(user);
  });
}

// Visibility state (synced with canvas)
let visibilityState = {
  showAll: true,
  showMine: true,
  showFollowing: false,
  hiddenUsers: new Set<string>(),
};

/**
 * Setup visibility toggle event handlers
 */
function setupVisibilityToggles(root: ShadowRoot): void {
  // Load saved preferences
  loadVisibilityState();

  const toggleAll = root.querySelector('#toggle-all-drawings');
  const toggleMine = root.querySelector('#toggle-my-drawings');
  const toggleFollowing = root.querySelector('#toggle-following-only');

  // Update toggles to match state
  toggleAll?.classList.toggle('active', visibilityState.showAll);
  toggleMine?.classList.toggle('active', visibilityState.showMine);
  toggleFollowing?.classList.toggle('active', visibilityState.showFollowing);

  // Show All toggle (master)
  toggleAll?.addEventListener('click', () => {
    visibilityState.showAll = !visibilityState.showAll;
    toggleAll.classList.toggle('active', visibilityState.showAll);
    document.dispatchEvent(new CustomEvent('oo:visibility:all', {
      detail: { show: visibilityState.showAll }
    }));
  });

  // My Drawings toggle
  toggleMine?.addEventListener('click', () => {
    visibilityState.showMine = !visibilityState.showMine;
    toggleMine.classList.toggle('active', visibilityState.showMine);
    document.dispatchEvent(new CustomEvent('oo:visibility:mine', {
      detail: { show: visibilityState.showMine }
    }));
  });

  // Following Only toggle
  toggleFollowing?.addEventListener('click', () => {
    visibilityState.showFollowing = !visibilityState.showFollowing;
    toggleFollowing.classList.toggle('active', visibilityState.showFollowing);
    document.dispatchEvent(new CustomEvent('oo:visibility:following', {
      detail: { show: visibilityState.showFollowing }
    }));
  });
}

/**
 * Load visibility state from localStorage
 */
function loadVisibilityState(): void {
  try {
    const saved = localStorage.getItem('oo_visibility_prefs');
    if (saved) {
      const prefs = JSON.parse(saved);
      visibilityState = {
        showAll: prefs.showAll ?? true,
        showMine: prefs.showMine ?? true,
        showFollowing: prefs.showFollowing ?? false,
        hiddenUsers: new Set(prefs.hiddenUsers ?? []),
      };
    }
  } catch {
    // Use defaults
  }
}

/**
 * Render the contributors list with per-user toggles and follow buttons
 */
async function renderContributorsList(
  root: ShadowRoot,
  contributors: { userId: string; displayName: string; photoURL: string }[]
): Promise<void> {
  const container = root.querySelector('#contributors-list');
  if (!container) return;

  // Filter out current user (they're shown via "My Drawings" toggle)
  const currentUser = getCurrentUser();
  const otherContributors = contributors.filter(c => c.userId !== currentUser?.uid);

  if (otherContributors.length === 0) {
    container.innerHTML = '<div class="no-contributors">No other contributors yet</div>';
    return;
  }

  // Check following status for each contributor
  const followingStatus = new Map<string, boolean>();
  if (currentUser) {
    await Promise.all(otherContributors.map(async (c) => {
      const following = await isFollowing(currentUser.uid, c.userId);
      followingStatus.set(c.userId, following);
    }));
  }

  container.innerHTML = otherContributors.map(c => {
    const isVisible = !visibilityState.hiddenUsers.has(c.userId);
    const avatarSrc = c.photoURL || '';
    const avatarFallback = c.displayName?.charAt(0).toUpperCase() || '?';
    const isFollowingUser = followingStatus.get(c.userId) || false;

    return `
      <div class="contributor-row" data-user-id="${c.userId}">
        <div class="contributor-info">
          ${avatarSrc
            ? `<img src="${avatarSrc}" class="contributor-avatar" alt="${c.displayName}">`
            : `<div class="contributor-avatar" style="display:flex;align-items:center;justify-content:center;color:#888;font-size:12px;">${avatarFallback}</div>`
          }
          <span class="contributor-name">${escapeHtml(c.displayName)}</span>
        </div>
        <div class="contributor-actions">
          ${currentUser ? `
            <button class="follow-btn ${isFollowingUser ? 'following' : 'follow'}"
                    data-follow-user="${c.userId}"
                    data-user-name="${escapeHtml(c.displayName)}"
                    data-user-photo="${avatarSrc}">
              ${isFollowingUser ? 'Following' : 'Follow'}
            </button>
          ` : ''}
          <div class="toggle-switch small ${isVisible ? 'active' : ''}" data-toggle-user="${c.userId}" title="Show/hide this user's drawings"></div>
        </div>
      </div>
    `;
  }).join('');

  // Add click handlers for per-user visibility toggles
  container.querySelectorAll('[data-toggle-user]').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const userId = toggle.getAttribute('data-toggle-user');
      if (!userId) return;

      const isActive = toggle.classList.toggle('active');
      if (isActive) {
        visibilityState.hiddenUsers.delete(userId);
      } else {
        visibilityState.hiddenUsers.add(userId);
      }

      document.dispatchEvent(new CustomEvent('oo:visibility:user', {
        detail: { userId, show: isActive }
      }));
    });
  });

  // Add click handlers for follow buttons
  container.querySelectorAll('[data-follow-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.getAttribute('data-follow-user');
      const userName = btn.getAttribute('data-user-name') || '';
      const userPhoto = btn.getAttribute('data-user-photo') || '';
      if (!userId || !currentUser) return;

      const button = btn as HTMLButtonElement;
      const wasFollowing = button.classList.contains('following');

      // Optimistic UI update
      button.disabled = true;

      try {
        if (wasFollowing) {
          await unfollowUser(userId);
          button.classList.remove('following');
          button.classList.add('follow');
          button.textContent = 'Follow';
          // Notify canvas to update following cache
          document.dispatchEvent(new CustomEvent('oo:following:changed', {
            detail: { userId, action: 'unfollow' }
          }));
        } else {
          await followUser(userId);
          button.classList.remove('follow');
          button.classList.add('following');
          button.textContent = 'Following';
          // Notify canvas to update following cache
          document.dispatchEvent(new CustomEvent('oo:following:changed', {
            detail: { userId, action: 'follow' }
          }));
        }
      } catch (error) {
        console.error('[OpenOverlay] Follow action failed:', error);
        // Revert on error
        if (wasFollowing) {
          button.classList.add('following');
          button.classList.remove('follow');
          button.textContent = 'Following';
        } else {
          button.classList.add('follow');
          button.classList.remove('following');
          button.textContent = 'Follow';
        }
      } finally {
        button.disabled = false;
      }
    });
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

        // Update bio content
        const bioContent = shadowRoot?.querySelector('#profile-bio-content') as HTMLElement;
        if (bioContent) {
          bioContent.innerHTML = profile.bio
            ? escapeHtml(profile.bio)
            : '<span class="profile-bio-empty">Click to add a bio...</span>';
          bioContent.dataset.bio = profile.bio || '';
        }
      }
    });

    // Setup follower subscription for real-time notifications
    setupFollowerSubscription(user.uid);

    // Setup click handler for followers stat
    setupFollowersStatClick();
  } else {
    // Clean up follower subscription
    if (followerUnsubscribe) {
      followerUnsubscribe();
      followerUnsubscribe = null;
    }
    newFollowerCount = 0;
    isFollowersPanelOpen = false;
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
    // Clear new follower badge when opening profile
    if (newFollowerCount > 0) {
      newFollowerCount = 0;
      updateFollowerBadge();
    }
  }
}

/**
 * Setup real-time follower subscription
 */
function setupFollowerSubscription(uid: string): void {
  // Clean up existing subscription
  if (followerUnsubscribe) {
    followerUnsubscribe();
  }

  const unsub = subscribeToFollowers(uid, (follower) => {
    console.log('[OpenOverlay] New follower:', follower.displayName);
    newFollowerCount++;
    updateFollowerBadge();

    // Update follower count in stats
    const followersCount = shadowRoot?.querySelector('#followers-count') as HTMLElement;
    if (followersCount) {
      const current = parseInt(followersCount.textContent || '0');
      followersCount.textContent = String(current + 1);
    }
  });

  if (unsub) {
    followerUnsubscribe = unsub;
  }
}

/**
 * Update the follower notification badge
 */
function updateFollowerBadge(): void {
  const followersStat = shadowRoot?.querySelector('#followers-stat');
  if (!followersStat) return;

  // Remove existing badge
  const existingBadge = followersStat.querySelector('.notification-badge');
  if (existingBadge) {
    existingBadge.remove();
  }

  // Add badge if there are new followers
  if (newFollowerCount > 0) {
    const badge = document.createElement('div');
    badge.className = 'notification-badge';
    badge.textContent = newFollowerCount > 9 ? '9+' : String(newFollowerCount);
    followersStat.appendChild(badge);
  }
}

/**
 * Setup click handler for followers stat
 */
function setupFollowersStatClick(): void {
  const followersStat = shadowRoot?.querySelector('#followers-stat');
  const followersPanel = shadowRoot?.querySelector('#followers-panel');

  if (!followersStat || !followersPanel) return;

  // Remove existing listener to prevent duplicates
  const newFollowersStat = followersStat.cloneNode(true);
  followersStat.parentNode?.replaceChild(newFollowersStat, followersStat);

  newFollowersStat.addEventListener('click', async () => {
    isFollowersPanelOpen = !isFollowersPanelOpen;
    followersPanel.classList.toggle('show', isFollowersPanelOpen);

    if (isFollowersPanelOpen) {
      // Clear badge
      newFollowerCount = 0;
      updateFollowerBadge();

      // Load followers
      await loadFollowersList();
    }
  });
}

/**
 * Load and display followers list
 */
async function loadFollowersList(): Promise<void> {
  const followersList = shadowRoot?.querySelector('#followers-list');
  if (!followersList || !currentAuthUser) return;

  followersList.innerHTML = '<div class="no-followers">Loading...</div>';

  try {
    const followers = await getFollowers(currentAuthUser.uid, 20);

    if (followers.length === 0) {
      followersList.innerHTML = '<div class="no-followers">No followers yet. Share your drawings to get followers!</div>';
      return;
    }

    followersList.innerHTML = followers.map(f => `
      <div class="follower-item">
        <img class="follower-avatar" src="${f.photoURL || ''}" alt="${escapeHtml(f.displayName)}" onerror="this.style.display='none'">
        <div class="follower-info">
          <div class="follower-name">${escapeHtml(f.displayName)}</div>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('[OpenOverlay] Failed to load followers:', error);
    followersList.innerHTML = '<div class="no-followers">Failed to load followers</div>';
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
  const wasOpen = isMenuOpen;
  isMenuOpen = !isMenuOpen;

  const fab = shadowRoot?.querySelector('.fab');
  const minis = shadowRoot?.querySelectorAll('.mini');

  fab?.classList.toggle('open', isMenuOpen);
  minis?.forEach(mini => mini.classList.toggle('show', isMenuOpen));

  // Dispatch event when menu closes (for onboarding completion)
  if (wasOpen && !isMenuOpen) {
    window.dispatchEvent(new CustomEvent('oo:menuClosed'));
  }
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

  // Reset eraser and layer when entering mode
  if (mode !== 'none') {
    isEraser = false;
    shadowRoot?.querySelector('#oo-eraser')?.classList.remove('active');

    // Reset layer to normal when entering draw or text mode
    drawLayer = 'normal';
    // Clear all layer button active states
    shadowRoot?.querySelector('#oo-layer-bg')?.classList.remove('active');
    shadowRoot?.querySelector('#oo-layer-fg')?.classList.remove('active');
    shadowRoot?.querySelector('#oo-text-layer-bg')?.classList.remove('active');
    shadowRoot?.querySelector('#oo-text-layer-fg')?.classList.remove('active');
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
    // Prevent click-outside handler from closing toolbar immediately
    toolbarJustOpened = true;

    // Always start in build mode when opening game toolbar
    gameSubMode = 'build';

    // Reset the game mode toggle buttons (none active in build mode)
    const gameModeButtons = shadowRoot?.querySelectorAll('.game-mode-btn');
    gameModeButtons?.forEach(btn => btn.classList.remove('active'));

    // Show build tools (build mode is default)
    const buildTools = shadowRoot?.querySelector('.build-tools-section') as HTMLElement;
    if (buildTools) buildTools.style.display = 'flex';

    // Dispatch build mode (doesn't drop character)
    document.dispatchEvent(new CustomEvent('oo:gamemode', {
      detail: { mode: 'build' }
    }));
  } else if (prevMode === 'game') {
    // Exiting game mode - keep character visible, just stop game loop
    // Don't dispatch 'none' mode - character stays
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

/**
 * Open the FAB menu (for onboarding)
 */
export function openMenu(): void {
  if (!isMenuOpen) {
    toggleMenu();
  }
}

/**
 * Set mode externally (for onboarding)
 */
export function setModeExternal(mode: 'none' | 'draw' | 'text' | 'game'): void {
  setMode(mode);
}

/**
 * Get quick explore button position (for onboarding)
 */
export function getQuickExplorePosition(): { x: number; y: number } | null {
  if (!shadowRoot) return null;
  const quickExplore = shadowRoot.querySelector('.quick-explore') as HTMLElement;
  if (!quickExplore) return null;
  const rect = quickExplore.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get profile button position (for onboarding)
 */
export function getProfileButtonPosition(): { x: number; y: number } | null {
  if (!shadowRoot) return null;
  const profileBtn = shadowRoot.querySelector('#oo-profile-btn') as HTMLElement;
  if (!profileBtn) return null;
  const rect = profileBtn.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Highlight profile button (for onboarding)
 */
export function highlightProfileButton(highlight: boolean): void {
  if (!shadowRoot) return;
  const profileBtn = shadowRoot.querySelector('#oo-profile-btn') as HTMLElement;
  if (profileBtn) {
    if (highlight) {
      profileBtn.style.background = '#22c55e';
      profileBtn.style.boxShadow = '0 0 20px #22c55e, 0 0 40px #22c55e';
      profileBtn.style.transform = 'scale(1.1)';
    } else {
      profileBtn.style.background = '';
      profileBtn.style.boxShadow = '';
      profileBtn.style.transform = '';
    }
  }
}

// ============ INVITE CODE MODAL ============

import { InviteCodeModal } from './components/InviteCodeModal';

let inviteCodeModal: InviteCodeModal | null = null;

/**
 * Show the invite code modal
 */
export function showInviteCodeModal(onSuccess?: () => void): void {
  if (!shadowRoot) {
    console.error('[OpenOverlay] Cannot show invite modal: shadowRoot not initialized');
    return;
  }

  // Create modal if it doesn't exist
  if (!inviteCodeModal) {
    inviteCodeModal = document.createElement('oo-invite-code-modal') as InviteCodeModal;
    shadowRoot.appendChild(inviteCodeModal);
  }

  inviteCodeModal.show(onSuccess);
}

/**
 * Hide the invite code modal
 */
export function hideInviteCodeModal(): void {
  if (inviteCodeModal) {
    inviteCodeModal.hide();
  }
}

/**
 * Skip invite code (for testing)
 */
export async function skipInviteCodeModal(): Promise<void> {
  if (inviteCodeModal) {
    await inviteCodeModal.skip();
  }
}
