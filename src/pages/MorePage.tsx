import { Bell, ChevronRight, Download, ListChecks, LogOut, Moon, Settings, Sun, Trophy, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useInstallAction } from '../components/Layout';
import { Avatar, Card, Toggle } from '../components/ui';

export default function MorePage() {
  const data = useData();
  const { streak } = useStats();
  const ui = useUI();
  const auth = useAuth();
  const install = useInstallAction();
  const unread = data.notifications.filter((n) => !n.read && !n.cleared).length;
  const dark = data.prefs.theme !== 'light';
  const links = [
    { href: '#/achievements', label: 'Achievements', icon: Trophy, extra: `${data.achievements.size} unlocked` },
    { href: '#/notifications', label: 'Notifications', icon: Bell, extra: unread ? `${unread} unread` : '' },
    { href: '#/tasks', label: 'All tasks', icon: ListChecks, extra: `${data.tasks.length}` },
    { href: '#/settings', label: 'Settings', icon: Settings, extra: '' },
    { href: '#/profile', label: 'Profile', icon: User, extra: '' },
  ];
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <a href="#/profile" className="card flex items-center gap-4 p-4">
        <Avatar name={data.profile.displayName} photo={data.profile.photoData} size={52} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-fg">{data.profile.displayName}</p>
          <p className="truncate text-xs text-muted">{data.profile.email}</p>
        </div>
        <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-semibold text-orange-400">🔥 {streak.current}</span>
      </a>
      <Card className="divide-y divide-line">
        {links.map((l) => (
          <a key={l.href} href={l.href} className="flex items-center gap-3 px-4 py-3.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent">
              <l.icon className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-fg">{l.label}</span>
            {l.extra && <span className="text-xs text-muted">{l.extra}</span>}
            <ChevronRight className="h-4 w-4 text-faint" />
          </a>
        ))}
      </Card>
      <Card className="divide-y divide-line">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent">{dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</span>
          <span className="flex-1 text-sm font-medium text-fg">Dark mode</span>
          <Toggle checked={dark} onChange={(v) => data.updatePrefs({ theme: v ? 'dark' : 'light' })} label="Dark mode" />
        </div>
        {install.canShow && (
          <button onClick={install.run} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent">
              <Download className="h-4 w-4" />
            </span>
            <span className="flex-1 text-sm font-medium text-fg">Install app</span>
            <ChevronRight className="h-4 w-4 text-faint" />
          </button>
        )}
        <button
          onClick={async () => {
            if (await ui.confirm({ title: 'Sign out of CONSISTO?', confirmText: 'Sign out' })) void auth.logOut();
          }}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-bad/12 text-bad">
            <LogOut className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm font-medium text-bad">Sign out</span>
        </button>
      </Card>
      <p className="pb-2 text-center text-[11px] text-faint">CONSISTO · Build habits. Keep promises. Stay consistent.</p>
    </div>
  );
}
