/**
 * Database Module
 * Handles Firestore operations for user profiles, following, and activities
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment,
  Firestore,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { firebaseConfig } from '@/firebase/config';
import { getCurrentUser } from '@/auth';

let db: Firestore | null = null;

// Types
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  bio: string;
  createdAt: Timestamp;
  followersCount: number;
  followingCount: number;
}

export interface Activity {
  id?: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string;
  type: 'drawing' | 'course' | 'annotation';
  pageUrl: string;
  pageTitle: string;
  thumbnail?: string;
  createdAt: Timestamp;
}

/**
 * Initialize Firestore
 */
export function initFirestore(): void {
  let app: FirebaseApp;
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }

  db = getFirestore(app);
  console.log('[OpenOverlay] Firestore initialized');
}

/**
 * Create or update user profile on sign in
 */
export async function createUserProfile(user: User): Promise<void> {
  if (!db) {
    console.error('[OpenOverlay] Firestore not initialized');
    return;
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    // Update existing profile (name/photo may have changed)
    await updateDoc(userRef, {
      displayName: user.displayName || 'Anonymous',
      photoURL: user.photoURL || '',
      email: user.email || '',
    });
    console.log('[OpenOverlay] User profile updated');
  } else {
    // Create new profile
    await setDoc(userRef, {
      uid: user.uid,
      displayName: user.displayName || 'Anonymous',
      email: user.email || '',
      photoURL: user.photoURL || '',
      bio: '',
      createdAt: serverTimestamp(),
      followersCount: 0,
      followingCount: 0,
    });
    console.log('[OpenOverlay] User profile created');
  }
}

/**
 * Get user profile by UID
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;

  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }
  return null;
}

/**
 * Update user's bio
 */
export async function updateBio(bio: string): Promise<void> {
  const user = getCurrentUser();
  if (!db || !user) return;

  const userRef = doc(db, 'users', user.uid);
  await updateDoc(userRef, { bio });
}

/**
 * Follow a user
 */
export async function followUser(targetUid: string): Promise<void> {
  const user = getCurrentUser();
  if (!db || !user || user.uid === targetUid) return;

  // Add to current user's following
  const followingRef = doc(db, 'users', user.uid, 'following', targetUid);
  await setDoc(followingRef, {
    followedAt: serverTimestamp(),
  });

  // Add to target user's followers
  const followerRef = doc(db, 'users', targetUid, 'followers', user.uid);
  await setDoc(followerRef, {
    followedAt: serverTimestamp(),
  });

  // Update counts
  const currentUserRef = doc(db, 'users', user.uid);
  const targetUserRef = doc(db, 'users', targetUid);

  await updateDoc(currentUserRef, {
    followingCount: increment(1),
  });
  await updateDoc(targetUserRef, {
    followersCount: increment(1),
  });

  console.log('[OpenOverlay] Followed user:', targetUid);
}

/**
 * Unfollow a user
 */
export async function unfollowUser(targetUid: string): Promise<void> {
  const user = getCurrentUser();
  if (!db || !user || user.uid === targetUid) return;

  // Remove from current user's following
  const followingRef = doc(db, 'users', user.uid, 'following', targetUid);
  await deleteDoc(followingRef);

  // Remove from target user's followers
  const followerRef = doc(db, 'users', targetUid, 'followers', user.uid);
  await deleteDoc(followerRef);

  // Update counts
  const currentUserRef = doc(db, 'users', user.uid);
  const targetUserRef = doc(db, 'users', targetUid);

  await updateDoc(currentUserRef, {
    followingCount: increment(-1),
  });
  await updateDoc(targetUserRef, {
    followersCount: increment(-1),
  });

  console.log('[OpenOverlay] Unfollowed user:', targetUid);
}

/**
 * Check if current user follows target user
 */
export async function isFollowing(targetUid: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!db || !user) return false;

  const followingRef = doc(db, 'users', user.uid, 'following', targetUid);
  const followingSnap = await getDoc(followingRef);

  return followingSnap.exists();
}

/**
 * Get followers of a user
 */
export async function getFollowers(uid: string, maxResults = 50): Promise<UserProfile[]> {
  if (!db) return [];

  const followersRef = collection(db, 'users', uid, 'followers');
  const q = query(followersRef, orderBy('followedAt', 'desc'), limit(maxResults));
  const snapshot = await getDocs(q);

  const followers: UserProfile[] = [];
  for (const docSnap of snapshot.docs) {
    const profile = await getUserProfile(docSnap.id);
    if (profile) followers.push(profile);
  }

  return followers;
}

/**
 * Get users that a user is following
 */
export async function getFollowing(uid: string, maxResults = 50): Promise<UserProfile[]> {
  if (!db) return [];

  const followingRef = collection(db, 'users', uid, 'following');
  const q = query(followingRef, orderBy('followedAt', 'desc'), limit(maxResults));
  const snapshot = await getDocs(q);

  const following: UserProfile[] = [];
  for (const docSnap of snapshot.docs) {
    const profile = await getUserProfile(docSnap.id);
    if (profile) following.push(profile);
  }

  return following;
}

/**
 * Post an activity (drawing, course, annotation)
 */
export async function postActivity(activity: Omit<Activity, 'id' | 'createdAt' | 'userId' | 'userDisplayName' | 'userPhotoURL'>): Promise<void> {
  const user = getCurrentUser();
  if (!db || !user) return;

  const activitiesRef = collection(db, 'activities');
  const newActivityRef = doc(activitiesRef);

  await setDoc(newActivityRef, {
    ...activity,
    userId: user.uid,
    userDisplayName: user.displayName || 'Anonymous',
    userPhotoURL: user.photoURL || '',
    createdAt: serverTimestamp(),
  });

  console.log('[OpenOverlay] Activity posted:', activity.type);
}

/**
 * Get activities from users the current user follows
 */
export async function getFeed(maxResults = 20): Promise<Activity[]> {
  const user = getCurrentUser();
  if (!db || !user) return [];

  // Get list of users we follow
  const followingRef = collection(db, 'users', user.uid, 'following');
  const followingSnapshot = await getDocs(followingRef);
  const followingUids = followingSnapshot.docs.map(d => d.id);

  // Include own activities
  followingUids.push(user.uid);

  if (followingUids.length === 0) return [];

  // Firestore 'in' query is limited to 10 items, so we may need multiple queries
  const activities: Activity[] = [];
  const chunks = [];

  for (let i = 0; i < followingUids.length; i += 10) {
    chunks.push(followingUids.slice(i, i + 10));
  }

  for (const chunk of chunks) {
    const activitiesRef = collection(db, 'activities');
    const q = query(
      activitiesRef,
      where('userId', 'in', chunk),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );

    const snapshot = await getDocs(q);
    snapshot.docs.forEach(docSnap => {
      activities.push({
        id: docSnap.id,
        ...docSnap.data()
      } as Activity);
    });
  }

  // Sort by createdAt and limit
  activities.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || 0;
    const bTime = b.createdAt?.toMillis?.() || 0;
    return bTime - aTime;
  });

  return activities.slice(0, maxResults);
}

/**
 * Get recent activities from a specific user
 */
export async function getUserActivities(uid: string, maxResults = 20): Promise<Activity[]> {
  if (!db) return [];

  const activitiesRef = collection(db, 'activities');
  const q = query(
    activitiesRef,
    where('userId', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  } as Activity));
}

/**
 * Search users by display name
 */
export async function searchUsers(searchTerm: string, maxResults = 10): Promise<UserProfile[]> {
  if (!db || !searchTerm) return [];

  // Firestore doesn't support full-text search, so we use prefix matching
  const usersRef = collection(db, 'users');
  const q = query(
    usersRef,
    where('displayName', '>=', searchTerm),
    where('displayName', '<=', searchTerm + '\uf8ff'),
    limit(maxResults)
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(docSnap => docSnap.data() as UserProfile);
}

// ============ SOCIAL DRAWING SYNC ============

export interface PageContribution {
  userId: string;
  userDisplayName: string;
  userPhotoURL: string;
  items: string; // JSON stringified array of their drawings
  updatedAt: Timestamp;
}

export interface CombinedDrawings {
  myItems: any[];           // Current user's items (editable)
  otherItems: any[];        // Other users' items (read-only)
  contributors: { userId: string; displayName: string; photoURL: string }[];
}

/**
 * Save current user's drawings to a page (public)
 */
export async function saveDrawingToCloud(pageKey: string, pageUrl: string, items: any[]): Promise<boolean> {
  const user = getCurrentUser();
  if (!db || !user) {
    console.log('[OpenOverlay] Not logged in, skipping cloud save');
    return false;
  }

  try {
    // Save to pageDrawings/{pageKey}/contributors/{userId}
    const contributorRef = doc(db, 'pageDrawings', pageKey, 'contributors', user.uid);
    await setDoc(contributorRef, {
      userId: user.uid,
      userDisplayName: user.displayName || 'Anonymous',
      userPhotoURL: user.photoURL || '',
      pageUrl,
      items: JSON.stringify(items),
      updatedAt: serverTimestamp(),
    });
    console.log('[OpenOverlay] Drawing saved to cloud (public)');
    return true;
  } catch (err) {
    console.error('[OpenOverlay] Failed to save drawing to cloud:', err);
    return false;
  }
}

/**
 * Load ALL users' drawings for a page
 * Returns combined drawings from all contributors
 */
export async function loadDrawingsFromCloud(pageKey: string): Promise<CombinedDrawings | null> {
  if (!db) return null;

  const user = getCurrentUser();

  try {
    const contributorsRef = collection(db, 'pageDrawings', pageKey, 'contributors');
    const snapshot = await getDocs(contributorsRef);

    const myItems: any[] = [];
    const otherItems: any[] = [];
    const contributors: { userId: string; displayName: string; photoURL: string }[] = [];

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data() as PageContribution;
      const items = JSON.parse(data.items || '[]');

      contributors.push({
        userId: data.userId,
        displayName: data.userDisplayName,
        photoURL: data.userPhotoURL,
      });

      if (user && data.userId === user.uid) {
        // Current user's items
        myItems.push(...items);
      } else {
        // Other users' items - tag them with owner info
        items.forEach((item: any) => {
          otherItems.push({
            ...item,
            _ownerId: data.userId,
            _ownerName: data.userDisplayName,
            _readOnly: true,
          });
        });
      }
    });

    console.log('[OpenOverlay] Loaded drawings:', myItems.length, 'mine,', otherItems.length, 'from others');
    return { myItems, otherItems, contributors };
  } catch (err) {
    console.error('[OpenOverlay] Failed to load drawings from cloud:', err);
    return null;
  }
}

/**
 * Delete current user's drawings from a page
 */
export async function deleteDrawingFromCloud(pageKey: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!db || !user) return false;

  try {
    const contributorRef = doc(db, 'pageDrawings', pageKey, 'contributors', user.uid);
    await deleteDoc(contributorRef);
    console.log('[OpenOverlay] Drawing deleted from cloud');
    return true;
  } catch (err) {
    console.error('[OpenOverlay] Failed to delete drawing from cloud:', err);
    return false;
  }
}

/**
 * Check if Firestore is available
 */
export function isFirestoreAvailable(): boolean {
  return db !== null;
}

/**
 * Check if user is logged in
 */
export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}

// ============ REAL-TIME ANNOTATIONS ============

export interface CloudAnnotation {
  id: string;
  pageKey: string;
  text: string;
  anchorSelector: string;
  anchorOffset: number;
  focusSelector: string;
  focusOffset: number;
  comment: string;
  color: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  reactions: { emoji: string; count: number; users: string[] }[];
  replies: { authorId: string; authorName: string; text: string; createdAt: number }[];
}

let annotationUnsubscribe: Unsubscribe | null = null;

/**
 * Save or update an annotation to cloud
 */
export async function saveAnnotationToCloud(pageKey: string, annotation: CloudAnnotation): Promise<boolean> {
  if (!db) {
    console.log('[OpenOverlay] Cannot save annotation: Firestore not initialized');
    return false;
  }

  try {
    const annotationRef = doc(db, 'pageAnnotations', pageKey, 'annotations', annotation.id);
    const dataToSave = {
      ...annotation,
      reactions: annotation.reactions || [],
      replies: annotation.replies || [],
      updatedAt: serverTimestamp(),
    };
    console.log('[OpenOverlay] Saving to Firestore:', annotationRef.path);
    await setDoc(annotationRef, dataToSave, { merge: true });
    console.log('[OpenOverlay] Annotation saved to cloud successfully');
    return true;
  } catch (err: any) {
    console.error('[OpenOverlay] Failed to save annotation:', err?.message || err);
    // Check if it's a permissions error
    if (err?.code === 'permission-denied') {
      console.error('[OpenOverlay] Firestore security rules may need to be updated');
    }
    return false;
  }
}

/**
 * Delete an annotation from cloud
 */
export async function deleteAnnotationFromCloud(pageKey: string, annotationId: string): Promise<boolean> {
  if (!db) return false;

  try {
    const annotationRef = doc(db, 'pageAnnotations', pageKey, 'annotations', annotationId);
    await deleteDoc(annotationRef);
    console.log('[OpenOverlay] Annotation deleted from cloud');
    return true;
  } catch (err) {
    console.error('[OpenOverlay] Failed to delete annotation:', err);
    return false;
  }
}

/**
 * Fetch annotations from cloud (one-time, no real-time)
 * Used as a fallback when subscription fails
 */
export async function fetchAnnotationsFromCloud(pageKey: string): Promise<CloudAnnotation[]> {
  if (!db) return [];

  try {
    const annotationsRef = collection(db, 'pageAnnotations', pageKey, 'annotations');
    const snapshot = await getDocs(annotationsRef);

    const annotations: CloudAnnotation[] = [];
    snapshot.forEach((docSnap) => {
      annotations.push({
        id: docSnap.id,
        ...docSnap.data()
      } as CloudAnnotation);
    });

    // Sort by createdAt client-side to avoid needing Firestore index
    annotations.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    console.log('[OpenOverlay] Fetched', annotations.length, 'annotations from cloud');
    return annotations;
  } catch (error) {
    console.error('[OpenOverlay] Failed to fetch annotations:', error);
    return [];
  }
}

/**
 * Subscribe to real-time annotation updates for a page
 */
export function subscribeToAnnotations(
  pageKey: string,
  callback: (annotations: CloudAnnotation[]) => void
): Unsubscribe | null {
  if (!db) {
    console.log('[OpenOverlay] Cannot subscribe to annotations: Firestore not initialized');
    return null;
  }

  // Unsubscribe from previous page if any
  if (annotationUnsubscribe) {
    annotationUnsubscribe();
  }

  const annotationsRef = collection(db, 'pageAnnotations', pageKey, 'annotations');

  // Use simple query without orderBy to avoid requiring Firestore index
  annotationUnsubscribe = onSnapshot(annotationsRef, (snapshot) => {
    const annotations: CloudAnnotation[] = [];
    snapshot.forEach((docSnap) => {
      annotations.push({
        id: docSnap.id,
        ...docSnap.data()
      } as CloudAnnotation);
    });

    // Sort client-side
    annotations.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    console.log('[OpenOverlay] Real-time update:', annotations.length, 'annotations');
    callback(annotations);
  }, (error) => {
    console.error('[OpenOverlay] Annotation subscription error:', error);
    // Try one-time fetch as fallback
    fetchAnnotationsFromCloud(pageKey).then(callback);
  });

  return annotationUnsubscribe;
}

/**
 * Unsubscribe from annotation updates
 */
export function unsubscribeFromAnnotations(): void {
  if (annotationUnsubscribe) {
    annotationUnsubscribe();
    annotationUnsubscribe = null;
  }
}

/**
 * Add a reply to an annotation
 */
export async function addReplyToAnnotation(
  pageKey: string,
  annotationId: string,
  reply: { authorId: string; authorName: string; text: string; createdAt: number }
): Promise<boolean> {
  if (!db) return false;

  try {
    const annotationRef = doc(db, 'pageAnnotations', pageKey, 'annotations', annotationId);
    const annotationSnap = await getDoc(annotationRef);

    if (!annotationSnap.exists()) return false;

    const data = annotationSnap.data();
    const replies = data.replies || [];
    replies.push(reply);

    await updateDoc(annotationRef, { replies });
    console.log('[OpenOverlay] Reply added');
    return true;
  } catch (err) {
    console.error('[OpenOverlay] Failed to add reply:', err);
    return false;
  }
}

/**
 * Toggle a reaction on an annotation
 */
export async function toggleReactionOnAnnotation(
  pageKey: string,
  annotationId: string,
  emoji: string,
  userId: string
): Promise<boolean> {
  if (!db) return false;

  try {
    const annotationRef = doc(db, 'pageAnnotations', pageKey, 'annotations', annotationId);
    const annotationSnap = await getDoc(annotationRef);

    if (!annotationSnap.exists()) return false;

    const data = annotationSnap.data();
    let reactions = data.reactions || [];

    const existingReaction = reactions.find((r: any) => r.emoji === emoji);

    if (existingReaction) {
      if (existingReaction.users.includes(userId)) {
        // Remove user's reaction
        existingReaction.users = existingReaction.users.filter((u: string) => u !== userId);
        existingReaction.count = existingReaction.users.length;
        if (existingReaction.count === 0) {
          reactions = reactions.filter((r: any) => r.emoji !== emoji);
        }
      } else {
        // Add user's reaction
        existingReaction.users.push(userId);
        existingReaction.count = existingReaction.users.length;
      }
    } else {
      // New reaction
      reactions.push({ emoji, count: 1, users: [userId] });
    }

    await updateDoc(annotationRef, { reactions });
    return true;
  } catch (err) {
    console.error('[OpenOverlay] Failed to toggle reaction:', err);
    return false;
  }
}
