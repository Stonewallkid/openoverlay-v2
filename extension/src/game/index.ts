/**
 * Game Module
 *
 * Runner game: physics, sprites, courses, leaderboard.
 * Allows users to race across web pages.
 */

import { store } from '@/shared/state';

// Physics constants
const PHYSICS = {
  gravity: 3200,
  maxVx: 360,
  friction: 5800,
  airFriction: 560,
  jumpPower: 800,
  coyoteTime: 120,
  jumpBuffer: 120,
  substeps: 3,
};

// Character sprites
const CHARACTERS = ['stick_guy', 'stick_girl', 'alien', 'robot'] as const;
type Character = typeof CHARACTERS[number];

// Player state
interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  lastGroundTime: number;
  jumpBuffered: boolean;
  jumpBufferTime: number;
}

let player: Player | null = null;
let lastFrameTime = 0;
let animationFrame: number | null = null;

/**
 * Initialize the game system.
 */
export function initGame(): void {
  subscribeToStore();
  setupKeyboardControls();

  console.log('[OpenOverlay] Game initialized');
}

/**
 * Subscribe to store changes.
 */
function subscribeToStore(): void {
  store.subscribeKey('game', (game, prevGame) => {
    if (game.active && !prevGame.active) {
      startGameLoop();
    } else if (!game.active && prevGame.active) {
      stopGameLoop();
    }
  });

  store.subscribeKey('mode', (mode) => {
    if (mode === 'game') {
      spawnPlayer();
    } else if (mode !== 'game') {
      despawnPlayer();
    }
  });
}

/**
 * Setup keyboard controls.
 */
function setupKeyboardControls(): void {
  const keys: Record<string, boolean> = {};

  document.addEventListener('keydown', (e) => {
    keys[e.key] = true;

    if (store.getState().mode === 'game') {
      // Prevent page scrolling
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      // Jump input buffering
      if (e.key === ' ' || e.key === 'ArrowUp') {
        if (player) {
          player.jumpBuffered = true;
          player.jumpBufferTime = performance.now();
        }
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
  });

  // Store keys reference for game loop
  (window as any).__OO_KEYS__ = keys;
}

/**
 * Spawn the player at the top of the viewport.
 */
function spawnPlayer(): void {
  const { game } = store.getState();

  player = {
    x: window.innerWidth / 2,
    y: 100,
    vx: 0,
    vy: 0,
    grounded: false,
    lastGroundTime: 0,
    jumpBuffered: false,
    jumpBufferTime: 0,
  };

  store.setState({
    game: {
      ...game,
      active: true,
      startTime: performance.now(),
    },
  });
}

/**
 * Despawn the player.
 */
function despawnPlayer(): void {
  player = null;

  store.setState({
    game: {
      ...store.getState().game,
      active: false,
    },
  });
}

/**
 * Start the game loop.
 */
function startGameLoop(): void {
  lastFrameTime = performance.now();

  const loop = (time: number) => {
    const dt = Math.min((time - lastFrameTime) / 1000, 0.05); // Cap delta time
    lastFrameTime = time;

    update(dt);
    render();

    animationFrame = requestAnimationFrame(loop);
  };

  animationFrame = requestAnimationFrame(loop);
}

/**
 * Stop the game loop.
 */
function stopGameLoop(): void {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

/**
 * Update physics and game state.
 */
function update(dt: number): void {
  if (!player) return;

  const keys = (window as any).__OO_KEYS__ || {};
  const now = performance.now();

  // Substep physics for stability
  const stepDt = dt / PHYSICS.substeps;

  for (let i = 0; i < PHYSICS.substeps; i++) {
    // Apply gravity
    player.vy += PHYSICS.gravity * stepDt;

    // Horizontal input
    if (keys['ArrowLeft'] || keys['a']) {
      player.vx -= (player.grounded ? PHYSICS.friction : PHYSICS.airFriction) * stepDt;
    }
    if (keys['ArrowRight'] || keys['d']) {
      player.vx += (player.grounded ? PHYSICS.friction : PHYSICS.airFriction) * stepDt;
    }

    // Friction when no input
    if (!keys['ArrowLeft'] && !keys['a'] && !keys['ArrowRight'] && !keys['d']) {
      const friction = player.grounded ? PHYSICS.friction : PHYSICS.airFriction;
      if (player.vx > 0) {
        player.vx = Math.max(0, player.vx - friction * stepDt);
      } else if (player.vx < 0) {
        player.vx = Math.min(0, player.vx + friction * stepDt);
      }
    }

    // Clamp horizontal velocity
    player.vx = Math.max(-PHYSICS.maxVx, Math.min(PHYSICS.maxVx, player.vx));

    // Update position
    player.x += player.vx * stepDt;
    player.y += player.vy * stepDt;

    // Ground collision (simple floor)
    const groundY = window.innerHeight - 50;
    if (player.y >= groundY) {
      player.y = groundY;
      player.vy = 0;
      player.grounded = true;
      player.lastGroundTime = now;
    } else {
      player.grounded = false;
    }

    // Wall collision
    if (player.x < 20) {
      player.x = 20;
      player.vx = 0;
    }
    if (player.x > window.innerWidth - 20) {
      player.x = window.innerWidth - 20;
      player.vx = 0;
    }
  }

  // Jump (with coyote time and input buffer)
  const canJump =
    player.grounded || (now - player.lastGroundTime < PHYSICS.coyoteTime);
  const wantsJump =
    player.jumpBuffered && (now - player.jumpBufferTime < PHYSICS.jumpBuffer);

  if (canJump && wantsJump) {
    player.vy = -PHYSICS.jumpPower;
    player.grounded = false;
    player.jumpBuffered = false;
  }

  // Update elapsed time
  const { game } = store.getState();
  if (game.active) {
    store.setState({
      game: {
        ...game,
        elapsed: now - game.startTime,
      },
    });
  }
}

/**
 * Render the game state.
 */
function render(): void {
  // For now, just update a HUD element
  // Full rendering will be implemented with a dedicated game canvas

  if (!player) return;

  const { game } = store.getState();
  const elapsed = Math.floor(game.elapsed / 10) / 100;

  // Update or create HUD
  let hud = document.getElementById('oo-game-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'oo-game-hud';
    hud.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      z-index: 2147483647;
      pointer-events: none;
    `;
    document.body.appendChild(hud);
  }

  hud.textContent = `Time: ${elapsed.toFixed(2)}s | Character: ${game.character}`;

  // Simple player rendering (temporary - will use proper sprite rendering)
  let sprite = document.getElementById('oo-player-sprite');
  if (!sprite) {
    sprite = document.createElement('div');
    sprite.id = 'oo-player-sprite';
    sprite.style.cssText = `
      position: fixed;
      width: 30px;
      height: 50px;
      background: #22c55e;
      border-radius: 50% 50% 0 0;
      z-index: 2147483646;
      pointer-events: none;
    `;
    document.body.appendChild(sprite);
  }

  sprite.style.left = `${player.x - 15}px`;
  sprite.style.top = `${player.y - 50}px`;
}

/**
 * Clean up game elements when exiting.
 */
function cleanupGame(): void {
  const hud = document.getElementById('oo-game-hud');
  const sprite = document.getElementById('oo-player-sprite');

  hud?.remove();
  sprite?.remove();
}

// Export for external use
export function setCharacter(character: Character): void {
  store.setState({
    game: {
      ...store.getState().game,
      character,
    },
  });
}
