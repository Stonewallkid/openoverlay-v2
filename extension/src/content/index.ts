/**
 * OpenOverlay v2 - Content Script Entry Point
 * Simplified for debugging
 */

import { initUI } from '@/ui';
import { initCanvas } from '@/canvas';
import { initAnnotations } from '@/annotations';
import { initGame } from '@/game';
import { initAuth } from '@/auth';
import { initFirestore } from '@/db';

// Prevent double injection
if ((window as any).__OPENOVERLAY_V2__) {
  console.log('[OpenOverlay] Already injected, skipping');
} else {
  (window as any).__OPENOVERLAY_V2__ = true;

  console.log('[OpenOverlay] v2.0.0 starting...');

  // Simple init - show FAB and canvas
  function init(): void {
    console.log('[OpenOverlay] init() called');
    console.log('[OpenOverlay] document.body exists:', !!document.body);

    // Initialize Firebase (auth + database) - optional, don't block on failure
    try {
      initFirestore();
      initAuth();
    } catch (err) {
      console.warn('[OpenOverlay] Firebase init failed (may be incognito):', err);
      // Continue without Firebase - drawing still works
    }

    // Initialize UI components - these are required
    try {
      initUI();
      initCanvas();
      initAnnotations();
      initGame();
      console.log('[OpenOverlay] Ready!');
    } catch (err) {
      console.error('[OpenOverlay] UI init error:', err);
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
