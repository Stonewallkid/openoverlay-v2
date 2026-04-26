/**
 * Game Module
 * Platformer game with stick figure character and course building
 */

import { checkPixelCollision } from '@/canvas';
import {
  updatePlayerPosition,
  subscribeToPlayers,
  removePlayer,
  unsubscribeFromPlayers,
  subscribeToTagGame,
  unsubscribeFromTagGame,
  startTagGame,
  tagPlayer,
  endTagGame,
  saveCourseToCloud,
  subscribeToCourses,
  unsubscribeFromCourses,
  isLoggedIn,
  isFirestoreAvailable,
  type RemotePlayer,
  type TagGameState,
  type CourseData,
} from '@/db';
import { getCurrentUser } from '@/auth';

// Game state
let gameCanvas: HTMLCanvasElement | null = null;
let gameCtx: CanvasRenderingContext2D | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;
let overlayCtx: CanvasRenderingContext2D | null = null;
let gameMode: 'none' | 'play' | 'build' = 'none';
let buildTool: 'select' | 'start' | 'finish' | 'checkpoint' | 'spawn' | 'trampoline' | 'speedBoost' | 'highJump' | 'spike' = 'spawn';

// Player
interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  onGround: boolean;
  facingRight: boolean;
  animFrame: number;
  sprite: string;
  jumpsRemaining: number;
  maxJumps: number;
}

let player: Player = {
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  width: 23,   // 75% of original 30
  height: 41,  // Adjusted to match actual character height (head + body + legs)
  onGround: false,
  facingRight: true,
  animFrame: 0,
  sprite: 'stick',
  jumpsRemaining: 2,
  maxJumps: 2,
};

// Track landing for slide effect
let wasOnGround = false;
let landingSlideFrames = 0;

// Idle wave animation
let lastMoveTime = 0;
let isWaving = false;
let waveFrame = 0;
let waveStartTime = 0;
const IDLE_WAVE_DELAY = 120000; // Start waving after 2 minutes of no movement
const WAVE_DURATION = 2000; // Wave for 2 seconds

// Ambient behavior system - Smudgy stays alive!
let ambientMode = false; // When true, Smudgy does idle behaviors even when game is 'none'
let isNapping = false;
let napStartTime = 0;
let lastDrawTime = 0; // Track when user last drew something
let cursorX = 0;
let cursorY = 0;
let isChasingCursor = false;
let chaseStartTime = 0;
const NAP_DELAY = 180000; // Start napping after 3 minutes of no drawing
const NAP_DURATION = 10000; // Nap for 10 seconds
const CHASE_DURATION = 3000; // Chase cursor for 3 seconds
const CHASE_CHANCE = 0.001; // Chance per frame to start chasing (rare)

// Player colors for different body parts
let playerColor = localStorage.getItem('oo_player_color') || '#ffffff'; // Legacy/body color
let headColor = localStorage.getItem('oo_color_head') || localStorage.getItem('oo_player_color') || '#ffffff';
let bodyColor = localStorage.getItem('oo_color_body') || localStorage.getItem('oo_player_color') || '#ffffff';
let faceColor = localStorage.getItem('oo_color_face') || '#ff69b4'; // Pink default for smudgy
let hairColor = localStorage.getItem('oo_color_hair') || localStorage.getItem('oo_player_color') || '#ffffff';
let dressColor = localStorage.getItem('oo_color_dress') || localStorage.getItem('oo_player_color') || '#ffffff';
let playerHat = localStorage.getItem('oo_player_hat') || 'none';
let playerAccessory = localStorage.getItem('oo_player_accessory') || 'none';

// Respawn setting for explore mode (default true)
let shouldRespawnInExplore = localStorage.getItem('oo_explore_respawn') !== 'false';

// Custom screen name (overrides Firebase displayName if set)
let customScreenName = localStorage.getItem('oo_screen_name') || '';

// Available customization options
const HATS = ['none', 'cap', 'tophat', 'crown', 'beanie', 'party'];
const ACCESSORIES = ['none', 'glasses', 'sunglasses', 'mustache', 'beard', 'mask'];

// Helper to darken a hex color by a percentage (0-1)
function darkenColor(hex: string, amount: number): string {
  // Handle shorthand hex
  const fullHex = hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  if (!result) return hex;

  const r = Math.max(0, Math.round(parseInt(result[1], 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(result[2], 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(result[3], 16) * (1 - amount)));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// Girl mode (longer hair + dress)
let isGirlMode = localStorage.getItem('oo_player_girl') === 'true';

// Face style ('smudgy' = pink circle eye, 'normal' = classic stick figure face)
let faceStyle = localStorage.getItem('oo_player_face') || 'smudgy';

// Smooth eye direction for Smudgy face (-1 = left, 0 = center, 1 = right)
let eyeLookDirection = 0;
const EYE_TURN_SPEED = 0.02; // How fast the eye turns to center when stopped
const FACE_STYLES = ['smudgy', 'normal'];

// Body reset delay - wait for face to turn before arms reset
let stoppingTimer = 0; // Counts up when stopped, body resets after threshold
const BODY_RESET_DELAY = 15; // Frames to wait before body resets (about 0.25 sec)

// Eye glance behavior - periodic look back during explore/tag
let lastGlanceX = 0; // X position at last glance
let nextGlanceDistance = 35; // First glance after 8-10 steps (~35px)
let isGlancing = false;
let glanceTimer = 0;
const GLANCE_DURATION = 60; // Frames to hold glance (longer look back, gauging situation)
const GLANCE_MIN_EXPLORE = 400; // Min pixels between glances in explore (long wait)
const GLANCE_MAX_EXPLORE = 600; // Max pixels between glances in explore
const GLANCE_MIN_TAG = 40; // Min pixels between glances when being chased
const GLANCE_MAX_TAG = 80; // Max pixels between glances when being chased

// Blood splat effects
interface BloodSplat {
  x: number;
  y: number;
  createdAt: number;
}
let bloodSplats: BloodSplat[] = [];

// Multiplayer state
let otherPlayers: Map<string, RemotePlayer> = new Map(); // Target positions from sync
// Extrapolated display state: tracks position, velocity, and when we last received sync
let displayPlayers: Map<string, {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastSyncTime: number;
  targetX: number;
  targetY: number;
}> = new Map();
let lastSyncTime = 0;
let lastSyncX = 0;
let lastSyncY = 0;
const SYNC_INTERVAL = 80; // Sync every 80ms (~12 updates/sec) for minimal delay

// Tag game state
let isTagMode = false;
let tagGameState: TagGameState | null = null;
let localTagCooldownUntil = 0;
let localIsIt = false; // Local fallback for when Firebase sync fails
let lastTaggedByPlayerId: string | null = null; // Track who tagged us to prevent tiebreaker issues
let pendingTaggedPlayerId: string | null = null; // Player we just tagged (explicit notification)
let pendingTaggedAt: number = 0; // When we tagged them
const TAG_COOLDOWN = 3000; // 3 seconds cooldown - needs to be longer than sync latency
const TAG_NOTIFICATION_DURATION = 5000; // How long to keep taggedPlayerId in sync
const NTB_FLASH_DURATION = 3000; // "No Tag Backs" flash duration
let ntbFlashEndTime = 0; // When the NTB flash should end
const MODE_INFO_DURATION = 4000; // How long to show mode info box
let modeInfoEndTime = 0; // When the mode info should hide

function showModeInfo(): void {
  modeInfoEndTime = performance.now() + MODE_INFO_DURATION;
}
const PLAYER_STALE_TIMEOUT = 5000; // Remove players who haven't updated in 5 seconds

// Helper to check if current player is "it" (uses Firebase state or local fallback)
function isCurrentUserIt(): boolean {
  const currentUser = getCurrentUser();
  if (!currentUser) return false;

  // Prefer Firebase state if available
  if (tagGameState?.gameActive) {
    return tagGameState.itPlayerId === currentUser.uid;
  }

  // Fallback to local state
  return localIsIt;
}

// Course elements
interface Checkpoint {
  id: string;
  type: 'start' | 'finish' | 'checkpoint' | 'spawn' | 'trampoline' | 'speedBoost' | 'highJump' | 'spike';
  x: number;
  y: number;
  order: number;
  reached: boolean;
  width?: number;   // For rectangular elements (default 60)
  height?: number;  // For rectangular elements (default 20)
}

interface Course {
  id: string;
  name: string;
  checkpoints: Checkpoint[];
  authorId: string;
  authorName: string;
  createdAt: number;
  bestTime?: number;
}

let currentCourse: Course = {
  id: generateId(),
  name: 'New Course',
  checkpoints: [],
  authorId: 'local-user',
  authorName: 'You',
  createdAt: Date.now(),
};

// Other users' courses (synced from Firebase)
let otherUsersCourses: Course[] = [];

// Game physics
const GRAVITY = 0.6;
const JUMP_FORCE = -12;  // Reduced slightly for smaller player
const MOVE_SPEED = 4;    // 30% faster than previous 3
const FRICTION = 0.7;    // Quick stop when not pressing keys
const MAX_FALL_SPEED = 14; // Cap fall speed to prevent tunneling through platforms
const COLLISION_SUBSTEP_SIZE = 6; // Max pixels per collision check step (smaller = more precise)

// Input state
const keys: { [key: string]: boolean } = {};

// Clear all keyboard state (prevent stuck keys)
function clearKeys(): void {
  for (const key in keys) {
    keys[key] = false;
  }
}

// Animation
let animationId: number | null = null;
let lastTime = 0;

// Race state
let raceStarted = false;
let raceStartTime = 0;
let raceTime = 0;
let checkpointCount = 0;

// Lives and death
let lives = 3;
let maxLives = 3;
let isDead = false;
let deathTime = 0;
const RESPAWN_DELAY = 1500; // 1.5 seconds total
const DEATH_Y_THRESHOLD = 2000; // Fall this far below viewport to die

// Power-up state
let speedBoostEndTime = 0;    // Timestamp when speed boost ends
let hasHighJumpBoost = false; // Consumed on next jump

// Game modes: 'explore' = no timer/lives, 'race' = timer + limited lives
let playMode: 'explore' | 'race' = 'explore';

// Countdown and notifications
let isCountingDown = false;
let countdownStartTime = 0;
const COUNTDOWN_DURATION = 2000; // 2 seconds
let notification: { text: string; subtext?: string; endTime: number } | null = null;

// Centered popup (for onboarding controls hint)
let centeredPopup: { text: string; endTime: number; startTime: number } | null = null;

// Player frozen during countdown
let playerFrozen = false;

// Restart button (legacy - replaced by popup)
let restartButton: HTMLButtonElement | null = null;

// Game popup
let gamePopup: HTMLDivElement | null = null;
let popupType: 'none' | 'gameover' | 'finish' = 'none';

// Scoreboard
interface ScoreEntry {
  name: string;
  time: number;
  timestamp: number;
}

let showingFinishModal = false;
let finishTime = 0;
let playerName = localStorage.getItem('oo_player_name') || '';
let showLeaderboard = false;

/**
 * Initialize the game
 */
export function initGame(): void {
  console.log('[OpenOverlay] initGame starting...');

  // Create game canvas
  gameCanvas = document.createElement('canvas');
  gameCanvas.id = 'oo-game-canvas';
  gameCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483638;
    pointer-events: none;
  `;

  document.body.appendChild(gameCanvas);
  gameCtx = gameCanvas.getContext('2d');

  // Create overlay canvas for notifications (above foreground drawings)
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'oo-overlay-canvas';
  overlayCanvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2147483646;
    pointer-events: none;
  `;
  document.body.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');

  resizeGameCanvas();
  window.addEventListener('resize', resizeGameCanvas);

  // Resize observer for body changes
  const resizeObserver = new ResizeObserver(resizeGameCanvas);
  resizeObserver.observe(document.body);

  // Input handlers
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);

  // Listen for game mode changes
  document.addEventListener('oo:gamemode', ((e: CustomEvent) => {
    setGameMode(e.detail.mode, e.detail.tool, e.detail.playmode, e.detail.spawnPos, e.detail.fromOnboarding);
  }) as EventListener);

  // Listen for undo/clear in build mode
  document.addEventListener('oo:undo', () => {
    if (gameMode === 'build' && currentCourse.checkpoints.length > 0) {
      currentCourse.checkpoints.pop();
      saveCourse();
      render();
    }
  });

  document.addEventListener('oo:clear', () => {
    if (gameMode === 'build') {
      currentCourse.checkpoints = [];
      saveCourse();
      render();
    }
  });

  // Listen for player color changes (legacy - sets all parts)
  document.addEventListener('oo:playercolor', ((e: CustomEvent) => {
    playerColor = e.detail.color;
    localStorage.setItem('oo_player_color', playerColor);
    render();
  }) as EventListener);

  // Listen for body part color changes
  document.addEventListener('oo:partcolor', ((e: CustomEvent) => {
    const { part, color } = e.detail;
    switch (part) {
      case 'head':
        headColor = color;
        localStorage.setItem('oo_color_head', color);
        break;
      case 'body':
        bodyColor = color;
        localStorage.setItem('oo_color_body', color);
        break;
      case 'face':
        faceColor = color;
        localStorage.setItem('oo_color_face', color);
        break;
      case 'hair':
        hairColor = color;
        localStorage.setItem('oo_color_hair', color);
        break;
      case 'dress':
        dressColor = color;
        localStorage.setItem('oo_color_dress', color);
        break;
    }
    render();
  }) as EventListener);

  // Listen for player style changes (girl mode)
  document.addEventListener('oo:playerstyle', ((e: CustomEvent) => {
    isGirlMode = e.detail.isGirl;
    render();
  }) as EventListener);

  // Listen for hat changes
  document.addEventListener('oo:playerhat', ((e: CustomEvent) => {
    playerHat = e.detail.hat;
    localStorage.setItem('oo_player_hat', playerHat);
    render();
  }) as EventListener);

  // Listen for accessory changes
  document.addEventListener('oo:playeraccessory', ((e: CustomEvent) => {
    playerAccessory = e.detail.accessory;
    localStorage.setItem('oo_player_accessory', playerAccessory);
    render();
  }) as EventListener);

  // Listen for face style changes
  document.addEventListener('oo:playerface', ((e: CustomEvent) => {
    faceStyle = e.detail.face;
    localStorage.setItem('oo_player_face', faceStyle);
    render();
  }) as EventListener);

  // Listen for screen name changes
  document.addEventListener('oo:screenname', ((e: CustomEvent) => {
    customScreenName = e.detail.name;
    localStorage.setItem('oo_screen_name', customScreenName);
    // Force a sync to update other players
    syncPlayerToCloud();
  }) as EventListener);

  // Listen for respawn setting changes
  document.addEventListener('oo:respawnsetting', ((e: CustomEvent) => {
    shouldRespawnInExplore = e.detail.respawn;
  }) as EventListener);

  // Listen for tag game toggle
  document.addEventListener('oo:toggletag', () => {
    console.log('[OpenOverlay] Tag toggle requested, gameMode:', gameMode);
    if (gameMode !== 'play') {
      // Auto-switch to play mode (explore) when starting tag
      console.log('[OpenOverlay] Auto-switching to play mode for tag');
      setGameMode('play', 'explore');
    }
    toggleTagMode();
  });

  // Mouse events for building
  gameCanvas.addEventListener('pointerdown', onPointerDown);
  gameCanvas.addEventListener('pointermove', onPointerMove);
  gameCanvas.addEventListener('pointerup', onPointerUp);
  gameCanvas.addEventListener('contextmenu', (e) => {
    if (gameMode === 'build') e.preventDefault();
  });

  // Load saved course
  loadCourse();
  render();

  // Clean up multiplayer on page unload (use multiple events for reliability)
  const cleanupMultiplayer = () => {
    if (gameMode === 'play') {
      unsubscribeFromPlayers();
      removePlayer(getPageKey());
    }
  };

  window.addEventListener('beforeunload', cleanupMultiplayer);
  window.addEventListener('pagehide', cleanupMultiplayer);

  // Also clean up when tab becomes hidden (user switches tabs)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameMode === 'play') {
      // Don't fully remove, just sync final position
      syncPlayerToCloud();
    }
  });

  // Track drawing activity for ambient behavior
  document.addEventListener('oo:save', () => {
    lastDrawTime = performance.now();
  });

  // Track cursor position for cursor chasing
  document.addEventListener('mousemove', (e) => {
    cursorX = e.pageX;
    cursorY = e.pageY;
  });

  // Listen for dismiss Smudgy request
  document.addEventListener('oo:dismisssmudgy', () => {
    if (ambientMode) {
      // Stop ambient behavior and hide player
      ambientMode = false;
      isNapping = false;
      isChasingCursor = false;
      gameMode = 'none';
      document.dispatchEvent(new CustomEvent('oo:ambientend'));
    }
  });

  // Initialize lastDrawTime
  lastDrawTime = performance.now();

  console.log('[OpenOverlay] Game initialized');
}

function resizeGameCanvas(): void {
  if (!gameCanvas || !gameCtx) return;

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

  gameCanvas.style.width = `${docWidth}px`;
  gameCanvas.style.height = `${docHeight}px`;
  gameCanvas.width = docWidth * dpr;
  gameCanvas.height = docHeight * dpr;
  gameCtx.scale(dpr, dpr);

  // Also resize overlay canvas
  if (overlayCanvas && overlayCtx) {
    overlayCanvas.style.width = `${docWidth}px`;
    overlayCanvas.style.height = `${docHeight}px`;
    overlayCanvas.width = docWidth * dpr;
    overlayCanvas.height = docHeight * dpr;
    overlayCtx.scale(dpr, dpr);
  }

  render();
}

// Track initial spawn position from onboarding (temporary)
let initialSpawnPosition: { x: number; y: number } | null = null;
let isFromOnboarding = false;

function setGameMode(mode: 'none' | 'play' | 'build', tool?: string, newPlayMode?: 'explore' | 'race', spawnPos?: { x: number; y: number }, fromOnboarding?: boolean): void {
  gameMode = mode;
  if (tool) buildTool = tool as any;
  if (newPlayMode) playMode = newPlayMode;
  if (spawnPos) initialSpawnPosition = spawnPos;
  isFromOnboarding = fromOnboarding || false;

  // Flash mode info when entering play mode
  if (mode === 'play') {
    showModeInfo();
  }

  if (gameCanvas) {
    gameCanvas.style.pointerEvents = mode === 'build' ? 'auto' : 'none';
    gameCanvas.style.cursor = mode === 'build' ? 'crosshair' : 'default';
  }

  if (mode === 'play') {
    // Reset race state
    raceStarted = false;
    raceTime = 0;
    checkpointCount = 0;
    currentCourse.checkpoints.forEach(c => c.reached = false);

    // Reset lives for race mode
    lives = maxLives;
    isDead = false;

    // Reset countdown/notification state
    isCountingDown = false;
    playerFrozen = false;
    notification = null;

    // Reset scoreboard state
    showingFinishModal = false;
    showLeaderboard = false;
    removeNameInput();

    // Subscribe to other players for multiplayer
    const pageKey = getPageKey();
    console.log('[OpenOverlay] Subscribing to players on page:', pageKey);
    subscribeToPlayers(pageKey, (players) => {
      otherPlayers = players;
      if (players.size > 0) {
        console.log('[OpenOverlay] Received', players.size, 'other players');
        players.forEach((p, id) => {
          console.log('[OpenOverlay] Player', id, 'at', p.x, p.y);
        });

        // Check if someone else is "it" in tag mode - update our state
        if (isTagMode) {
          const currentUser = getCurrentUser();
          const now = Date.now();
          let itPlayerId: string | null = null;

          // First, check if any player explicitly tagged US via taggedPlayerId
          for (const [id, rp] of players) {
            if (rp.taggedPlayerId === currentUser?.uid && rp.taggedAt && now - rp.taggedAt < TAG_NOTIFICATION_DURATION) {
              // We were explicitly tagged by this player!
              if (!localIsIt && now > localTagCooldownUntil) {
                console.log('[OpenOverlay] EXPLICITLY TAGGED by:', id, 'via taggedPlayerId');
                localIsIt = true;
                lastTaggedByPlayerId = id;
                localTagCooldownUntil = now + TAG_COOLDOWN;
                showNotification("You're IT!", 'Tag someone!', 2000);
                showNTBFlash();
                document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
                  detail: { isTagMode: true, isIt: true, gameActive: true }
                }));
              }
            }
          }

          for (const [id, rp] of players) {
            console.log('[OpenOverlay] Checking player', id, 'isIt:', rp.isIt);
            if (rp.isIt) {
              itPlayerId = id;
              console.log('[OpenOverlay] Found IT player in sync:', rp.displayName, 'id:', id);
              break;
            }
            // Clear lastTaggedByPlayerId if that player now shows isIt: false (sync caught up)
            if (id === lastTaggedByPlayerId && !rp.isIt) {
              console.log('[OpenOverlay] Clearing lastTaggedByPlayerId - sync caught up');
              lastTaggedByPlayerId = null;
            }
          }

          // If someone else is "it" and we think we're "it", use tiebreaker
          // BUT don't apply tiebreaker if:
          // 1. We're in cooldown (we were just tagged or just tagged someone)
          // 2. The other IT player is the one who just tagged us (stale sync)
          const inTagCooldown = now < localTagCooldownUntil;
          const wasTaggedByThisPlayer = itPlayerId === lastTaggedByPlayerId;

          if (itPlayerId && localIsIt && currentUser && !inTagCooldown && !wasTaggedByThisPlayer) {
            // Tiebreaker: lower user ID wins (only when not in cooldown and not tagged by them)
            if (itPlayerId < currentUser.uid) {
              console.log('[OpenOverlay] Tiebreaker: other player wins (lower ID), giving up IT');
              localIsIt = false;
              lastTaggedByPlayerId = null; // Clear since we're giving up IT
              document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
                detail: { isTagMode: true, isIt: false, gameActive: true }
              }));
            } else {
              console.log('[OpenOverlay] Tiebreaker: we win (lower ID), keeping IT');
            }
          } else if (itPlayerId && localIsIt && inTagCooldown) {
            // In cooldown - skip tiebreaker to let tag transfer settle
            console.log('[OpenOverlay] Skipping tiebreaker - in tag cooldown');
          } else if (itPlayerId && localIsIt && wasTaggedByThisPlayer) {
            // This player tagged us - their stale isIt:true is expected, skip tiebreaker
            console.log('[OpenOverlay] Skipping tiebreaker - was tagged by this player (stale sync)');
          } else if (itPlayerId && !localIsIt) {
            // Someone else is IT and we're not - that's fine, no change needed
            console.log('[OpenOverlay] Other player is IT, we are not');
          }
        }
      }
    });

    // Subscribe to tag game state (will be null if no tag game active)
    subscribeToTagGame(pageKey, (state) => {
      const prevState = tagGameState;
      tagGameState = state;
      console.log('[OpenOverlay] Tag game state changed:', state);

      // Dispatch event to update UI
      const currentUser = getCurrentUser();
      const isIt = state?.itPlayerId === currentUser?.uid;
      document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
        detail: { isTagMode, isIt, gameActive: state?.gameActive ?? false }
      }));

      if (state?.gameActive) {
        console.log('[OpenOverlay] Tag game active, "it" is:', state.itPlayerId);
        if (prevState?.itPlayerId !== state.itPlayerId) {
          if (isIt) {
            showNotification("You're IT!", 'Tag someone!', 2000);
          } else if (prevState?.itPlayerId === currentUser?.uid) {
            // We were just tagged - show notification
            showNotification("You're not IT!", 'Run away!', 2000);
          }
        }
      }
    });

    // Start countdown before player drops
    startCountdown();

    // Hide toolbar only for race mode (explore mode keeps toolbar visible)
    if (playMode === 'race') {
      document.dispatchEvent(new CustomEvent('oo:hidetoolbar'));
    }

    // Start game loop
    startGameLoop();
  } else if (mode === 'build') {
    // Keep game loop running, keep player visible for character editing
    // Clean up modal/leaderboard/restart button
    showingFinishModal = false;
    showLeaderboard = false;
    removeNameInput();
    removeRestartButton();
    isCountingDown = false;
    playerFrozen = false;
    notification = null;
    // Keep multiplayer connected so other players stay visible
    // Tag mode is disabled in build mode though
    isTagMode = false;
    localIsIt = false;
    lastTaggedByPlayerId = null;
    pendingTaggedPlayerId = null;
    pendingTaggedAt = 0;
    tagGameState = null;
  } else {
    // Mode is 'none' - keep player visible, keep game running
    showingFinishModal = false;
    showLeaderboard = false;
    removeNameInput();
    removeRestartButton();
    isCountingDown = false;
    playerFrozen = false;
    notification = null;

    // Unsubscribe from multiplayer and remove self
    unsubscribeFromPlayers();
    unsubscribeFromTagGame();
    removePlayer(getPageKey());
    otherPlayers.clear();
    displayPlayers.clear();
    isTagMode = false;
    localIsIt = false;
    lastTaggedByPlayerId = null;
    pendingTaggedPlayerId = null;
    pendingTaggedAt = 0;
    tagGameState = null;
  }

  render();
}

function startGameLoop(): void {
  // Always clear and restart to ensure fresh state
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  lastTime = performance.now();
  animationId = requestAnimationFrame(gameLoop);
}

function stopGameLoop(): void {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
}

function gameLoop(currentTime: number): void {
  const deltaTime = Math.min((currentTime - lastTime) / 16.67, 3); // Cap and normalize
  lastTime = currentTime;

  update(deltaTime);
  render();

  if (gameMode === 'play' || gameMode === 'build' || ambientMode) {
    animationId = requestAnimationFrame(gameLoop);
  } else {
    // Clear animationId when loop stops naturally
    animationId = null;
  }
}

function respawnPlayer(): void {
  // Use initial spawn position if provided (from onboarding)
  if (initialSpawnPosition) {
    player.x = initialSpawnPosition.x - player.width / 2;
    player.y = initialSpawnPosition.y - player.height;
    initialSpawnPosition = null; // Clear after using
    player.vx = 0;
    player.vy = 0;
    player.onGround = true; // Start on ground since coming from button
    player.jumpsRemaining = player.maxJumps;
    return;
  }

  // Find spawn point or start point
  const spawnPoint = currentCourse.checkpoints.find(c => c.type === 'spawn');
  const startPoint = currentCourse.checkpoints.find(c => c.type === 'start');
  const respawnAt = spawnPoint || startPoint;

  if (respawnAt) {
    player.x = respawnAt.x - player.width / 2;
    player.y = respawnAt.y - player.height - 10;
  } else {
    // Default to center of screen
    player.x = window.scrollX + window.innerWidth / 2 - player.width / 2;
    player.y = window.scrollY + 100;
  }

  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.jumpsRemaining = player.maxJumps;
}

function startCountdown(): void {
  // Clear any stuck keyboard state
  clearKeys();

  // Position player at spawn point
  respawnPlayer();

  // In explore mode, skip countdown but add brief grace period for collision canvas to render
  if (playMode === 'explore') {
    isCountingDown = false;
    playerFrozen = true; // Start frozen to prevent falling through
    raceStarted = false; // Ensure race state is off
    showNotification('Explore!', 'No timer, unlimited respawns', 2000);

    // Unfreeze after short delay to ensure collision canvas is drawn
    setTimeout(() => {
      playerFrozen = false;
    }, 150);
    return;
  }

  // Race mode - do countdown
  isCountingDown = true;
  countdownStartTime = performance.now();
  playerFrozen = true;
  showNotification('Get Ready!', '2');
}

function showNotification(text: string, subtext?: string, duration: number = 1000): void {
  notification = {
    text,
    subtext,
    endTime: performance.now() + duration,
  };
}

/**
 * Show a centered text popup (used for onboarding controls hint)
 */
function showCenteredPopup(text: string, duration: number = 1000): void {
  const now = performance.now();
  centeredPopup = {
    text,
    startTime: now,
    endTime: now + duration,
  };
}

/**
 * Show the "No Tag Backs" fullscreen flash for 3 seconds.
 */
function showNTBFlash(): void {
  ntbFlashEndTime = performance.now() + NTB_FLASH_DURATION;
}

function createRestartButton(): void {
  if (restartButton) return;

  restartButton = document.createElement('button');
  restartButton.textContent = '🔄 Restart';
  restartButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    padding: 10px 16px;
    background: #ef4444;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  restartButton.onclick = () => {
    // Reset and restart
    raceStarted = false;
    raceTime = 0;
    checkpointCount = 0;
    currentCourse.checkpoints.forEach(c => c.reached = false);
    lives = maxLives;
    isDead = false;
    startCountdown();
  };
  document.body.appendChild(restartButton);
}

function removeRestartButton(): void {
  if (restartButton) {
    restartButton.remove();
    restartButton = null;
  }
}

function showGamePopup(type: 'gameover' | 'finish'): void {
  if (gamePopup) removeGamePopup();

  popupType = type;
  const { top10 } = getTopScores();

  gamePopup = document.createElement('div');
  gamePopup.id = 'oo-game-popup';
  gamePopup.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.7);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  const isFinish = type === 'finish';
  const title = isFinish ? '🏆 RACE COMPLETE!' : '💀 GAME OVER';
  const titleColor = isFinish ? '#22c55e' : '#ef4444';
  const timeStr = (raceTime / 1000).toFixed(2);
  const isBest = isFinish && finishTime === currentCourse.bestTime;

  let leaderboardHTML = '';
  if (top10.length > 0) {
    leaderboardHTML = `
      <div style="margin-top: 15px; max-height: 200px; overflow-y: auto;">
        <div style="color: #fbbf24; font-weight: bold; margin-bottom: 8px;">🏆 Today's Best</div>
        ${top10.slice(0, 5).map((s, i) => `
          <div style="display: flex; justify-content: space-between; color: ${i < 3 ? ['#fbbf24', '#c0c0c0', '#cd7f32'][i] : '#888'}; font-size: 13px; padding: 2px 0;">
            <span>${i + 1}. ${s.name.slice(0, 10)}</span>
            <span>${(s.time / 1000).toFixed(2)}s</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #111;
    border: 3px solid ${titleColor};
    border-radius: 12px;
    padding: 25px 35px;
    text-align: center;
    min-width: 300px;
    max-width: 400px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.8);
  `;
  modal.innerHTML = `
    <div style="color: ${titleColor}; font-size: 24px; font-weight: bold; margin-bottom: 15px;">${title}</div>
    <div style="color: #fff; font-size: 40px; font-weight: bold; font-family: monospace;">${timeStr}s</div>
    ${isBest ? '<div style="color: #fbbf24; font-size: 14px; margin-top: 5px;">⭐ NEW PERSONAL BEST!</div>' : ''}
    ${isFinish ? `
      <div style="margin-top: 15px;">
        <input type="text" id="oo-popup-name" placeholder="Enter name..." value="${playerName}"
          style="padding: 8px 12px; border-radius: 6px; border: 2px solid #333; background: #222; color: #fff; font-size: 14px; width: 180px; text-align: center;">
      </div>
    ` : ''}
    ${leaderboardHTML}
    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
      <button id="oo-popup-retry" style="padding: 10px 25px; background: ${titleColor}; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer;">
        🔄 Retry
      </button>
      <button id="oo-popup-close" style="padding: 10px 25px; background: #333; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer;">
        ✕ Close
      </button>
    </div>
  `;

  gamePopup.appendChild(modal);
  document.body.appendChild(gamePopup);

  // Event listeners
  const retryBtn = gamePopup.querySelector('#oo-popup-retry');
  const closeBtn = gamePopup.querySelector('#oo-popup-close');
  const nameInput = gamePopup.querySelector('#oo-popup-name') as HTMLInputElement | null;

  retryBtn?.addEventListener('click', () => {
    // Save score if finishing with name
    if (isFinish && nameInput && nameInput.value.trim()) {
      saveScore(nameInput.value.trim(), finishTime);
    }
    removeGamePopup();
    restartRace();
  });

  closeBtn?.addEventListener('click', () => {
    // Save score if finishing with name
    if (isFinish && nameInput && nameInput.value.trim()) {
      saveScore(nameInput.value.trim(), finishTime);
    }
    removeGamePopup();
    exitGame();
  });

  // Click outside modal to close
  gamePopup.addEventListener('click', (e) => {
    if (e.target === gamePopup) {
      if (isFinish && nameInput && nameInput.value.trim()) {
        saveScore(nameInput.value.trim(), finishTime);
      }
      removeGamePopup();
      exitGame();
    }
  });

  // Focus name input if present
  nameInput?.focus();

  // Enter key submits
  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim()) {
      saveScore(nameInput.value.trim(), finishTime);
      removeGamePopup();
      restartRace();
    }
  });
}

function removeGamePopup(): void {
  if (gamePopup) {
    gamePopup.remove();
    gamePopup = null;
  }
  popupType = 'none';
}

function restartRace(): void {
  raceStarted = false;
  raceTime = 0;
  checkpointCount = 0;
  currentCourse.checkpoints.forEach(c => c.reached = false);
  lives = maxLives;
  isDead = false;
  showingFinishModal = false;
  showLeaderboard = false;
  bloodSplats = [];
  removeRestartButton();
  startCountdown();
}

function exitGame(): void {
  // Exit to game menu (build mode)
  document.dispatchEvent(new CustomEvent('oo:gamemode', { detail: { mode: 'build' } }));
  raceStarted = false;
  showingFinishModal = false;
  showLeaderboard = false;
  removeRestartButton();
}

function handleDeath(): void {
  if (isDead) return; // Already dead

  isDead = true;
  deathTime = performance.now();

  // Lose a life in race mode
  if (playMode === 'race' && raceStarted) {
    lives--;
    console.log('[OpenOverlay] Died! Lives remaining:', lives);
  }
}

// Track jump key state for double jump
let jumpKeyWasPressed = false;

/**
 * Update remote player display positions using velocity extrapolation.
 * This predicts where players are NOW based on their last known velocity.
 */
function updateRemotePlayerPositions(): void {
  const now = performance.now();

  for (const [playerId, sync] of otherPlayers) {
    let display = displayPlayers.get(playerId);

    if (!display) {
      // Initialize new player
      display = {
        x: sync.x,
        y: sync.y,
        vx: sync.vx,
        vy: sync.vy,
        lastSyncTime: now,
        targetX: sync.x,
        targetY: sync.y,
      };
      displayPlayers.set(playerId, display);
      continue;
    }

    // Check if we got new sync data (position changed significantly or velocity changed)
    const posChanged = Math.abs(sync.x - display.targetX) > 0.1 || Math.abs(sync.y - display.targetY) > 0.1;
    const velChanged = Math.abs(sync.vx - display.vx) > 0.1 || Math.abs(sync.vy - display.vy) > 0.1;

    if (posChanged || velChanged) {
      // New sync data received - update velocity immediately
      display.vx = sync.vx;
      display.vy = sync.vy;
      display.lastSyncTime = now;

      // Predict where player is NOW by adding velocity * estimated network delay
      // This compensates for the ~80ms sync interval + network latency
      const networkCompensation = 5; // frames worth of prediction (~80ms at 60fps)
      display.targetX = sync.x + sync.vx * networkCompensation;
      display.targetY = sync.y + sync.vy * networkCompensation;
    }

    // Extrapolate position based on velocity (pixels per frame at 60fps)
    // This makes the player continue moving smoothly between syncs
    display.x += display.vx * 0.5;
    display.y += display.vy * 0.5;

    // Gradually correct towards the predicted position to prevent drift
    const correctionSpeed = 0.12;
    const errorX = display.targetX - display.x;
    const errorY = display.targetY - display.y;

    // Only correct if there's significant error
    if (Math.abs(errorX) > 1 || Math.abs(errorY) > 1) {
      display.x += errorX * correctionSpeed;
      display.y += errorY * correctionSpeed;
    }

    // If way off (teleport/respawn), snap immediately
    const totalError = Math.sqrt(errorX * errorX + errorY * errorY);
    if (totalError > 150) {
      display.x = sync.x;
      display.y = sync.y;
    }
  }

  // Clean up disconnected players from display
  for (const playerId of displayPlayers.keys()) {
    if (!otherPlayers.has(playerId)) {
      displayPlayers.delete(playerId);
    }
  }

  // Clean up stale players who haven't updated recently
  const realNow = Date.now();
  for (const [playerId, player] of otherPlayers) {
    if (player.updatedAt && realNow - player.updatedAt > PLAYER_STALE_TIMEOUT) {
      console.log('[OpenOverlay] Removing stale player:', playerId);
      otherPlayers.delete(playerId);
      displayPlayers.delete(playerId);
    }
  }
}

function update(dt: number): void {
  if (gameMode !== 'play') return;

  // Update remote player positions using velocity extrapolation
  updateRemotePlayerPositions();

  // Handle countdown
  if (isCountingDown) {
    const elapsed = performance.now() - countdownStartTime;
    const remaining = COUNTDOWN_DURATION - elapsed;

    if (remaining > 1000) {
      notification = { text: 'Get Ready!', subtext: '2', endTime: performance.now() + 100 };
    } else if (remaining > 0) {
      notification = { text: 'Get Ready!', subtext: '1', endTime: performance.now() + 100 };
    } else {
      // Countdown finished!
      isCountingDown = false;
      playerFrozen = false;
      notification = { text: 'GO!', endTime: performance.now() + 500 };

      // Start race timer if in race mode
      if (playMode === 'race') {
        raceStarted = true;
        raceStartTime = performance.now();
        // Popup will handle retry, no need for floating button
      }
    }
    return; // Don't update player during countdown
  }

  // Handle death/respawn
  if (isDead) {
    const timeLeft = RESPAWN_DELAY - (performance.now() - deathTime);
    if (timeLeft > 0) {
      notification = {
        text: 'You fell!',
        subtext: `Respawning in ${Math.ceil(timeLeft / 1000)}...`,
        endTime: performance.now() + 100
      };
    }

    if (performance.now() - deathTime >= RESPAWN_DELAY) {
      // Check if game over (race mode only)
      if (playMode === 'race' && lives <= 0) {
        // Game over - show popup
        raceStarted = false;
        isDead = false;
        removeRestartButton();
        showGamePopup('gameover');
        return;
      }
      // In explore mode with respawn disabled, dismiss character
      if (playMode === 'explore' && !shouldRespawnInExplore) {
        isDead = false;
        notification = null;
        // Dispatch event to stop game mode (dismiss character)
        document.dispatchEvent(new CustomEvent('oo:gamemode', { detail: { mode: 'none' } }));
        return;
      }
      // Respawn with brief grace period for collision
      isDead = false;
      respawnPlayer();
      notification = null;
      playerFrozen = true;
      setTimeout(() => {
        playerFrozen = false;
      }, 100);
    }
    return; // Don't update while dead
  }

  // Clear notification if expired
  if (notification && performance.now() > notification.endTime) {
    notification = null;
  }

  // Handle input (with speed boost check)
  const isSpeedBoosted = performance.now() < speedBoostEndTime;
  const currentMoveSpeed = isSpeedBoosted ? MOVE_SPEED * 2 : MOVE_SPEED;

  if (keys['ArrowLeft'] || keys['KeyA']) {
    player.vx = -currentMoveSpeed;
    player.facingRight = false;
    lastMoveTime = performance.now();
    isWaving = false;
  } else if (keys['ArrowRight'] || keys['KeyD']) {
    player.vx = currentMoveSpeed;
    player.facingRight = true;
    lastMoveTime = performance.now();
    isWaving = false;
  } else {
    // Use slower friction during landing slide, faster otherwise
    const friction = landingSlideFrames > 0 ? 0.92 : FRICTION;
    player.vx *= friction;
    if (Math.abs(player.vx) < 0.1) player.vx = 0;
  }

  // Decrease landing slide frames
  if (landingSlideFrames > 0) landingSlideFrames--;

  // Update eye look direction for Smudgy face
  const isMoving = Math.abs(player.vx) > 0.5;
  if (isMoving) {
    // Check if it's time to glance back (explore mode, or during tag if we're not IT)
    const isBeingChased = tagGameState?.gameActive && !isPlayerIt();
    const shouldGlance = playMode === 'explore' || isBeingChased;
    const distanceTraveled = Math.abs(player.x - lastGlanceX);

    if (shouldGlance && distanceTraveled > nextGlanceDistance && !isGlancing) {
      // Start a glance back
      isGlancing = true;
      glanceTimer = 0;
      lastGlanceX = player.x;
      // Set random distance for next glance (more frequent when being chased)
      if (isBeingChased) {
        nextGlanceDistance = GLANCE_MIN_TAG + Math.random() * (GLANCE_MAX_TAG - GLANCE_MIN_TAG);
      } else {
        nextGlanceDistance = GLANCE_MIN_EXPLORE + Math.random() * (GLANCE_MAX_EXPLORE - GLANCE_MIN_EXPLORE);
      }
    }

    if (isGlancing) {
      // Look backwards (-1 in local coords = opposite of forward)
      eyeLookDirection = -1;
      glanceTimer++;
      if (glanceTimer >= GLANCE_DURATION) {
        isGlancing = false;
      }
    } else {
      // Normal forward look (+1 in local coords)
      eyeLookDirection = 1;
    }
    stoppingTimer = 0; // Reset stopping timer while moving
  } else {
    // When stopped, slowly turn eye toward center
    // Start from the side we were facing (based on facingRight)
    isGlancing = false; // Reset glance when stopped
    nextGlanceDistance = 50; // Reset to quick first glance when starting to move again
    if (stoppingTimer === 0 && Math.abs(eyeLookDirection) > 0.1) {
      // Just stopped - set initial direction based on which way we were running
      // If we were running left (facingRight=false), eye should start on LEFT of screen
      // Since context is NOT flipped when stopped, we use negative for left
      eyeLookDirection = player.facingRight ? 1 : -1;
    }
    if (Math.abs(eyeLookDirection) > 0.1) {
      eyeLookDirection *= (1 - EYE_TURN_SPEED);
    } else {
      eyeLookDirection = 0;
    }
    // Increment stopping timer - body waits for face to reset
    stoppingTimer++;
  }

  // Check for idle wave animation
  if (player.onGround && Math.abs(player.vx) < 0.1) {
    const idleTime = performance.now() - lastMoveTime;
    if (idleTime > IDLE_WAVE_DELAY && !isWaving) {
      // Start waving
      isWaving = true;
      waveStartTime = performance.now();
      waveFrame = 0;
    }
    if (isWaving) {
      // Wave for limited duration
      if (performance.now() - waveStartTime < WAVE_DURATION) {
        waveFrame += 0.15;
      } else {
        // Done waving, reset timer so it doesn't wave again immediately
        isWaving = false;
        lastMoveTime = performance.now();
      }
    }
  } else {
    isWaving = false;
    waveFrame = 0;
  }

  // Double jump logic - only trigger on key press, not hold
  const jumpKeyPressed = keys['ArrowUp'] || keys['KeyW'] || keys['Space'];
  if (jumpKeyPressed && !jumpKeyWasPressed && player.jumpsRemaining > 0) {
    // Apply high jump boost if available
    const jumpForce = hasHighJumpBoost ? JUMP_FORCE * 1.5 : JUMP_FORCE;
    player.vy = jumpForce;
    player.onGround = false;
    player.jumpsRemaining--;
    hasHighJumpBoost = false; // Consume the boost
  }
  jumpKeyWasPressed = jumpKeyPressed;

  // Apply gravity and cap fall speed
  player.vy += GRAVITY * dt;
  if (player.vy > MAX_FALL_SPEED) player.vy = MAX_FALL_SPEED;

  // --- PIXEL-PERFECT COLLISION DETECTION WITH SUBSTEPS ---
  // Break large movements into smaller steps to prevent tunneling

  // Max walkable slope angle (degrees) - steeper than this is a wall
  const MAX_SLOPE_ANGLE = 50;
  const movingRight = player.vx >= 0;

  // Reset ground state - will be set true if we land
  player.onGround = false;

  // Calculate total movement
  const totalMoveX = player.vx * dt;
  const totalMoveY = player.vy * dt;
  const totalDist = Math.sqrt(totalMoveX * totalMoveX + totalMoveY * totalMoveY);

  // Determine number of substeps needed
  const numSteps = Math.max(1, Math.ceil(totalDist / COLLISION_SUBSTEP_SIZE));
  const stepX = totalMoveX / numSteps;
  const stepY = totalMoveY / numSteps;

  // Process each substep
  for (let step = 0; step < numSteps; step++) {
    // Intended position for this substep
    const intendedX = player.x + stepX;
    const intendedY = player.y + stepY;

    // PRE-MOVEMENT COLLISION CHECK (horizontal)
    const preCollision = checkPixelCollision(
      intendedX,
      player.y,
      player.width,
      player.height,
      movingRight
    );

    // If hitting a wall horizontally, don't move X
    let canMoveX = true;
    if (player.vx < 0 && preCollision.leftWall) {
      player.x = preCollision.leftWallX;
      player.vx = 0;
      canMoveX = false;
    }
    if (player.vx > 0 && preCollision.rightWall) {
      player.x = preCollision.rightWallX - player.width;
      player.vx = 0;
      canMoveX = false;
    }

    // Check for steep slope ahead before moving
    if (canMoveX && Math.abs(player.vx) > 0.5 && preCollision.slopeAheadY > 0) {
      if (preCollision.slopeAngle > MAX_SLOPE_ANGLE) {
        player.vx = 0;
        canMoveX = false;
      }
    }

    // PRE-MOVEMENT CEILING CHECK (when jumping up)
    let canMoveY = true;
    if (player.vy < 0) {
      const ceilingCheck = checkPixelCollision(
        player.x,
        intendedY,
        player.width,
        player.height,
        movingRight
      );
      if (ceilingCheck.ceiling) {
        player.y = ceilingCheck.ceilingY;
        player.vy = 1;
        canMoveY = false;
      }
    }

    // Apply substep movement
    if (canMoveX) {
      player.x += stepX;
    }
    if (canMoveY) {
      player.y += stepY;
    }

    // Check floor collision after this substep (when falling)
    if (player.vy >= 0) {
      const floorCheck = checkPixelCollision(
        player.x,
        player.y,
        player.width,
        player.height,
        movingRight
      );
      if (floorCheck.floor) {
        const targetY = floorCheck.floorY - player.height;
        const heightDiff = player.y - targetY;
        const isFallingFast = player.vy > 5;
        const maxSnapUp = isFallingFast ? 2 : 8; // Allow small snap even when fast

        if (heightDiff <= maxSnapUp && heightDiff >= -COLLISION_SUBSTEP_SIZE) {
          // Check if just landed
          if (!wasOnGround && Math.abs(player.vx) > 0.5) {
            landingSlideFrames = 8;
          }
          // Show onboarding hint when landing from onboarding
          if (!wasOnGround && isFromOnboarding) {
            isFromOnboarding = false;
            showCenteredPopup('Move with WASD/Arrows!', 1500);
          }
          player.y = targetY;
          player.vy = 0;
          player.onGround = true;
          player.jumpsRemaining = player.maxJumps;
          break; // Stop substeps - we've landed
        }
      }
    }
  }

  // Final collision check at current position
  const collision = checkPixelCollision(
    player.x,
    player.y,
    player.width,
    player.height,
    movingRight
  );

  // Ceiling collision (when jumping up)
  if (player.vy < 0 && collision.ceiling) {
    player.y = collision.ceilingY;
    player.vy = 1; // Start falling
  }

  // Wall collision - check if player actually overlaps with detected walls
  // leftWallX = right edge of wall to the left, rightWallX = left edge of wall to the right
  const leftOverlap = collision.leftWall && player.x < collision.leftWallX;
  const rightOverlap = collision.rightWall && (player.x + player.width) > collision.rightWallX;

  if (leftOverlap && rightOverlap) {
    // Stuck between two walls - push out to the side with less overlap
    const leftPush = collision.leftWallX - player.x;
    const rightPush = (player.x + player.width) - collision.rightWallX;
    if (leftPush < rightPush) {
      player.x = collision.leftWallX;
    } else {
      player.x = collision.rightWallX - player.width;
    }
    player.vx = 0;
  } else if (leftOverlap) {
    player.x = collision.leftWallX;
    player.vx = 0;
  } else if (rightOverlap) {
    player.x = collision.rightWallX - player.width;
    player.vx = 0;
  }

  // Final floor collision check (fallback if not caught by substeps)
  // Only reset onGround if we're falling and didn't land in substeps
  if (player.vy > 0 && !player.onGround && collision.floor) {
    const targetY = collision.floorY - player.height;
    const heightDiff = player.y - targetY;

    if (heightDiff <= 8 && heightDiff >= -COLLISION_SUBSTEP_SIZE) {
      if (!wasOnGround && Math.abs(player.vx) > 0.5) {
        landingSlideFrames = 8;
      }
      player.y = targetY;
      player.vy = 0;
      player.onGround = true;
      player.jumpsRemaining = player.maxJumps;
    }
  }

  // SLOPE CLIMBING: Simple gradual step-up when on ground
  // Only step up 1-2 pixels at a time to prevent teleportation
  if (player.onGround && Math.abs(player.vx) > 0.5) {
    const speed = Math.abs(player.vx);
    // Step up amount scales with speed but max 3px per frame
    const maxStepUp = Math.min(3, Math.ceil(speed * 0.3));

    // Check collision at a slightly higher position
    for (let stepUp = 1; stepUp <= maxStepUp; stepUp++) {
      const testY = player.y - stepUp;
      const stepCollision = checkPixelCollision(player.x, testY, player.width, player.height, movingRight);

      // If there's floor at this height and no walls, step up
      if (stepCollision.floor && !stepCollision.leftWall && !stepCollision.rightWall) {
        const newY = stepCollision.floorY - player.height;
        const heightDiff = player.y - newY;

        // Only step up if it's a small step (not teleporting)
        if (heightDiff > 0 && heightDiff <= maxStepUp) {
          player.y = newY;
          break;
        }
      }
    }
  }

  // Track ground state for next frame
  wasOnGround = player.onGround;

  // No floor - player can fall to death
  // Check if player fell too far below the page OR off the sides
  const pageBottom = Math.max(document.body.scrollHeight, window.innerHeight);
  const pageRight = Math.max(document.body.scrollWidth, window.innerWidth);

  if (player.y > pageBottom + DEATH_Y_THRESHOLD ||
      player.x < -100 ||
      player.x > pageRight + 100) {
    handleDeath();
  }

  // Animation
  if (Math.abs(player.vx) > 0.5) {
    player.animFrame = (player.animFrame + 0.15 * dt) % 4;
  } else {
    player.animFrame = 0;
  }

  // Check checkpoints
  checkCheckpoints();

  // Check game elements (trampolines, speed boosts, etc.)
  checkGameElements();

  // Check tag collisions with other players
  if (isTagMode) {
    checkPlayerTagCollision();
  }

  // Update race time
  if (raceStarted && playMode === 'race') {
    raceTime = performance.now() - raceStartTime;
  }

  // Note: Auto-scroll removed - player and drawings should scroll together with the page

  // Sync player position to cloud for multiplayer
  const now = performance.now();
  if (gameMode === 'play' && now - lastSyncTime > SYNC_INTERVAL) {
    // Sync if moved more than 5 pixels, OR if we haven't synced in 5 seconds (keep-alive)
    const moved = Math.abs(player.x - lastSyncX) > 5 || Math.abs(player.y - lastSyncY) > 5;
    const needsKeepAlive = now - lastSyncTime > 5000; // Sync at least every 5 seconds

    if (moved || needsKeepAlive) {
      lastSyncTime = now;
      lastSyncX = player.x;
      lastSyncY = player.y;
      syncPlayerToCloud();
    }
  }
}

// Sync local player state to cloud
function syncPlayerToCloud(): void {
  const pageKey = getPageKey();
  const currentUser = getCurrentUser();

  const syncIsIt = isTagMode && isCurrentUserIt();
  if (isTagMode) {
    console.log('[OpenOverlay] Syncing player with isIt:', syncIsIt, 'isTagMode:', isTagMode, 'localIsIt:', localIsIt);
  }

  const now = Date.now();

  // Clear expired tag notification
  if (pendingTaggedPlayerId && now - pendingTaggedAt > TAG_NOTIFICATION_DURATION) {
    pendingTaggedPlayerId = null;
    pendingTaggedAt = 0;
  }

  // Build sync data object
  const syncData: any = {
    x: player.x,
    y: player.y + player.height, // Send feet Y position
    vx: player.vx,
    vy: player.vy,
    facingRight: player.facingRight,
    animFrame: player.animFrame,
    onGround: player.onGround,
    isDead: isDead,
    playerColor: playerColor,
    playerHat: playerHat,
    playerAccessory: playerAccessory,
    isGirlMode: isGirlMode,
    faceStyle: faceStyle,
    displayName: customScreenName || currentUser?.displayName || '',
    updatedAt: now,
    // Tag game state (use helper for fallback)
    isIt: isTagMode && isCurrentUserIt(),
    tagCooldownUntil: localTagCooldownUntil,
  };

  // Only include tag notification fields if we actually tagged someone
  // (Firestore doesn't accept undefined values)
  if (pendingTaggedPlayerId) {
    syncData.taggedPlayerId = pendingTaggedPlayerId;
    syncData.taggedAt = pendingTaggedAt;
  }

  // Sync feet position (y + height) for consistent ground level across different machines
  updatePlayerPosition(pageKey, syncData);
}

function checkCheckpoints(): void {
  // Only track checkpoints in race mode
  if (playMode !== 'race') return;

  // Combine checkpoints from my course and other users' courses
  const allCheckpoints: Checkpoint[] = [
    ...currentCourse.checkpoints,
    ...otherUsersCourses.flatMap(c => c.checkpoints)
  ];

  const totalCheckpoints = allCheckpoints.filter(c => c.type === 'checkpoint').length;

  for (const checkpoint of allCheckpoints) {
    if (checkpoint.reached) continue;

    const playerCenterX = player.x + player.width / 2;
    const playerCenterY = player.y + player.height / 2;
    const distance = Math.hypot(playerCenterX - checkpoint.x, playerCenterY - checkpoint.y);

    if (distance < 50) {
      if (checkpoint.type === 'start' && !raceStarted) {
        raceStarted = true;
        raceStartTime = performance.now();
        checkpoint.reached = true;
        console.log('[OpenOverlay] Race started!');
      } else if (checkpoint.type === 'checkpoint' && raceStarted) {
        // Checkpoints must be reached in order!
        const nextCheckpointOrder = checkpointCount + 1;
        if (checkpoint.order === nextCheckpointOrder) {
          checkpoint.reached = true;
          checkpointCount++;
          console.log('[OpenOverlay] Checkpoint', checkpointCount, 'of', totalCheckpoints, 'reached!');
          showNotification(`Flag ${checkpointCount}/${totalCheckpoints}`, '', 1500);
        }
      } else if (checkpoint.type === 'finish' && raceStarted) {
        // Must have collected ALL checkpoints to finish
        if (checkpointCount >= totalCheckpoints) {
          checkpoint.reached = true;
          raceStarted = false;
          finishTime = raceTime;
          console.log('[OpenOverlay] Race finished! Time:', (finishTime / 1000).toFixed(2) + 's');

          // Check for best time
          if (!currentCourse.bestTime || finishTime < currentCourse.bestTime) {
            currentCourse.bestTime = finishTime;
            saveCourse();
          }

          // Remove restart button and show finish popup
          removeRestartButton();
          showGamePopup('finish');

          // Dispatch finish event
          document.dispatchEvent(new CustomEvent('oo:racefinish', {
            detail: { time: finishTime, bestTime: currentCourse.bestTime }
          }));
        }
      }
    }
  }
}

function checkGameElements(): void {
  // Combine elements from my course and other users' courses
  const allElements: Checkpoint[] = [
    ...currentCourse.checkpoints,
    ...otherUsersCourses.flatMap(c => c.checkpoints)
  ];

  for (const element of allElements) {
    // Only check interactive game elements
    if (!['trampoline', 'speedBoost', 'highJump', 'spike'].includes(element.type)) continue;

    const elemWidth = element.width || 60;
    const elemHeight = element.height || 20;

    // AABB collision - element is positioned at bottom center
    const elemLeft = element.x - elemWidth / 2;
    const elemRight = element.x + elemWidth / 2;
    const elemTop = element.y - elemHeight;
    const elemBottom = element.y;

    const playerLeft = player.x;
    const playerRight = player.x + player.width;
    const playerTop = player.y;
    const playerBottom = player.y + player.height;

    // Check collision
    if (playerRight > elemLeft && playerLeft < elemRight &&
        playerBottom > elemTop && playerTop < elemBottom) {

      switch (element.type) {
        case 'trampoline':
          // Only bounce if coming from above
          if (player.vy > 0) {
            player.vy = -20; // Strong upward bounce
            player.onGround = false;
            player.jumpsRemaining = player.maxJumps; // Reset jumps
          }
          break;

        case 'speedBoost':
          speedBoostEndTime = performance.now() + 3000; // 3 second boost
          break;

        case 'highJump':
          hasHighJumpBoost = true;
          break;

        case 'spike':
          // Spikes kill the player
          if (!isDead) {
            // Add blood splat at player position
            bloodSplats.push({
              x: player.x + player.width / 2,
              y: player.y + player.height,
              createdAt: performance.now()
            });
            handleDeath();
          }
          break;
      }
    }
  }
}

/**
 * Check for tag collisions with other players
 */
function checkPlayerTagCollision(): void {
  if (!isTagMode) return;

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const now = Date.now();
  const pageKey = getPageKey();

  // Player center and feet positions
  const playerCenterX = player.x + player.width / 2;
  const playerFeetY = player.y + player.height;

  // Check if WE are "it" (use helper that handles fallback)
  const isWeIt = isCurrentUserIt();

  for (const [playerId, remote] of otherPlayers) {
    // Use interpolated position for collision detection (matches visual position)
    const interpolated = displayPlayers.get(playerId);
    const remoteX = interpolated ? interpolated.x : remote.x;
    const remoteY = interpolated ? interpolated.y : remote.y;

    // Calculate distance between players (use feet Y positions)
    const dx = playerCenterX - remoteX;
    const dy = playerFeetY - remoteY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Touch threshold - players are ~30px wide
    if (distance < 40) {
      const offCooldown = now > localTagCooldownUntil;
      const targetOffCooldown = !remote.tagCooldownUntil || now > remote.tagCooldownUntil;

      if (isWeIt && offCooldown && targetOffCooldown) {
        // Tag them!
        console.log('[OpenOverlay] TAGGING player:', playerId);

        // Update local state immediately
        localIsIt = false;

        // Set explicit tag notification - this will be synced to tell the other player they were tagged
        pendingTaggedPlayerId = playerId;
        pendingTaggedAt = now;

        // Try to update Firebase (may fail due to permissions)
        tagPlayer(pageKey, playerId).catch(() => {
          console.log('[OpenOverlay] Firebase tag update failed, using local state');
        });

        localTagCooldownUntil = now + TAG_COOLDOWN;
        showNotification('Tagged!', remote.displayName || 'Player', 1500);
        showNTBFlash();

        // Dispatch state change event
        document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
          detail: { isTagMode: true, isIt: false, gameActive: true }
        }));

        // Force immediate sync to notify the tagged player
        syncPlayerToCloud();
      }

      // Check if THEY tagged US (they are "it" and touched us)
      // Also check that THEY are not in cooldown - prevents passive re-tagging after cooldown expires
      const remoteOffCooldown = !remote.tagCooldownUntil || now > remote.tagCooldownUntil;
      if (!isWeIt && remote.isIt && offCooldown && remoteOffCooldown) {
        // We got tagged!
        console.log('[OpenOverlay] GOT TAGGED by:', playerId);

        // Update local state - we are now "it"
        localIsIt = true;
        localTagCooldownUntil = now + TAG_COOLDOWN;
        lastTaggedByPlayerId = playerId; // Track who tagged us
        showNotification("You're IT!", 'Tag someone!', 2000);
        showNTBFlash();

        // Dispatch state change event
        document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
          detail: { isTagMode: true, isIt: true, gameActive: true }
        }));
      }
    }
  }
}

function render(): void {
  if (!gameCtx || !gameCanvas) return;

  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Clear overlay canvas
  if (overlayCtx && overlayCanvas) {
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  // Draw blood splats (behind everything)
  drawBloodSplats();

  // Draw checkpoints and game elements from current user's course
  for (const checkpoint of currentCourse.checkpoints) {
    drawCheckpoint(checkpoint);
  }

  // Draw other users' course elements (so everyone can race each other's courses)
  for (const course of otherUsersCourses) {
    for (const checkpoint of course.checkpoints) {
      drawCheckpoint(checkpoint, course.authorName);
    }
  }

  // Draw player (in play mode and build mode - so characters stay visible while editing)
  if (gameMode === 'play' || gameMode === 'build') {
    // Draw other players first (behind local player)
    drawOtherPlayers();
    drawPlayer();
    // Only show HUD in play mode
    if (gameMode === 'play') {
      drawHUD();
    }
  }

  // Draw build mode indicator
  if (gameMode === 'build') {
    drawBuildModeUI();
  }
}

function drawBloodSplats(): void {
  if (!gameCtx) return;

  const now = performance.now();
  const SPLAT_DURATION = 5000; // Fade after 5 seconds

  // Filter out old splats
  bloodSplats = bloodSplats.filter(s => now - s.createdAt < SPLAT_DURATION);

  for (const splat of bloodSplats) {
    const age = now - splat.createdAt;
    const alpha = Math.max(0, 1 - age / SPLAT_DURATION);

    gameCtx.save();
    gameCtx.globalAlpha = alpha;

    // Main splat
    gameCtx.fillStyle = '#dc2626';
    gameCtx.beginPath();
    gameCtx.arc(splat.x, splat.y, 12, 0, Math.PI * 2);
    gameCtx.fill();

    // Smaller droplets around
    gameCtx.fillStyle = '#b91c1c';
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 15 + Math.random() * 10;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.5; // Flatter spread
      gameCtx.beginPath();
      gameCtx.arc(splat.x + dx, splat.y + dy, 4 + Math.random() * 3, 0, Math.PI * 2);
      gameCtx.fill();
    }

    gameCtx.restore();
  }
}

function drawCheckpoint(checkpoint: Checkpoint, authorName?: string): void {
  if (!gameCtx) return;

  const x = checkpoint.x;
  const y = checkpoint.y;

  gameCtx.save();

  // Show author name for other users' elements (small text below the element)
  if (authorName && (checkpoint.type === 'start' || checkpoint.type === 'finish')) {
    gameCtx.font = '10px Arial';
    gameCtx.fillStyle = 'rgba(255,255,255,0.7)';
    gameCtx.textAlign = 'center';
    gameCtx.fillText(`by ${authorName}`, x, y + 15);
  }

  if (checkpoint.type === 'start') {
    // Race start arch
    const archColor = checkpoint.reached ? '#86efac' : '#22c55e';
    const archWidth = 80;
    const archHeight = 70;

    // Left pole
    gameCtx.strokeStyle = '#444';
    gameCtx.lineWidth = 6;
    gameCtx.beginPath();
    gameCtx.moveTo(x - archWidth/2, y);
    gameCtx.lineTo(x - archWidth/2, y - archHeight);
    gameCtx.stroke();

    // Right pole
    gameCtx.beginPath();
    gameCtx.moveTo(x + archWidth/2, y);
    gameCtx.lineTo(x + archWidth/2, y - archHeight);
    gameCtx.stroke();

    // Arch top (banner)
    gameCtx.fillStyle = archColor;
    gameCtx.fillRect(x - archWidth/2 - 3, y - archHeight - 15, archWidth + 6, 20);

    // Border on banner
    gameCtx.strokeStyle = '#166534';
    gameCtx.lineWidth = 2;
    gameCtx.strokeRect(x - archWidth/2 - 3, y - archHeight - 15, archWidth + 6, 20);

    // START text on banner
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 14px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.fillText('START', x, y - archHeight - 1);

  } else if (checkpoint.type === 'finish') {
    // Checkered finish arch
    const archWidth = 80;
    const archHeight = 70;

    // Left pole
    gameCtx.strokeStyle = '#444';
    gameCtx.lineWidth = 6;
    gameCtx.beginPath();
    gameCtx.moveTo(x - archWidth/2, y);
    gameCtx.lineTo(x - archWidth/2, y - archHeight);
    gameCtx.stroke();

    // Right pole
    gameCtx.beginPath();
    gameCtx.moveTo(x + archWidth/2, y);
    gameCtx.lineTo(x + archWidth/2, y - archHeight);
    gameCtx.stroke();

    // Checkered banner
    const bannerY = y - archHeight - 15;
    const bannerH = 20;
    const squareSize = 8;

    // Background
    gameCtx.fillStyle = checkpoint.reached ? '#fbbf24' : '#111';
    gameCtx.fillRect(x - archWidth/2 - 3, bannerY, archWidth + 6, bannerH);

    // Checkered pattern
    for (let i = 0; i < Math.ceil((archWidth + 6) / squareSize); i++) {
      for (let j = 0; j < Math.ceil(bannerH / squareSize); j++) {
        if ((i + j) % 2 === 0) {
          gameCtx.fillStyle = '#fff';
          gameCtx.fillRect(
            x - archWidth/2 - 3 + i * squareSize,
            bannerY + j * squareSize,
            squareSize,
            Math.min(squareSize, bannerH - j * squareSize)
          );
        }
      }
    }

    // Border
    gameCtx.strokeStyle = '#444';
    gameCtx.lineWidth = 2;
    gameCtx.strokeRect(x - archWidth/2 - 3, bannerY, archWidth + 6, bannerH);

    // FINISH text below arch
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 11px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.fillText('FINISH', x, y + 15);

  } else if (checkpoint.type === 'spawn') {
    // Spawn point - only visible in build mode
    if (gameMode !== 'build') {
      gameCtx.restore();
      return;
    }

    const spawnColor = '#a855f7'; // Purple

    // Down arrow above
    gameCtx.fillStyle = spawnColor;
    gameCtx.beginPath();
    gameCtx.moveTo(x, y - 20);
    gameCtx.lineTo(x - 10, y - 35);
    gameCtx.lineTo(x + 10, y - 35);
    gameCtx.closePath();
    gameCtx.fill();

    // Player silhouette outline
    gameCtx.strokeStyle = spawnColor;
    gameCtx.lineWidth = 2;

    // Head
    gameCtx.beginPath();
    gameCtx.arc(x, y - 55, 8, 0, Math.PI * 2);
    gameCtx.stroke();

    // Body
    gameCtx.beginPath();
    gameCtx.moveTo(x, y - 47);
    gameCtx.lineTo(x, y - 30);
    gameCtx.stroke();

    // Arms
    gameCtx.beginPath();
    gameCtx.moveTo(x - 10, y - 42);
    gameCtx.lineTo(x + 10, y - 42);
    gameCtx.stroke();

    // Legs
    gameCtx.beginPath();
    gameCtx.moveTo(x, y - 30);
    gameCtx.lineTo(x - 8, y - 15);
    gameCtx.moveTo(x, y - 30);
    gameCtx.lineTo(x + 8, y - 15);
    gameCtx.stroke();

    // Label
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 10px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.fillText('SPAWN', x, y + 5);

  } else if (checkpoint.type === 'trampoline') {
    // Orange bouncy pad
    const w = checkpoint.width || 60;
    const h = checkpoint.height || 20;

    // Base pad
    gameCtx.fillStyle = '#f97316';
    gameCtx.fillRect(x - w/2, y - h, w, h);

    // Border
    gameCtx.strokeStyle = '#c2410c';
    gameCtx.lineWidth = 2;
    gameCtx.strokeRect(x - w/2, y - h, w, h);

    // Springs (zigzag pattern)
    gameCtx.strokeStyle = '#c2410c';
    gameCtx.lineWidth = 2;
    const springCount = 3;
    const springWidth = w / springCount;
    for (let i = 0; i < springCount; i++) {
      const sx = x - w/2 + springWidth/2 + i * springWidth;
      gameCtx.beginPath();
      gameCtx.moveTo(sx, y);
      gameCtx.lineTo(sx - 4, y - h/3);
      gameCtx.lineTo(sx + 4, y - h*2/3);
      gameCtx.lineTo(sx, y - h);
      gameCtx.stroke();
    }

  } else if (checkpoint.type === 'speedBoost') {
    // Blue ground pad with arrows
    const w = checkpoint.width || 60;
    const h = checkpoint.height || 20;

    // Base pad
    const isActive = performance.now() < speedBoostEndTime;
    gameCtx.fillStyle = isActive ? '#60a5fa' : '#3b82f6';
    gameCtx.fillRect(x - w/2, y - h, w, h);

    // Border
    gameCtx.strokeStyle = '#1d4ed8';
    gameCtx.lineWidth = 2;
    gameCtx.strokeRect(x - w/2, y - h, w, h);

    // Arrows
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 14px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText('>>', x, y - h/2);

  } else if (checkpoint.type === 'highJump') {
    // Green spring pad
    const w = checkpoint.width || 60;
    const h = checkpoint.height || 20;

    // Base pad
    const isActive = hasHighJumpBoost;
    gameCtx.fillStyle = isActive ? '#86efac' : '#22c55e';
    gameCtx.fillRect(x - w/2, y - h, w, h);

    // Border
    gameCtx.strokeStyle = '#15803d';
    gameCtx.lineWidth = 2;
    gameCtx.strokeRect(x - w/2, y - h, w, h);

    // Up arrow
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 16px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText('^', x, y - h/2);

  } else if (checkpoint.type === 'spike') {
    // Red triangular spikes
    const w = checkpoint.width || 60;
    const h = checkpoint.height || 30;

    const spikeCount = 4;
    const spikeW = w / spikeCount;

    gameCtx.fillStyle = '#ef4444';
    for (let i = 0; i < spikeCount; i++) {
      const sx = x - w/2 + i * spikeW;
      gameCtx.beginPath();
      gameCtx.moveTo(sx, y);
      gameCtx.lineTo(sx + spikeW/2, y - h);
      gameCtx.lineTo(sx + spikeW, y);
      gameCtx.closePath();
      gameCtx.fill();
    }

    // Dark outline
    gameCtx.strokeStyle = '#991b1b';
    gameCtx.lineWidth = 1;
    for (let i = 0; i < spikeCount; i++) {
      const sx = x - w/2 + i * spikeW;
      gameCtx.beginPath();
      gameCtx.moveTo(sx, y);
      gameCtx.lineTo(sx + spikeW/2, y - h);
      gameCtx.lineTo(sx + spikeW, y);
      gameCtx.closePath();
      gameCtx.stroke();
    }

  } else if (checkpoint.type === 'checkpoint') {
    // Checkpoint flag (blue/gold)
    const flagColor = checkpoint.reached ? '#fbbf24' : '#3b82f6';

    // Pole
    gameCtx.strokeStyle = '#444';
    gameCtx.lineWidth = 4;
    gameCtx.beginPath();
    gameCtx.moveTo(x, y);
    gameCtx.lineTo(x, y - 50);
    gameCtx.stroke();

    // Flag
    gameCtx.fillStyle = flagColor;
    gameCtx.beginPath();
    gameCtx.moveTo(x, y - 50);
    gameCtx.lineTo(x + 35, y - 40);
    gameCtx.lineTo(x, y - 30);
    gameCtx.closePath();
    gameCtx.fill();

    // Number on flag
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 12px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText(String(checkpoint.order), x + 15, y - 40);
  }

  gameCtx.restore();
}

// Draw other players from multiplayer sync
function drawOtherPlayers(): void {
  if (!gameCtx) return;

  for (const [playerId, remotePlayer] of otherPlayers) {
    // Debug: log remote player data once per player
    const logKey = `logged_${playerId}`;
    if (!(window as any)[logKey]) {
      (window as any)[logKey] = true;
      console.log('[OpenOverlay] Remote player data:', playerId, JSON.stringify({
        isGirlMode: remotePlayer.isGirlMode,
        playerHat: remotePlayer.playerHat,
        playerColor: remotePlayer.playerColor,
        displayName: remotePlayer.displayName,
        playerAccessory: remotePlayer.playerAccessory,
        isIt: remotePlayer.isIt,
      }));
    }
    drawRemotePlayer(playerId, remotePlayer);
  }
}

// Draw a remote player with their customizations
function drawRemotePlayer(playerId: string, rp: RemotePlayer): void {
  if (!gameCtx) return;

  // Skip if player is dead
  if (rp.isDead) return;

  // Use interpolated position for smooth movement
  const interpolated = displayPlayers.get(playerId);
  const displayX = interpolated ? interpolated.x : rp.x;
  const displayY = interpolated ? interpolated.y : rp.y;

  const w = 30;
  const h = 50;
  const x = displayX;
  // displayY is the feet position, so subtract height to get top position
  const y = displayY - h;

  gameCtx.save();

  // Make remote players slightly transparent
  gameCtx.globalAlpha = 0.85;

  // Flip if facing left
  if (!rp.facingRight) {
    gameCtx.translate(x + w / 2, 0);
    gameCtx.scale(-1, 1);
    gameCtx.translate(-(x + w / 2), 0);
  }

  // Stick figure dimensions (scaled 75% for smaller player)
  const headRadius = 7;
  const bodyLength = 13;
  const limbLength = 11;

  const centerX = x + w / 2;
  const headY = y + headRadius + 3;
  const bodyStartY = headY + headRadius;
  const bodyEndY = bodyStartY + bodyLength;

  const color = rp.playerColor || '#ffffff';

  gameCtx.strokeStyle = color;
  gameCtx.lineWidth = 3;
  gameCtx.lineCap = 'round';
  gameCtx.lineJoin = 'round';

  // Shadow
  gameCtx.shadowColor = 'rgba(0,0,0,0.3)';
  gameCtx.shadowBlur = 4;
  gameCtx.shadowOffsetX = 2;
  gameCtx.shadowOffsetY = 2;

  const isMoving = Math.abs(rp.vx) > 0.5;
  const animFrame = rp.animFrame || 0;

  if (rp.isGirlMode) {
    // === GIRL CHARACTER - same detailed style as local player ===

    // 1. Draw hair first (back layer) - smooth rounded bob
    gameCtx.fillStyle = color;
    gameCtx.beginPath();
    // Start at bottom left of hair
    gameCtx.moveTo(centerX - headRadius - 2, headY + 8);
    // Left side going up
    gameCtx.lineTo(centerX - headRadius - 1, headY - 2);
    // Curve over the top of head
    gameCtx.quadraticCurveTo(centerX - headRadius + 2, headY - headRadius - 4, centerX, headY - headRadius - 3);
    gameCtx.quadraticCurveTo(centerX + headRadius - 2, headY - headRadius - 4, centerX + headRadius + 1, headY - 2);
    // Right side going down
    gameCtx.lineTo(centerX + headRadius + 2, headY + 8);
    // Curve back under
    gameCtx.quadraticCurveTo(centerX + headRadius, headY + 10, centerX + headRadius - 2, headY + 10);
    gameCtx.lineTo(centerX - headRadius + 2, headY + 10);
    gameCtx.quadraticCurveTo(centerX - headRadius, headY + 10, centerX - headRadius - 2, headY + 8);
    gameCtx.closePath();
    gameCtx.fill();

    // 2. Draw face circle (white/light filled)
    gameCtx.fillStyle = '#fff';
    gameCtx.beginPath();
    gameCtx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
    gameCtx.fill();

    // 3. Draw bangs on top of face
    gameCtx.fillStyle = color;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX - headRadius + 2, headY - 2);
    gameCtx.quadraticCurveTo(centerX - 2, headY - headRadius - 2, centerX, headY - headRadius + 1);
    gameCtx.quadraticCurveTo(centerX + 2, headY - headRadius - 2, centerX + headRadius - 2, headY - 2);
    gameCtx.quadraticCurveTo(centerX, headY - 1, centerX - headRadius + 2, headY - 2);
    gameCtx.closePath();
    gameCtx.fill();

    // 4. Face features (on white face)
    const remoteFaceStyle = (rp as any).faceStyle || 'smudgy';
    if (remoteFaceStyle === 'smudgy') {
      // For remote players, calculate look direction from velocity
      const remoteLookDir = rp.vx > 0.5 ? 1 : rp.vx < -0.5 ? -1 : 0;
      drawSmudgyFace(gameCtx, centerX, headY, headRadius, remoteLookDir, rp.vy, rp.onGround !== false, color);
    } else {
      gameCtx.fillStyle = color;
      if (isMoving) {
        // Running: single side eye + small mouth dash
        gameCtx.beginPath();
        gameCtx.arc(centerX + 2, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        // Mouth dash
        gameCtx.lineWidth = 2;
        gameCtx.beginPath();
        gameCtx.moveTo(centerX, headY + 4);
        gameCtx.lineTo(centerX + 4, headY + 4);
        gameCtx.stroke();
        gameCtx.lineWidth = 3;
      } else {
        // Standing: two eyes + smile
        gameCtx.beginPath();
        gameCtx.arc(centerX - 3, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        // Smile
        gameCtx.lineWidth = 1.5;
        gameCtx.beginPath();
        gameCtx.arc(centerX, headY + 3, 2.5, 0.2 * Math.PI, 0.8 * Math.PI);
        gameCtx.stroke();
        gameCtx.lineWidth = 3;
      }
    }

    // 5. Dress body - solid triangle (scaled 75%)
    gameCtx.fillStyle = color;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    gameCtx.lineTo(centerX - 8, bodyEndY + 1);
    gameCtx.lineTo(centerX + 8, bodyEndY + 1);
    gameCtx.closePath();
    gameCtx.fill();

    // 6. Legs (under dress) - scaled 75% with thin black outline
    const legSwingGirl = isMoving ? Math.sin(animFrame * Math.PI) * 6 : 0;
    // Draw black outline first
    gameCtx.strokeStyle = '#000';
    gameCtx.lineWidth = 2.5;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX - 3, bodyEndY);
    gameCtx.lineTo(centerX - 5 + legSwingGirl, bodyEndY + limbLength);
    gameCtx.moveTo(centerX + 3, bodyEndY);
    gameCtx.lineTo(centerX + 5 - legSwingGirl, bodyEndY + limbLength);
    gameCtx.stroke();
    // Then white legs
    gameCtx.strokeStyle = '#fff';
    gameCtx.lineWidth = 2;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX - 3, bodyEndY);
    gameCtx.lineTo(centerX - 5 + legSwingGirl, bodyEndY + limbLength);
    gameCtx.moveTo(centerX + 3, bodyEndY);
    gameCtx.lineTo(centerX + 5 - legSwingGirl, bodyEndY + limbLength);
    gameCtx.stroke();
    gameCtx.lineWidth = 3;
    gameCtx.strokeStyle = color;

  } else {
    // === BOY CHARACTER - same detailed style as local player ===
    const remoteFaceStyleBoy = (rp as any).faceStyle || 'smudgy';
    const topOfHead = headY - headRadius;

    if (remoteFaceStyleBoy === 'smudgy') {
      // Draw hair FIRST (behind head)
      const remoteAnimFrame = (rp as any).animFrame || 0;
      gameCtx.strokeStyle = color;
      gameCtx.lineWidth = 2.5;
      gameCtx.lineCap = 'round';

      const hairWiggle = Math.sin(remoteAnimFrame * Math.PI * 2) * 2;

      if (isMoving) {
        // Running: hairs stick up then bend back in wind
        gameCtx.beginPath();
        gameCtx.moveTo(centerX + 2, topOfHead + 2);
        gameCtx.bezierCurveTo(
          centerX + 2, topOfHead - 6,     // Go UP first
          centerX - 6, topOfHead - 4,     // Then curve back
          centerX - 12 + hairWiggle, topOfHead - 2
        );
        gameCtx.stroke();

        // Back hair
        gameCtx.beginPath();
        gameCtx.moveTo(centerX - 1, topOfHead + 2);
        gameCtx.bezierCurveTo(
          centerX - 1, topOfHead - 4,
          centerX - 5, topOfHead - 2,
          centerX - 9 + hairWiggle * 0.7, topOfHead
        );
        gameCtx.stroke();
      } else {
        // Standing: mohawk spikes going straight up
        gameCtx.beginPath();
        gameCtx.moveTo(centerX + 1, topOfHead + 1);
        gameCtx.quadraticCurveTo(centerX + 1, topOfHead - 5, centerX, topOfHead - 9);
        gameCtx.stroke();

        gameCtx.beginPath();
        gameCtx.moveTo(centerX - 2, topOfHead + 2);
        gameCtx.quadraticCurveTo(centerX - 2, topOfHead - 2, centerX - 2, topOfHead - 5);
        gameCtx.stroke();
      }

      // Now draw head circle (on top of hair)
      gameCtx.strokeStyle = color;
      gameCtx.lineWidth = 3;
      gameCtx.beginPath();
      gameCtx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
      gameCtx.stroke();

      // Draw Smudgy face (pink circle with transparent cutout)
      const remoteLookDirBoy = rp.vx > 0.5 ? 1 : rp.vx < -0.5 ? -1 : 0;
      drawSmudgyFace(gameCtx, centerX, headY, headRadius, remoteLookDirBoy, rp.vy, rp.onGround !== false, color);
    } else {
      // Head circle first
      gameCtx.beginPath();
      gameCtx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
      gameCtx.stroke();

      // Hair - marker tip style (scaled 75%)
      gameCtx.fillStyle = color;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 6, headY - headRadius + 1);
      gameCtx.lineTo(centerX - 3, headY - headRadius - 4);
      gameCtx.lineTo(centerX + 8, headY - headRadius + 3);
      gameCtx.quadraticCurveTo(centerX, headY - headRadius - 1, centerX - 6, headY - headRadius + 1);
      gameCtx.closePath();
      gameCtx.fill();
      gameCtx.stroke();

      // Face
      gameCtx.fillStyle = color;
      if (isMoving) {
        // Running: single side eye + mouth dash
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY - 1, 2, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.moveTo(centerX + 1, headY + 4);
        gameCtx.lineTo(centerX + 5, headY + 4);
        gameCtx.stroke();
      } else {
        // Standing: two eyes + smile
        gameCtx.beginPath();
        gameCtx.arc(centerX - 3, headY - 1, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY - 1, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        // Smile
        gameCtx.lineWidth = 1.5;
        gameCtx.beginPath();
        gameCtx.arc(centerX, headY + 3, 3, 0.2 * Math.PI, 0.8 * Math.PI);
        gameCtx.stroke();
        gameCtx.lineWidth = 3;
      }
    }

    // Body
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    gameCtx.lineTo(centerX, bodyEndY);
    gameCtx.stroke();

    // Helper to draw an L-shaped limb for remote player
    const drawRemoteLLimb = (
      startX: number, startY: number,
      angle: number,
      upperLen: number, lowerLen: number,
      isLeft: boolean
    ) => {
      const elbowX = startX + Math.sin(angle) * upperLen * (isLeft ? -1 : 1);
      const elbowY = startY + Math.cos(angle) * upperLen;
      const lowerAngle = angle + (isLeft ? -1.2 : 1.2);
      const endX = elbowX + Math.sin(lowerAngle) * lowerLen * (isLeft ? -1 : 1);
      const endY = elbowY + Math.cos(lowerAngle) * lowerLen;

      gameCtx.beginPath();
      gameCtx.moveTo(startX, startY);
      gameCtx.lineTo(elbowX, elbowY);
      gameCtx.lineTo(endX, endY);
      gameCtx.stroke();
    };

    const shoulderY = bodyStartY + 3;
    const hipY = bodyEndY;
    const walkCycle = Math.sin(animFrame * Math.PI);
    const upperArm = 6;
    const forearm = 6;
    const thigh = 6;
    const calf = 7;

    // Arms
    if (isMoving) {
      const armSwing = walkCycle * 0.8;
      drawRemoteLLimb(centerX, shoulderY, -armSwing * 0.6, upperArm, forearm, true);
      drawRemoteLLimb(centerX, shoulderY, armSwing * 0.6, upperArm, forearm, false);
    } else {
      drawRemoteLLimb(centerX, shoulderY, 0.2, upperArm, forearm, true);
      drawRemoteLLimb(centerX, shoulderY, 0.2, upperArm, forearm, false);
    }

    // Legs - simple wiggly sticks
    const legSwing = isMoving ? Math.sin(animFrame * Math.PI) * 8 : 0;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, hipY);
    gameCtx.lineTo(centerX - 4 + legSwing, hipY + limbLength);
    gameCtx.stroke();
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, hipY);
    gameCtx.lineTo(centerX + 4 - legSwing, hipY + limbLength);
    gameCtx.stroke();
  }

  // Draw hat for remote player
  if (rp.playerHat && rp.playerHat !== 'none') {
    drawRemoteHat(centerX, headY, headRadius, rp.playerHat, color);
  }

  // Restore transform BEFORE drawing text (so text isn't mirrored)
  gameCtx.restore();

  // Draw name above head (after restore so text isn't flipped)
  gameCtx.save();
  gameCtx.globalAlpha = 0.9;
  if (rp.displayName) {
    gameCtx.shadowColor = 'transparent';
    gameCtx.fillStyle = 'rgba(0,0,0,0.7)';
    gameCtx.font = 'bold 11px "Comic Sans MS", "Chalkboard SE", cursive';
    const nameWidth = gameCtx.measureText(rp.displayName).width;
    gameCtx.fillRect(centerX - nameWidth/2 - 5, headY - headRadius - 22, nameWidth + 10, 16);
    gameCtx.fillStyle = rp.playerColor || '#fff';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText(rp.displayName, centerX, headY - headRadius - 14);
  }

  gameCtx.restore();

  // Draw "IT" indicator for tag game AFTER restore so it's not flipped
  const isThisPlayerIt = isTagMode && rp.isIt;
  if (isThisPlayerIt) {
    gameCtx.save();
    gameCtx.shadowColor = '#ff0000';
    gameCtx.shadowBlur = 15;
    gameCtx.fillStyle = '#ff0000';
    gameCtx.font = 'bold 16px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText('IT', centerX, headY - headRadius - 25);
    gameCtx.restore();
  }

  // Draw cooldown shield if player is in cooldown (just got tagged)
  const now = Date.now();
  if (isTagMode && rp.tagCooldownUntil && rp.tagCooldownUntil > now) {
    drawCooldownShield(centerX, y + h / 2, rp.tagCooldownUntil, now);
  }
}

// Draw hat for remote players
function drawRemoteHat(centerX: number, headY: number, headRadius: number, hat: string, playerColor: string): void {
  if (!gameCtx) return;

  const topY = headY - headRadius;

  switch (hat) {
    case 'cap':
      // Baseball cap
      gameCtx.fillStyle = '#ef4444';
      gameCtx.beginPath();
      gameCtx.ellipse(centerX, topY - 2, headRadius + 2, 5, 0, 0, Math.PI * 2);
      gameCtx.fill();
      // Brim
      gameCtx.fillRect(centerX - 2, topY - 4, headRadius + 8, 4);
      break;

    case 'tophat':
      // Top hat
      gameCtx.fillStyle = '#1a1a1a';
      // Brim
      gameCtx.fillRect(centerX - 12, topY - 2, 24, 4);
      // Hat body
      gameCtx.fillRect(centerX - 8, topY - 18, 16, 16);
      // Band
      gameCtx.fillStyle = playerColor;
      gameCtx.fillRect(centerX - 8, topY - 6, 16, 3);
      break;

    case 'crown':
      // Crown
      gameCtx.fillStyle = '#fbbf24';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 10, topY);
      gameCtx.lineTo(centerX - 10, topY - 8);
      gameCtx.lineTo(centerX - 6, topY - 4);
      gameCtx.lineTo(centerX - 3, topY - 12);
      gameCtx.lineTo(centerX, topY - 6);
      gameCtx.lineTo(centerX + 3, topY - 12);
      gameCtx.lineTo(centerX + 6, topY - 4);
      gameCtx.lineTo(centerX + 10, topY - 8);
      gameCtx.lineTo(centerX + 10, topY);
      gameCtx.closePath();
      gameCtx.fill();
      // Jewels
      gameCtx.fillStyle = '#dc2626';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY - 5, 2, 0, Math.PI * 2);
      gameCtx.fill();
      break;

    case 'beanie':
      // Beanie
      gameCtx.fillStyle = '#3b82f6';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY, headRadius + 1, Math.PI, 0);
      gameCtx.fill();
      // Pom pom
      gameCtx.fillStyle = '#fff';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY - headRadius - 3, 4, 0, Math.PI * 2);
      gameCtx.fill();
      break;

    case 'party':
      // Party hat
      gameCtx.fillStyle = '#ec4899';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, topY - 20);
      gameCtx.lineTo(centerX - 10, topY);
      gameCtx.lineTo(centerX + 10, topY);
      gameCtx.closePath();
      gameCtx.fill();
      // Stripes
      gameCtx.strokeStyle = '#fbbf24';
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 8, topY - 4);
      gameCtx.lineTo(centerX + 8, topY - 4);
      gameCtx.moveTo(centerX - 5, topY - 10);
      gameCtx.lineTo(centerX + 5, topY - 10);
      gameCtx.stroke();
      gameCtx.lineWidth = 3;
      break;
  }
}

/**
 * Draw Smudgy face - pink circle with transparent cutout that follows look direction
 * lookDir: -1 to 1, negative = looking left, positive = looking right
 * bodyColor: the color for the head outline (matches body)
 */
function drawSmudgyFace(ctx: CanvasRenderingContext2D, centerX: number, headY: number, headRadius: number, lookDir: number, vy: number, onGround: boolean, bodyColor: string): void {
  // Completely disable shadow for pink face
  ctx.save();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Big pink circle - fills most of the head (uses faceColor)
  ctx.fillStyle = faceColor;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
  ctx.fill();

  // Thin darker outline around the face (darken the face color)
  const darkerFaceColor = darkenColor(faceColor, 0.2);
  ctx.strokeStyle = darkerFaceColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
  ctx.stroke();

  // Eye cutout position
  const maxOffset = headRadius - 3;
  const eyeOffsetX = lookDir * maxOffset;

  // Vertical offset - look UP when jumping
  let eyeOffsetY = 0;
  let jumpingEyeXReduction = 1;
  if (!onGround) {
    if (vy < -2) {
      eyeOffsetY = -4;
      jumpingEyeXReduction = 0.3;
    } else if (vy > 2) {
      eyeOffsetY = 1;
    }
  } else if (Math.abs(lookDir) > 0.3) {
    eyeOffsetY = 1;
  }

  const cutoutRadius = headRadius - 4;
  const finalEyeOffsetX = eyeOffsetX * jumpingEyeXReduction;

  // Cut out the eye hole
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(centerX + finalEyeOffsetX, headY + eyeOffsetY, cutoutRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer(): void {
  if (!gameCtx) return;

  const x = player.x;
  const y = player.y;
  const w = player.width;
  const h = player.height;

  gameCtx.save();

  // Only flip if actually moving - face forward when stopped
  const isMoving = Math.abs(player.vx) > 0.5;
  if (isMoving && !player.facingRight) {
    gameCtx.translate(x + w / 2, 0);
    gameCtx.scale(-1, 1);
    gameCtx.translate(-(x + w / 2), 0);
  }

  // Body lean when running (10 degrees forward)
  const LEAN_ANGLE = 0.17; // ~10 degrees in radians
  const leanAmount = isMoving ? LEAN_ANGLE : 0;
  if (leanAmount !== 0) {
    // Rotate around the hip point (bottom of body)
    const pivotX = x + w / 2;
    const pivotY = y + h - 5; // Near the feet
    gameCtx.translate(pivotX, pivotY);
    gameCtx.rotate(leanAmount);
    gameCtx.translate(-pivotX, -pivotY);
  }

  // Stick figure dimensions (scaled 75% for smaller player)
  const headRadius = 7;
  const bodyLength = 13;
  const limbLength = 11;

  const centerX = x + w / 2;
  const headY = y + headRadius + 3;
  const bodyStartY = headY + headRadius;
  const bodyEndY = bodyStartY + bodyLength;

  gameCtx.strokeStyle = bodyColor;
  gameCtx.lineWidth = 3;
  gameCtx.lineCap = 'round';
  gameCtx.lineJoin = 'round';

  // Shadow
  gameCtx.shadowColor = 'rgba(0,0,0,0.3)';
  gameCtx.shadowBlur = 4;
  gameCtx.shadowOffsetX = 2;
  gameCtx.shadowOffsetY = 2;


  if (isGirlMode) {
    // === GIRL CHARACTER - solid shapes, no see-through ===
    const hairWiggle = Math.sin(player.animFrame * Math.PI * 2) * 3;

    // 1. Draw hair first (back layer)
    gameCtx.fillStyle = hairColor;
    gameCtx.beginPath();

    if (isMoving) {
      // Running: hair trails BEHIND on the LEFT side in local coords
      // (When character is flipped for left movement, this becomes right in world coords)
      // Hair covers back of head and flows back with wiggle
      gameCtx.moveTo(centerX, headY - headRadius - 3);
      // Curve over back/left of head
      gameCtx.quadraticCurveTo(centerX - headRadius + 2, headY - headRadius - 4, centerX - headRadius - 1, headY - 2);
      // Back side goes down and angles away with wiggle (blowing opposite to movement)
      gameCtx.lineTo(centerX - headRadius - 2, headY + 4);
      gameCtx.quadraticCurveTo(centerX - headRadius - 4 - hairWiggle, headY + 8, centerX - headRadius - 3 - hairWiggle, headY + 12);
      // Bottom curves back in toward center
      gameCtx.quadraticCurveTo(centerX - headRadius, headY + 11, centerX - headRadius + 3, headY + 10);
      // Connect to back/left side of head (covers the "bald spot")
      gameCtx.lineTo(centerX - 2, headY + headRadius);
      gameCtx.closePath();
      gameCtx.fill();
    } else {
      // Standing: normal symmetrical bob hair
      gameCtx.moveTo(centerX - headRadius - 2, headY + 8);
      gameCtx.lineTo(centerX - headRadius - 1, headY - 2);
      gameCtx.quadraticCurveTo(centerX - headRadius + 2, headY - headRadius - 4, centerX, headY - headRadius - 3);
      gameCtx.quadraticCurveTo(centerX + headRadius - 2, headY - headRadius - 4, centerX + headRadius + 1, headY - 2);
      gameCtx.lineTo(centerX + headRadius + 2, headY + 8);
      gameCtx.quadraticCurveTo(centerX + headRadius, headY + 10, centerX + headRadius - 2, headY + 10);
      gameCtx.lineTo(centerX - headRadius + 2, headY + 10);
      gameCtx.quadraticCurveTo(centerX - headRadius, headY + 10, centerX - headRadius - 2, headY + 8);
      gameCtx.closePath();
      gameCtx.fill();
    }

    // 2. Draw face circle (white/light filled) with thin black outline
    // First draw thin black outline
    gameCtx.strokeStyle = '#000';
    gameCtx.lineWidth = 0.5;
    gameCtx.beginPath();
    gameCtx.arc(centerX, headY, headRadius - 0.5, 0, Math.PI * 2);
    gameCtx.stroke();
    // Then head fill
    gameCtx.fillStyle = headColor;
    gameCtx.beginPath();
    gameCtx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
    gameCtx.fill();

    // 3. Draw bangs on top of face
    gameCtx.fillStyle = hairColor;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX - headRadius + 2, headY - 2);
    gameCtx.quadraticCurveTo(centerX - 2, headY - headRadius - 2, centerX, headY - headRadius + 1);
    gameCtx.quadraticCurveTo(centerX + 2, headY - headRadius - 2, centerX + headRadius - 2, headY - 2);
    gameCtx.quadraticCurveTo(centerX, headY - 1, centerX - headRadius + 2, headY - 2);
    gameCtx.closePath();
    gameCtx.fill();

    // 4. Face features (on white face)
    if (faceStyle === 'smudgy') {
      drawSmudgyFace(gameCtx, centerX, headY, headRadius, eyeLookDirection, player.vy, player.onGround, headColor);
    } else {
      gameCtx.fillStyle = bodyColor;
      if (isMoving) {
        // Running: single side eye + small mouth dash
        gameCtx.beginPath();
        gameCtx.arc(centerX + 2, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        // Mouth dash
        gameCtx.lineWidth = 2;
        gameCtx.beginPath();
        gameCtx.moveTo(centerX, headY + 4);
        gameCtx.lineTo(centerX + 4, headY + 4);
        gameCtx.stroke();
        gameCtx.lineWidth = 3;
      } else {
        // Standing: two eyes + smile
        gameCtx.beginPath();
        gameCtx.arc(centerX - 3, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        // Smile
        gameCtx.lineWidth = 1.5;
        gameCtx.beginPath();
        gameCtx.arc(centerX, headY + 3, 2.5, 0.2 * Math.PI, 0.8 * Math.PI);
        gameCtx.stroke();
        gameCtx.lineWidth = 3;
      }
    }

    // Dress is drawn later (after arms/legs) so it layers on top

  } else {
    // === BOY CHARACTER - stick figure style ===

    const topOfHead = headY - headRadius;

    if (faceStyle === 'smudgy') {
      // Draw hair FIRST (behind the head) with outlines
      gameCtx.lineCap = 'round';
      const hairWiggle = Math.sin(player.animFrame * Math.PI * 2) * 2;

      // Helper to draw hair with outline
      const drawHairStroke = (drawPath: () => void) => {
        // White outline (outermost)
        gameCtx.strokeStyle = '#fff';
        gameCtx.lineWidth = 3.1;
        drawPath();
        gameCtx.stroke();
        // Thin black inside
        gameCtx.strokeStyle = '#000';
        gameCtx.lineWidth = 2.8;
        drawPath();
        gameCtx.stroke();
        // Main color
        gameCtx.strokeStyle = hairColor;
        gameCtx.lineWidth = 2.5;
        drawPath();
        gameCtx.stroke();
      };

      if (isMoving) {
        // Running: hairs stick up high then curve back slightly (shorter, more upright)
        // Front hair - mostly UP with slight bend back
        drawHairStroke(() => {
          gameCtx.beginPath();
          gameCtx.moveTo(centerX + 2, topOfHead + 1);
          gameCtx.bezierCurveTo(
            centerX + 1, topOfHead - 8,
            centerX - 3, topOfHead - 9,
            centerX - 6 + hairWiggle * 0.5, topOfHead - 7
          );
        });

        // Back hair - starts farther back on head, shorter and more upright
        drawHairStroke(() => {
          gameCtx.beginPath();
          gameCtx.moveTo(centerX - 2, topOfHead + 1);
          gameCtx.bezierCurveTo(
            centerX - 2, topOfHead - 5,
            centerX - 4, topOfHead - 6,
            centerX - 7 + hairWiggle * 0.4, topOfHead - 4
          );
        });
      } else {
        // Standing: mohawk spikes going straight up
        drawHairStroke(() => {
          gameCtx.beginPath();
          gameCtx.moveTo(centerX + 1, topOfHead + 1);
          gameCtx.quadraticCurveTo(centerX + 1, topOfHead - 5, centerX, topOfHead - 9);
        });

        drawHairStroke(() => {
          gameCtx.beginPath();
          gameCtx.moveTo(centerX - 2, topOfHead + 2);
          gameCtx.quadraticCurveTo(centerX - 2, topOfHead - 2, centerX - 2, topOfHead - 5);
        });
      }

      // Draw Smudgy face first (pink with eye cutout), THEN white outline on top
      drawSmudgyFace(gameCtx, centerX, headY, headRadius, eyeLookDirection, player.vy, player.onGround, headColor);

      // Head outline AFTER pink/cutout so it's not affected by destination-out
      gameCtx.strokeStyle = headColor;
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
      gameCtx.stroke();
    } else {
      // Head circle for non-smudgy style
      gameCtx.beginPath();
      gameCtx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
      gameCtx.stroke();

      // Hair - marker tip style (scaled 75%)
      gameCtx.fillStyle = hairColor;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 6, headY - headRadius + 1);
      gameCtx.lineTo(centerX - 3, headY - headRadius - 4);
      gameCtx.lineTo(centerX + 8, headY - headRadius + 3);
      gameCtx.quadraticCurveTo(centerX, headY - headRadius - 1, centerX - 6, headY - headRadius + 1);
      gameCtx.closePath();
      gameCtx.fill();
      gameCtx.stroke();

      // Face
      gameCtx.fillStyle = bodyColor;
      if (isMoving) {
        // Running: single side eye + mouth dash
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY - 1, 2, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.moveTo(centerX + 1, headY + 4);
        gameCtx.lineTo(centerX + 5, headY + 4);
        gameCtx.stroke();
      } else {
        // Standing: two eyes + smile
        gameCtx.beginPath();
        gameCtx.arc(centerX - 3, headY - 1, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.arc(centerX + 3, headY - 1, 1.5, 0, Math.PI * 2);
        gameCtx.fill();
        gameCtx.beginPath();
        gameCtx.arc(centerX, headY + 3, 3, 0.1 * Math.PI, 0.9 * Math.PI);
        gameCtx.stroke();
      }
    }

    // Stick body with thin outline
    // White outline first (outermost)
    gameCtx.strokeStyle = '#fff';
    gameCtx.lineWidth = 3.6;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    gameCtx.lineTo(centerX, bodyEndY);
    gameCtx.stroke();
    // Thin black outline inside
    gameCtx.strokeStyle = '#000';
    gameCtx.lineWidth = 3.3;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    gameCtx.lineTo(centerX, bodyEndY);
    gameCtx.stroke();
    // Main color (innermost)
    gameCtx.strokeStyle = bodyColor;
    gameCtx.lineWidth = 3;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    gameCtx.lineTo(centerX, bodyEndY);
    gameCtx.stroke();
  }

  // Animation
  const walkCycle = Math.sin(player.animFrame * Math.PI);
  const isWalking = Math.abs(player.vx) > 0.5;
  // Body stays in walking pose until face finishes turning
  const bodyStillWalking = isWalking || stoppingTimer < BODY_RESET_DELAY;

  // Wave animation for idle
  const waveAngle = isWaving ? Math.sin(waveFrame * 3) * 0.5 : 0;

  // Helper to draw an L-shaped limb (90-degree angle at joint) with outlines
  // angle: rotation angle of the whole limb around shoulder/hip
  // The limb is an "L" shape: upper segment goes out, lower segment goes down
  const drawLLimb = (
    startX: number, startY: number,
    angle: number, // Rotation angle (0 = arm pointing down-forward)
    upperLen: number, lowerLen: number,
    isLeft: boolean // Left side limbs bend outward to the left
  ) => {
    // Upper segment direction based on angle
    const upperAngle = angle;
    const elbowX = startX + Math.sin(upperAngle) * upperLen * (isLeft ? -1 : 1);
    const elbowY = startY + Math.cos(upperAngle) * upperLen;

    // Lower segment always goes more downward (90-degree-ish from upper)
    const lowerAngle = upperAngle + (isLeft ? -1.2 : 1.2); // Bend at elbow/knee
    const endX = elbowX + Math.sin(lowerAngle) * lowerLen * (isLeft ? -1 : 1);
    const endY = elbowY + Math.cos(lowerAngle) * lowerLen;

    // White outline first (outermost)
    gameCtx.strokeStyle = '#fff';
    gameCtx.lineWidth = 3.6;
    gameCtx.beginPath();
    gameCtx.moveTo(startX, startY);
    gameCtx.lineTo(elbowX, elbowY);
    gameCtx.lineTo(endX, endY);
    gameCtx.stroke();
    // Thin black outline inside
    gameCtx.strokeStyle = '#000';
    gameCtx.lineWidth = 3.3;
    gameCtx.beginPath();
    gameCtx.moveTo(startX, startY);
    gameCtx.lineTo(elbowX, elbowY);
    gameCtx.lineTo(endX, endY);
    gameCtx.stroke();
    // Main color (innermost)
    gameCtx.strokeStyle = bodyColor;
    gameCtx.lineWidth = 3;
    gameCtx.beginPath();
    gameCtx.moveTo(startX, startY);
    gameCtx.lineTo(elbowX, elbowY);
    gameCtx.lineTo(endX, endY);
    gameCtx.stroke();
  };

  const shoulderY = bodyStartY + 4;
  const hipY = bodyEndY;
  const upperArm = 6;
  const forearm = 6;
  const thigh = 6;
  const calf = 7;

  // Arms - body waits for face to turn before switching to standing pose
  if (isWaving) {
    // Waving arm - raised up, swinging
    const waveSwing = Math.sin(waveFrame * 4) * 0.4;
    drawLLimb(centerX, shoulderY, -1.5 + waveSwing, upperArm, forearm, true);
    // Other arm relaxed
    drawLLimb(centerX, shoulderY, 0.3, upperArm, forearm, false);
  } else if (bodyStillWalking) {
    // Running (or still transitioning from running): arms pump with big swings
    // Use decaying swing when stopping
    const swingAmount = isWalking ? walkCycle * 1.2 : walkCycle * 1.2 * (1 - stoppingTimer / BODY_RESET_DELAY);
    drawLLimb(centerX, shoulderY, -swingAmount, upperArm, forearm, true);
    drawLLimb(centerX, shoulderY, swingAmount, upperArm, forearm, false);
  } else {
    if (isGirlMode) {
      // Girl standing: arms stick straight out to the sides (looks better with dress)
      // Left arm with outline (white outside, thin black inside)
      gameCtx.strokeStyle = '#fff';
      gameCtx.lineWidth = 3.6;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - limbLength, shoulderY + 2);
      gameCtx.stroke();
      gameCtx.strokeStyle = '#000';
      gameCtx.lineWidth = 3.3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - limbLength, shoulderY + 2);
      gameCtx.stroke();
      gameCtx.strokeStyle = bodyColor;
      gameCtx.lineWidth = 3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - limbLength, shoulderY + 2);
      gameCtx.stroke();
      // Right arm with outline (white outside, thin black inside)
      gameCtx.strokeStyle = '#fff';
      gameCtx.lineWidth = 3.6;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + limbLength, shoulderY + 2);
      gameCtx.stroke();
      gameCtx.strokeStyle = '#000';
      gameCtx.lineWidth = 3.3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + limbLength, shoulderY + 2);
      gameCtx.stroke();
      gameCtx.strokeStyle = bodyColor;
      gameCtx.lineWidth = 3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + limbLength, shoulderY + 2);
      gameCtx.stroke();
    } else {
      // Boy standing: hands on waist pose (arms angle out then down to hips)
      const waistY = bodyEndY - 2; // Just above where legs start
      const elbowOutX = 7; // How far elbow sticks out
      const elbowY = shoulderY + 5; // Elbow height
      const handInX = 4; // How far in the hand is (on waist)

      // Left arm with outline
      gameCtx.strokeStyle = '#fff';
      gameCtx.lineWidth = 3.6;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - elbowOutX, elbowY);
      gameCtx.lineTo(centerX - handInX, waistY);
      gameCtx.stroke();
      gameCtx.strokeStyle = '#000';
      gameCtx.lineWidth = 3.3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - elbowOutX, elbowY);
      gameCtx.lineTo(centerX - handInX, waistY);
      gameCtx.stroke();
      gameCtx.strokeStyle = bodyColor;
      gameCtx.lineWidth = 3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX - elbowOutX, elbowY);
      gameCtx.lineTo(centerX - handInX, waistY);
      gameCtx.stroke();
      // Right arm with outline
      gameCtx.strokeStyle = '#fff';
      gameCtx.lineWidth = 3.6;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + elbowOutX, elbowY);
      gameCtx.lineTo(centerX + handInX, waistY);
      gameCtx.stroke();
      gameCtx.strokeStyle = '#000';
      gameCtx.lineWidth = 3.3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + elbowOutX, elbowY);
      gameCtx.lineTo(centerX + handInX, waistY);
      gameCtx.stroke();
      gameCtx.strokeStyle = bodyColor;
      gameCtx.lineWidth = 3;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, shoulderY);
      gameCtx.lineTo(centerX + elbowOutX, elbowY);
      gameCtx.lineTo(centerX + handInX, waistY);
      gameCtx.stroke();
    }
  }

  // Helper to draw a line with outlines (white outside, thin black inside)
  const drawLineWithOutline = (x1: number, y1: number, x2: number, y2: number) => {
    // White outline (outermost)
    gameCtx.strokeStyle = '#fff';
    gameCtx.lineWidth = 3.6;
    gameCtx.beginPath();
    gameCtx.moveTo(x1, y1);
    gameCtx.lineTo(x2, y2);
    gameCtx.stroke();
    // Thin black outline inside
    gameCtx.strokeStyle = '#000';
    gameCtx.lineWidth = 3.3;
    gameCtx.beginPath();
    gameCtx.moveTo(x1, y1);
    gameCtx.lineTo(x2, y2);
    gameCtx.stroke();
    // Main color (innermost)
    gameCtx.strokeStyle = bodyColor;
    gameCtx.lineWidth = 3;
    gameCtx.beginPath();
    gameCtx.moveTo(x1, y1);
    gameCtx.lineTo(x2, y2);
    gameCtx.stroke();
  };

  // Legs - simple wiggly sticks with outlines
  const legSwing = isWalking ? Math.sin(player.animFrame * Math.PI) * 8 : 0;

  if (!player.onGround && player.vy < 0) {
    // Jumping up - legs tucked together
    drawLineWithOutline(centerX, hipY, centerX - 3, hipY + limbLength * 0.7);
    drawLineWithOutline(centerX, hipY, centerX + 3, hipY + limbLength * 0.7);
  } else if (!player.onGround) {
    // Falling - legs spread
    drawLineWithOutline(centerX, hipY, centerX - 7, hipY + limbLength);
    drawLineWithOutline(centerX, hipY, centerX + 7, hipY + limbLength);
  } else if (isWalking) {
    // Running: simple wiggly legs
    drawLineWithOutline(centerX, hipY, centerX - 4 + legSwing, hipY + limbLength);
    drawLineWithOutline(centerX, hipY, centerX + 4 - legSwing, hipY + limbLength);
  } else {
    // Standing: legs straight down, slight spread
    drawLineWithOutline(centerX, hipY, centerX - 4, hipY + limbLength);
    drawLineWithOutline(centerX, hipY, centerX + 4, hipY + limbLength);
  }

  // Girl's dress - drawn AFTER arms/legs so it layers on top
  if (isGirlMode) {
    gameCtx.fillStyle = dressColor;
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyStartY);
    // Longer dress - extends 5px past bodyEndY, wider at bottom
    gameCtx.lineTo(centerX - 10, bodyEndY + 5);
    gameCtx.lineTo(centerX + 10, bodyEndY + 5);
    gameCtx.closePath();
    gameCtx.fill();
  }

  // Draw accessories on top
  drawAccessories(centerX, headY, headRadius);

  gameCtx.restore();

  // Draw "IT" indicator for tag game AFTER restore so it's not flipped
  if (isTagMode && isCurrentUserIt()) {
    gameCtx.save();
    gameCtx.shadowColor = '#ff0000';
    gameCtx.shadowBlur = 15;
    gameCtx.fillStyle = '#ff0000';
    gameCtx.font = 'bold 16px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText('IT', centerX, headY - headRadius - 20);
    gameCtx.restore();
  }

  // Draw cooldown shield if local player is in cooldown
  const now = Date.now();
  if (isTagMode && localTagCooldownUntil > now) {
    drawCooldownShield(centerX, player.y + player.height / 2, localTagCooldownUntil, now);
  }
}

/**
 * Draw a cooldown shield around a player who just got tagged.
 * Shows pie segments that disappear every 0.5 seconds.
 */
function drawCooldownShield(centerX: number, centerY: number, cooldownUntil: number, now: number): void {
  if (!gameCtx) return;

  const timeRemaining = cooldownUntil - now;
  if (timeRemaining <= 0) return;

  const totalSegments = 6; // 6 segments for 3 second cooldown (0.5s each)
  const segmentDuration = TAG_COOLDOWN / totalSegments;
  const segmentsRemaining = Math.ceil(timeRemaining / segmentDuration);

  const radius = 35; // Shield radius around player
  const segmentAngle = (Math.PI * 2) / totalSegments;

  gameCtx.save();

  // Draw remaining pie segments
  for (let i = 0; i < segmentsRemaining; i++) {
    const startAngle = -Math.PI / 2 + (i * segmentAngle); // Start from top
    const endAngle = startAngle + segmentAngle - 0.05; // Small gap between segments

    // Semi-transparent cyan/blue shield color
    gameCtx.fillStyle = 'rgba(0, 200, 255, 0.3)';
    gameCtx.strokeStyle = 'rgba(0, 200, 255, 0.7)';
    gameCtx.lineWidth = 2;

    gameCtx.beginPath();
    gameCtx.moveTo(centerX, centerY);
    gameCtx.arc(centerX, centerY, radius, startAngle, endAngle);
    gameCtx.closePath();
    gameCtx.fill();
    gameCtx.stroke();
  }

  // Draw outer ring
  gameCtx.strokeStyle = 'rgba(0, 200, 255, 0.5)';
  gameCtx.lineWidth = 3;
  gameCtx.beginPath();
  gameCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  gameCtx.stroke();

  gameCtx.restore();
}

function drawAccessories(centerX: number, headY: number, headRadius: number): void {
  if (!gameCtx) return;

  // Reset shadow for accessories
  gameCtx.shadowBlur = 0;

  // Draw hat
  if (playerHat !== 'none') {
    drawHat(centerX, headY, headRadius);
  }

  // Draw face accessory
  if (playerAccessory !== 'none') {
    drawFaceAccessory(centerX, headY, headRadius);
  }
}

function drawHat(centerX: number, headY: number, headRadius: number): void {
  if (!gameCtx) return;

  const topY = headY - headRadius;

  switch (playerHat) {
    case 'cap':
      // Baseball cap
      gameCtx.fillStyle = '#ef4444';
      gameCtx.beginPath();
      gameCtx.ellipse(centerX, topY - 2, headRadius + 2, 5, 0, 0, Math.PI * 2);
      gameCtx.fill();
      // Brim
      gameCtx.fillRect(centerX - 2, topY - 4, headRadius + 8, 4);
      break;

    case 'tophat':
      // Top hat
      gameCtx.fillStyle = '#1a1a1a';
      gameCtx.fillRect(centerX - 7, topY - 18, 14, 16);
      // Brim
      gameCtx.fillRect(centerX - 12, topY - 2, 24, 4);
      break;

    case 'crown':
      // Crown
      gameCtx.fillStyle = '#fbbf24';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 10, topY);
      gameCtx.lineTo(centerX - 10, topY - 8);
      gameCtx.lineTo(centerX - 6, topY - 4);
      gameCtx.lineTo(centerX - 3, topY - 12);
      gameCtx.lineTo(centerX, topY - 6);
      gameCtx.lineTo(centerX + 3, topY - 12);
      gameCtx.lineTo(centerX + 6, topY - 4);
      gameCtx.lineTo(centerX + 10, topY - 8);
      gameCtx.lineTo(centerX + 10, topY);
      gameCtx.closePath();
      gameCtx.fill();
      // Jewels
      gameCtx.fillStyle = '#dc2626';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY - 5, 2, 0, Math.PI * 2);
      gameCtx.fill();
      break;

    case 'beanie':
      // Beanie
      gameCtx.fillStyle = '#3b82f6';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY, headRadius + 1, Math.PI, 0);
      gameCtx.fill();
      // Pom pom
      gameCtx.fillStyle = '#fff';
      gameCtx.beginPath();
      gameCtx.arc(centerX, topY - headRadius - 3, 4, 0, Math.PI * 2);
      gameCtx.fill();
      break;

    case 'party':
      // Party hat
      gameCtx.fillStyle = '#ec4899';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX, topY - 20);
      gameCtx.lineTo(centerX - 10, topY);
      gameCtx.lineTo(centerX + 10, topY);
      gameCtx.closePath();
      gameCtx.fill();
      // Stripes
      gameCtx.strokeStyle = '#fbbf24';
      gameCtx.lineWidth = 2;
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 8, topY - 4);
      gameCtx.lineTo(centerX + 8, topY - 4);
      gameCtx.moveTo(centerX - 5, topY - 10);
      gameCtx.lineTo(centerX + 5, topY - 10);
      gameCtx.stroke();
      gameCtx.lineWidth = 3;
      break;
  }
}

function drawFaceAccessory(centerX: number, headY: number, headRadius: number): void {
  if (!gameCtx) return;

  switch (playerAccessory) {
    case 'glasses':
      // Round glasses
      gameCtx.strokeStyle = '#333';
      gameCtx.lineWidth = 1.5;
      gameCtx.beginPath();
      gameCtx.arc(centerX - 4, headY - 1, 4, 0, Math.PI * 2);
      gameCtx.arc(centerX + 4, headY - 1, 4, 0, Math.PI * 2);
      gameCtx.stroke();
      // Bridge
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 1, headY - 1);
      gameCtx.lineTo(centerX + 1, headY - 1);
      gameCtx.stroke();
      gameCtx.lineWidth = 3;
      break;

    case 'sunglasses':
      // Cool sunglasses
      gameCtx.fillStyle = '#1a1a1a';
      gameCtx.fillRect(centerX - 9, headY - 3, 7, 5);
      gameCtx.fillRect(centerX + 2, headY - 3, 7, 5);
      // Bridge
      gameCtx.fillRect(centerX - 2, headY - 2, 4, 2);
      break;

    case 'mustache':
      // Handlebar mustache
      gameCtx.fillStyle = '#4a3728';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - 8, headY + 3);
      gameCtx.quadraticCurveTo(centerX - 4, headY + 6, centerX, headY + 4);
      gameCtx.quadraticCurveTo(centerX + 4, headY + 6, centerX + 8, headY + 3);
      gameCtx.quadraticCurveTo(centerX + 4, headY + 4, centerX, headY + 3);
      gameCtx.quadraticCurveTo(centerX - 4, headY + 4, centerX - 8, headY + 3);
      gameCtx.fill();
      break;

    case 'beard':
      // Full beard
      gameCtx.fillStyle = '#4a3728';
      gameCtx.beginPath();
      gameCtx.moveTo(centerX - headRadius + 2, headY + 2);
      gameCtx.quadraticCurveTo(centerX - headRadius, headY + 10, centerX, headY + 14);
      gameCtx.quadraticCurveTo(centerX + headRadius, headY + 10, centerX + headRadius - 2, headY + 2);
      gameCtx.quadraticCurveTo(centerX, headY + 6, centerX - headRadius + 2, headY + 2);
      gameCtx.fill();
      break;

    case 'mask':
      // Superhero mask
      gameCtx.fillStyle = '#1a1a1a';
      gameCtx.beginPath();
      gameCtx.ellipse(centerX, headY - 1, headRadius - 1, 4, 0, 0, Math.PI * 2);
      gameCtx.fill();
      // Eye holes
      gameCtx.fillStyle = '#fff';
      gameCtx.beginPath();
      gameCtx.ellipse(centerX - 4, headY - 1, 2.5, 2, 0, 0, Math.PI * 2);
      gameCtx.ellipse(centerX + 4, headY - 1, 2.5, 2, 0, 0, Math.PI * 2);
      gameCtx.fill();
      break;
  }
}

function drawHUD(): void {
  if (!gameCtx) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const now = performance.now();
  const showModeBox = now < modeInfoEndTime;

  gameCtx.save();

  // Only show full HUD box during mode info flash
  if (showModeBox) {
    // HUD background - wider for race mode to show lives
    const hudWidth = playMode === 'race' ? 260 : 180;
    gameCtx.fillStyle = 'rgba(0,0,0,0.8)';
    gameCtx.fillRect(scrollX + 10, scrollY + 10, hudWidth, 70);

    // Mode indicator
    let modeText = 'EXPLORE MODE';
    let modeColor = '#22c55e'; // green
    if (isTagMode) {
      modeText = 'TAG MODE';
      modeColor = '#f97316'; // orange
    } else if (playMode === 'race') {
      modeText = 'RACE MODE';
      modeColor = '#ef4444'; // red
    }
    gameCtx.fillStyle = modeColor;
    gameCtx.font = 'bold 11px sans-serif';
    gameCtx.fillText(modeText, scrollX + 20, scrollY + 25);
  }

  if (playMode === 'race') {
    // Minimal background for timer/lives when mode info has faded
    if (!showModeBox) {
      gameCtx.fillStyle = 'rgba(0,0,0,0.7)';
      gameCtx.fillRect(scrollX + 10, scrollY + 10, 250, 50);
    }

    // Timer
    const timeStr = (raceTime / 1000).toFixed(2);
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 20px monospace';
    const timerText = isCountingDown ? 'Ready...' : raceStarted ? `${timeStr}s` : lives <= 0 ? 'GAME OVER' : `${timeStr}s`;
    gameCtx.fillText(timerText, scrollX + 20, scrollY + (showModeBox ? 48 : 38));

    // Lives display - stick figure icons
    const livesY = showModeBox ? 48 : 38;
    gameCtx.font = '14px sans-serif';
    gameCtx.fillStyle = '#888';
    gameCtx.fillText('Lives:', scrollX + 155, scrollY + livesY);

    for (let i = 0; i < maxLives; i++) {
      const lifeX = scrollX + 200 + i * 20;
      const lifeY = scrollY + (showModeBox ? 40 : 30);

      if (i < lives) {
        // Alive - draw stick figure
        gameCtx.strokeStyle = '#22c55e';
        gameCtx.lineWidth = 2;
        // Head
        gameCtx.beginPath();
        gameCtx.arc(lifeX, lifeY - 6, 4, 0, Math.PI * 2);
        gameCtx.stroke();
        // Body
        gameCtx.beginPath();
        gameCtx.moveTo(lifeX, lifeY - 2);
        gameCtx.lineTo(lifeX, lifeY + 6);
        gameCtx.stroke();
        // Arms
        gameCtx.beginPath();
        gameCtx.moveTo(lifeX - 4, lifeY + 1);
        gameCtx.lineTo(lifeX + 4, lifeY + 1);
        gameCtx.stroke();
        // Legs
        gameCtx.beginPath();
        gameCtx.moveTo(lifeX, lifeY + 6);
        gameCtx.lineTo(lifeX - 3, lifeY + 12);
        gameCtx.moveTo(lifeX, lifeY + 6);
        gameCtx.lineTo(lifeX + 3, lifeY + 12);
        gameCtx.stroke();
      } else {
        // Dead - X'd out
        gameCtx.strokeStyle = '#ef4444';
        gameCtx.lineWidth = 2;
        gameCtx.beginPath();
        gameCtx.moveTo(lifeX - 5, lifeY - 8);
        gameCtx.lineTo(lifeX + 5, lifeY + 8);
        gameCtx.moveTo(lifeX + 5, lifeY - 8);
        gameCtx.lineTo(lifeX - 5, lifeY + 8);
        gameCtx.stroke();
      }
    }

    // Best time - only show during mode info flash
    if (showModeBox && currentCourse.bestTime) {
      gameCtx.fillStyle = '#fbbf24';
      gameCtx.font = '12px monospace';
      gameCtx.fillText(`Best: ${(currentCourse.bestTime / 1000).toFixed(2)}s`, scrollX + 20, scrollY + 66);
    }

    // Game over text
    if (lives <= 0) {
      gameCtx.fillStyle = '#ef4444';
      gameCtx.font = 'bold 14px sans-serif';
      gameCtx.fillText('GAME OVER - Press Play to retry', scrollX + 20, scrollY + (showModeBox ? 100 : 70));
    }
  } else if (isTagMode) {
    // Minimal background for tag status when mode info has faded
    if (!showModeBox) {
      gameCtx.fillStyle = 'rgba(0,0,0,0.7)';
      gameCtx.fillRect(scrollX + 10, scrollY + 10, 200, 30);
    }

    // Tag mode - show who's IT (use helper that handles Firebase fallback)
    const isLocalPlayerIt = isCurrentUserIt();
    const tagTextY = showModeBox ? 48 : 32;

    if (isLocalPlayerIt) {
      gameCtx.fillStyle = '#ff4444';
      gameCtx.font = 'bold 16px sans-serif';
      gameCtx.fillText("You're IT! Tag someone!", scrollX + 20, scrollY + tagTextY);
    } else {
      // Find who is IT - check multiple sources
      let itPlayerName = '';
      let someoneIsIt = false;

      // Method 1: Use tagGameState.itPlayerId (authoritative Firebase source)
      if (tagGameState?.itPlayerId) {
        someoneIsIt = true;
        for (const [id, rp] of otherPlayers) {
          if (id === tagGameState.itPlayerId) {
            itPlayerName = rp.displayName || 'Another player';
            break;
          }
        }
      }

      // Method 2: Check rp.isIt flag in player sync data
      if (!itPlayerName) {
        for (const [, rp] of otherPlayers) {
          if (rp.isIt) {
            itPlayerName = rp.displayName || 'Another player';
            someoneIsIt = true;
            break;
          }
        }
      }

      // Method 3: Check if localIsIt is true (we might be IT but Firebase hasn't synced)
      if (!someoneIsIt && localIsIt) {
        // This shouldn't happen (we'd be in the if branch above), but just in case
        someoneIsIt = true;
      }

      if (itPlayerName) {
        gameCtx.fillStyle = '#22c55e';
        gameCtx.font = 'bold 16px sans-serif';
        gameCtx.fillText('Run! ' + itPlayerName + ' is IT!', scrollX + 20, scrollY + tagTextY);
      } else if (someoneIsIt) {
        // We know someone is IT from Firebase but can't find their name yet
        gameCtx.fillStyle = '#22c55e';
        gameCtx.font = 'bold 16px sans-serif';
        gameCtx.fillText('Run! Someone is IT!', scrollX + 20, scrollY + tagTextY);
      } else {
        gameCtx.fillStyle = '#fff';
        gameCtx.font = '16px sans-serif';
        gameCtx.fillText('Waiting for IT player...', scrollX + 20, scrollY + tagTextY);
      }
    }

    // Only show hint during mode info flash
    if (showModeBox) {
      gameCtx.fillStyle = '#888';
      gameCtx.font = '12px sans-serif';
      gameCtx.fillText('Touch another player to tag them', scrollX + 20, scrollY + 66);
    }
  } else if (showModeBox) {
    // Explore mode - only show during mode info flash
    gameCtx.fillStyle = '#fff';
    gameCtx.font = '16px sans-serif';
    gameCtx.fillText('Explore freely!', scrollX + 20, scrollY + 48);

    gameCtx.fillStyle = '#888';
    gameCtx.font = '12px sans-serif';
    gameCtx.fillText('No timer, unlimited respawns', scrollX + 20, scrollY + 66);
  }

  // Controls hint - only show during mode info flash
  if (showModeBox) {
    gameCtx.fillStyle = '#666';
    gameCtx.font = '11px sans-serif';
    gameCtx.fillText('WASD/Arrows, Space=jump, L=leaderboard', scrollX + 10, scrollY + 95);
  }

  // Notification popup (bottom left)
  drawNotification();
  drawCenteredPopup();
  drawNTBFlash();

  // Countdown overlay (on overlay canvas so it's above foreground)
  if (isCountingDown && overlayCtx) {
    const elapsed = performance.now() - countdownStartTime;
    const remaining = COUNTDOWN_DURATION - elapsed;
    const countNum = remaining > 1000 ? '2' : '1';

    overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    overlayCtx.fillRect(scrollX, scrollY, window.innerWidth, window.innerHeight);

    overlayCtx.fillStyle = '#fff';
    overlayCtx.font = 'bold 120px sans-serif';
    overlayCtx.textAlign = 'center';
    overlayCtx.textBaseline = 'middle';
    overlayCtx.fillText(countNum, scrollX + window.innerWidth / 2, scrollY + window.innerHeight / 2);
    overlayCtx.textBaseline = 'alphabetic';
    overlayCtx.textAlign = 'left';
  }

  gameCtx.restore();
}

function drawNotification(): void {
  if (!overlayCtx || !notification) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Notification popup in bottom left
  const popupWidth = 200;
  const popupHeight = notification.subtext ? 60 : 40;
  const popupX = scrollX + 20;
  const popupY = scrollY + window.innerHeight - popupHeight - 20;

  // Background
  overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  overlayCtx.fillRect(popupX, popupY, popupWidth, popupHeight);

  // Border
  overlayCtx.strokeStyle = notification.text === 'GO!' ? '#22c55e' :
                        notification.text === 'GAME OVER' ? '#ef4444' :
                        notification.text === 'You fell!' ? '#f59e0b' : '#3b82f6';
  overlayCtx.lineWidth = 2;
  overlayCtx.strokeRect(popupX, popupY, popupWidth, popupHeight);

  // Main text
  overlayCtx.fillStyle = '#fff';
  overlayCtx.font = 'bold 16px sans-serif';
  overlayCtx.textAlign = 'center';
  const textY = notification.subtext ? popupY + 22 : popupY + 26;
  overlayCtx.fillText(notification.text, popupX + popupWidth / 2, textY);

  // Subtext
  if (notification.subtext) {
    overlayCtx.fillStyle = '#888';
    overlayCtx.font = '13px sans-serif';
    overlayCtx.fillText(notification.subtext, popupX + popupWidth / 2, popupY + 44);
  }

  overlayCtx.textAlign = 'left';
}

/**
 * Draw centered popup (for onboarding controls hint)
 */
function drawCenteredPopup(): void {
  if (!overlayCtx || !centeredPopup) return;

  const now = performance.now();
  if (now > centeredPopup.endTime) {
    centeredPopup = null;
    return;
  }

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const centerX = scrollX + window.innerWidth / 2;
  const centerY = scrollY + window.innerHeight / 2;

  // Calculate alpha for fade in/out (quick fade in, hold, quick fade out)
  const duration = centeredPopup.endTime - centeredPopup.startTime;
  const elapsed = now - centeredPopup.startTime;
  const progress = elapsed / duration;

  let alpha = 1;
  if (progress < 0.1) {
    alpha = progress / 0.1; // Fade in first 10%
  } else if (progress > 0.8) {
    alpha = (1 - progress) / 0.2; // Fade out last 20%
  }

  overlayCtx.save();
  overlayCtx.globalAlpha = alpha;

  // Draw large centered text with shadow
  overlayCtx.font = 'bold 36px sans-serif';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';

  // Shadow
  overlayCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  overlayCtx.fillText(centeredPopup.text, centerX + 2, centerY + 2);

  // Main text
  overlayCtx.fillStyle = '#ffffff';
  overlayCtx.fillText(centeredPopup.text, centerX, centerY);

  overlayCtx.restore();
}

/**
 * Draw the "No Tag Backs" fullscreen flash overlay.
 */
function drawNTBFlash(): void {
  if (!overlayCtx || performance.now() > ntbFlashEndTime) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const w = window.innerWidth;
  const h = window.innerHeight;

  // Calculate fade based on remaining time
  const remaining = ntbFlashEndTime - performance.now();
  const progress = remaining / NTB_FLASH_DURATION;

  // Flash effect - starts bright, fades out
  const alpha = Math.min(0.7, progress * 0.9);

  // Red flash background
  overlayCtx.save();
  overlayCtx.fillStyle = `rgba(220, 38, 38, ${alpha * 0.3})`;
  overlayCtx.fillRect(scrollX, scrollY, w, h);

  // "NO TAG BACKS" text with glow
  const textAlpha = Math.min(1, progress * 1.5);
  overlayCtx.font = 'bold 72px sans-serif';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';

  // Glow effect
  overlayCtx.shadowColor = '#ff0000';
  overlayCtx.shadowBlur = 30;
  overlayCtx.fillStyle = `rgba(255, 255, 255, ${textAlpha})`;
  overlayCtx.fillText('NO TAG BACKS', scrollX + w / 2, scrollY + h / 2);

  // Second pass for stronger glow
  overlayCtx.shadowBlur = 15;
  overlayCtx.fillText('NO TAG BACKS', scrollX + w / 2, scrollY + h / 2);

  overlayCtx.restore();
}

function drawBuildModeUI(): void {
  if (!gameCtx) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  gameCtx.save();

  // Build mode indicator
  gameCtx.fillStyle = 'rgba(0,0,0,0.8)';
  gameCtx.fillRect(scrollX + 10, scrollY + 10, 200, 35);

  gameCtx.fillStyle = '#22c55e';
  gameCtx.font = 'bold 14px sans-serif';
  gameCtx.fillText('BUILD MODE', scrollX + 20, scrollY + 32);

  gameCtx.fillStyle = '#888';
  gameCtx.font = '12px sans-serif';
  const toolName = buildTool.charAt(0).toUpperCase() + buildTool.slice(1);
  gameCtx.fillText(`Tool: ${toolName}`, scrollX + 115, scrollY + 32);

  gameCtx.restore();
}

// Input handlers
function onKeyDown(e: KeyboardEvent): void {
  if (gameMode !== 'play') return;

  // Don't process keys if in finish modal (typing name) or if typing in an input
  if (showingFinishModal) return;

  // Check if user is typing in an input field (including shadow DOM inputs)
  let activeEl = document.activeElement;
  // If active element is a shadow host, check its shadow root for the actual focused element
  while (activeEl?.shadowRoot?.activeElement) {
    activeEl = activeEl.shadowRoot.activeElement;
  }
  const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable);
  if (isTyping) return;

  keys[e.code] = true;

  // Toggle leaderboard with Tab or L
  if (e.code === 'Tab' || e.code === 'KeyL') {
    e.preventDefault();
    showLeaderboard = !showLeaderboard;
    render();
    return;
  }

  // Prevent scrolling with game keys
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
    e.preventDefault();
  }
}

function onKeyUp(e: KeyboardEvent): void {
  keys[e.code] = false;
}

// Building handlers
let draggingCheckpoint: Checkpoint | null = null;

function findCheckpointAt(x: number, y: number): Checkpoint | null {
  for (const checkpoint of currentCourse.checkpoints) {
    // For rectangular elements, use AABB check
    if (checkpoint.width && checkpoint.height) {
      const left = checkpoint.x - checkpoint.width / 2;
      const right = checkpoint.x + checkpoint.width / 2;
      const top = checkpoint.y - checkpoint.height;
      const bottom = checkpoint.y;
      if (x >= left && x <= right && y >= top && y <= bottom) {
        return checkpoint;
      }
    } else {
      // For flags/points, use distance-based check
      const dist = Math.hypot(x - checkpoint.x, y - checkpoint.y);
      if (dist < 40) return checkpoint;
    }
  }
  return null;
}

function onPointerDown(e: PointerEvent): void {
  if (gameMode !== 'build') return;

  const x = e.pageX;
  const y = e.pageY;

  // Check if clicking on existing checkpoint
  const clickedCheckpoint = findCheckpointAt(x, y);

  if (clickedCheckpoint) {
    // Right-click or shift-click to delete
    if (e.button === 2 || e.shiftKey) {
      currentCourse.checkpoints = currentCourse.checkpoints.filter(c => c.id !== clickedCheckpoint.id);
      saveCourse();
      render();
      return;
    }

    // Start dragging (in select mode or any mode when clicking existing element)
    draggingCheckpoint = clickedCheckpoint;
    if (gameCanvas) gameCanvas.style.cursor = 'grabbing';
    return;
  }

  // In select mode, don't place anything if not clicking on existing element
  if (buildTool === 'select') return;

  // Place new element
  const type = buildTool as Checkpoint['type'];

  // Remove existing start/finish/spawn if placing new one (only one allowed)
  if (type === 'start' || type === 'finish' || type === 'spawn') {
    currentCourse.checkpoints = currentCourse.checkpoints.filter(c => c.type !== type);
  }

  // Calculate order for race elements
  const order = type === 'start' ? 0 :
                type === 'finish' ? 999 :
                type === 'spawn' ? -1 :
                type === 'checkpoint' ? currentCourse.checkpoints.filter(c => c.type === 'checkpoint').length + 1 :
                0; // Game elements don't need order

  // Create the element
  const newElement: Checkpoint = {
    id: generateId(),
    type,
    x,
    y,
    order,
    reached: false,
  };

  // Add size for game elements
  if (type === 'trampoline' || type === 'speedBoost' || type === 'highJump') {
    newElement.width = 60;
    newElement.height = 20;
  } else if (type === 'spike') {
    newElement.width = 60;
    newElement.height = 30;
  }

  currentCourse.checkpoints.push(newElement);

  saveCourse();
  render();
}

function onPointerMove(e: PointerEvent): void {
  if (gameMode !== 'build') return;

  // Handle dragging
  if (draggingCheckpoint) {
    draggingCheckpoint.x = e.pageX;
    draggingCheckpoint.y = e.pageY;
    render();
  }
}

function onPointerUp(_e: PointerEvent): void {
  if (draggingCheckpoint) {
    saveCourse();
    draggingCheckpoint = null;
    if (gameCanvas) gameCanvas.style.cursor = 'crosshair';
  }
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

async function saveCourse(): Promise<void> {
  const pageKey = getPageKey();
  localStorage.setItem(`oo_course_${pageKey}`, JSON.stringify(currentCourse));

  // Also save to cloud if logged in
  if (isLoggedIn()) {
    await saveCourseToCloud(pageKey, currentCourse);
  }

  console.log('[OpenOverlay] Course saved');
}

function loadCourse(): void {
  const pageKey = getPageKey();

  // Try to subscribe to real-time course updates from Firebase
  if (isFirestoreAvailable()) {
    subscribeToCourses(pageKey, (data) => {
      // Update my course from cloud (if exists)
      if (data.myCourse) {
        currentCourse = data.myCourse as Course;
        currentCourse.checkpoints.forEach(c => c.reached = false);
        // Update localStorage
        localStorage.setItem(`oo_course_${pageKey}`, JSON.stringify(currentCourse));
      }

      // Store other users' courses
      otherUsersCourses = data.otherCourses.map(c => ({
        ...c,
        checkpoints: (c.checkpoints || []).map((cp: Checkpoint) => ({ ...cp, reached: false }))
      })) as Course[];

      console.log('[OpenOverlay] Course sync: mine=', currentCourse.checkpoints.length, 'elements, others=', otherUsersCourses.length, 'courses');

      // Re-render if in game mode
      if (gameMode !== 'none') {
        render();
      }
    });
  }

  // Also load from localStorage as initial/fallback
  const data = localStorage.getItem(`oo_course_${pageKey}`);
  if (data) {
    try {
      currentCourse = JSON.parse(data);
      // Reset reached states
      currentCourse.checkpoints.forEach(c => c.reached = false);
      console.log('[OpenOverlay] Course loaded from localStorage:', currentCourse.checkpoints.length, 'checkpoints');
    } catch (e) {
      console.warn('[OpenOverlay] Failed to load course');
    }
  }
}

function getPageKey(): string {
  return btoa(window.location.href).slice(0, 32);
}

// Scoreboard functions
function getScoreboardKey(): string {
  return `oo_scores_${getPageKey()}`;
}

function getTodayStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function loadScores(): ScoreEntry[] {
  const data = localStorage.getItem(getScoreboardKey());
  if (!data) return [];

  try {
    const scores: ScoreEntry[] = JSON.parse(data);
    // Filter to today's scores only
    const todayStart = getTodayStart();
    return scores.filter(s => s.timestamp >= todayStart);
  } catch {
    return [];
  }
}

function saveScore(name: string, time: number): void {
  const scores = loadScores();
  scores.push({
    name,
    time,
    timestamp: Date.now(),
  });

  // Sort by time and keep all for the day
  scores.sort((a, b) => a.time - b.time);

  localStorage.setItem(getScoreboardKey(), JSON.stringify(scores));
  localStorage.setItem('oo_player_name', name);
  playerName = name;
}

function getTopScores(): { top10: ScoreEntry[]; playerBest: ScoreEntry | null; playerRank: number } {
  const scores = loadScores();
  const top10 = scores.slice(0, 10);

  // Find player's best time
  let playerBest: ScoreEntry | null = null;
  let playerRank = -1;

  if (playerName) {
    const playerScores = scores.filter(s => s.name === playerName);
    if (playerScores.length > 0) {
      playerBest = playerScores[0]; // Already sorted, so first is best
      playerRank = scores.findIndex(s => s.name === playerName && s.time === playerBest!.time) + 1;
    }
  }

  return { top10, playerBest, playerRank };
}

// Input element for name entry
let nameInput: HTMLInputElement | null = null;

function createNameInput(): void {
  if (nameInput) return;

  nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Enter your name...';
  nameInput.value = playerName;
  nameInput.maxLength = 20;
  nameInput.style.cssText = `
    position: fixed;
    z-index: 2147483647;
    font-size: 18px;
    padding: 10px 15px;
    border: 2px solid #22c55e;
    border-radius: 8px;
    background: #222;
    color: #fff;
    outline: none;
    width: 200px;
    text-align: center;
  `;

  nameInput.addEventListener('keydown', (e) => {
    e.stopPropagation(); // Prevent game from receiving keys
    if (e.key === 'Enter' && nameInput!.value.trim()) {
      submitScore();
    }
  });

  document.body.appendChild(nameInput);
}

function removeNameInput(): void {
  if (nameInput) {
    nameInput.remove();
    nameInput = null;
  }
}

function submitScore(): void {
  if (!nameInput || !nameInput.value.trim()) return;

  saveScore(nameInput.value.trim(), finishTime);
  showingFinishModal = false;
  showLeaderboard = true;
  removeNameInput();

  if (gameCanvas) {
    gameCanvas.style.pointerEvents = 'none';
  }

  render();

  // Hide leaderboard after 5 seconds
  setTimeout(() => {
    showLeaderboard = false;
    render();
  }, 5000);
}

function drawFinishModal(): void {
  if (!gameCtx || !showingFinishModal) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const centerX = scrollX + window.innerWidth / 2;
  const centerY = scrollY + window.innerHeight / 2;

  // Dimmed background
  gameCtx.fillStyle = 'rgba(0,0,0,0.7)';
  gameCtx.fillRect(scrollX, scrollY, window.innerWidth, window.innerHeight);

  // Modal box
  const modalWidth = 320;
  const modalHeight = 200;
  const modalX = centerX - modalWidth / 2;
  const modalY = centerY - modalHeight / 2;

  gameCtx.fillStyle = '#1a1a1a';
  gameCtx.fillRect(modalX, modalY, modalWidth, modalHeight);
  gameCtx.strokeStyle = '#22c55e';
  gameCtx.lineWidth = 3;
  gameCtx.strokeRect(modalX, modalY, modalWidth, modalHeight);

  // Title
  gameCtx.fillStyle = '#22c55e';
  gameCtx.font = 'bold 24px sans-serif';
  gameCtx.textAlign = 'center';
  gameCtx.fillText('🏆 RACE COMPLETE!', centerX, modalY + 40);

  // Time
  gameCtx.fillStyle = '#fff';
  gameCtx.font = 'bold 32px monospace';
  gameCtx.fillText((finishTime / 1000).toFixed(2) + 's', centerX, modalY + 85);

  // Best time indicator
  if (finishTime === currentCourse.bestTime) {
    gameCtx.fillStyle = '#fbbf24';
    gameCtx.font = 'bold 14px sans-serif';
    gameCtx.fillText('⭐ NEW PERSONAL BEST!', centerX, modalY + 110);
  }

  // Instructions
  gameCtx.fillStyle = '#888';
  gameCtx.font = '14px sans-serif';
  gameCtx.fillText('Enter your name for the leaderboard', centerX, modalY + 140);
  gameCtx.fillText('Press Enter to submit', centerX, modalY + 160);

  // Position input field
  createNameInput();
  if (nameInput) {
    nameInput.style.left = (centerX - 100) + 'px';
    nameInput.style.top = (modalY + 165) + 'px';
    nameInput.focus();
  }
}

function drawLeaderboard(): void {
  if (!gameCtx || !showLeaderboard) return;

  const ctx = gameCtx; // Local reference for closure
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  const { top10, playerBest, playerRank } = getTopScores();

  // Leaderboard panel
  const panelWidth = 280;
  const panelHeight = Math.min(60 + top10.length * 28 + (playerRank > 10 ? 40 : 0), 400);
  const panelX = scrollX + window.innerWidth - panelWidth - 20;
  const panelY = scrollY + 20;

  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  // Title
  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText("🏆 TODAY'S TOP 10", panelX + panelWidth / 2, panelY + 25);

  // Scores
  ctx.font = '14px monospace';
  ctx.textAlign = 'left';

  top10.forEach((score, i) => {
    const y = panelY + 50 + i * 28;
    const isPlayer = score.name === playerName;

    // Rank
    ctx.fillStyle = i < 3 ? ['#fbbf24', '#c0c0c0', '#cd7f32'][i] : '#888';
    ctx.fillText(`${i + 1}.`, panelX + 15, y);

    // Name
    ctx.fillStyle = isPlayer ? '#22c55e' : '#fff';
    ctx.fillText(score.name.slice(0, 12), panelX + 45, y);

    // Time
    ctx.textAlign = 'right';
    ctx.fillText((score.time / 1000).toFixed(2) + 's', panelX + panelWidth - 15, y);
    ctx.textAlign = 'left';
  });

  // Show player's best if not in top 10
  if (playerBest && playerRank > 10) {
    const y = panelY + 55 + top10.length * 28 + 15;
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(panelX + 10, y - 15);
    ctx.lineTo(panelX + panelWidth - 10, y - 15);
    ctx.stroke();

    ctx.fillStyle = '#22c55e';
    ctx.fillText(`${playerRank}.`, panelX + 15, y + 5);
    ctx.fillText(playerBest.name.slice(0, 12), panelX + 45, y + 5);
    ctx.textAlign = 'right';
    ctx.fillText((playerBest.time / 1000).toFixed(2) + 's', panelX + panelWidth - 15, y + 5);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#888';
    ctx.font = '11px sans-serif';
    ctx.fillText('Your best', panelX + 45, y + 20);
  }
}

// Exports for UI
export function clearCourse(): void {
  currentCourse.checkpoints = [];
  currentCourse.bestTime = undefined;
  saveCourse();
  render();
}

export function undoLastElement(): void {
  if (currentCourse.checkpoints.length > 0) {
    currentCourse.checkpoints.pop();
  }
  saveCourse();
  render();
}

export function setBuildTool(tool: string): void {
  buildTool = tool as any;
}

export function setPlayerColor(color: string): void {
  playerColor = color;
  localStorage.setItem('oo_player_color', color);
}

export function getPlayerColor(): string {
  return playerColor;
}

// Tag game exports
export function toggleTagMode(): void {
  console.log('[OpenOverlay] toggleTagMode called, current isTagMode:', isTagMode);
  if (!isTagMode) {
    // Start or join tag game
    isTagMode = true;
    showModeInfo(); // Flash mode info
    const pageKey = getPageKey();
    console.log('[OpenOverlay] Starting/joining tag game on page:', pageKey);

    // Check if any other player is already "it"
    let someoneElseIsIt = false;
    for (const [, rp] of otherPlayers) {
      if (rp.isIt) {
        someoneElseIsIt = true;
        break;
      }
    }

    // If no one else is "it", we become "it"
    localIsIt = !someoneElseIsIt;
    console.log('[OpenOverlay] localIsIt:', localIsIt, 'someoneElseIsIt:', someoneElseIsIt);

    // Dispatch event with initial local state
    document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
      detail: { isTagMode: true, isIt: localIsIt, gameActive: true }
    }));

    // Force immediate sync so other players see our isIt state
    syncPlayerToCloud();
    console.log('[OpenOverlay] Forced sync with isIt:', localIsIt);

    if (localIsIt) {
      showNotification("You're IT!", 'Tag another player!', 2000);
    } else {
      showNotification('Tag Mode!', 'Avoid being tagged!', 2000);
    }

    // Try Firebase (may fail due to permissions - that's ok, we use local state)
    // Note: startTagGame returns false both when joining existing game AND when Firebase fails
    // So we only trust it if it returns true (meaning we definitely became IT via Firebase)
    startTagGame(pageKey).then((isNowIt) => {
      console.log('[OpenOverlay] startTagGame returned:', isNowIt);
      if (isNowIt && !localIsIt) {
        // Firebase says we're IT but local says no - trust Firebase
        localIsIt = true;
        document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
          detail: { isTagMode: true, isIt: true, gameActive: true }
        }));
      }
      // If Firebase returns false, we keep our local state (could be IT or not)
    }).catch((err) => {
      console.log('[OpenOverlay] Firebase unavailable, using local tag state:', localIsIt);
    });
  } else {
    // Leave tag game
    isTagMode = false;
    showModeInfo(); // Flash mode info (back to explore)
    localIsIt = false;
    lastTaggedByPlayerId = null;
    pendingTaggedPlayerId = null;
    pendingTaggedAt = 0;
    console.log('[OpenOverlay] Left tag mode');
    // Dispatch event to update UI
    document.dispatchEvent(new CustomEvent('oo:tagstatechange', {
      detail: { isTagMode: false, isIt: false, gameActive: false }
    }));
    showNotification('Left tag game', '', 1500);
  }
}

export function isInTagMode(): boolean {
  return isTagMode;
}

export function isCurrentPlayerIt(): boolean {
  return isTagMode && isCurrentUserIt();
}
