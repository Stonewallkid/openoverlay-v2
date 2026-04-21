/**
 * Auth Module
 * Handles Firebase Authentication with Google Sign-In for Chrome Extensions
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User,
  Auth
} from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { createUserProfile } from '@/db';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let currentUser: User | null = null;

// Callbacks for auth state changes
const authStateListeners: ((user: User | null) => void)[] = [];

/**
 * Initialize Firebase Auth
 */
export function initAuth(): void {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  auth = getAuth(app);

  // Listen for auth state changes
  firebaseOnAuthStateChanged(auth, async (user) => {
    currentUser = user;
    console.log('[OpenOverlay] Auth state changed:', user?.displayName || 'signed out');

    // Create/update user profile on sign in
    if (user) {
      await createUserProfile(user);
    }

    // Notify all listeners
    authStateListeners.forEach(callback => callback(user));
  });

  console.log('[OpenOverlay] Auth initialized');
}

/**
 * Sign in with Google using Chrome Identity API (via background service worker)
 */
export async function signInWithGoogle(): Promise<User | null> {
  if (!auth) {
    console.error('[OpenOverlay] Auth not initialized');
    return null;
  }

  // Request OAuth token from background service worker
  const response = await new Promise<{ success: boolean; token?: string; error?: string }>((resolve) => {
    chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_IN' }, resolve);
  });

  if (!response.success || !response.token) {
    throw new Error(response.error || 'Failed to get auth token');
  }

  try {
    // Create credential from the token
    const credential = GoogleAuthProvider.credential(null, response.token);

    // Sign in to Firebase with the credential
    const result = await signInWithCredential(auth, credential);
    console.log('[OpenOverlay] Signed in as:', result.user.displayName);
    return result.user;
  } catch (error) {
    console.error('[OpenOverlay] Sign in error:', error);

    // If token is invalid, request removal and retry
    if ((error as any)?.code === 'auth/invalid-credential') {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_OUT' }, () => resolve());
      });
    }
    throw error;
  }
}

/**
 * Sign out
 */
export async function signOut(): Promise<void> {
  if (!auth) return;

  // Remove cached Chrome token via background
  await new Promise<void>((resolve) => {
    chrome.runtime.sendMessage({ type: 'GOOGLE_SIGN_OUT' }, () => resolve());
  });

  await firebaseSignOut(auth);
  console.log('[OpenOverlay] Signed out');
}

/**
 * Get current user
 */
export function getCurrentUser(): User | null {
  return currentUser;
}

/**
 * Listen for auth state changes
 */
export function onAuthStateChanged(callback: (user: User | null) => void): () => void {
  authStateListeners.push(callback);

  // Call immediately with current state
  callback(currentUser);

  // Return unsubscribe function
  return () => {
    const index = authStateListeners.indexOf(callback);
    if (index > -1) {
      authStateListeners.splice(index, 1);
    }
  };
}

/**
 * Check if user is signed in
 */
export function isSignedIn(): boolean {
  return currentUser !== null;
}
