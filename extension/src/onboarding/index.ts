/**
 * Onboarding Module
 * Smudgy runs onto the page and demonstrates the extension
 */

import { openMenu, setModeExternal, getShadowRoot } from '@/ui';

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
const WHITE = '#ffffff';

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

  // Reset state
  state = {
    step: 0,
    smudgyX: -50,
    smudgyY: groundY,
    smudgyVx: SMUDGY_SPEED,
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
  };

  // Create overlay canvas
  createCanvas();
  createSkipButton();

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
    z-index: 2147483645;
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
    z-index: 2147483646;
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

  // Ground collision
  if (state.smudgyY >= groundY) {
    state.smudgyY = groundY;
    state.smudgyVy = 0;
    state.onGround = true;
  }

  // Update facing direction
  if (state.smudgyVx > 0.5) state.facingRight = true;
  else if (state.smudgyVx < -0.5) state.facingRight = false;

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
 * Get FAB button position
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
 * Update onboarding step logic
 */
function updateStep(dt: number): void {
  state.stepTimer += dt * 16.67;

  const fabPos = getFabPosition();
  const targetX = fabPos.x - 60; // Stand to the left of FAB

  switch (state.step) {
    case 0: // Run in from left toward FAB
      if (state.smudgyX < targetX) {
        state.smudgyVx = SMUDGY_SPEED;
      } else {
        state.smudgyVx = 0;
        state.smudgyX = targetX;
        state.step = 1;
        state.stepTimer = 0;
        showSpeech("hi! i'm smudgy");
      }
      break;

    case 1: // Wait for speech, then jump to FAB
      if (state.stepTimer > SPEECH_DURATION) {
        state.step = 2;
        state.stepTimer = 0;
        jump();
        state.smudgyVx = 2; // Move toward FAB while jumping
      }
      break;

    case 2: // Land near FAB, open menu
      if (state.onGround && state.stepTimer > 500) {
        state.smudgyVx = 0;
        openMenu();
        state.step = 3;
        state.stepTimer = 0;
        showSpeech("let's draw!");
      }
      break;

    case 3: // Wait, then activate draw mode
      if (state.stepTimer > SPEECH_DURATION) {
        setModeExternal('draw');
        state.step = 4;
        state.stepTimer = 0;
        // Start running left while "drawing"
        state.smudgyVx = -SMUDGY_SPEED;
        state.drawnLine = [{ x: state.smudgyX, y: state.smudgyY }];
      }
      break;

    case 4: // Run across screen drawing a line
      // Add points to the drawn line
      state.drawnLine.push({ x: state.smudgyX, y: state.smudgyY });

      if (state.smudgyX < 100) {
        state.smudgyVx = 0;
        state.step = 5;
        state.stepTimer = 0;
        // Jump up
        jump();
      }
      break;

    case 5: // Jump off edge, then fall and land on the line
      // Move back right
      state.smudgyVx = SMUDGY_SPEED;

      // Check if we should land on our drawn line
      if (state.smudgyY >= groundY - 10 && state.smudgyVy > 0) {
        // Land on line
        state.onGround = true;
        state.smudgyVy = 0;
        state.step = 6;
        state.stepTimer = 0;
        showSpeech("draw platforms!");
      }
      break;

    case 6: // Walk on the line back to center
      if (state.smudgyX > window.innerWidth / 2) {
        state.smudgyVx = 0;
        state.step = 7;
        state.stepTimer = 0;
      }
      break;

    case 7: // Pause, then wave goodbye
      if (state.stepTimer > 1000) {
        showSpeech("your turn!");
        state.step = 8;
        state.stepTimer = 0;
      }
      break;

    case 8: // Wave animation, then fade out
      if (state.stepTimer > SPEECH_DURATION + 1000) {
        // Mark complete
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

  // Draw the demo line (what Smudgy "drew")
  if (state.drawnLine.length > 1) {
    ctx.save();
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(state.drawnLine[0].x, state.drawnLine[0].y);
    for (let i = 1; i < state.drawnLine.length; i++) {
      ctx.lineTo(state.drawnLine[i].x, state.drawnLine[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw motion lines
  drawMotionLines();

  // Draw Smudgy
  drawSmudgy(state.smudgyX, state.smudgyY, state.facingRight, state.animFrame, state.step === 8);

  // Draw speech bubble
  if (state.speechBubble) {
    drawSpeechBubble(state.smudgyX, state.smudgyY - 60, state.speechBubble);
  }
}

/**
 * Draw motion lines trailing behind Smudgy
 */
function drawMotionLines(): void {
  if (!ctx || motionHistory.length < 2) return;

  ctx.save();
  ctx.strokeStyle = PINK;
  ctx.lineCap = 'round';

  for (let i = 0; i < motionHistory.length - 1; i++) {
    const alpha = 1 - (i / motionHistory.length);
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 3 - (i * 0.3);

    ctx.beginPath();
    ctx.moveTo(motionHistory[i].x - 15, motionHistory[i].y - 5 + (i * 2));
    ctx.lineTo(motionHistory[i].x - 30 - (i * 5), motionHistory[i].y - 5 + (i * 2));
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draw Smudgy character
 */
function drawSmudgy(x: number, y: number, facingRight: boolean, animFrame: number, waving: boolean): void {
  if (!ctx) return;

  ctx.save();

  const headY = y - 35;
  const bodyY = y - 20;

  // Calculate walk cycle
  const walkCycle = Math.sin(animFrame * Math.PI * 0.5);

  // Head - white circle with black outline
  ctx.fillStyle = WHITE;
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, headY, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // C-shaped pink element (the distinctive Smudgy eye/mouth)
  ctx.fillStyle = PINK;
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  if (facingRight) {
    // Pink C on the right side of face
    ctx.beginPath();
    ctx.arc(x + 2, headY, 6, -Math.PI * 0.5, Math.PI * 0.5, false);
    ctx.stroke();
  } else {
    // Pink C on the left side of face (flipped)
    ctx.beginPath();
    ctx.arc(x - 2, headY, 6, Math.PI * 0.5, -Math.PI * 0.5, false);
    ctx.stroke();
  }

  // Body
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, headY + 12);
  ctx.lineTo(x, bodyY + 15);
  ctx.stroke();

  // Arms
  const armSwing = walkCycle * 0.4;
  const leftArmAngle = waving ? -Math.PI * 0.7 + Math.sin(animFrame * 2) * 0.3 : -Math.PI * 0.3 + armSwing;
  const rightArmAngle = waving ? -Math.PI * 0.3 : -Math.PI * 0.7 - armSwing;

  // Left arm
  ctx.beginPath();
  ctx.moveTo(x, bodyY);
  ctx.lineTo(x + Math.cos(leftArmAngle) * 12, bodyY + Math.sin(leftArmAngle) * 12 + 12);
  ctx.stroke();

  // Right arm
  ctx.beginPath();
  ctx.moveTo(x, bodyY);
  ctx.lineTo(x + Math.cos(rightArmAngle) * 12, bodyY + Math.sin(rightArmAngle) * 12 + 12);
  ctx.stroke();

  // Legs
  const legSwing = walkCycle * 0.5;
  const legY = bodyY + 15;

  // Left leg
  ctx.beginPath();
  ctx.moveTo(x, legY);
  ctx.lineTo(x - 6 + legSwing * 4, y);
  ctx.stroke();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(x, legY);
  ctx.lineTo(x + 6 - legSwing * 4, y);
  ctx.stroke();

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

    // Draw tiny waving Smudgy
    const waveAnim = Math.sin(frame * 0.2) * 0.3;

    // Head
    waveCtx.fillStyle = WHITE;
    waveCtx.strokeStyle = '#333';
    waveCtx.lineWidth = 1.5;
    waveCtx.beginPath();
    waveCtx.arc(40, 30, 10, 0, Math.PI * 2);
    waveCtx.fill();
    waveCtx.stroke();

    // Pink C
    waveCtx.strokeStyle = PINK;
    waveCtx.lineWidth = 2;
    waveCtx.beginPath();
    waveCtx.arc(42, 30, 5, -Math.PI * 0.5, Math.PI * 0.5);
    waveCtx.stroke();

    // Body
    waveCtx.strokeStyle = WHITE;
    waveCtx.lineWidth = 2;
    waveCtx.beginPath();
    waveCtx.moveTo(40, 40);
    waveCtx.lineTo(40, 55);
    waveCtx.stroke();

    // Waving arm
    waveCtx.beginPath();
    waveCtx.moveTo(40, 45);
    waveCtx.lineTo(50 + waveAnim * 5, 35 + waveAnim * 3);
    waveCtx.stroke();

    // Other arm
    waveCtx.beginPath();
    waveCtx.moveTo(40, 45);
    waveCtx.lineTo(32, 52);
    waveCtx.stroke();

    // Legs
    waveCtx.beginPath();
    waveCtx.moveTo(40, 55);
    waveCtx.lineTo(35, 70);
    waveCtx.moveTo(40, 55);
    waveCtx.lineTo(45, 70);
    waveCtx.stroke();

    if (frame < 120) {
      requestAnimationFrame(waveLoop);
    } else {
      waveCanvas.remove();
    }
  };

  requestAnimationFrame(waveLoop);
}
