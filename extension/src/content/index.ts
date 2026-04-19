/**
 * OpenOverlay v2 - Content Script Entry Point
 *
 * This is the main entry point for the content script.
 * It initializes all modules and sets up the overlay.
 */

import { store, initPageUrl, getPageUrlHash } from '@/shared/state';
import { api, ApiClientError } from '@/shared/api';
import { initUI } from '@/ui';
import { initCanvas } from '@/canvas';
import { initGame } from '@/game';

// Prevent double injection
if ((window as any).__OPENOVERLAY_V2__) {
  throw new Error('OpenOverlay already injected');
}
(window as any).__OPENOVERLAY_V2__ = true;

/**
 * Main initialization function.
 */
async function init(): Promise<void> {
  console.log('[OpenOverlay] v2.0.0 initializing...');

  // Skip certain pages
  if (shouldSkipPage()) {
    console.log('[OpenOverlay] Skipping page');
    return;
  }

  // Initialize page URL in state
  initPageUrl();

  // Try to restore auth from storage
  await restoreAuth();

  // Initialize UI components
  initUI();

  // Initialize canvas system
  initCanvas();

  // Initialize game system
  initGame();

  // Load page content
  await loadPageContent();

  // Start observing DOM changes for re-anchoring annotations
  startObserver();

  // Listen for visibility changes
  document.addEventListener('visibilitychange', onVisibilityChange);

  console.log('[OpenOverlay] Ready');
}

/**
 * Check if we should skip injecting on this page.
 */
function shouldSkipPage(): boolean {
  const url = window.location.href;

  // Skip Chrome internal pages
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
    return true;
  }

  // Skip about pages
  if (url.startsWith('about:')) {
    return true;
  }

  // Skip empty pages
  if (url === 'about:blank' || url === 'about:srcdoc') {
    return true;
  }

  // Skip if we're in an iframe (optional - can be toggled)
  if (window.top !== window.self) {
    return true;
  }

  return false;
}

/**
 * Restore authentication state from chrome.storage.
 */
async function restoreAuth(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['oo_token', 'oo_user']);

    if (result.oo_token && result.oo_user) {
      store.setState({
        token: result.oo_token,
        user: result.oo_user,
        isAuthenticated: true,
      });

      // Verify token is still valid
      try {
        const user = await api.getMe();
        store.setState({ user });
      } catch (err) {
        // Token expired, clear auth
        if (err instanceof ApiClientError && err.status === 401) {
          await clearAuth();
        }
      }
    }
  } catch (err) {
    console.warn('[OpenOverlay] Failed to restore auth:', err);
  }
}

/**
 * Clear authentication state.
 */
async function clearAuth(): Promise<void> {
  store.setState({
    token: null,
    user: null,
    isAuthenticated: false,
  });

  try {
    await chrome.storage.local.remove(['oo_token', 'oo_user']);
  } catch (err) {
    console.warn('[OpenOverlay] Failed to clear auth storage:', err);
  }
}

/**
 * Load content for the current page.
 */
async function loadPageContent(): Promise<void> {
  const { isAuthenticated, pageUrlHash } = store.getState();

  store.setState({ isLoading: true });

  try {
    const content = await api.getPageContent(pageUrlHash);

    // Filter content based on user preferences
    const { filters, user } = store.getState();
    const filteredDrawings = filterContent(content.drawings, filters, user?.id);
    const filteredAnnotations = filterContent(content.annotations, filters, user?.id);
    const filteredCourses = filterContent(content.courses, filters, user?.id);

    store.setState({
      drawings: filteredDrawings,
      annotations: filteredAnnotations,
      courses: filteredCourses,
      isLoading: false,
    });
  } catch (err) {
    console.warn('[OpenOverlay] Failed to load page content:', err);
    store.setState({ isLoading: false });
  }
}

/**
 * Filter content based on user preferences.
 */
function filterContent<T extends { userId: string }>(
  items: T[],
  filters: typeof store extends { getState(): { filters: infer F } } ? F : never,
  currentUserId?: string
): T[] {
  return items.filter((item) => {
    // Always show own content
    if (currentUserId && item.userId === currentUserId) {
      return true;
    }

    // Check if user is hidden
    if (filters.hiddenUserIds.has(item.userId)) {
      return false;
    }

    // Check if filtering to specific users
    if (filters.visibleUserIds.size > 0) {
      return filters.visibleUserIds.has(item.userId);
    }

    return true;
  });
}

/**
 * Start observing DOM changes for annotation re-anchoring.
 */
function startObserver(): void {
  const observer = new MutationObserver((mutations) => {
    // Debounce re-anchoring
    clearTimeout((window as any).__oo_reanchor);
    (window as any).__oo_reanchor = setTimeout(() => {
      // Re-anchor annotations after DOM changes
      // This will be implemented in the annotations module
      document.dispatchEvent(new CustomEvent('oo:reanchor'));
    }, 300);
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * Handle visibility changes (tab switching).
 */
function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    // Refresh content when tab becomes visible
    loadPageContent();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init());
} else {
  init();
}

// Export for debugging
(window as any).__OO_STORE__ = store;
(window as any).__OO_API__ = api;
