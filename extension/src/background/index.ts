/**
 * Background Service Worker
 *
 * Handles:
 * - Google OAuth flow
 * - Cross-tab communication
 * - WebSocket connection for real-time sync
 * - Storage management
 */

const API_URL = 'http://localhost:3000/api'; // TODO: Use environment variable

// WebSocket connection state
let ws: WebSocket | null = null;
let wsReconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];

/**
 * Initialize the service worker.
 */
function init(): void {
  console.log('[OpenOverlay BG] Service worker started');

  // Listen for messages from content scripts
  chrome.runtime.onMessage.addListener(handleMessage);

  // Connect to WebSocket for real-time sync
  // connectWebSocket();
}

/**
 * Handle messages from content scripts.
 */
function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: any) => void
): boolean {
  switch (message.type) {
    case 'GOOGLE_SIGN_IN':
      handleGoogleSignIn(sendResponse);
      return true; // Will respond asynchronously

    case 'GOOGLE_SIGN_OUT':
      handleGoogleSignOut(sendResponse);
      return true;

    case 'GET_USER':
      handleGetUser(sendResponse);
      return true;

    case 'SYNC_CONTENT':
      handleSyncContent(message.data, sender.tab?.id);
      sendResponse({ success: true });
      return false;

    default:
      return false;
  }
}

/**
 * Handle Google Sign-In request.
 * Returns the OAuth token for Firebase authentication.
 */
async function handleGoogleSignIn(
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    // Get OAuth token from Chrome Identity API
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (token) {
          resolve(token);
        } else {
          reject(new Error('No token returned'));
        }
      });
    });

    console.log('[OpenOverlay BG] Got OAuth token');
    sendResponse({ success: true, token });
  } catch (error: any) {
    console.error('[OpenOverlay BG] Sign-in error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle Google Sign-Out request.
 */
async function handleGoogleSignOut(
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    // Get current token to revoke
    const token = await new Promise<string | undefined>((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, resolve);
    });

    if (token) {
      // Remove cached auth token
      await new Promise<void>((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      });

      // Revoke on Google's servers
      await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`)
        .catch(() => {}); // Ignore errors
    }

    // Clear local storage
    await chrome.storage.local.remove(['oo_user', 'oo_token']);

    sendResponse({ success: true });
  } catch (error: any) {
    console.error('[OpenOverlay BG] Sign-out error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * Handle get user request.
 */
async function handleGetUser(
  sendResponse: (response: any) => void
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['oo_user', 'oo_token']);
    sendResponse({
      user: result.oo_user || null,
      token: result.oo_token || null,
    });
  } catch (error: any) {
    console.error('[OpenOverlay BG] Get user error:', error);
    sendResponse({ user: null, token: null });
  }
}

/**
 * Handle content sync from a tab.
 */
function handleSyncContent(data: any, tabId?: number): void {
  // Broadcast to other tabs via WebSocket
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SYNC',
      data,
      sourceTabId: tabId,
    }));
  }
}

/**
 * Connect to WebSocket server for real-time sync.
 */
function connectWebSocket(): void {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[OpenOverlay BG] Max reconnection attempts reached');
    return;
  }

  const WS_URL = 'ws://localhost:8080'; // TODO: Use environment variable

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[OpenOverlay BG] WebSocket connected');
      wsReconnectAttempts = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
      } catch (e) {
        // Ignore non-JSON messages
      }
    };

    ws.onerror = () => {
      console.warn('[OpenOverlay BG] WebSocket error');
    };

    ws.onclose = (event) => {
      ws = null;

      if (!event.wasClean) {
        scheduleReconnect();
      }
    };
  } catch (e) {
    console.warn('[OpenOverlay BG] Failed to create WebSocket');
    scheduleReconnect();
  }
}

/**
 * Schedule WebSocket reconnection with exponential backoff.
 */
function scheduleReconnect(): void {
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

  const delay = RECONNECT_DELAYS[
    Math.min(wsReconnectAttempts, RECONNECT_DELAYS.length - 1)
  ];

  wsReconnectAttempts++;
  console.log(`[OpenOverlay BG] Reconnecting in ${delay / 1000}s...`);

  setTimeout(connectWebSocket, delay);
}

/**
 * Handle incoming WebSocket messages.
 */
function handleWebSocketMessage(data: any): void {
  if (data.type === 'SYNC') {
    // Forward to all tabs except source
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id && tab.id !== data.sourceTabId) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'REMOTE_SYNC',
            data: data.data,
          }).catch(() => {}); // Ignore errors for tabs without content script
        }
      });
    });
  }
}

// Initialize
init();
