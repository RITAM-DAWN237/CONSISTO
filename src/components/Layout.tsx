import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  CalendarDays,
  CloudOff,
  Download,
  FileText,
  Home,
  Menu as MenuIcon,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  StickyNote,
  Sun,
  Trophy,
  X,
  ListChecks,
  AlertTriangle,
} from 'lucide-react';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { navigate, useInstallPrompt, useOnline, useRoute } from '../hooks';
import { cn } from '../lib/utils';
import { Logo } from './Logo';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationCenter';
import { Avatar, Toggle } from './ui';

const NAV = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/notes', label: 'Notes', icon: NotebookPen },
  { path: '/achievements', label: 'Achievements', icon: Trophy },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const MOBILE_NAV = [
  { path: '/home', label: 'Home', icon: Home },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/notes', label: 'Notes', icon: NotebookPen },
  { path: '/more', label: 'More', icon: MenuIcon },
];

const MORE_PATHS = ['/more', '/achievements', '/settings', '/profile', '/notifications'];

function isActive(path: string, current: string) {
  if (path === '/home') return current === '/home' || current === '/tasks';
  if (path === '/more') return MORE_PATHS.includes(current);
  return current.startsWith(path);
}

export function useInstallAction() {
  const { available, installed, install, ios } = useInstallPrompt();
  const ui = useUI();
  const run = async () => {
    if (available) {
      const r = await install();
      if (r === 'accepted') ui.toast({ type: 'success', title: 'CONSISTO installed', message: 'Launch it from your home screen or app list.' });
      return;
    }
    if (ios) ui.toast({ type: 'info', title: 'Install on iPhone / iPad', message: 'Tap the Share button in Safari, then "Add to Home Screen".', duration: 9000 });
    else ui.toast({ type: 'info', title: 'Install from your browser menu', message: 'Use the install icon in the address bar or browser menu → "Install app". Supported in Chrome, Edge and Samsung Internet.', duration: 9000 });
  };
  return { canShow: !installed, available, run };
}

function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const { prefs, updatePrefs } = useData();
  const dark = prefs.theme !== 'light';
  const toggle = () => updatePrefs({ theme: dark ? 'light' : 'dark' });
  if (collapsed)
    return (
      <button onClick={toggle} aria-label="Toggle theme" className="grid h-10 w-full place-items-center rounded-xl text-muted hover:bg-fg/[0.06] hover:text-fg">
        {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>
    );
  return (
    <div className="flex items-center justify-center gap-3 py-1">
      <Sun className={cn('h-4 w-4', !dark ? 'text-warn' : 'text-faint')} />
      <Toggle checked={dark} onChange={toggle} label="Dark mode" />
      <Moon className={cn('h-4 w-4', dark ? 'text-accent' : 'text-faint')} />
    </div>
  );
}

function MountainArt() {
  return (
    <svg viewBox="0 0 160 64" className="h-14 w-full" aria-hidden>
      <defs>
        <linearGradient id="consisto-mt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".95" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity=".12" />
        </linearGradient>
      </defs>
      <circle cx="134" cy="16" r="2" fill="currentColor" opacity=".5" />
      <circle cx="22" cy="12" r="1.5" fill="currentColor" opacity=".4" />
      <path d="M0 64 L36 30 L56 46 L84 14 L118 50 L134 38 L160 58 L160 64 Z" fill="url(#consisto-mt)" />
      <path d="M84 14 L93 25 L87 23 L81 28 L76 23 Z" fill="#fff" opacity=".85" />
      <path d="M84 14 V3" stroke="#fff" strokeWidth="1.4" />
      <path d="M84 3 L95 6 L84 9 Z" fill="#f97316" />
    </svg>
  );
}

function SidebarStreakCard() {
  const { streak } = useStats();
  return (
    <div className="mx-3 mb-3 hidden rounded-2xl border border-line bg-card p-3 text-center text-muted lg:block">
      <MountainArt />
      <p className="mt-1 text-sm text-fg">
        {streak.current > 0 ? (
          <>
            You're on a<br />
            <span className="font-bold text-warn">{streak.current} day streak! 🔥</span>
          </>
        ) : (
          <>Complete a task today to start your streak.</>
        )}
      </p>
      <a href="#/achievements" className="mt-2 inline-flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/10">
        View Achievements →
      </a>
    </div>
  );
}

function Sidebar() {
  const { prefs, updatePrefs, profile } = useData();
  const { path } = useRoute();
  const install = useInstallAction();
  const collapsed = prefs.sidebarCollapsed;
  const floating = prefs.sidebarStyle === 'floating';
  const label = collapsed ? 'hidden' : 'hidden lg:inline';
  const profileLink = (
    <a
      href="#/profile"
      title="Profile"
      aria-current={path === '/profile' ? 'page' : undefined}
      className={cn('flex h-11 items-center gap-2.5 rounded-xl px-[7px] transition-colors hover:bg-fg/[0.05]', path === '/profile' && 'bg-fg/[0.06]')}
    >
      <Avatar name={profile.displayName} photo={profile.photoData} size={30} />
      <span className={cn(label, 'min-w-0 flex-1 truncate text-left')}>
        <span className="block truncate text-sm font-semibold text-fg">{profile.displayName}</span>
        <span className="block truncate text-[11px] text-faint">{profile.email}</span>
      </span>
    </a>
  );
  return (
    <aside
      className={cn(
        'fixed z-40 hidden flex-col border-line bg-surface transition-[width] duration-200 md:flex',
        floating ? 'inset-y-3 left-3 rounded-2xl border shadow-xl' : 'inset-y-0 left-0 border-r',
        collapsed ? 'w-[72px]' : 'w-[72px] lg:w-60'
      )}
      aria-label="Main navigation"
    >
      <a href="#/home" className="flex h-16 shrink-0 items-center gap-2.5 px-[18px]">
        <Logo size={36} />
        <span className={cn(label, 'text-lg font-bold tracking-tight text-fg')}>Consisto</span>
      </a>
      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {NAV.map((item) => {
          const active = isActive(item.path, path);
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              title={item.label}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                active ? 'bg-accent text-accent-fg shadow-[0_10px_28px_-14px_var(--accent)]' : 'text-muted hover:bg-fg/[0.05] hover:text-fg'
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span className={label}>{item.label}</span>
            </a>
          );
        })}
      </nav>
      {!collapsed && <SidebarStreakCard />}
      <div className="space-y-1 border-t border-line p-3">
        {profileLink}
        {install.canShow && (
          <button
            onClick={install.run}
            title="Install App"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-accent hover:bg-accent/10 lg:justify-start lg:px-3"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className={label}>Install App</span>
          </button>
        )}
        <div className={cn(collapsed ? 'block' : 'lg:hidden')}>
          <ThemeSwitch collapsed />
        </div>
        <div className={cn(collapsed ? 'hidden' : 'hidden lg:block')}>
          <ThemeSwitch collapsed={false} />
        </div>
        <button
          onClick={() => updatePrefs({ sidebarCollapsed: !collapsed })}
          className="hidden h-10 w-full items-center justify-center gap-2 rounded-xl text-sm text-muted hover:bg-fg/[0.06] hover:text-fg lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          <span className={label}>Collapse</span>
        </button>
      </div>
    </aside>
  );
}

function SyncStatus({ compact }: { compact?: boolean }) {
  const online = useOnline();
  const { syncing } = useData();
  if (!online)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-semibold text-warn" title="Offline — changes are saved on this device and will sync automatically">
        <CloudOff className="h-3.5 w-3.5" />
        {!compact && 'Offline · changes queued'}
      </span>
    );
  if (syncing)
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent" title="Syncing with the cloud">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        {!compact && 'Syncing'}
      </span>
    );
  return null;
}

function TopBar() {
  const { profile } = useData();
  return (
    <header className="sticky top-0 z-30 hidden h-16 items-center gap-3 border-b border-line bg-bg/80 px-6 backdrop-blur-md md:flex">
      <GlobalSearch className="max-w-md" />
      <div className="ml-auto flex items-center gap-1.5">
        <SyncStatus />
        <NotificationBell />
        <a href="#/profile" aria-label="Profile" className="ml-1 rounded-full">
          <Avatar name={profile.displayName} photo={profile.photoData} size={36} />
        </a>
      </div>
    </header>
  );
}

const TITLES: Record<string, string> = {
  '/calendar': 'Calendar',
  '/analytics': 'Analytics',
  '/notes': 'Notes',
  '/achievements': 'Achievements',
  '/settings': 'Settings',
  '/profile': 'Profile',
  '/more': 'More',
  '/tasks': 'All Tasks',
  '/notifications': 'Notifications',
};

function MobileTopBar() {
  const { path } = useRoute();
  const { profile } = useData();
  const [searching, setSearching] = useState(false);
  const title = TITLES[path];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden">
      {searching ? (
        <div className="flex h-14 items-center gap-2 px-3">
          <GlobalSearch autoFocus onDone={() => setSearching(false)} />
          <button aria-label="Close search" onClick={() => setSearching(false)} className="grid h-10 w-10 place-items-center rounded-xl text-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex h-14 items-center gap-2 px-4">
          {title ? (
            <h1 className="text-lg font-bold tracking-tight text-fg">{title}</h1>
          ) : (
            <a href="#/home" className="flex items-center gap-2">
              <Logo size={30} />
              <span className="text-lg font-bold tracking-tight text-fg">Consisto</span>
            </a>
          )}
          <div className="ml-auto flex items-center">
            <SyncStatus compact />
            <button aria-label="Search" onClick={() => setSearching(true)} className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:text-fg">
              <Search className="h-5 w-5" />
            </button>
            <NotificationBell />
            <a href="#/profile" aria-label="Profile" className="ml-1">
              <Avatar name={profile.displayName} photo={profile.photoData} size={32} />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function BottomNav() {
  const { path } = useRoute();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Main navigation"
    >
      <div className="grid h-16 grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active = isActive(item.path, path);
          return (
            <a
              key={item.path}
              href={`#${item.path}`}
              aria-current={active ? 'page' : undefined}
              className={cn('flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors', active ? 'text-accent' : 'text-faint')}
            >
              <span className={cn('grid h-7 w-12 place-items-center rounded-full transition-colors', active && 'bg-accent/15')}>
                <item.icon className="h-5 w-5" />
              </span>
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Fab() {
  const ui = useUI();
  const data = useData();
  const { path } = useRoute();
  const [open, setOpen] = useState(false);
  if (['/settings', '/profile', '/more', '/notifications'].includes(path)) return null;
  const newNote = (type: 'quick' | 'detailed') => {
    setOpen(false);
    const id = data.createNote({ type });
    ui.openNote(id);
  };
  const actions = [
    { label: 'New task', icon: ListChecks, run: () => { setOpen(false); ui.openTaskEditor(); } },
    { label: 'Quick note', icon: StickyNote, run: () => newNote('quick') },
    { label: 'Detailed note', icon: FileText, run: () => newNote('detailed') },
  ];
  return (
    <div className="fixed right-4 z-40 flex flex-col items-end gap-2 md:hidden" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }}>
      {open && <div className="fixed inset-0 -z-10 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />}
      {open &&
        actions.map((a, i) => (
          <button
            key={a.label}
            onClick={a.run}
            className="flex items-center gap-2 rounded-full border border-line bg-card-2 py-2 pl-3 pr-4 text-sm font-semibold text-fg shadow-xl animate-slide-up"
            style={{ animationDelay: `${(actions.length - i) * 30}ms` }}
          >
            <a.icon className="h-4 w-4 text-accent" />
            {a.label}
          </button>
        ))}
      <button
        aria-label={open ? 'Close quick actions' : 'Create task or note'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-14 w-14 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_12px_32px_-8px_var(--accent)] transition active:scale-95"
      >
        <Plus className={cn('h-6 w-6 transition-transform', open && 'rotate-45')} />
      </button>
    </div>
  );
}

function DbErrorBanner() {
  const { dbError, dismissDbError } = useData();
  if (!dbError) return null;
  const msg =
    dbError === 'permission'
      ? 'Firestore rejected a request (permission denied). Deploy the security rules from firestore.rules and make sure you are signed in.'
      : dbError === 'missing'
        ? 'The Firestore database was not found. Create a Firestore database in the Firebase console (Build → Firestore Database).'
        : `Cloud sync problem: ${dbError}. Your changes are kept on this device.`;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad/10 p-3 text-sm text-fg">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-bad" />
      <p className="flex-1 leading-relaxed">{msg}</p>
      <button onClick={dismissDbError} aria-label="Dismiss" className="rounded-lg p-1 text-muted hover:bg-fg/10">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { prefs } = useData();
  const collapsed = prefs.sidebarCollapsed;
  const floating = prefs.sidebarStyle === 'floating';
  const pad = floating ? (collapsed ? 'md:pl-[84px]' : 'md:pl-[84px] lg:pl-[252px]') : collapsed ? 'md:pl-[72px]' : 'md:pl-[72px] lg:pl-60';
  return (
    <div className={cn('min-h-dvh transition-[padding] duration-200', pad)}>
      <Sidebar />
      <MobileTopBar />
      <TopBar />
      <main className="mx-auto w-full max-w-[1440px] px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-10 md:pt-6 lg:px-8">
        <DbErrorBanner />
        {children}
      </main>
      <BottomNav />
      <Fab />
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="hidden text-2xl font-bold tracking-tight text-fg md:block">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export { navigate };
