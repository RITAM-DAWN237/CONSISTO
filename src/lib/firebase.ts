// Firebase initialisation.
// The web config below is a *public* client identifier (not a secret). Security is enforced by
// Firebase Authentication + the Firestore security rules in /firestore.rules.
// You may override any value with VITE_FIREBASE_* environment variables (e.g. on Netlify).
import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import { getAnalytics, isSupported, type Analytics } from 'firebase/analytics';
import { isInIframe } from './utils';

const env = import.meta.env;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyBAoib19OJ-PMhUpgoih19P6ZVu2Ip6-N4',
  // Optional: set VITE_FIREBASE_AUTH_DOMAIN to your own site domain (together with the /__/auth proxy in
  // netlify.toml) for the most reliable Google sign-in on browsers that block third-party storage.
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'consisto-5714a.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'consisto-5714a',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'consisto-5714a.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '785935606631',
  appId: env.VITE_FIREBASE_APP_ID || '1:785935606631:web:15ea40b507bb337563c5c2',
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || 'G-Z8WGZ2N4GW',
};

export const app = getApps()[0] ?? initializeApp(firebaseConfig);
export const auth = getAuth(app);
// Google's account chooser and Firebase auth emails follow the browser language.
auth.useDeviceLanguage();

// Firestore with an IndexedDB-backed offline cache. Writes made offline are queued and
// synchronised automatically when connectivity returns.
let firestore: Firestore;
try {
  firestore = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  try {
    // IndexedDB persistence unavailable → in-memory cache (still syncs while online).
    firestore = initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: memoryLocalCache() });
  } catch {
    // Already initialised (e.g. dev hot-reload) → reuse the existing instance.
    firestore = getFirestore(app);
  }
}
export const db = firestore;

export let analytics: Analytics | null = null;
isSupported()
  .then((ok) => {
    if (ok) analytics = getAnalytics(app);
  })
  .catch(() => {
    /* analytics blocked or unsupported — ignore */
  });

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/missing-email': 'Please enter your email address.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in instead.',
  'auth/weak-password': 'Password is too weak — use at least 8 characters with letters and numbers.',
  'auth/missing-password': 'Please enter your password.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/requires-recent-login': 'For security, please confirm your identity again.',
  'auth/configuration-not-found':
    'Firebase Authentication is not set up yet. Open Firebase Console → Authentication and click "Get started".',
  // Google / OAuth
  'auth/popup-closed-by-user': 'The Google window was closed before sign-in finished.',
  'auth/cancelled-popup-request': 'A sign-in window is already open.',
  'auth/web-storage-unsupported':
    'Your browser is blocking the storage sign-in needs (private mode or blocked cookies). Allow cookies for this site and try again.',
  'auth/operation-not-supported-in-this-environment':
    'Google sign-in is not supported in this browser. Open CONSISTO in Chrome, Edge, Firefox or Safari.',
  'auth/credential-already-in-use': 'That Google account is already connected to a different CONSISTO account.',
  'auth/provider-already-linked': 'Google is already connected to your account.',
  'auth/no-such-provider': 'That sign-in method is not connected to your account.',
  'auth/user-mismatch': 'Please confirm with the same Google account that is connected to CONSISTO.',
  'auth/account-exists-with-different-credential':
    'An account with this email already exists. Sign in with your password to connect Google.',
  'auth/internal-error': 'Sign-in failed unexpectedly. Make sure cookies are allowed for this site and try again.',
  'auth/timeout': 'Sign-in timed out. Please try again.',
};

export type AuthMethod = 'password' | 'google';

export function authErrorMessage(err: unknown, method: AuthMethod = 'password'): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/operation-not-allowed') {
    return method === 'google'
      ? 'Google sign-in is not enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method → Google.'
      : 'Email/password sign-in is not enabled for this Firebase project. Enable it in Firebase Console → Authentication → Sign-in method.';
  }
  if (code === 'auth/unauthorized-domain') {
    return `This domain (${window.location.hostname}) is not authorised for Google sign-in. Add it in Firebase Console → Authentication → Settings → Authorised domains.`;
  }
  if (code === 'auth/popup-blocked') {
    return isInIframe()
      ? 'Pop-ups are blocked in this embedded preview. Open CONSISTO in its own browser tab to use Google sign-in.'
      : 'Your browser blocked the Google sign-in pop-up. Allow pop-ups for this site and try again.';
  }
  return AUTH_ERRORS[code] ?? (err as Error)?.message?.replace('Firebase: ', '') ?? 'Something went wrong. Please try again.';
}
