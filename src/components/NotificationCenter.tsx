import { useMemo, useRef, useState } from 'react';
import { AlarmClock, Bell, BellOff, BellRing, CheckCheck, CircleX, Flame, Info, Settings, Trash2, Trophy, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationType } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { navigate, useClickOutside, useIsMobile } from '../hooks';
import { nowInTz, timeAgo, zonedToEpoch } from '../lib/dates';
import { cn } from '../lib/utils';
import { Button, EmptyState, Segmented } from './ui';

const TYPE_META: Record<NotificationType, { icon: LucideIcon; cls: string; label: string }> = {
  start: { icon: BellRing, cls: 'bg-ok/15 text-ok', label: 'Start reminder' },
  end: { icon: AlarmClock, cls: 'bg-warn/15 text-warn', label: 'End reminder' },
  missed: { icon: CircleX, cls: 'bg-bad/15 text-bad', label: 'Missed task' },
  'reminder-missed': { icon: BellOff, cls: 'bg-fg/10 text-muted', label: 'Missed reminder' },
  milestone: { icon: Flame, cls: 'bg-orange-400/15 text-orange-400', label: 'Streak milestone' },
  achievement: { icon: Trophy, cls: 'bg-amber-400/15 text-amber-400', label: 'Achievement' },
  system: { icon: Info, cls: 'bg-info/15 text-info', label: 'System' },
};

type Filter = 'all' | 'reminders' | 'missed' | 'rewards';

const matches = (n: AppNotification, f: Filter) =>
  f === 'all' ||
  (f === 'reminders' && (n.type === 'start' || n.type === 'end' || n.type === 'reminder-missed')) ||
  (f === 'missed' && (n.type === 'missed' || n.type === 'reminder-missed')) ||
  (f === 'rewards' && (n.type === 'milestone' || n.type === 'achievement'));

export function NotificationList({ onNavigate, compact }: { onNavigate?: () => void; compact?: boolean }) {
  const data = useData();
  const ui = useUI();
  const [filter, setFilter] = useState<Filter>('all');
  const startOfToday = zonedToEpoch(nowInTz(data.prefs.timezone).dateKey, 0, data.prefs.timezone);

  const items = useMemo(() => data.notifications.filter((n) => !n.cleared && matches(n, filter)), [data.notifications, filter]);
  const today = items.filter((n) => n.createdAtMs >= startOfToday);
  const earlier = items.filter((n) => n.createdAtMs < startOfToday);
  const unread = data.notifications.filter((n) => !n.read && !n.cleared).length;

  const open = (n: AppNotification) => {
    data.markNotificationsRead([n.id]);
    navigate(n.link || '/home');
    onNavigate?.();
  };

  const clearAll = async () => {
    const ok = await ui.confirm({ title: 'Clear all notifications?', message: 'They will be removed from the notification centre on all your devices.', confirmText: 'Clear all', danger: true });
    if (ok) data.clearNotifications(items.map((n) => n.id));
  };

  const renderItem = (n: AppNotification) => {
    const meta = TYPE_META[n.type] ?? TYPE_META.system;
    const Icon = meta.icon;
    return (
      <li key={n.id} className="group relative">
        <button onClick={() => open(n)} className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-fg/[0.05]', !n.read && 'bg-accent/[0.06]')}>
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', meta.cls)}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 pr-6">
            <span className="block text-sm font-semibold leading-snug text-fg">{n.title}</span>
            {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{n.body}</span>}
            <span className="mt-1 block text-[11px] text-faint">
              {meta.label} · {timeAgo(n.createdAtMs)}
            </span>
          </span>
          {!n.read && <span className="absolute right-3 top-4 h-2 w-2 rounded-full bg-accent" aria-label="Unread" />}
        </button>
        <button
          aria-label="Clear notification"
          onClick={() => data.clearNotifications([n.id])}
          className="absolute bottom-2 right-2 rounded-lg p-1.5 text-faint opacity-100 transition hover:bg-fg/10 hover:text-fg md:opacity-0 md:group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </li>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('flex flex-wrap items-center justify-between gap-2', compact ? 'px-3 pb-2' : 'pb-3')}>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          className="flex-1"
          options={[
            { value: 'all', label: 'All' },
            { value: 'reminders', label: 'Reminders' },
            { value: 'missed', label: 'Missed' },
            { value: 'rewards', label: 'Rewards' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={<CheckCheck />} onClick={() => data.markNotificationsRead()} disabled={!unread}>
            Read all
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={clearAll} disabled={!items.length}>
            Clear
          </Button>
        </div>
      </div>
      <div className={cn('min-h-0 flex-1 overflow-y-auto', compact && 'max-h-[60vh] px-1')}>
        {!items.length ? (
          <EmptyState icon={<Bell />} title="You're all caught up" message="Reminders, missed tasks, streak milestones and achievements will appear here." />
        ) : (
          <>
            {today.length > 0 && <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Today</p>}
            <ul className="space-y-1">{today.map(renderItem)}</ul>
            {earlier.length > 0 && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Earlier</p>}
            <ul className="space-y-1">{earlier.map(renderItem)}</ul>
          </>
        )}
      </div>
      <a
        href="#/settings?section=notifications"
        onClick={() => onNavigate?.()}
        className={cn('mt-2 flex items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-muted hover:bg-fg/[0.05] hover:text-fg', compact && 'mx-3 mb-3')}
      >
        <Settings className="h-3.5 w-3.5" /> Notification preferences
      </a>
    </div>
  );
}

export function NotificationBell() {
  const data = useData();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  const unread = data.notifications.filter((n) => !n.read && !n.cleared).length;
  return (
    <div ref={ref} className="relative">
      <button
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
        onClick={() => (isMobile ? navigate('/notifications') : setOpen((o) => !o))}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-fg/[0.06] hover:text-fg"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-bad px-1 text-[10px] font-bold text-white ring-2 ring-bg">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && !isMobile && (
        <div className="absolute right-0 top-12 z-50 flex w-[400px] flex-col rounded-2xl border border-line bg-card shadow-2xl animate-scale-in">
          <div className="flex items-center justify-between px-4 pb-2 pt-4">
            <h2 className="text-base font-semibold text-fg">Notifications</h2>
            <a href="#/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-accent hover:underline">
              Open full view
            </a>
          </div>
          <NotificationList compact onNavigate={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const { now } = useStats();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col" data-now={now.minutes}>
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Notifications</h1>
        <p className="mt-1 text-sm text-muted">Reminders, missed tasks, milestones and achievements.</p>
      </div>
      <div className="card p-3 md:p-4">
        <NotificationList />
      </div>
    </div>
  );
}
