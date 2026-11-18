// Authentication: email/password + Google (Firebase Auth), account linking and account management.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  getRedirectResult,
  GoogleAuthProvider,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  unlink,
  updatePassword,
  updateProfile,
  type AuthError,
  type OAuthCredential,
  type User,
} from 'firebase/auth';
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { auth, authErrorMessage, db } from '../lib/firebase';
import { isInIframe } from '../lib/utils';
import { DEFAULT_PREFS } from '../constants';
import { useUI } from './UIContext';

export const USER_SUBCOLLECTIONS = ['tasks', 'completions', 'notes', 'categories', 'notifications', 'achievements', 'statistics'];

export function newUserDoc(name: string, email: string, photoURL: string | null = null) {
  return {
    displayName: name,
    email,
    photoData: null,
    photoURL,
    createdAtMs: Date.now(),
    stats: { totalCompletions: 0, longestStreak: 0 },
    prefs: DEFAULT_PREFS,
  };
}

/** Outcome of a Google sign-in attempt. */
export type GoogleResult = 'signed-in' | 'redirecting' | 'cancelled' | 'link-required';

/** A Google sign-in that hit an existing email/password account and is waiting to be linked. */
export interface PendingLink {
  email: string | null;
  /** false when Firebase returned no credential we can link automatically */
  canLink: boolean;
}

const CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']);
const REDIRECT_FALLBACK = new Set(['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment']);

export const errorCode = (e: unknown): string => (e as { code?: string })?.code ?? '';
export const isCancelled = (e: unknown): boolean => CANCEL_CODES.has(errorCode(e));

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always show the account chooser so people with several Google accounts can pick the right one.
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

export function providerIds(user: User | null): string[] {
  return user?.providerData.map((p) => p.providerId) ?? [];
}

/** Fall back to a full-page redirect only when the pop-up was blocked and we're not inside an iframe. */
function shouldRedirect(e: unknown): boolean {
  return REDIRECT_FALLBACK.has(errorCode(e)) && !isInIframe();
}

function requireUser(): User {
  const u = auth.currentUser;
  if (!u) throw new Error('You are not signed in.');
  return u;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  version: number;
  pendingLink: PendingLink | null;
  authNotice: string | null;
  signUp(name: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string, remember: boolean): Promise<void>;
  signInWithGoogle(remember: boolean): Promise<GoogleResult>;
  cancelPendingLink(): void;
  clearAuthNotice(): void;
  resetPassword(email: string): Promise<void>;
  logOut(): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  addPassword(password: string): Promise<void>;
  linkGoogle(): Promise<'linked' | 'redirecting' | 'cancelled'>;
  unlinkGoogle(): Promise<void>;
  reauthWithGoogle(): Promise<void>;
  resendVerification(): Promise<void>;
  refreshUser(): Promise<void>;
  /** Pass the password for email accounts; omit it to confirm with Google instead. */
  deleteAccount(password?: string): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useUI();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const pendingRef = useRef<{ credential: OAuthCredential | null; email: string | null } | null>(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  /** Google hit an existing password account → keep the Google credential to link after a password sign-in. */
  const capturePending = useCallback((e: unknown): boolean => {
    if (errorCode(e) !== 'auth/account-exists-with-different-credential') return false;
    const credential = GoogleAuthProvider.credentialFromError(e as AuthError);
    const email = (e as AuthError).customData?.email ?? null;
    pendingRef.current = { credential, email };
    setPendingLink({ email, canLink: !!credential });
    return true;
  }, []);

  const cancelPendingLink = useCallback(() => {
    pendingRef.current = null;
    setPendingLink(null);
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);
      }),
    []
  );

  // Completes a redirect-based Google flow (used only when pop-ups are blocked) and surfaces its errors.
  useEffect(() => {
    let alive = true;
    getRedirectResult(auth)
      .then((res) => {
        if (alive && res?.operationType === 'link') {
          bump();
          toast({ type: 'success', title: 'Google account connected' });
        }
      })
      .catch((e) => {
        if (!alive || isCancelled(e) || capturePending(e)) return;
        if (auth.currentUser) toast({ type: 'error', title: "Couldn't connect Google", message: authErrorMessage(e, 'google') });
        else setAuthNotice(authErrorMessage(e, 'google'));
      });
    return () => {
      alive = false;
    };
  }, [bump, capturePending, toast]);

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await setPersistence(auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() }).catch(() => undefined);
      // Create the private workspace document (security rules restrict it to this uid).
      void setDoc(doc(db, 'users', cred.user.uid), newUserDoc(name.trim(), email.trim()), { merge: true }).catch(() => undefined);
      void sendEmailVerification(cred.user).catch(() => undefined);
      bump();
    },
    [bump]
  );

  const signIn = useCallback(
    async (email: string, password: string, remember: boolean) => {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const pending = pendingRef.current;
      if (!pending) return;
      pendingRef.current = null;
      setPendingLink(null);
      const sameEmail = !pending.email || pending.email.toLowerCase() === (cred.user.email ?? '').toLowerCase();
      if (!pending.credential || !sameEmail) return;
      try {
        await linkWithCredential(cred.user, pending.credential);
        bump();
        toast({ type: 'success', title: 'Google account connected', message: 'Next time you can sign in with Google or your password.' });
      } catch (e) {
        toast({ type: 'warning', title: "Signed in, but Google wasn't connected", message: authErrorMessage(e, 'google') });
      }
    },
    [bump, toast]
  );

  const signInWithGoogle = useCallback(
    async (remember: boolean): Promise<GoogleResult> => {
      const persistence = remember ? browserLocalPersistence : browserSessionPersistence;
      // Deliberately not awaited: the pop-up must open straight from the tap (Safari blocks late pop-ups).
      // Firebase applies the queued persistence change before it stores the signed-in user.
      void setPersistence(auth, persistence).catch(() => undefined);
      try {
        await signInWithPopup(auth, googleProvider());
        cancelPendingLink();
        return 'signed-in';
      } catch (e) {
        if (isCancelled(e)) return 'cancelled';
        if (capturePending(e)) return 'link-required';
        if (!shouldRedirect(e)) throw e;
        await setPersistence(auth, persistence);
        const redirect: Promise<unknown> = signInWithRedirect(auth, googleProvider());
        await redirect; // navigates to Google; only settles here if starting the redirect fails
        return 'redirecting';
      }
    },
    [cancelPendingLink, capturePending]
  );

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const logOut = useCallback(async () => {
    cancelPendingLink();
    await signOut(auth);
  }, [cancelPendingLink]);

  const changePassword = useCallback(async (current: string, next: string) => {
    const u = requireUser();
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', current));
    await updatePassword(u, next);
  }, []);

  /** Lets a Google-only account also sign in with email + password. */
  const addPassword = useCallback(
    async (password: string) => {
      const u = requireUser();
      if (!u.email) throw new Error('Your account has no email address to attach a password to.');
      await linkWithCredential(u, EmailAuthProvider.credential(u.email, password));
      bump();
    },
    [bump]
  );

  const linkGoogle = useCallback(async (): Promise<'linked' | 'redirecting' | 'cancelled'> => {
    const u = requireUser();
    try {
      await linkWithPopup(u, googleProvider());
      bump();
      return 'linked';
    } catch (e) {
      if (isCancelled(e)) return 'cancelled';
      if (!shouldRedirect(e)) throw e;
      const redirect: Promise<unknown> = linkWithRedirect(u, googleProvider());
      await redirect;
      return 'redirecting';
    }
  }, [bump]);

  const unlinkGoogle = useCallback(async () => {
    const u = requireUser();
    if (u.providerData.length < 2) throw new Error('Add a password first — otherwise you would have no way to sign in.');
    await unlink(u, GoogleAuthProvider.PROVIDER_ID);
    bump();
  }, [bump]);

  const reauthWithGoogle = useCallback(async () => {
    await reauthenticateWithPopup(requireUser(), googleProvider());
  }, []);

  const resendVerification = useCallback(async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser);
  }, []);

  const refreshUser = useCallback(async () => {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      setUser(auth.currentUser);
      bump();
    }
  }, [bump]);

  const deleteAccount = useCallback(async (password?: string) => {
    const u = requireUser();
    // Firebase requires a recent sign-in before deleting an account.
    if (password != null) await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password));
    else await reauthenticateWithPopup(u, googleProvider());
    // Delete every document in the user's private workspace, then the account itself.
    for (const name of USER_SUBCOLLECTIONS) {
      const snap = await getDocs(collection(db, 'users', u.uid, name));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
    await deleteDoc(doc(db, 'users', u.uid));
    await deleteUser(u);
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      version,
      pendingLink,
      authNotice,
      signUp,
      signIn,
      signInWithGoogle,
      cancelPendingLink,
      clearAuthNotice,
      resetPassword,
      logOut,
      changePassword,
      addPassword,
      linkGoogle,
      unlinkGoogle,
      reauthWithGoogle,
      resendVerification,
      refreshUser,
      deleteAccount,
    }),
    [
      user,
      loading,
      version,
      pendingLink,
      authNotice,
      signUp,
      signIn,
      signInWithGoogle,
      cancelPendingLink,
      clearAuthNotice,
      resetPassword,
      logOut,
      changePassword,
      addPassword,
      linkGoogle,
      unlinkGoogle,
      reauthWithGoogle,
      resendVerification,
      refreshUser,
      deleteAccount,
    ]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}
