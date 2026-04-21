/**
 * Application state definition.
 * Single source of truth for the extension.
 */

import { Store } from './store';
import type {
  User,
  Drawing,
  Annotation,
  Course,
  DrawingItem,
  BrushStyle,
  TextStyle,
} from './types';

// UI mode the overlay is in
export type OverlayMode = 'none' | 'draw' | 'text' | 'annotate' | 'game';

// Brush configuration
export interface BrushConfig {
  color: string;
  width: number;
  style: BrushStyle;
  opacity: number;
}

// Text configuration
export interface TextConfig {
  color: string;
  size: number;
  style: TextStyle;
  opacity: number;
}

// Content visibility filters
export interface ContentFilters {
  showDrawings: boolean;
  showAnnotations: boolean;
  showCourses: boolean;
  visibleUserIds: Set<string>; // empty = show all
  hiddenUserIds: Set<string>;
}

// Game state
export interface GameState {
  active: boolean;
  character: string;
  courseId: string | null;
  startTime: number;
  elapsed: number;
}

// Complete application state
export interface AppState {
  // Authentication
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // UI state
  mode: OverlayMode;
  panelOpen: boolean;
  toolbarPosition: { x: number; y: number };
  fabPosition: { x: number; y: number };

  // Drawing state
  brush: BrushConfig;
  text: TextConfig;
  currentItems: DrawingItem[]; // items being drawn (not yet saved)
  isDrawing: boolean;

  // Content filters
  filters: ContentFilters;

  // Page content (from API)
  pageUrl: string;
  pageUrlHash: string;
  drawings: Drawing[];
  annotations: Annotation[];
  courses: Course[];
  isLoading: boolean;

  // Game state
  game: GameState;

  // Connection status
  isOnline: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
}

// Default state
const defaultState: AppState = {
  // Auth
  user: null,
  token: null,
  isAuthenticated: false,

  // UI
  mode: 'none',
  panelOpen: false,
  toolbarPosition: { x: -1, y: -1 }, // -1 = default position
  fabPosition: { x: -1, y: -1 },

  // Drawing
  brush: {
    color: '#ff3366',
    width: 3,
    style: 'solid',
    opacity: 1,
  },
  text: {
    color: '#ff3366',
    size: 32,
    style: 'normal',
    opacity: 1,
  },
  currentItems: [],
  isDrawing: false,

  // Filters
  filters: {
    showDrawings: true,
    showAnnotations: true,
    showCourses: true,
    visibleUserIds: new Set(),
    hiddenUserIds: new Set(),
  },

  // Page content
  pageUrl: '',
  pageUrlHash: '',
  drawings: [],
  annotations: [],
  courses: [],
  isLoading: false,

  // Game
  game: {
    active: false,
    character: 'stick_guy',
    courseId: null,
    startTime: 0,
    elapsed: 0,
  },

  // Connection
  isOnline: true,
  syncStatus: 'idle',
};

// Create the global store
export const store = new Store<AppState>(defaultState);

// Helper to get current page URL hash
export function getPageUrlHash(): string {
  const url = new URL(window.location.href);
  const key = url.origin + url.pathname + url.search;
  return hashString(key);
}

// Simple hash function
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Initialize page URL in state
export function initPageUrl(): void {
  const url = window.location.href.split('#')[0];
  store.setState({
    pageUrl: url,
    pageUrlHash: getPageUrlHash(),
  });
}
