import { useRef, useState } from 'react';
import { Camera, CheckCircle2, Download, KeyRound, Link2, LogOut, Mail, RefreshCw, ShieldAlert, ShieldCheck, Trash2, Unlink } from 'lucide-react';
import { updateProfile } from 'firebase/auth';
import { errorCode, isCancelled, providerIds, useAuth } from '../context/AuthContext';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { auth as fbAuth, authErrorMessage } from '../lib/firebase';
import { epochToKey, formatDateKey } from '../lib/dates';
import { cn, downloadJson, resizeImage } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { GoogleButton, GoogleIcon } from '../components/GoogleIcon';
import { Avatar, Button, Card, Field, inputClass, Modal } from '../components/ui';

export default function ProfilePage() {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const authCtx = useAuth();
  const user = authCtx.user!;
  const providers = providerIds(user);
  const hasPassword = providers.includes('password');
  const hasGoogle = providers.includes('google.com');
  const googleProfile = user.providerData.find((p) => p.providerId === 'google.com');
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(data.profile.displayName);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delError, setDelError] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const saveName = async () => {
    const n = name.trim();
    if (!n || n.length > 80) {
      ui.toast({ type: 'error', title: 'Display name must be 1–80 characters' });
      return;
    }
    data.updateProfileData({ displayName: n });
    if (fbAuth.currentUser) await updateProfile(fbAuth.currentUser, { displayName: n }).catch(() => undefined);
    ui.toast({ type: 'success', title: 'Profile updated' });
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      ui.toast({ type: 'error', title: 'Please choose an image file' });
      return;
    }
    try {
      const url = await resizeImage(file, 160);
      data.updateProfileData({ photoData: url });
      ui.toast({ type: 'success', title: 'Profile photo updated' });
    } catch (e) {
      ui.toast({ type: 'error', title: 'Could not use that image', message: (e as Error).message });
    }
  };

  const newPasswordValid = () => {
    if (pw.next.length < 8) {
      setPwError('New password must be at least 8 characters.');
      return false;
    }
    if (pw.next !== pw.confirm) {
      setPwError('New passwords do not match.');
      return false;
    }
    return true;
  };

  const changePassword = async () => {
    setPwError(null);
    if (!newPasswordValid()) return;
    setPwBusy(true);
    try {
      await authCtx.changePassword(pw.current, pw.next);
      setPw({ current: '', next: '', confirm: '' });
      ui.toast({ type: 'success', title: 'Password changed' });
    } catch (e) {
      setPwError(authErrorMessage(e));
    } finally {
      setPwBusy(false);
    }
  };

  /** Google-only accounts: attach an email + password sign-in method. */
  const createPassword = async () => {
    setPwError(null);
    if (!newPasswordValid()) return;
    setPwBusy(true);
    try {
      await authCtx.addPassword(pw.next);
      setPw({ current: '', next: '', confirm: '' });
      setNeedsReauth(false);
      ui.toast({ type: 'success', title: 'Password added', message: `You can now also sign in with ${user.email} and this password.` });
    } catch (e) {
      if (errorCode(e) === 'auth/requires-recent-login') setNeedsReauth(true);
      else setPwError(authErrorMessage(e));
    } finally {
      setPwBusy(false);
    }
  };

  const confirmWithGoogleThenCreate = async () => {
    setPwError(null);
    try {
      await authCtx.reauthWithGoogle();
    } catch (e) {
      if (!isCancelled(e)) setPwError(authErrorMessage(e, 'google'));
      return;
    }
    setNeedsReauth(false);
    await createPassword();
  };

  const connectGoogle = async () => {
    setLinkBusy(true);
    try {
      const result = await authCtx.linkGoogle();
      if (result === 'linked') {
        const photo = fbAuth.currentUser?.providerData.find((p) => p.providerId === 'google.com')?.photoURL;
        if (photo && !data.profile.photoData) data.updateProfileData({ photoURL: photo });
        ui.toast({ type: 'success', title: 'Google account connected', message: 'You can now sign in with Google too.' });
      }
    } catch (e) {
      ui.toast({ type: 'error', title: "Couldn't connect Google", message: authErrorMessage(e, 'google') });
    } finally {
      setLinkBusy(false);
    }
  };

  const disconnectGoogle = async () => {
    const ok = await ui.confirm({
      title: 'Disconnect Google?',
      message: `You'll sign in with ${user.email} and your password instead. Your data is not affected.`,
      confirmText: 'Disconnect',
      danger: true,
    });
    if (!ok) return;
    try {
      await authCtx.unlinkGoogle();
      ui.toast({ type: 'success', title: 'Google disconnected' });
    } catch (e) {
      ui.toast({ type: 'error', title: "Couldn't disconnect Google", message: authErrorMessage(e, 'google') });
    }
  };

  const deleteAccount = async () => {
    setDelError(null);
    setDelBusy(true);
    try {
      await authCtx.deleteAccount(hasPassword ? delPw : undefined);
    } catch (e) {
      if (!isCancelled(e)) setDelError(authErrorMessage(e, hasPassword ? 'password' : 'google'));
      setDelBusy(false);
    }
  };

  const memberSince = formatDateKey(epochToKey(data.profile.createdAtMs, data.prefs.timezone), 'full');
  const methods = [hasGoogle && 'Google', hasPassword && 'Email & password'].filter(Boolean).join(' · ');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Profile" subtitle="Your account and private workspace" />
      <Card className="mb-4 p-5 md:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative">
            <Avatar name={data.profile.displayName} photo={data.profile.photoData} size={88} />
            <button aria-label="Change photo" onClick={() => fileRef.current?.click()} className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full border-2 border-card bg-accent text-accent-fg">
              <Camera className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPhoto(e.target.files?.[0])} />
          </div>
          <div className="w-full min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xl font-bold text-fg">{data.profile.displayName}</p>
            <p className="flex items-center justify-center gap-1.5 text-sm text-muted sm:justify-start">
              <Mail className="h-3.5 w-3.5" />
              <span className="truncate">{data.profile.email}</span>
              {user.emailVerified ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-ok" aria-label="Verified" /> : null}
            </p>
            <p className="mt-1 text-xs text-faint">
              Member since {memberSince}
              {methods && ` · Signs in with ${methods}`}
            </p>
            {data.profile.photoData && (
              <button className="mt-1 text-xs font-semibold text-muted hover:text-fg" onClick={() => data.updateProfileData({ photoData: null, photoURL: null })}>
                Remove photo
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Total completions', stats.totalCompletions],
            ['Current streak', `${stats.streak.current}d`],
            ['Longest streak', `${stats.longestStreak}d`],
            ['Active tasks', data.tasks.filter((t) => t.status === 'active').length],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded-xl bg-fg/[0.04] p-3 text-center">
              <p className="text-lg font-extrabold text-fg">{v}</p>
              <p className="text-[11px] text-muted">{l}</p>
            </div>
          ))}
        </div>
      </Card>

      {!user.emailVerified && (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 border-warn/30 p-4">
          <p className="text-sm text-fg">Your email address isn't verified yet.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={<RefreshCw />} onClick={() => void authCtx.refreshUser()}>
              I've verified
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                try {
                  await authCtx.resendVerification();
                  ui.toast({ type: 'success', title: 'Verification email sent' });
                } catch (e) {
                  ui.toast({ type: 'error', title: 'Could not send email', message: authErrorMessage(e) });
                }
              }}
            >
              Resend email
            </Button>
          </div>
        </Card>
      )}

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Display name</h2>
        <div className="flex gap-2">
          <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={inputClass} aria-label="Display name" />
          <Button onClick={() => void saveName()} disabled={name.trim() === data.profile.displayName}>
            Save
          </Button>
        </div>
      </Card>

      {/* Sign-in methods */}
      <Card className="mb-4 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <ShieldCheck className="h-4 w-4 text-accent" /> Sign-in methods
        </h2>
        <p className="mb-3 mt-1 text-xs text-muted">Every connected method opens the same account and data.</p>
        <div className="divide-y divide-line rounded-xl border border-line">
          <div className="flex items-center gap-3 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-white">
              <GoogleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Google</p>
              <p className="truncate text-xs text-muted">{hasGoogle ? `Connected${googleProfile?.email ? ` · ${googleProfile.email}` : ''}` : 'Not connected'}</p>
            </div>
            {hasGoogle ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Unlink />}
                disabled={providers.length < 2}
                title={providers.length < 2 ? 'Add a password first so you can still sign in' : undefined}
                onClick={() => void disconnectGoogle()}
              >
                Disconnect
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Link2 />} loading={linkBusy} onClick={() => void connectGoogle()}>
                Connect
              </Button>
            )}
          </div>
          <div className="flex items-center gap-3 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">Email &amp; password</p>
              <p className="truncate text-xs text-muted">{hasPassword ? `Connected · ${user.email ?? ''}` : 'No password set'}</p>
            </div>
            {hasPassword ? <span className="text-xs font-semibold text-ok">Active</span> : <span className="text-xs text-faint">Set one below</span>}
          </div>
        </div>
      </Card>

      {/* Password */}
      <Card className="mb-4 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-fg">
          <KeyRound className="h-4 w-4 text-accent" /> {hasPassword ? 'Change password' : 'Set a password'}
        </h2>
        <p className="mb-3 text-xs text-muted">
          {hasPassword ? 'Confirm your current password to choose a new one.' : `Your account uses Google sign-in. Add a password to also sign in with ${user.email ?? 'your email'}.`}
        </p>
        <div className={cn('grid gap-3', hasPassword ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          {hasPassword && (
            <Field label="Current">
              <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputClass} />
            </Field>
          )}
          <Field label="New">
            <input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputClass} />
          </Field>
          <Field label="Confirm">
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} className={inputClass} />
          </Field>
        </div>
        {pwError && <p className="mt-2 text-xs font-medium text-bad">{pwError}</p>}
        {needsReauth && (
          <div className="mt-3 rounded-xl border border-warn/30 bg-warn/10 p-3">
            <p className="mb-2 text-xs text-fg">For security, confirm it's you with Google before adding a password.</p>
            <GoogleButton onClick={() => void confirmWithGoogleThenCreate()} label="Confirm with Google" className="sm:w-auto" />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {hasPassword ? (
            <>
              <Button onClick={() => void changePassword()} loading={pwBusy} disabled={!pw.current || !pw.next}>
                Update password
              </Button>
              <Button
                variant="ghost"
                onClick={async () => {
                  try {
                    await authCtx.resetPassword(data.profile.email);
                    ui.toast({ type: 'success', title: 'Password reset email sent', message: `Check ${data.profile.email}` });
                  } catch (e) {
                    ui.toast({ type: 'error', title: 'Could not send reset email', message: authErrorMessage(e) });
                  }
                }}
              >
                Email me a reset link instead
              </Button>
            </>
          ) : (
            <Button onClick={() => void createPassword()} loading={pwBusy} disabled={!pw.next || !pw.confirm}>
              Add password
            </Button>
          )}
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-base font-semibold text-fg">Data & session</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Download />} onClick={() => downloadJson(`consisto-export-${new Date().toISOString().slice(0, 10)}.json`, data.exportData())}>
            Export my data
          </Button>
          <Button
            variant="secondary"
            icon={<LogOut />}
            onClick={async () => {
              if (await ui.confirm({ title: 'Sign out of CONSISTO?', confirmText: 'Sign out' })) void authCtx.logOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </Card>

      <Card className="border-bad/30 p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-bad">
          <ShieldAlert className="h-4 w-4" /> Danger zone
        </h2>
        <p className="mb-3 text-xs text-muted">Permanently delete your account and every task, completion, note and setting in your workspace.</p>
        <Button variant="danger" icon={<Trash2 />} onClick={() => setDeleting(true)}>
          Delete account
        </Button>
      </Card>

      {deleting && (
        <Modal open onClose={() => !delBusy && setDeleting(false)} size="sm" label="Delete account">
          <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pb-5">
            <h2 className="text-lg font-bold text-fg">Delete your account?</h2>
            <p className="mt-1 text-sm text-muted">
              This cannot be undone. {hasPassword ? 'Enter your password to confirm.' : 'Confirm with your Google account to continue.'}
            </p>
            {hasPassword && (
              <input type="password" autoFocus value={delPw} onChange={(e) => setDelPw(e.target.value)} className={`${inputClass} mt-4`} placeholder="Password" autoComplete="current-password" />
            )}
            {delError && <p className="mt-2 text-xs font-medium text-bad">{delError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setDeleting(false)} disabled={delBusy}>
                Cancel
              </Button>
              {hasPassword ? (
                <Button variant="danger" onClick={() => void deleteAccount()} loading={delBusy} disabled={!delPw}>
                  Delete forever
                </Button>
              ) : (
                <GoogleButton onClick={() => void deleteAccount()} busy={delBusy} label="Confirm with Google & delete" busyLabel="Deleting…" className="sm:w-auto" />
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
