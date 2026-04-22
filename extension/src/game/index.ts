/**
 * Game Module
 * Platformer game with stick figure character and course building
 */

import { getCollisionSurfaces } from '@/canvas';

// Game state
let gameCanvas: HTMLCanvasElement | null = null;
let gameCtx: CanvasRenderingContext2D | null = null;
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
  width: 30,
  height: 50,
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

// Player color
let playerColor = localStorage.getItem('oo_player_color') || '#ffffff';

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


// Game physics
const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const MOVE_SPEED = 5;
const FRICTION = 0.7; // Quick stop when not pressing keys

// Input state
const keys: { [key: string]: boolean } = {};

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
const RESPAWN_DELAY = 2000; // 2 seconds
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

// Player frozen during countdown
let playerFrozen = false;

// Restart button
let restartButton: HTMLButtonElement | null = null;

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
    setGameMode(e.detail.mode, e.detail.tool, e.detail.playmode);
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

  // Listen for player color changes
  document.addEventListener('oo:playercolor', ((e: CustomEvent) => {
    playerColor = e.detail.color;
    localStorage.setItem('oo_player_color', playerColor);
    render(); // Re-render to show new color
  }) as EventListener);

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

  render();
}

function setGameMode(mode: 'none' | 'play' | 'build', tool?: string, newPlayMode?: 'explore' | 'race'): void {
  gameMode = mode;
  if (tool) buildTool = tool as any;
  if (newPlayMode) playMode = newPlayMode;

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

    // Start countdown before player drops
    startCountdown();

    // Hide toolbar
    document.dispatchEvent(new CustomEvent('oo:hidetoolbar'));

    // Start game loop
    startGameLoop();
  } else if (mode === 'build') {
    // Keep game loop running but hide player (will still render checkpoints)
    // Clean up modal/leaderboard/restart button
    showingFinishModal = false;
    showLeaderboard = false;
    removeNameInput();
    removeRestartButton();
    isCountingDown = false;
    playerFrozen = false;
    notification = null;
  } else {
    // Mode is 'none' - keep player visible, keep game running
    showingFinishModal = false;
    showLeaderboard = false;
    removeNameInput();
    removeRestartButton();
    isCountingDown = false;
    playerFrozen = false;
    notification = null;
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

  if (gameMode === 'play') {
    animationId = requestAnimationFrame(gameLoop);
  } else {
    // Clear animationId when loop stops naturally
    animationId = null;
  }
}

function respawnPlayer(): void {
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
  // Position player at spawn point
  respawnPlayer();

  // In explore mode, skip countdown - just drop in immediately
  if (playMode === 'explore') {
    isCountingDown = false;
    playerFrozen = false;
    raceStarted = false; // Ensure race state is off
    showNotification('Explore!', 'No timer, unlimited respawns', 2000);
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

function update(dt: number): void {
  if (gameMode !== 'play') return;

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
        createRestartButton();
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
        // Game over - stop race
        raceStarted = false;
        notification = { text: 'GAME OVER', subtext: 'Press Restart to try again', endTime: performance.now() + 5000 };
        return;
      }
      // Respawn
      isDead = false;
      respawnPlayer();
      notification = null;
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

  // Apply gravity
  player.vy += GRAVITY * dt;

  // Move player
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Get collision surfaces
  const surfaces = getCollisionSurfaces();

  // --- COLLISION DETECTION ---

  // Pass 1: Ceiling collision (when jumping up)
  if (player.vy < 0) {
    for (const surface of surfaces) {
      const playerLeft = player.x;
      const playerRight = player.x + player.width;
      const playerTop = player.y;
      const playerCenterX = player.x + player.width / 2;

      const surfLeft = surface.x;
      const surfRight = surface.x + surface.width;
      const surfBottom = surface.y + surface.height;

      // Check if player's center is horizontally under the surface
      if (playerCenterX < surfLeft || playerCenterX > surfRight) {
        continue;
      }

      // Check if player's head is hitting the bottom of the surface
      const headToSurface = surfBottom - playerTop;
      if (headToSurface >= 0 && headToSurface < 15) {
        // Bump head - stop upward movement
        player.y = surfBottom;
        player.vy = 1; // Start falling
        break;
      }
    }
  }

  // Pass 2: Floor collision (when falling down)
  player.onGround = false;
  let bestFloorY = Infinity;

  for (const surface of surfaces) {
    const playerLeft = player.x;
    const playerRight = player.x + player.width;
    const playerBottom = player.y + player.height;
    const playerCenterX = player.x + player.width / 2;

    const surfLeft = surface.x;
    const surfRight = surface.x + surface.width;
    const surfTop = surface.y;
    const surfBottom = surface.y + surface.height;
    const surfCenterY = surface.y + surface.height / 2;

    // Check horizontal overlap - use some tolerance
    const horizontalOverlap = Math.min(playerRight, surfRight) - Math.max(playerLeft, surfLeft);
    if (horizontalOverlap < 5) continue;

    // Only land when falling down (one-way platform)
    if (player.vy < 0) continue;

    // Player's feet must be near the surface top
    // Allow landing if feet are within range of surface top
    const feetToSurfTop = playerBottom - surfTop;
    if (feetToSurfTop < -5) continue;  // Feet too high above surface
    if (feetToSurfTop > 30) continue;  // Feet too far below surface

    // This is a valid floor - track the highest one
    if (surfTop < bestFloorY) {
      bestFloorY = surfTop;
    }
  }

  // Land on the best floor found
  if (bestFloorY < Infinity) {
    // Check if just landed (wasn't on ground before)
    if (!wasOnGround && Math.abs(player.vx) > 0.5) {
      landingSlideFrames = 8; // Slide for 8 frames
    }
    player.y = bestFloorY - player.height;
    player.vy = 0;
    player.onGround = true;
    player.jumpsRemaining = player.maxJumps;
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

  // Update race time
  if (raceStarted && playMode === 'race') {
    raceTime = performance.now() - raceStartTime;
  }

  // Auto-scroll to follow player
  const viewportCenterY = window.scrollY + window.innerHeight / 2;
  const playerCenterY = player.y + player.height / 2;
  if (Math.abs(playerCenterY - viewportCenterY) > window.innerHeight / 3) {
    window.scrollTo({
      top: playerCenterY - window.innerHeight / 2,
      behavior: 'auto'
    });
  }
}

function checkCheckpoints(): void {
  // Only track checkpoints in race mode
  if (playMode !== 'race') return;

  const totalCheckpoints = currentCourse.checkpoints.filter(c => c.type === 'checkpoint').length;

  for (const checkpoint of currentCourse.checkpoints) {
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

          // Remove restart button on finish
          removeRestartButton();

          // Show finish modal for name entry
          showingFinishModal = true;
          if (gameCanvas) {
            gameCanvas.style.pointerEvents = 'auto';
          }

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
  for (const element of currentCourse.checkpoints) {
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
            handleDeath();
          }
          break;
      }
    }
  }
}

function render(): void {
  if (!gameCtx || !gameCanvas) return;

  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Draw checkpoints and game elements
  for (const checkpoint of currentCourse.checkpoints) {
    drawCheckpoint(checkpoint);
  }

  // Draw player (only in play mode)
  if (gameMode === 'play') {
    drawPlayer();
    drawHUD();
    drawLeaderboard();
    drawFinishModal();
  }

  // Draw build mode indicator
  if (gameMode === 'build') {
    drawBuildModeUI();
  }
}

function drawCheckpoint(checkpoint: Checkpoint): void {
  if (!gameCtx) return;

  const x = checkpoint.x;
  const y = checkpoint.y;

  gameCtx.save();

  if (checkpoint.type === 'start') {
    // Green flag
    const flagColor = checkpoint.reached ? '#86efac' : '#22c55e';

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

    // Label
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 11px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.fillText('START', x, y + 15);

  } else if (checkpoint.type === 'finish') {
    // Checkered flag
    const flagColor = checkpoint.reached ? '#fbbf24' : '#ef4444';

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

    // Checkered pattern
    gameCtx.fillStyle = '#fff';
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) {
          gameCtx.fillRect(x + 5 + i * 8, y - 48 + j * 8, 6, 6);
        }
      }
    }

    // Label
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 11px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.fillText('FINISH', x, y + 15);

  } else if (checkpoint.type === 'spawn') {
    // Spawn point - player silhouette with down arrow
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

function drawPlayer(): void {
  if (!gameCtx) return;

  const x = player.x;
  const y = player.y;
  const w = player.width;
  const h = player.height;

  gameCtx.save();

  // Flip if facing left
  if (!player.facingRight) {
    gameCtx.translate(x + w / 2, 0);
    gameCtx.scale(-1, 1);
    gameCtx.translate(-(x + w / 2), 0);
  }

  // Stick figure dimensions
  const headRadius = 9;
  const bodyLength = 18;
  const limbLength = 14;

  const centerX = x + w / 2;
  const headY = y + headRadius + 3;
  const bodyStartY = headY + headRadius;
  const bodyEndY = bodyStartY + bodyLength;

  gameCtx.strokeStyle = playerColor;
  gameCtx.lineWidth = 3;
  gameCtx.lineCap = 'round';
  gameCtx.lineJoin = 'round';

  // Shadow
  gameCtx.shadowColor = 'rgba(0,0,0,0.3)';
  gameCtx.shadowBlur = 4;
  gameCtx.shadowOffsetX = 2;
  gameCtx.shadowOffsetY = 2;

  // Head
  gameCtx.beginPath();
  gameCtx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  gameCtx.stroke();

  // Marker tip hairstyle - chisel/wedge shape like a real marker nib
  gameCtx.fillStyle = playerColor;
  gameCtx.beginPath();
  // Wide base on left side of head
  gameCtx.moveTo(centerX - 8, headY - headRadius + 1);
  // Flat top edge going right and slightly up
  gameCtx.lineTo(centerX - 4, headY - headRadius - 5);
  // Angled chisel edge sloping down to a point on the right
  gameCtx.lineTo(centerX + 10, headY - headRadius + 4);
  // Back along the head curve
  gameCtx.quadraticCurveTo(centerX, headY - headRadius - 1, centerX - 8, headY - headRadius + 1);
  gameCtx.closePath();
  gameCtx.fill();
  gameCtx.stroke();

  // Eyes
  gameCtx.fillStyle = playerColor;
  gameCtx.beginPath();
  gameCtx.arc(centerX + 3, headY - 1, 2, 0, Math.PI * 2);
  gameCtx.fill();

  // Body
  gameCtx.beginPath();
  gameCtx.moveTo(centerX, bodyStartY);
  gameCtx.lineTo(centerX, bodyEndY);
  gameCtx.stroke();

  // Animation
  const walkCycle = Math.sin(player.animFrame * Math.PI);
  const armSwing = walkCycle * 0.5;
  const legSwing = walkCycle * 0.6;

  // Wave animation for idle
  const waveAngle = isWaving ? Math.sin(waveFrame * 3) * 0.5 : 0;

  // Left arm (waves when idle)
  gameCtx.beginPath();
  gameCtx.moveTo(centerX, bodyStartY + 4);
  if (isWaving) {
    // Waving arm - raised up and waving
    const waveX = centerX - limbLength * Math.cos(-0.8 + waveAngle);
    const waveY = bodyStartY + 4 + limbLength * Math.sin(-0.8 + waveAngle);
    gameCtx.lineTo(waveX, waveY);
  } else {
    gameCtx.lineTo(
      centerX - limbLength * Math.cos(0.6 + armSwing),
      bodyStartY + 4 + limbLength * Math.sin(0.6 + armSwing)
    );
  }
  gameCtx.stroke();

  // Right arm
  gameCtx.beginPath();
  gameCtx.moveTo(centerX, bodyStartY + 4);
  gameCtx.lineTo(
    centerX + limbLength * Math.cos(0.6 - armSwing),
    bodyStartY + 4 + limbLength * Math.sin(0.6 - armSwing)
  );
  gameCtx.stroke();

  // Legs
  if (!player.onGround && player.vy < 0) {
    // Jumping up - legs tucked
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(centerX - 6, bodyEndY + limbLength * 0.7);
    gameCtx.stroke();

    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(centerX + 6, bodyEndY + limbLength * 0.7);
    gameCtx.stroke();
  } else if (!player.onGround) {
    // Falling - legs spread
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(centerX - 10, bodyEndY + limbLength);
    gameCtx.stroke();

    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(centerX + 10, bodyEndY + limbLength);
    gameCtx.stroke();
  } else {
    // Walking/standing - always show both legs spread
    const isWalking = Math.abs(player.vx) > 0.5;
    const legSpread = isWalking ? legSwing * 0.8 : 0.3; // Base spread when standing

    // Left leg
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(
      centerX - limbLength * (isWalking ? Math.sin(legSwing) * 0.8 : 0.3),
      bodyEndY + limbLength * (isWalking ? Math.cos(legSwing * 0.5) : 0.95)
    );
    gameCtx.stroke();

    // Right leg
    gameCtx.beginPath();
    gameCtx.moveTo(centerX, bodyEndY);
    gameCtx.lineTo(
      centerX + limbLength * (isWalking ? Math.sin(legSwing) * 0.8 : 0.3),
      bodyEndY + limbLength * (isWalking ? Math.cos(legSwing * 0.5) : 0.95)
    );
    gameCtx.stroke();
  }

  gameCtx.restore();
}

function drawHUD(): void {
  if (!gameCtx) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  gameCtx.save();

  // HUD background - wider for race mode to show lives
  const hudWidth = playMode === 'race' ? 260 : 180;
  gameCtx.fillStyle = 'rgba(0,0,0,0.8)';
  gameCtx.fillRect(scrollX + 10, scrollY + 10, hudWidth, 70);

  // Mode indicator
  gameCtx.fillStyle = playMode === 'race' ? '#ef4444' : '#22c55e';
  gameCtx.font = 'bold 11px sans-serif';
  gameCtx.fillText(playMode === 'race' ? 'RACE MODE' : 'EXPLORE MODE', scrollX + 20, scrollY + 25);

  if (playMode === 'race') {
    // Timer
    const timeStr = (raceTime / 1000).toFixed(2);
    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 20px monospace';
    const timerText = isCountingDown ? 'Ready...' : raceStarted ? `${timeStr}s` : lives <= 0 ? 'GAME OVER' : `${timeStr}s`;
    gameCtx.fillText(timerText, scrollX + 20, scrollY + 48);

    // Lives display - stick figure icons
    gameCtx.font = '14px sans-serif';
    gameCtx.fillStyle = '#888';
    gameCtx.fillText('Lives:', scrollX + 155, scrollY + 48);

    for (let i = 0; i < maxLives; i++) {
      const lifeX = scrollX + 200 + i * 20;
      const lifeY = scrollY + 40;

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

    // Best time
    if (currentCourse.bestTime) {
      gameCtx.fillStyle = '#fbbf24';
      gameCtx.font = '12px monospace';
      gameCtx.fillText(`Best: ${(currentCourse.bestTime / 1000).toFixed(2)}s`, scrollX + 20, scrollY + 66);
    }

    // Game over text
    if (lives <= 0) {
      gameCtx.fillStyle = '#ef4444';
      gameCtx.font = 'bold 14px sans-serif';
      gameCtx.fillText('GAME OVER - Press Play to retry', scrollX + 20, scrollY + 100);
    }
  } else {
    // Explore mode - just show simple message
    gameCtx.fillStyle = '#fff';
    gameCtx.font = '16px sans-serif';
    gameCtx.fillText('Explore freely!', scrollX + 20, scrollY + 48);

    gameCtx.fillStyle = '#888';
    gameCtx.font = '12px sans-serif';
    gameCtx.fillText('No timer, unlimited respawns', scrollX + 20, scrollY + 66);
  }

  // Controls hint
  gameCtx.fillStyle = '#666';
  gameCtx.font = '11px sans-serif';
  gameCtx.fillText('WASD/Arrows, Space=jump, L=leaderboard', scrollX + 10, scrollY + 95);

  // Notification popup (bottom left)
  drawNotification();

  // Countdown overlay
  if (isCountingDown) {
    const elapsed = performance.now() - countdownStartTime;
    const remaining = COUNTDOWN_DURATION - elapsed;
    const countNum = remaining > 1000 ? '2' : '1';

    gameCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    gameCtx.fillRect(scrollX, scrollY, window.innerWidth, window.innerHeight);

    gameCtx.fillStyle = '#fff';
    gameCtx.font = 'bold 120px sans-serif';
    gameCtx.textAlign = 'center';
    gameCtx.textBaseline = 'middle';
    gameCtx.fillText(countNum, scrollX + window.innerWidth / 2, scrollY + window.innerHeight / 2);
    gameCtx.textBaseline = 'alphabetic';
    gameCtx.textAlign = 'left';
  }

  gameCtx.restore();
}

function drawNotification(): void {
  if (!gameCtx || !notification) return;

  const scrollX = window.scrollX;
  const scrollY = window.scrollY;

  // Notification popup in bottom left
  const popupWidth = 200;
  const popupHeight = notification.subtext ? 60 : 40;
  const popupX = scrollX + 20;
  const popupY = scrollY + window.innerHeight - popupHeight - 20;

  // Background
  gameCtx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  gameCtx.fillRect(popupX, popupY, popupWidth, popupHeight);

  // Border
  gameCtx.strokeStyle = notification.text === 'GO!' ? '#22c55e' :
                        notification.text === 'GAME OVER' ? '#ef4444' :
                        notification.text === 'You fell!' ? '#f59e0b' : '#3b82f6';
  gameCtx.lineWidth = 2;
  gameCtx.strokeRect(popupX, popupY, popupWidth, popupHeight);

  // Main text
  gameCtx.fillStyle = '#fff';
  gameCtx.font = 'bold 16px sans-serif';
  gameCtx.textAlign = 'center';
  const textY = notification.subtext ? popupY + 22 : popupY + 26;
  gameCtx.fillText(notification.text, popupX + popupWidth / 2, textY);

  // Subtext
  if (notification.subtext) {
    gameCtx.fillStyle = '#888';
    gameCtx.font = '13px sans-serif';
    gameCtx.fillText(notification.subtext, popupX + popupWidth / 2, popupY + 44);
  }

  gameCtx.textAlign = 'left';
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

  // Don't process keys if in finish modal (typing name)
  if (showingFinishModal) return;

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

function saveCourse(): void {
  const pageKey = getPageKey();
  localStorage.setItem(`oo_course_${pageKey}`, JSON.stringify(currentCourse));
  console.log('[OpenOverlay] Course saved');
}

function loadCourse(): void {
  const pageKey = getPageKey();
  const data = localStorage.getItem(`oo_course_${pageKey}`);

  if (data) {
    try {
      currentCourse = JSON.parse(data);
      // Reset reached states
      currentCourse.checkpoints.forEach(c => c.reached = false);
      console.log('[OpenOverlay] Course loaded:', currentCourse.checkpoints.length, 'checkpoints');
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
