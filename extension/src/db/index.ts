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
  serverTimestamp,
  increment,
  Firestore,
  Timestamp
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
