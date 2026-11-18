// Authentication: Google, email sign-in, account creation and password reset (Firebase Auth).
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowLeft, Bell, CalendarCheck, CheckCircle2, Eye, EyeOff, Flame, Lock, Mail, User, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authErrorMessage } from '../lib/firebase';
import { cn, isInAppBrowser } from '../lib/utils';
import { Logo } from '../components/Logo';
import { Button } from '../components/ui';
import { GoogleButton, GoogleIcon } from '../components/GoogleIcon';
import { TAGLINE } from '../constants';

type Mode = 'signin' | 'signup' | 'forgot';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const BAD_CREDENTIAL = new Set(['auth/invalid-credential', 'auth/wrong-password', 'auth/invalid-login-credentials', 'auth/user-not-found']);

function strength(pw: string): { score: number; label: string; color: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const levels = [
    { label: 'Too weak', color: 'var(--bad)' },
    { label: 'Weak', color: 'var(--bad)' },
    { label: 'Fair', color: 'var(--warn)' },
    { label: 'Good', color: 'var(--info)' },
    { label: 'Strong', color: 'var(--ok)' },
    { label: 'Very strong', color: 'var(--ok)' },
  ];
  return { score: s, ...levels[s] };
}

function InputWithIcon({ icon, right, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { icon: ReactNode; right?: ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <input
        {...props}
        className="h-12 w-full rounded-xl border border-line bg-card-2 pl-10 pr-11 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20"
      />
      {right && <span className="absolute right-2 top-1/2 -translate-y-1/2">{right}</span>}
    </div>
  );
}

function DecorativeGrid() {
  // Purely decorative pattern for the welcome panel (not user data).
  const cells = useMemo(() => Array.from({ length: 7 * 18 }, (_, i) => [0, 1, 2, 3, 3, 2, 1, 3, 0, 2][(i * 7 + (i % 5) * 3) % 10]), []);
  const colors = ['rgba(255,255,255,0.06)', '#0e4429', '#006d32', '#39d353'];
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" aria-hidden>
      {cells.map((c, i) => (
        <span key={i} className="h-3 w-3 rounded-[3px]" style={{ background: colors[c] }} />
      ))}
    </div>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2.5 text-sm leading-relaxed text-bad">
      {children}
    </p>
  );
}

export default function AuthPage() {
  const auth = useAuth();
  const { pendingLink, authNotice, clearAuthNotice, cancelPendingLink } = auth;
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<{ msg: string; source: 'email' | 'google' } | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const inApp = useMemo(() => isInAppBrowser(), []);
  const pwStrength = strength(password);
  const googleError = error?.source === 'google' ? error.msg : authNotice;
  const emailError = error?.source === 'email' ? error.msg : null;

  // Google hit an existing password account → switch to sign-in with the email prefilled.
  useEffect(() => {
    if (!pendingLink) return;
    setMode('signin');
    setResetSent(false);
    setError(null);
    if (pendingLink.email) setEmail(pendingLink.email);
  }, [pendingLink]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    clearAuthNotice();
    setResetSent(false);
    setPassword('');
    setConfirm('');
  };

  const continueWithGoogle = async () => {
    // No awaits before signInWithGoogle — the pop-up must open directly from this tap.
    setError(null);
    clearAuthNotice();
    setGoogleBusy(true);
    try {
      await auth.signInWithGoogle(remember);
    } catch (err) {
      setError({ msg: authErrorMessage(err, 'google'), source: 'google' });
    } finally {
      setGoogleBusy(false);
    }
  };

  const fail = (msg: string) => setError({ msg, source: 'email' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    clearAuthNotice();
    if (!EMAIL_RE.test(email.trim())) return fail('Please enter a valid email address.');
    if (mode === 'signup') {
      if (name.trim().length < 2) return fail('Please enter your name (at least 2 characters).');
      if (password.length < 8) return fail('Password must be at least 8 characters.');
      if (pwStrength.score < 2) return fail('Choose a stronger password — mix letters, numbers and symbols.');
      if (password !== confirm) return fail('Passwords do not match.');
    }
    if (mode === 'signin' && !password) return fail('Please enter your password.');
    setBusy(true);
    try {
      if (mode === 'signin') await auth.signIn(email, password, remember);
      else if (mode === 'signup') await auth.signUp(name, email, password);
      else {
        await auth.resetPassword(email);
        setResetSent(true);
      }
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      // Avoid account enumeration on the reset screen.
      if (mode === 'forgot' && code === 'auth/user-not-found') setResetSent(true);
      else if (mode === 'signin' && BAD_CREDENTIAL.has(code)) fail('Incorrect email or password. If you joined with Google, use “Continue with Google” above.');
      else if (mode === 'signup' && code === 'auth/email-already-in-use')
        fail('An account with this email already exists. Sign in instead — or use “Continue with Google” if that’s how you joined.');
      else fail(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pwToggle = (
    <button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow((s) => !s)} className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:text-fg">
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex xl:p-14">
        <div className="absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-bold tracking-tight text-fg">Consisto</span>
        </div>
        <div className="relative">
          <h1 className="max-w-md text-4xl font-extrabold leading-tight tracking-tight text-fg xl:text-5xl">{TAGLINE}</h1>
          <p className="mt-4 max-w-md text-base text-muted">Tasks, habits, reminders, streaks, analytics and notes — in one calm, focused workspace that works offline.</p>
          <div className="mt-8 rounded-2xl border border-line bg-card/70 p-5 backdrop-blur">
            <DecorativeGrid />
          </div>
          <ul className="mt-8 space-y-3 text-sm text-fg/90">
            {[
              [Bell, 'Start & end reminders — you always tick tasks yourself'],
              [Flame, 'Recurrence-aware streaks and milestones'],
              [CalendarCheck, 'GitHub-style heatmap, calendar and timetable'],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof Bell;
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
                    <I className="h-4 w-4" />
                  </span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-faint">Your workspace is private — protected by Firebase Authentication and per-user security rules.</p>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-8 md:px-8">
        <div className="w-full max-w-[440px] rounded-3xl border border-line bg-card/60 backdrop-blur-xl p-6 sm:p-8 shadow-2xl ring-1 ring-white/10">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Logo size={64} />
            <p className="mt-3 text-2xl font-bold tracking-tight text-fg">Consisto</p>
            <p className="mt-1 text-sm text-muted">{TAGLINE}</p>
          </div>

          {mode !== 'forgot' && (
            <div className="mb-6 grid grid-cols-2 rounded-xl border border-line bg-card-2/80 p-1" role="tablist">
              {(['signin', 'signup'] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)} className={cn('rounded-lg py-2 text-sm font-semibold transition', mode === m ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-fg')}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>
          )}

          <h2 className="text-2xl font-bold tracking-tight text-fg">{mode === 'signin' ? 'Welcome back 👋' : mode === 'signup' ? 'Start your streak' : 'Reset your password'}</h2>
          <p className="mb-6 mt-1 text-sm text-muted">
            {mode === 'signin' ? 'Sign in to continue building consistency.' : mode === 'signup' ? 'Create your private CONSISTO workspace.' : "Enter your account email and we'll send you a secure reset link."}
          </p>

          {pendingLink && mode === 'signin' && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-info/30 bg-info/10 p-3.5">
              <GoogleIcon className="mt-0.5 h-5 w-5 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-fg">You already have a CONSISTO account</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {pendingLink.email ? (
                    <>
                      <span className="font-medium text-fg">{pendingLink.email}</span> signs in with a password.{' '}
                    </>
                  ) : (
                    'This email signs in with a password. '
                  )}
                  {pendingLink.canLink
                    ? 'Enter it once below and Google will be connected — after that you can use either.'
                    : 'Sign in below, then connect Google from your Profile.'}
                </p>
              </div>
              <button aria-label="Dismiss" onClick={cancelPendingLink} className="rounded-lg p-1 text-faint hover:text-fg">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {mode !== 'forgot' && (
            <>
              <GoogleButton onClick={() => void continueWithGoogle()} busy={googleBusy} disabled={busy} />
              {googleError && <div className="mt-3">{<ErrorBox>{googleError}</ErrorBox>}</div>}
              {inApp && (
                <p className="mt-2 text-center text-[11px] leading-relaxed text-warn">
                  Google blocks sign-in inside some in-app browsers. If it doesn't work, open this page in Chrome or Safari.
                </p>
              )}
              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                <span className="h-px flex-1 bg-line" />
                or with email
                <span className="h-px flex-1 bg-line" />
              </div>
            </>
          )}

          {mode === 'forgot' && resetSent ? (
            <div className="rounded-2xl border border-ok/30 bg-ok/10 p-5 text-sm">
              <CheckCircle2 className="mb-2 h-6 w-6 text-ok" />
              <p className="font-semibold text-fg">Check your inbox</p>
              <p className="mt-1 leading-relaxed text-muted">
                If an account exists for <span className="font-medium text-fg">{email}</span>, a password reset link is on its way. Check your spam folder too.
              </p>
              <Button className="mt-4 w-full" onClick={() => switchMode('signin')}>
                Back to sign in
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3.5" noValidate>
              {mode === 'signup' && (
                <InputWithIcon icon={<User />} type="text" autoComplete="name" placeholder="Your name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Name" />
              )}
              <InputWithIcon icon={<Mail />} type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
              {mode !== 'forgot' && (
                <InputWithIcon
                  icon={<Lock />}
                  type={show ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-label="Password"
                  right={pwToggle}
                />
              )}
              {mode === 'signup' && password && (
                <div>
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i < pwStrength.score ? pwStrength.color : 'color-mix(in oklab, var(--fg) 10%, transparent)' }} />
                    ))}
                  </div>
                  <p className="mt-1 text-xs" style={{ color: pwStrength.color }}>
                    {pwStrength.label}
                  </p>
                </div>
              )}
              {mode === 'signup' && (
                <InputWithIcon icon={<Lock />} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirm password" />
              )}
              {mode === 'signin' && (
                <div className="flex items-center justify-between text-sm">
                  <label className="flex cursor-pointer items-center gap-2 text-muted">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 rounded accent-[var(--accent)]" />
                    Keep me signed in
                  </label>
                  <button type="button" onClick={() => switchMode('forgot')} className="font-semibold text-accent hover:underline">
                    Forgot password?
                  </button>
                </div>
              )}
              {emailError && <ErrorBox>{emailError}</ErrorBox>}
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={googleBusy}>
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
              </Button>
              {mode === 'forgot' && (
                <button type="button" onClick={() => switchMode('signin')} className="flex w-full items-center justify-center gap-1.5 pt-1 text-sm font-semibold text-muted hover:text-fg">
                  <ArrowLeft className="h-4 w-4" /> Back to sign in
                </button>
              )}
              {mode === 'signup' && <p className="text-center text-xs text-faint">We'll send a verification email. Your data is private to your account.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
