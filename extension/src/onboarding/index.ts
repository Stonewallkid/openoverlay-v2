/**
 * Onboarding Module
 * Smudgy runs onto the page and demonstrates the extension
 */

import { openMenu, getShadowRoot, getQuickExplorePosition, getProfileButtonPosition, highlightProfileButton, setModeExternal } from '@/ui';
import { addExternalStroke } from '@/canvas';

/**
 * Highlight the FAB button during onboarding
 */
function highlightFab(highlight: boolean): void {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return;
  const fab = shadowRoot.querySelector('.fab') as HTMLElement;
  if (fab) {
    if (highlight) {
      fab.style.background = '#22c55e'; // Green
      fab.style.boxShadow = '0 0 20px #22c55e, 0 0 40px #22c55e'; // Glow effect
      fab.style.transform = 'scale(1.1)'; // Slightly bigger
    } else {
      fab.style.background = '';
      fab.style.boxShadow = '';
      fab.style.transform = '';
    }
  }
}

/**
 * Highlight a mini button during onboarding (make it green/active)
 */
function highlightButton(index: number): void {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return;
  const minis = shadowRoot.querySelectorAll('.mini');
  // Clear all highlights first
  minis.forEach(m => m.classList.remove('active'));
  // Highlight the specified button
  if (minis[index]) {
    minis[index].classList.add('active');
  }
}

/**
 * Clear all button highlights
 */
function clearButtonHighlights(): void {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return;
  const minis = shadowRoot.querySelectorAll('.mini');
  minis.forEach(m => m.classList.remove('active'));
  highlightFab(false);
  highlightProfileButton(false);
}

// Storage keys
const STORAGE_KEY = 'oo_onboarding_complete';
const SKIP_KEY = 'oo_onboarding_skipped';
const SESSION_KEY = 'oo_onboarding_shown_this_session';

// Physics constants
const SMUDGY_SPEED = 5;
const GRAVITY = 0.6;
const JUMP_FORCE = -12;
const GROUND_Y_OFFSET = 100; // Distance from bottom of viewport

// Animation timing
const SPEECH_DURATION = 2500;

// Brand colors
const PINK = '#ff69b4';
const DARK_PINK = '#d45a9d';
const WHITE = '#ffffff';
const BLACK = '#000000';

interface OnboardingState {
  step: number;
  smudgyX: number;
  smudgyY: number;
  smudgyVx: number;
  smudgyVy: number;
  onGround: boolean;
  facingRight: boolean;
  animFrame: number;
  speechBubble: string | null;
  speechTimer: number;
  drawnLine: { x: number; y: number }[];
  isComplete: boolean;
  isSkipped: boolean;
  stepTimer: number;
  eyeLookDirection: number; // -1 = left, 0 = center, 1 = right (smooth)
}

let state: OnboardingState = {
  step: 0,
  smudgyX: -50,
  smudgyY: 0,
  smudgyVx: 0,
  smudgyVy: 0,
  onGround: true,
  facingRight: true,
  animFrame: 0,
  speechBubble: null,
  speechTimer: 0,
  drawnLine: [],
  isComplete: false,
  isSkipped: false,
  stepTimer: 0,
  eyeLookDirection: 1, // Start looking right (entering from left)
};

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let skipButton: HTMLDivElement | null = null;
let lastTime = 0;
let groundY = 0;

// Motion line history for trail effect
let motionHistory: { x: number; y: number }[] = [];

/**
 * Check if onboarding should be shown
 */
export function shouldShowOnboarding(): boolean {
  // Already completed or skipped
  if (localStorage.getItem(STORAGE_KEY) === 'true') return false;
  if (localStorage.getItem(SKIP_KEY) === 'true') return false;
  // Already shown this session (for returning user wave)
  if (sessionStorage.getItem(SESSION_KEY) === 'true') return false;
  return true;
}

/**
 * Start the onboarding sequence
 */
export function startOnboarding(): void {
  console.log('[Smudgy] Starting onboarding...');

  // Mark as shown this session
  sessionStorage.setItem(SESSION_KEY, 'true');

  // Calculate ground position
  groundY = window.innerHeight - GROUND_Y_OFFSET;

  // Reset state - start from top center, falling
  state = {
    step: 0,
    smudgyX: window.innerWidth / 2,
    smudgyY: -50, // Start above viewport
    smudgyVx: 0,
    smudgyVy: 2, // Initial falling velocity
    onGround: false,
    facingRight: true,
    animFrame: 0,
    speechBubble: null,
    speechTimer: 0,
    drawnLine: [],
    isComplete: false,
    isSkipped: false,
    stepTimer: 0,
    eyeLookDirection: 0, // Start looking center
  };

  // Reset self-draw line
  selfDrawLine = [];
  selfDrawProgress = 0;
  fullLine = [];

  // Create overlay canvas
  createCanvas();
  createSkipButton();

  // Listen for menu close to mark onboarding complete
  const handleMenuClose = (): void => {
    // Only mark complete if we've gotten past the intro (step > 0)
    if (state.step > 0 && !state.isComplete && !state.isSkipped) {
      console.log('[Smudgy] Menu closed - onboarding complete!');
      localStorage.setItem(STORAGE_KEY, 'true');
      cleanup();
      window.removeEventListener('oo:menuClosed', handleMenuClose);
    }
  };
  window.addEventListener('oo:menuClosed', handleMenuClose);

  // Start animation loop
  lastTime = performance.now();
  requestAnimationFrame(onboardingLoop);
}

/**
 * Create the onboarding canvas overlay
 */
function createCanvas(): void {
  canvas = document.createElement('canvas');
  canvas.id = 'smudgy-onboarding-canvas';
  canvas.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    pointer-events: none;
    z-index: 2147483648;
  `;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  ctx = canvas.getContext('2d');
}

/**
 * Create skip button
 */
function createSkipButton(): void {
  skipButton = document.createElement('div');
  skipButton.id = 'smudgy-skip';
  skipButton.textContent = 'skip intro';
  skipButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    font-family: sans-serif;
    font-size: 12px;
    border-radius: 20px;
    cursor: pointer;
    z-index: 2147483649;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
  skipButton.addEventListener('mouseenter', () => {
    skipButton!.style.opacity = '1';
  });
  skipButton.addEventListener('mouseleave', () => {
    skipButton!.style.opacity = '0.7';
  });
  skipButton.addEventListener('click', () => {
    state.isSkipped = true;
    localStorage.setItem(SKIP_KEY, 'true');
    cleanup();
  });
  document.body.appendChild(skipButton);
}

/**
 * Clean up onboarding elements
 */
function cleanup(): void {
  if (canvas) {
    canvas.remove();
    canvas = null;
    ctx = null;
  }
  if (skipButton) {
    skipButton.remove();
    skipButton = null;
  }
  clearButtonHighlights();
  state.isComplete = true;
}

/**
 * Main animation loop
 */
function onboardingLoop(timestamp: number): void {
  if (state.isComplete || state.isSkipped) return;

  const dt = Math.min((timestamp - lastTime) / 16.67, 3); // Cap delta, normalize to 60fps
  lastTime = timestamp;

  // Update physics
  updateSmudgy(dt);

  // Update step logic
  updateStep(dt);

  // Render
  render();

  // Continue loop
  if (!state.isComplete && !state.isSkipped) {
    requestAnimationFrame(onboardingLoop);
  }
}

/**
 * Update Smudgy physics
 */
function updateSmudgy(dt: number): void {
  // Apply gravity
  if (!state.onGround) {
    state.smudgyVy += GRAVITY * dt;
  }

  // Apply velocity
  state.smudgyX += state.smudgyVx * dt;
  state.smudgyY += state.smudgyVy * dt;

  // Ground collision - only apply during initial steps (before jumping to FAB)
  // Steps 3+ involve jumping to buttons that are below groundY
  if (state.step <= 2 && state.smudgyY >= groundY) {
    state.smudgyY = groundY;
    state.smudgyVy = 0;
    state.onGround = true;
  }

  // Update facing direction
  if (state.smudgyVx > 0.5) state.facingRight = true;
  else if (state.smudgyVx < -0.5) state.facingRight = false;

  // Update eye look direction (smooth turning)
  const isMoving = Math.abs(state.smudgyVx) > 0.5;
  if (isMoving) {
    // When moving, eye looks FORWARD (always +1 in local coords)
    // The context flip handles making it look correct on screen
    state.eyeLookDirection = 1;
  } else {
    // When stopped, slowly turn eye toward center
    // Start from the side we were facing (based on facingRight)
    if (Math.abs(state.eyeLookDirection) === 1) {
      // Just stopped - set initial direction based on which way we were running
      state.eyeLookDirection = state.facingRight ? 1 : -1;
    }
    if (Math.abs(state.eyeLookDirection) > 0.1) {
      state.eyeLookDirection *= 0.98; // Slow turn
    } else {
      state.eyeLookDirection = 0;
    }
  }

  // Update animation frame
  if (Math.abs(state.smudgyVx) > 0.5) {
    state.animFrame = (state.animFrame + 0.2 * dt) % 4;
  } else {
    state.animFrame = 0;
  }

  // Update motion history for trail
  if (Math.abs(state.smudgyVx) > 2) {
    motionHistory.unshift({ x: state.smudgyX, y: state.smudgyY - 25 });
    if (motionHistory.length > 8) motionHistory.pop();
  } else {
    // Fade out trail when stopped
    if (motionHistory.length > 0) motionHistory.pop();
  }

  // Update speech timer
  if (state.speechTimer > 0) {
    state.speechTimer -= dt * 16.67;
    if (state.speechTimer <= 0) {
      state.speechBubble = null;
    }
  }
}

/**
 * Show a speech bubble
 */
function showSpeech(text: string): void {
  state.speechBubble = text;
  state.speechTimer = SPEECH_DURATION;
}

/**
 * Make Smudgy jump
 */
function jump(): void {
  if (state.onGround) {
    state.smudgyVy = JUMP_FORCE;
    state.onGround = false;
  }
}

/**
 * Get FAB button position (3-dot menu)
 */
function getFabPosition(): { x: number; y: number } {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return { x: window.innerWidth - 40, y: window.innerHeight - 40 };

  const fab = shadowRoot.querySelector('.fab') as HTMLElement;
  if (!fab) return { x: window.innerWidth - 40, y: window.innerHeight - 40 };

  const rect = fab.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

/**
 * Get mini button position by index (0=draw, 1=text, 2=game)
 */
function getMiniButtonPosition(index: number): { x: number; y: number } {
  const shadowRoot = getShadowRoot();
  if (!shadowRoot) return { x: window.innerWidth - 40, y: window.innerHeight - 100 - index * 50 };

  const minis = shadowRoot.querySelectorAll('.mini');
  if (!minis[index]) return { x: window.innerWidth - 40, y: window.innerHeight - 100 - index * 50 };

  const rect = (minis[index] as HTMLElement).getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

// Self-drawing line state
let selfDrawLine: { x: number; y: number }[] = [];
let selfDrawProgress = 0;
let fullLine: { x: number; y: number }[] = []; // The complete line path

/**
 * Update onboarding step logic
 * Sequence:
 * 0: Fall from top, land in bottom center
 * 1: Wave hello, say "hi! i'm smudgy!"
 * 2: Run toward FAB, stop near it
 * 3: Wait for menu to open, then jump toward FAB
 * 4: In air, land on FAB (turns green!)
 * 5: Stay on FAB (green), then jump to draw button
 * 6: In air, land on draw button, say "draw here!"
 * 7: Line draws across screen, then jump to profile button
 * 8: In air, land on profile button (turns green!), say sign in message
 * 9: Stay on profile, then jump to quick explore
 * 10: In air, land on quick explore button, say "explore with me!", spawn player
 * 11: Wait for player to land, then cleanup onboarding
 */
function updateStep(dt: number): void {
  state.stepTimer += dt * 16.67;

  const fabPos = getFabPosition();
  const drawBtnPos = getMiniButtonPosition(0);
  const centerX = window.innerWidth / 2;

  switch (state.step) {
    case 0: // Fall from top, land in bottom center
      // Gravity is applied in updateSmudgy, just wait to land
      if (state.onGround && state.stepTimer > 500) {
        state.smudgyVx = 0;
        state.step = 1;
        state.stepTimer = 0;
        showSpeech("hi! i'm smudgy!");
      }
      break;

    case 1: // Wave hello, then run to FAB
      if (state.stepTimer > SPEECH_DURATION) {
        state.step = 2;
        state.stepTimer = 0;
        state.smudgyVx = SMUDGY_SPEED; // Run right toward FAB
      }
      break;

    case 2: // Run toward FAB area and stop near it
      if (state.smudgyX >= fabPos.x - 80) {
        // Stop running, prepare to jump to FAB
        state.smudgyVx = 0;
        state.step = 3;
        state.stepTimer = 0;
        // Open menu before the jump
        openMenu();
      }
      break;

    case 3: // Wait for menu to open, then jump onto FAB
      if (state.stepTimer > 500) {
        // Jump toward FAB
        state.smudgyVy = JUMP_FORCE * 0.6; // Smaller jump
        state.smudgyVx = 3; // Move right toward FAB
        state.onGround = false;
        state.step = 4;
        state.stepTimer = 0;
      }
      break;

    case 4: // In air, landing on FAB
      // Guide toward FAB horizontally
      if (state.smudgyX < fabPos.x - 5) {
        state.smudgyVx = 3;
      } else if (state.smudgyX > fabPos.x + 5) {
        state.smudgyVx = -2;
      } else {
        state.smudgyVx = 0;
      }

      // Debug: log positions every 30 frames
      if (Math.floor(state.stepTimer / 500) !== Math.floor((state.stepTimer - dt * 16.67) / 500)) {
        console.log(`[Smudgy] Step 4: smudgyY=${state.smudgyY.toFixed(0)}, fabPos.y=${fabPos.y.toFixed(0)}, vy=${state.smudgyVy.toFixed(1)}`);
      }

      // Land on FAB when falling and near FAB position
      // FAB center is fabPos.y, so top of FAB is around fabPos.y - 28 (button radius)
      // Smudgy height is ~38, so land when smudgyY reaches fabPos.y - 28 - 5 (some tolerance)
      if (state.smudgyVy > 0 && state.smudgyY >= fabPos.y - 70) {
        // Land on top of FAB
        state.smudgyX = fabPos.x;
        state.smudgyY = fabPos.y - 65; // Stand on top of FAB
        state.smudgyVx = 0;
        state.smudgyVy = 0;
        state.onGround = true;
        state.step = 5;
        state.stepTimer = 0;
        // Highlight the FAB green - VISIBLE!
        highlightFab(true);
        console.log('[Smudgy] Landed on FAB at Y=' + state.smudgyY.toFixed(0) + ', turning green!');
      }
      break;

    case 5: // On FAB (green!), wait then jump to draw button
      // Stay on FAB for 1.5 seconds so user can see it's green
      if (state.stepTimer > 1500) {
        // Clear FAB highlight before jumping
        highlightFab(false);
        // Jump up toward draw button
        state.smudgyVy = JUMP_FORCE * 0.7;
        state.onGround = false;
        state.step = 6;
        state.stepTimer = 0;
      }
      break;

    case 6: // Jumping to draw button
      // Move toward draw button while in air
      const dxDraw = drawBtnPos.x - state.smudgyX;
      if (Math.abs(dxDraw) > 5) {
        state.smudgyVx = dxDraw * 0.1;
      }

      // When falling and past peak, land on draw button
      if (state.smudgyVy > 0 && state.stepTimer > 200) {
        // Land on draw button
        state.smudgyX = drawBtnPos.x;
        state.smudgyY = drawBtnPos.y - 25;
        state.smudgyVx = 0;
        state.smudgyVy = 0;
        state.onGround = true;
        state.step = 7;
        state.stepTimer = 0;
        showSpeech("draw here!");
        // Highlight the draw button (index 0)
        highlightButton(0);
        // Open the draw toolbar
        setModeExternal('draw');

        // Build the full line path upfront (from left side to near FAB)
        selfDrawProgress = 0;
        selfDrawLine = [];
        fullLine = [];
        const lineStartX = 80;
        const lineEndX = fabPos.x - 60;
        const numPoints = 50; // Smooth line with many points
        for (let i = 0; i <= numPoints; i++) {
          fullLine.push({
            x: lineStartX + (lineEndX - lineStartX) * (i / numPoints),
            y: groundY
          });
        }
      }
      break;

    case 7: // On draw button, line draws itself, then jump to profile button
      // Animate the self-drawing line (slower so it's visible)
      selfDrawProgress += dt * 0.025; // ~2.5 seconds to draw fully

      // Show portion of the line based on progress
      const pointsToShow = Math.floor(fullLine.length * Math.min(selfDrawProgress, 1));
      selfDrawLine = fullLine.slice(0, pointsToShow + 1);

      if (state.stepTimer > SPEECH_DURATION && selfDrawProgress >= 1) {
        // Add the line to the real canvas so game Smudgy can land on it
        if (fullLine.length > 1) {
          addExternalStroke(fullLine, PINK, 4);
        }
        // Close the draw toolbar
        setModeExternal('none');
        clearButtonHighlights();
        // Jump toward profile button
        state.smudgyVy = JUMP_FORCE * 0.5;
        state.onGround = false;
        state.step = 8;
        state.stepTimer = 0;
      }
      break;

    case 8: // Jumping to profile button
      const profilePos = getProfileButtonPosition();
      const profileTargetX = profilePos ? profilePos.x : fabPos.x;
      const profileTargetY = profilePos ? profilePos.y : fabPos.y;

      // Move toward profile button while in air
      const dxProfile = profileTargetX - state.smudgyX;
      if (Math.abs(dxProfile) > 5) {
        state.smudgyVx = dxProfile * 0.08;
      }

      // When falling and near profile button position, land on it
      if (state.smudgyVy > 0 && state.smudgyY >= profileTargetY - 60) {
        // Land on profile button
        state.smudgyX = profileTargetX;
        state.smudgyY = profileTargetY - 40;
        state.smudgyVx = 0;
        state.smudgyVy = 0;
        state.onGround = true;
        state.step = 9;
        state.stepTimer = 0;
        // Highlight profile button green
        highlightProfileButton(true);
        showSpeech("sign in for TONS more!");
        console.log('[Smudgy] Landed on profile button!');
      }
      break;

    case 9: // On profile button (green!), wait then jump to explore
      if (state.stepTimer > 2000) {
        // Clear profile highlight
        highlightProfileButton(false);
        // Jump toward quick explore button
        state.smudgyVy = JUMP_FORCE * 0.5;
        state.onGround = false;
        state.step = 10;
        state.stepTimer = 0;
      }
      break;

    case 10: // Jumping to quick explore button
      const quickExplorePos = getQuickExplorePosition();
      const targetX = quickExplorePos ? quickExplorePos.x : fabPos.x;
      const targetY = quickExplorePos ? quickExplorePos.y : fabPos.y - 20;

      // Move toward quick explore button while in air
      const dxQuick = targetX - state.smudgyX;
      if (Math.abs(dxQuick) > 5) {
        state.smudgyVx = dxQuick * 0.08;
      }

      // When falling and near explore button position, land on it
      if (state.smudgyVy > 0 && state.smudgyY >= targetY - 60) {
        // Land on quick explore button
        state.smudgyX = targetX;
        state.smudgyY = targetY - 40;
        state.smudgyVx = 0;
        state.smudgyVy = 0;
        state.onGround = true;
        state.step = 11;
        state.stepTimer = 0;
        showSpeech("explore with me!");
        console.log('[Smudgy] Landed on explore button!');

        // Start game mode - player will fall from sky above the drawn line
        const lineMiddleX = fullLine.length > 0 ? fullLine[Math.floor(fullLine.length / 2)].x : window.innerWidth / 2;
        document.dispatchEvent(new CustomEvent('oo:gamemode', {
          detail: {
            mode: 'play',
            playmode: 'explore',
            spawnPos: { x: lineMiddleX, y: -50 },
            fromOnboarding: true
          }
        }));
      }
      break;

    case 11: // On quick explore button, wait for game Smudgy to fall and land
      // Wait for speech + time for game Smudgy to fall (~1.5 sec)
      if (state.stepTimer > SPEECH_DURATION + 1000) {
        // Game Smudgy should have landed by now - cleanup onboarding Smudgy
        localStorage.setItem(STORAGE_KEY, 'true');
        cleanup();
      }
      break;
  }
}

/**
 * Render everything
 */
function render(): void {
  if (!ctx || !canvas) return;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw the self-drawing ground line (from draw button demo)
  if (selfDrawLine.length > 1) {
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(selfDrawLine[0].x, selfDrawLine[0].y);
    for (let i = 1; i < selfDrawLine.length; i++) {
      ctx.lineTo(selfDrawLine[i].x, selfDrawLine[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw motion lines
  drawMotionLines();

  // Draw Smudgy (wave during step 1 - hello wave)
  drawSmudgy(state.smudgyX, state.smudgyY, state.facingRight, state.animFrame, state.step === 1);

  // Draw speech bubble
  if (state.speechBubble) {
    drawSpeechBubble(state.smudgyX, state.smudgyY - 60, state.speechBubble);
  }
}

/**
 * Draw motion lines trailing behind Smudgy (disabled - was distracting)
 */
function drawMotionLines(): void {
  // Motion lines disabled per user feedback
  return;
}

/**
 * Draw Smudgy character - uses same body as game character but with pink circle face
 */
function drawSmudgy(x: number, y: number, facingRight: boolean, animFrame: number, waving: boolean): void {
  if (!ctx) return;

  ctx.save();

  // Only flip if actually moving left - face forward when stopped
  const isMoving = Math.abs(state.smudgyVx) > 0.5;
  if (isMoving && !facingRight) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  // Same dimensions as game character (scaled 75%)
  const headRadius = 7;
  const bodyLength = 13;
  const limbLength = 11;

  const centerX = x;
  const headY = y - 38 + headRadius + 3;
  const bodyStartY = headY + headRadius;
  const bodyEndY = bodyStartY + bodyLength;

  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  const topOfHead = headY - headRadius;
  const hairWiggle = Math.sin(state.animFrame * Math.PI * 2) * 2;

  // Helper to draw hair stroke with outline (white outside, thin black inside, white core)
  const drawHairStroke = (drawPath: () => void) => {
    // White outline (outermost)
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3.1;
    drawPath();
    ctx.stroke();
    // Thin black inside
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 2.8;
    drawPath();
    ctx.stroke();
    // White core
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2.5;
    drawPath();
    ctx.stroke();
  };

  ctx.lineCap = 'round';

  if (isMoving) {
    // Running: hairs stick up high then curve back slightly
    drawHairStroke(() => {
      ctx.beginPath();
      ctx.moveTo(centerX + 2, topOfHead + 1);
      ctx.bezierCurveTo(
        centerX + 1, topOfHead - 8,
        centerX - 3, topOfHead - 9,
        centerX - 6 + hairWiggle * 0.5, topOfHead - 7
      );
    });

    drawHairStroke(() => {
      ctx.beginPath();
      ctx.moveTo(centerX - 2, topOfHead + 1);
      ctx.bezierCurveTo(
        centerX - 2, topOfHead - 5,
        centerX - 4, topOfHead - 6,
        centerX - 7 + hairWiggle * 0.4, topOfHead - 4
      );
    });
  } else {
    // Standing: mohawk spikes going straight up
    drawHairStroke(() => {
      ctx.beginPath();
      ctx.moveTo(centerX + 1, topOfHead + 1);
      ctx.quadraticCurveTo(centerX + 1, topOfHead - 5, centerX, topOfHead - 9);
    });

    drawHairStroke(() => {
      ctx.beginPath();
      ctx.moveTo(centerX - 2, topOfHead + 2);
      ctx.quadraticCurveTo(centerX - 2, topOfHead - 2, centerX - 2, topOfHead - 5);
    });
  }

  // Now draw head circle (on top of hair)
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Turn off shadow for the pink fill (no pink glow)
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Pink circle - almost fills head
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
  ctx.fill();

  // Darker pink outline around the face
  ctx.strokeStyle = DARK_PINK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius - 1, 0, Math.PI * 2);
  ctx.stroke();

  // Eye cutout position - use signed lookDir so eye is on correct side when stopped
  // Negative lookDir = eye on left, positive = eye on right
  const maxOffset = headRadius - 3;
  let eyeOffsetX = state.eyeLookDirection * maxOffset; // Signed value!

  // Vertical offset - look UP when jumping (almost straight up with slight angle)
  let eyeOffsetY = 0;
  let jumpingEyeXReduction = 1;
  if (!state.onGround) {
    if (state.smudgyVy < -2) {
      eyeOffsetY = -4; // Looking up high while jumping
      jumpingEyeXReduction = 0.3; // Move eye more toward center when looking up
    } else if (state.smudgyVy > 2) {
      eyeOffsetY = 1; // Slight look down when falling
    }
  } else if (Math.abs(state.eyeLookDirection) > 0.3) {
    eyeOffsetY = 1; // Slightly down when looking to the side
  }

  const cutoutRadius = headRadius - 4;

  // Cut out the eye hole using destination-out (transparent hole)
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(centerX + eyeOffsetX * jumpingEyeXReduction, headY + eyeOffsetY, cutoutRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Redraw head outline ON TOP so it covers any cutout bleeding past the edge
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, headY, headRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Helper to draw a line with outline (white outside, black inside, white core)
  const drawLineWithOutline = (x1: number, y1: number, x2: number, y2: number) => {
    // White outline (outermost)
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // Thin black inside
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 3.3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // White core
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  // Stick body with outline
  drawLineWithOutline(centerX, bodyStartY, centerX, bodyEndY);

  // Animation
  const walkCycle = Math.sin(animFrame * Math.PI);
  const isWalking = isMoving;

  // Wave animation
  const waveAngle = waving ? Math.sin(animFrame * 3) * 0.5 : 0;

  // Helper to draw an L-shaped limb with outline (90-degree angle at joint)
  const drawLLimb = (
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

    // White outline (outermost)
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    // Thin black inside
    ctx.strokeStyle = BLACK;
    ctx.lineWidth = 3.3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    // White core
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  };

  const shoulderY = bodyStartY + 4;
  const hipY = bodyEndY;
  const upperArm = 6;
  const forearm = 6;
  const thigh = 6;
  const calf = 7;

  // Arms
  if (waving) {
    const waveSwing = Math.sin(animFrame * 4) * 0.4;
    drawLLimb(centerX, shoulderY, -1.5 + waveSwing, upperArm, forearm, true);
    drawLLimb(centerX, shoulderY, 0.3, upperArm, forearm, false);
  } else if (isWalking) {
    const armSwing = walkCycle * 0.8;
    drawLLimb(centerX, shoulderY, -armSwing * 0.6, upperArm, forearm, true);
    drawLLimb(centerX, shoulderY, armSwing * 0.6, upperArm, forearm, false);
  } else {
    // Standing: arms pointing mostly downward
    drawLLimb(centerX, shoulderY, 0.1, upperArm, forearm, true);
    drawLLimb(centerX, shoulderY, 0.1, upperArm, forearm, false);
  }

  // Legs - simple wiggly sticks with outline
  const legSwing = isWalking ? Math.sin(animFrame * Math.PI) * 8 : 0;

  if (!state.onGround && state.smudgyVy < 0) {
    // Jumping up - legs tucked
    drawLineWithOutline(centerX, hipY, centerX - 3, hipY + limbLength * 0.7);
    drawLineWithOutline(centerX, hipY, centerX + 3, hipY + limbLength * 0.7);
  } else if (!state.onGround) {
    // Falling - legs spread
    drawLineWithOutline(centerX, hipY, centerX - 7, hipY + limbLength);
    drawLineWithOutline(centerX, hipY, centerX + 7, hipY + limbLength);
  } else {
    // Walking or standing - wiggly legs
    drawLineWithOutline(centerX, hipY, centerX - 4 + legSwing, hipY + limbLength);
    drawLineWithOutline(centerX, hipY, centerX + 4 - legSwing, hipY + limbLength);
  }

  ctx.restore();
}

/**
 * Draw speech bubble
 */
function drawSpeechBubble(x: number, y: number, text: string): void {
  if (!ctx) return;

  ctx.save();

  const padding = 12;
  const fontSize = 14;
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
  const textWidth = ctx.measureText(text).width;

  const bubbleWidth = textWidth + padding * 2;
  const bubbleHeight = 28;
  const bubbleX = x - bubbleWidth / 2;
  const bubbleY = y - bubbleHeight;

  // Bubble background
  ctx.fillStyle = WHITE;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;

  // Rounded rectangle
  ctx.beginPath();
  ctx.roundRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight, 8);
  ctx.fill();
  ctx.stroke();

  // Tail pointing down
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(x - 8, bubbleY + bubbleHeight - 1);
  ctx.lineTo(x, bubbleY + bubbleHeight + 10);
  ctx.lineTo(x + 8, bubbleY + bubbleHeight - 1);
  ctx.fill();

  // Tail outline
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.moveTo(x - 8, bubbleY + bubbleHeight);
  ctx.lineTo(x, bubbleY + bubbleHeight + 10);
  ctx.lineTo(x + 8, bubbleY + bubbleHeight);
  ctx.stroke();

  // Cover the line where tail meets bubble
  ctx.fillStyle = WHITE;
  ctx.fillRect(x - 9, bubbleY + bubbleHeight - 2, 18, 4);

  // Text
  ctx.fillStyle = '#333';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, bubbleY + bubbleHeight / 2);

  ctx.restore();
}

/**
 * Quick wave for returning users
 */
export function showReturningUserWave(): void {
  // Only show once per session
  if (sessionStorage.getItem(SESSION_KEY) === 'true') return;
  sessionStorage.setItem(SESSION_KEY, 'true');

  console.log('[Smudgy] Welcome back wave');

  // Create small canvas near FAB
  const waveCanvas = document.createElement('canvas');
  waveCanvas.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 60px;
    width: 80px;
    height: 80px;
    pointer-events: none;
    z-index: 2147483645;
  `;
  waveCanvas.width = 80;
  waveCanvas.height = 80;
  document.body.appendChild(waveCanvas);

  const waveCtx = waveCanvas.getContext('2d');
  if (!waveCtx) return;

  let frame = 0;
  const waveLoop = (): void => {
    frame++;
    waveCtx.clearRect(0, 0, 80, 80);

    // Fade in/out
    const alpha = frame < 30 ? frame / 30 : frame > 90 ? (120 - frame) / 30 : 1;
    waveCtx.globalAlpha = alpha;

    // Draw tiny waving Smudgy (same style as game character)
    const waveAnim = Math.sin(frame * 0.15) * 0.5;

    waveCtx.strokeStyle = WHITE;
    waveCtx.lineWidth = 2.5;
    waveCtx.lineCap = 'round';
    waveCtx.lineJoin = 'round';

    // Shadow
    waveCtx.shadowColor = 'rgba(0,0,0,0.3)';
    waveCtx.shadowBlur = 3;
    waveCtx.shadowOffsetX = 1;
    waveCtx.shadowOffsetY = 1;

    // Head circle (outline only)
    waveCtx.beginPath();
    waveCtx.arc(40, 25, 8, 0, Math.PI * 2);
    waveCtx.stroke();

    // Pink circle - almost fills head
    waveCtx.fillStyle = PINK;
    waveCtx.beginPath();
    waveCtx.arc(40, 25, 7, 0, Math.PI * 2);
    waveCtx.fill();

    // Cut out eye hole (transparent) - centered since standing still
    waveCtx.save();
    waveCtx.globalCompositeOperation = 'destination-out';
    waveCtx.beginPath();
    waveCtx.arc(40, 25, 4, 0, Math.PI * 2);
    waveCtx.fill();
    waveCtx.restore();

    // Body
    waveCtx.beginPath();
    waveCtx.moveTo(40, 33);
    waveCtx.lineTo(40, 48);
    waveCtx.stroke();

    // Waving arm (left)
    const waveX = 40 - 10 * Math.cos(-0.8 + waveAnim);
    const waveY = 37 + 10 * Math.sin(-0.8 + waveAnim);
    waveCtx.beginPath();
    waveCtx.moveTo(40, 37);
    waveCtx.lineTo(waveX, waveY);
    waveCtx.stroke();

    // Other arm (right)
    waveCtx.beginPath();
    waveCtx.moveTo(40, 37);
    waveCtx.lineTo(48, 44);
    waveCtx.stroke();

    // Legs (standing)
    waveCtx.beginPath();
    waveCtx.moveTo(40, 48);
    waveCtx.lineTo(36, 60);
    waveCtx.stroke();
    waveCtx.beginPath();
    waveCtx.moveTo(40, 48);
    waveCtx.lineTo(44, 60);
    waveCtx.stroke();

    if (frame < 120) {
      requestAnimationFrame(waveLoop);
    } else {
      waveCanvas.remove();
    }
  };

  requestAnimationFrame(waveLoop);
}
