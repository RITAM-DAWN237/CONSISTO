import { useEffect, useLayoutEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import type { Prefs } from './types';
import { AuthProvider, useAuth } from './context/AuthContext';
import { UIProvider, useUI } from './context/UIContext';
import { DataProvider, StatsProvider, useData } from './context/DataContext';
import { useAchievementEngine, useReminderEngine } from './services/engines';
import { useRoute } from './hooks';
import { ACCENTS, FONTS } from './constants';
import { unlockAudio } from './lib/sounds';
import { AppLayout } from './components/Layout';
import { Logo } from './components/Logo';
import { TaskEditor } from './components/TaskEditor';
import { TaskDetails } from './components/TaskDetails';
import { NoteEditor } from './components/NoteEditor';
import { NotificationsPage } from './components/NotificationCenter';
import { Button } from './components/ui';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import CalendarPage from './pages/CalendarPage';
import AnalyticsPage from './pages/AnalyticsPage';
import NotesPage from './pages/NotesPage';
import AchievementsPage from './pages/AchievementsPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import MorePage from './pages/MorePage';
import TasksPage from './pages/TasksPage';

function Splash({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <Logo size={72} className="animate-float" />
        <p className="text-sm font-semibold tracking-wide text-muted">{label}</p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-fg/10">
          <div className="h-full w-1/3 animate-loading rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}

function useApplyAppearance(prefs: Prefs) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = prefs.theme;
    root.dataset.density = prefs.density;
    const a = ACCENTS.find((x) => x.id === prefs.accent) ?? ACCENTS[0];
    const f = FONTS.find((x) => x.id === prefs.font) ?? FONTS[0];
    root.style.setProperty('--accent', a.color);
    root.style.setProperty('--accent-strong', a.strong);
    root.style.setProperty('--app-font', f.stack);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'light' ? '#f5f4fa' : prefs.theme === 'amoled' ? '#000000' : '#0b0a12');
    try {
      localStorage.setItem('consisto-ui', JSON.stringify({ theme: prefs.theme, accent: a.color, accentStrong: a.strong, font: f.stack }));
    } catch {
      /* UI cache only */
    }
  }, [prefs.theme, prefs.accent, prefs.font, prefs.density]);
}

function ModalHost() {
  const ui = useUI();
  const m = ui.modal;
  if (!m) return null;
  if (m.type === 'task-editor') return <TaskEditor key={m.task?.id ?? 'new'} task={m.task} defaults={m.defaults} onClose={ui.closeModal} />;
  if (m.type === 'task-details') return <TaskDetails key={`${m.taskId}-${m.dateKey ?? ''}`} taskId={m.taskId} dateKey={m.dateKey} onClose={ui.closeModal} />;
  return <NoteEditor key={m.noteId} noteId={m.noteId} onClose={ui.closeModal} />;
}

function UpdateBanner() {
  const ui = useUI();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onUpdate = () => setShow(true);
    const onLatest = () => ui.toast({ type: 'success', title: "You're on the latest version" });
    window.addEventListener('consisto:update-available', onUpdate);
    window.addEventListener('consisto:up-to-date', onLatest);
    return () => {
      window.removeEventListener('consisto:update-available', onUpdate);
      window.removeEventListener('consisto:up-to-date', onLatest);
    };
  }, [ui]);
  if (!show) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/40 bg-card-2 p-3 shadow-2xl animate-slide-up md:bottom-6">
      <RefreshCw className="h-5 w-5 shrink-0 text-accent" />
      <p className="flex-1 text-sm text-fg">A new version of CONSISTO is available.</p>
      <Button size="sm" onClick={() => (window as unknown as { __consistoApplyUpdate?: () => void }).__consistoApplyUpdate?.() ?? window.location.reload()}>
        Reload
      </Button>
      <button aria-label="Dismiss" onClick={() => setShow(false)} className="rounded-lg p-1 text-faint hover:text-fg">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function Router() {
  const { path } = useRoute();
  switch (path) {
    case '/calendar':
      return <CalendarPage />;
    case '/analytics':
      return <AnalyticsPage />;
    case '/notes':
      return <NotesPage />;
    case '/achievements':
      return <AchievementsPage />;
    case '/settings':
      return <SettingsPage />;
    case '/profile':
      return <ProfilePage />;
    case '/more':
      return <MorePage />;
    case '/tasks':
      return <TasksPage />;
    case '/notifications':
      return <NotificationsPage />;
    default:
      return <HomePage />;
  }
}

function AppShell() {
  const data = useData();
  const { path } = useRoute();
  const [forceReady, setForceReady] = useState(false);
  useApplyAppearance(data.prefs);
  useReminderEngine();
  useAchievementEngine();

  useEffect(() => {
    const t = window.setTimeout(() => setForceReady(true), 8000);
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('pointerdown', unlock);
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [path]);

  if (!data.ready && !forceReady) return <Splash />;
  return (
    <>
      <AppLayout>
        <Router />
      </AppLayout>
      <ModalHost />
      <UpdateBanner />
    </>
  );
}

function Gate() {
  const { user, loading } = useAuth();
  const { closeModal } = useUI();
  const uid = user?.uid;
  useEffect(() => {
    closeModal(); // never carry an open editor across accounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  if (loading) return <Splash label="Starting CONSISTO…" />;
  if (!user) return <AuthPage />;
  return (
    <DataProvider key={user.uid} user={user}>
      <StatsProvider>
        <AppShell />
      </StatsProvider>
    </DataProvider>
  );
}

export default function App() {
  // UIProvider wraps AuthProvider so auth flows (e.g. Google account linking) can show toasts.
  return (
    <UIProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </UIProvider>
  );
}
