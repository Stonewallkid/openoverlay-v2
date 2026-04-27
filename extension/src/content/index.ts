/**
 * OpenOverlay v2 - Content Script Entry Point
 * Simplified for debugging
 */

import { initUI, showInviteCodeModal } from '@/ui';
import { initCanvas } from '@/canvas';
import { initAnnotations } from '@/annotations';
import { initGame } from '@/game';
import { initAuth } from '@/auth';
import { initFirestore, hasValidatedInviteCode } from '@/db';
import { shouldShowOnboarding, startOnboarding, showReturningUserWave, loadOnboardingState } from '@/onboarding';

// Feature flag: Set to true to require invite codes
const REQUIRE_INVITE_CODE = false;

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

      // Trigger onboarding/invite code check after a short delay
      setTimeout(async () => {
        // Load onboarding state from chrome.storage.local first
        await loadOnboardingState();

        // Check if invite code is required
        if (REQUIRE_INVITE_CODE) {
          const hasCode = await hasValidatedInviteCode();
          if (!hasCode) {
            // Show invite code modal first
            showInviteCodeModal(() => {
              // After successful code entry, show onboarding if needed
              if (shouldShowOnboarding()) {
                startOnboarding();
              }
            });
            return;
          }
        }

        // No invite code required or already validated
        if (shouldShowOnboarding()) {
          startOnboarding();
        } else {
          // Show quick wave for returning users
          showReturningUserWave();
        }
      }, 1500);
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
