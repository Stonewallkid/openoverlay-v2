/**
 * OpenOverlay v2 - Content Script Entry Point
 * Simplified for debugging
 */

import { initUI } from '@/ui';
import { initCanvas } from '@/canvas';
import { initAnnotations } from '@/annotations';
import { initGame } from '@/game';

// Prevent double injection
if ((window as any).__OPENOVERLAY_V2__) {
  console.log('[OpenOverlay] Already injected, skipping');
} else {
  (window as any).__OPENOVERLAY_V2__ = true;

  console.log('[OpenOverlay] v2.0.0 starting...');

  // Simple init - show FAB and canvas
  function init(): void {
    try {
      console.log('[OpenOverlay] init() called');
      console.log('[OpenOverlay] document.body exists:', !!document.body);

      initUI();
      initCanvas();
      initAnnotations();
      initGame();

      console.log('[OpenOverlay] Ready!');
    } catch (err) {
      console.error('[OpenOverlay] Init error:', err);
    }
  }

  // Wait for body to exist
  if (document.body) {
    init();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Fallback: wait a bit
    setTimeout(init, 100);
  }
}
