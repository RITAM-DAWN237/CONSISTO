import { useEffect } from 'react';
import { ArrowRight, ArrowUp, BarChart3, Bell, CheckCircle2, Clock, Flame, LayoutGrid, ListChecks, Pin, Plus, Sparkles, StickyNote, Trophy } from 'lucide-react';
import type { WidgetId } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { MILESTONES, MOTIVATION, WIDGET_META } from '../constants';
import { addDays, dayNum, formatDateKey, formatHours, formatTime, nowInTz, partOfDay, rangeKeys, relativeDayLabel, startOfWeek, untilLabel, WEEKDAYS_SHORT, weekdayOf } from '../lib/dates';
import { aggregate, dayUnitState, recentRatios } from '../lib/engine';
import { ACHIEVEMENTS } from '../lib/achievements';
import { cn, hexToRgba } from '../lib/utils';
import { useUpcomingReminders } from '../services/engines';
import { navigate, useNotificationPermission, useRoute } from '../hooks';
import { Heatmap } from '../components/Heatmap';
import { BarChart, MiniBars, Sparkline, useChartTheme } from '../components/Charts';
import { CountTaskRow, TaskRow } from '../components/TaskRow';
import { Button, Card, CardHeader, CategoryChip, EmptyState, HexBadge, LinkAction, ProgressBar } from '../components/ui';

function HeroArt() {
  return (
    <svg viewBox="0 0 320 120" preserveAspectRatio="xMaxYMax meet" className="pointer-events-none absolute bottom-0 right-0 h-full w-[60%] max-w-[380px] opacity-80" aria-hidden>
      <defs>
        <radialGradient id="hero-glow">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".38" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="hero-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity=".34" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity=".02" />
        </linearGradient>
        <mask id="hero-crescent">
          <rect width="320" height="120" fill="white" />
          <circle cx="252" cy="31" r="19" fill="black" />
        </mask>
      </defs>
      <circle cx="262" cy="38" r="50" fill="url(#hero-glow)" />
      <circle cx="262" cy="38" r="21" fill="#e9ddff" mask="url(#hero-crescent)" />
      {[
        [196, 22],
        [300, 14],
        [228, 60],
        [170, 44],
        [310, 64],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i % 2 ? 1.2 : 1.8} fill="#fff" opacity=".7" />
      ))}
      <path d="M40 120 L118 66 L150 86 L196 48 L248 92 L272 78 L320 104 L320 120 Z" fill="url(#hero-hill)" />
      <path d="M150 120 L214 82 L250 100 L290 86 L320 98 L320 120 Z" fill="var(--accent)" opacity=".16" />
    </svg>
  );
}

function Greeting() {
  const { profile } = useData();
  const { now, todayKey } = useStats();
  const first = profile.displayName.split(' ')[0] || 'there';
  return (
    <div className="relative overflow-hidden rounded-3xl border border-line bg-gradient-to-r from-accent/[0.10] via-card to-card px-5 py-5 md:px-7 md:py-7">
      <HeroArt />
      <div className="relative max-w-[70%]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{formatDateKey(todayKey, 'long')}</p>
        <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-fg md:text-[32px]">
          {partOfDay(now.minutes)}, {first}! <span className="inline-block origin-[70%_70%] animate-wave">👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted md:text-base">{MOTIVATION[dayNum(todayKey) % MOTIVATION.length]}</p>
      </div>
    </div>
  );
}

function StatCards() {
  const { prefs } = useData();
  const { streak, todayItems, dayStats, todayKey, totalCompletions } = useStats();
  const done = todayItems.filter((i) => i.status === 'completed').length;
  const total = todayItems.filter((i) => i.status !== 'skipped').length;
  const pct = total ? done / total : 0;
  const ws = startOfWeek(todayKey, prefs.weekStart);
  const weekKeys = rangeKeys(ws, addDays(ws, 6));
  const week = aggregate(dayStats, weekKeys);
  const lastWeek = aggregate(dayStats, rangeKeys(addDays(ws, -7), addDays(ws, -1)));
  const delta = week.plannedMin - lastWeek.plannedMin;
  const todayKept = dayUnitState(dayStats.get(todayKey), prefs.streakRule, true) === 'kept';
  const card = 'relative overflow-hidden p-3.5 md:p-5';
  return (
    <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
      <Card className={card}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-500/15 md:h-11 md:w-11">
            <Flame className="h-5 w-5 text-orange-400 md:h-6 md:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-none text-fg md:text-3xl">{streak.current}</p>
            <p className="mt-1 text-xs text-muted">Day Streak</p>
          </div>
          {todayKept && streak.current > 0 && (
            <span className="ml-auto inline-flex items-center gap-0.5 text-xs font-semibold text-ok">
              <ArrowUp className="h-3.5 w-3.5" />1
            </span>
          )}
        </div>
        <div className="-mx-1 mt-3">
          <Sparkline values={recentRatios(dayStats, todayKey, 14)} />
        </div>
      </Card>

      <Card className={card}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ok/15 md:h-11 md:w-11">
            <CheckCircle2 className="h-5 w-5 text-ok md:h-6 md:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-none text-fg md:text-3xl">
              {done}
              <span className="text-lg text-muted"> / {total}</span>
            </p>
            <p className="mt-1 text-xs text-muted">Today's Progress</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <ProgressBar value={pct} />
          <span className="text-xs font-semibold text-fg">{Math.round(pct * 100)}%</span>
        </div>
      </Card>

      <Card className={card}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-accent/15 md:h-11 md:w-11">
            <Clock className="h-5 w-5 text-accent md:h-6 md:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-none text-fg md:text-3xl">{formatHours(week.plannedMin)}</p>
            <p className="mt-1 text-xs text-muted">Planned this week</p>
          </div>
        </div>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className={cn('text-xs font-semibold', delta >= 0 ? 'text-ok' : 'text-warn')}>
            {delta >= 0 ? '↑' : '↓'} {formatHours(Math.abs(delta))}
            <span className="hidden font-normal text-faint sm:inline"> vs last week</span>
          </span>
          <MiniBars values={weekKeys.map((k) => dayStats.get(k)?.plannedMin ?? 0)} highlight={weekKeys.indexOf(todayKey)} />
        </div>
      </Card>

      <Card className={cn(card, 'cursor-pointer transition hover:border-line-strong')} onClick={() => navigate('/achievements')}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-400/15 md:h-11 md:w-11">
            <Trophy className="h-5 w-5 text-amber-400 md:h-6 md:w-6" />
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-none text-fg md:text-3xl">{totalCompletions}</p>
            <p className="mt-1 text-xs text-muted">Total Completions</p>
          </div>
          <ArrowRight className="ml-auto hidden h-4 w-4 text-faint sm:block" />
        </div>
        <p className="mt-4 text-xs text-muted">Every tick is recorded with its real completion time.</p>
      </Card>
    </div>
  );
}

function TasksWidget() {
  const { todayItems, overdueItems, countTasks } = useStats();
  const ui = useUI();
  const done = todayItems.filter((x) => x.status === 'completed').length;
  const nothing = todayItems.length === 0 && countTasks.length === 0;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        icon={<ListChecks />}
        title="Today's Tasks"
        subtitle={todayItems.length ? `${done} of ${todayItems.length} completed · tap the circle to tick / undo` : 'Nothing scheduled today'}
        action={<LinkAction href="#/tasks">View All</LinkAction>}
      />
      <div className="flex-1 px-2 md:px-3">
        {nothing ? (
          <EmptyState icon={<Sparkles />} title="No tasks scheduled today" message="Add a habit or task — CONSISTO reminds you, you tick it off, and your streak grows." />
        ) : (
          <div className="divide-y divide-line">
            {todayItems.map((i) => (
              <TaskRow key={i.occ.id} item={i} />
            ))}
          </div>
        )}
        {countTasks.length > 0 && (
          <>
            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Count goals</p>
            {countTasks.map((t) => (
              <CountTaskRow key={t.id} task={t} />
            ))}
          </>
        )}
        {overdueItems.length > 0 && (
          <details className="mx-1 mt-3 rounded-xl border border-bad/20 bg-bad/[0.04] px-1 py-1">
            <summary className="cursor-pointer list-none px-2 py-1.5 text-xs font-semibold text-bad">
              Missed recently · {overdueItems.length} — you can still complete them (recorded as late)
            </summary>
            {overdueItems.map((i) => (
              <TaskRow key={i.occ.id} item={i} showDate />
            ))}
          </details>
        )}
      </div>
      <div className="flex justify-center p-4">
        <Button variant="soft" icon={<Plus />} onClick={() => ui.openTaskEditor()}>
          Add a new task
        </Button>
      </div>
    </Card>
  );
}

function HeatmapWidget() {
  return (
    <Card className="h-full">
      <CardHeader icon={<BarChart3 />} title="Consistency Heatmap" action={<LinkAction href="#/analytics">Analytics</LinkAction>} />
      <div className="px-4 pb-4 md:px-5">
        <Heatmap compact />
      </div>
    </Card>
  );
}

function TrophyArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden>
      <defs>
        <linearGradient id="trophy-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef3c7" />
          <stop offset=".45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <path d="M36 20h48v20c0 16-10 28-24 28S36 56 36 40V20z" fill="url(#trophy-gold)" />
      <path d="M37 27H25c0 14 6 22 16 24M83 27h12c0 14-6 22-16 24" stroke="url(#trophy-gold)" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="54" y="66" width="12" height="15" fill="url(#trophy-gold)" />
      <rect x="40" y="80" width="40" height="10" rx="3" fill="url(#trophy-gold)" />
      <rect x="33" y="90" width="54" height="11" rx="3" fill="#78350f" opacity=".85" />
      <path d="M60 29l4 8.4 9.2 1.1-6.8 6.3 1.8 9.1L60 49.4l-8.2 4.5 1.8-9.1-6.8-6.3 9.2-1.1z" fill="#fff" opacity=".9" />
      <path d="M100 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M16 50l1.5 3.5 3.5 1.5-3.5 1.5L16 60l-1.5-3.5L11 55l3.5-1.5z" fill="#fff" opacity=".8" />
    </svg>
  );
}

function StreakWidget() {
  const { streak, longestStreak } = useStats();
  const next = MILESTONES.find((m) => m > streak.current) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => m <= streak.current) ?? 0;
  const progress = next ? (streak.current - prev) / (next - prev) : 1;
  return (
    <div className="relative h-full min-h-[150px] overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent via-accent-strong to-[#2e1065] p-5 text-white shadow-[0_18px_40px_-20px_var(--accent)]">
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <TrophyArt className="absolute -left-1 bottom-1 h-28 w-28 drop-shadow-[0_8px_16px_rgba(0,0,0,.35)] md:h-32 md:w-32" />
      <div className="relative ml-[104px] md:ml-[120px]">
        <h3 className="text-xl font-extrabold md:text-2xl">{streak.current > 0 ? `${streak.current} Day Streak!` : 'Start a streak today'}</h3>
        <p className="mt-1 text-sm text-white/80">
          {streak.current > 0 ? "You're on fire! Keep going 🔥" : 'Complete your scheduled tasks to light the flame.'}
        </p>
        {next && (
          <div className="mt-3">
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-white/75">
              {next - streak.current} more {next - streak.current === 1 ? 'day' : 'days'} to the {next}-day milestone · best {longestStreak}
            </p>
          </div>
        )}
        <a href="#/achievements" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur hover:bg-white/25">
          View Details <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function RemindersWidget() {
  const data = useData();
  const { todayKey } = useStats();
  const events = useUpcomingReminders(4);
  const { permission, request } = useNotificationPermission();
  return (
    <Card className="h-full">
      <CardHeader icon={<Bell />} title="Upcoming Reminders" action={<LinkAction href="#/notifications">View All</LinkAction>} />
      <div className="px-4 pb-4 md:px-5">
        {permission === 'default' && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-accent/10 p-3 text-xs text-fg">
            Enable notifications for start &amp; end alarms.
            <Button size="sm" onClick={() => void request()}>
              Enable
            </Button>
          </div>
        )}
        {permission === 'denied' && (
          <p className="mb-3 rounded-xl bg-warn/10 p-3 text-xs text-warn">Notifications are blocked in browser settings. In-app alerts still appear while CONSISTO is open.</p>
        )}
        {events.length === 0 ? (
          <p className="py-6 text-center text-xs leading-relaxed text-muted">No reminders in the next 24 hours. Give a task a time range to get start / end alarms.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => {
              const at = nowInTz(data.prefs.timezone, e.fireAt);
              return (
                <li key={e.id} className="flex items-center gap-3">
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', e.type === 'start' ? 'bg-ok' : 'bg-warn')} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">
                      {data.taskMap.get(e.taskId)?.title} – {e.type === 'start' ? 'Start' : 'End'} Reminder
                    </p>
                    <p className="text-xs text-muted">
                      {relativeDayLabel(at.dateKey, todayKey)} • {formatTime(at.minutes, data.prefs.timeFormat)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold', e.type === 'start' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>
                    {untilLabel(e.fireAt - Date.now())}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function NotesWidget() {
  const data = useData();
  const ui = useUI();
  const notes = [...data.notes]
    .filter((n) => !n.archived)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAtMs - a.updatedAtMs)
    .slice(0, 3);
  return (
    <Card className="h-full">
      <CardHeader icon={<StickyNote />} title="Quick Notes" action={<LinkAction href="#/notes">View All</LinkAction>} />
      <div className="space-y-2 px-4 pb-4 md:px-5">
        {notes.length === 0 && <p className="py-4 text-center text-xs text-muted">No notes yet — capture ideas, study notes and plans.</p>}
        {notes.map((n) => {
          const cat = data.categoryMap.get(n.categoryId);
          return (
            <button
              key={n.id}
              onClick={() => ui.openNote(n.id)}
              className="block w-full rounded-xl border border-line bg-card-2/60 p-3 text-left transition hover:border-line-strong"
              style={n.color ? { borderLeft: `3px solid ${n.color}`, background: hexToRgba(n.color, 0.06) } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-fg">{n.title || 'Untitled note'}</p>
                {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{n.text || 'Empty note'}</p>
              {cat && <CategoryChip className="mt-2" category={cat} />}
            </button>
          );
        })}
        <Button variant="ghost" size="sm" icon={<Plus />} onClick={() => ui.openNote(data.createNote({ type: 'quick' }))}>
          Quick note
        </Button>
      </div>
    </Card>
  );
}

function AchievementsWidget() {
  const data = useData();
  const { streak, totalCompletions, todayItems } = useStats();
  const doneToday = todayItems.filter((i) => i.status === 'completed').length;
  const items: [string, [string, string], number, string][] = [
    ['flame', ['#fb923c', '#c2410c'], streak.current, 'Day Streak'],
    ['star', ['#fde047', '#f59e0b'], doneToday, 'Done Today'],
    ['crown', ['#f0abfc', '#7c3aed'], totalCompletions, 'Total'],
  ];
  return (
    <Card className="h-full">
      <CardHeader icon={<Trophy />} title="Achievements" action={<LinkAction href="#/achievements">View All</LinkAction>} />
      <div className="grid grid-cols-3 gap-2 px-4 text-center md:px-5">
        {items.map(([icon, colors, value, label]) => (
          <div key={label} className="flex flex-col items-center">
            <HexBadge icon={icon} colors={colors} size={46} />
            <p className="mt-1 text-base font-bold text-fg">{value}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </div>
        ))}
      </div>
      <p className="px-5 pb-4 pt-3 text-center text-xs text-muted">
        {data.achievements.size} of {ACHIEVEMENTS.length} badges unlocked
      </p>
    </Card>
  );
}

function WeeklyWidget() {
  const { dayStats, todayKey } = useStats();
  const { prefs } = useData();
  const t = useChartTheme();
  const ws = startOfWeek(todayKey, prefs.weekStart);
  const keys = rangeKeys(ws, addDays(ws, 6));
  return (
    <Card className="h-full">
      <CardHeader icon={<BarChart3 />} title="Weekly Activity" subtitle="Completed vs scheduled this week" action={<LinkAction href="#/analytics">Analytics</LinkAction>} />
      <div className="px-3 pb-4 md:px-5">
        <BarChart
          height={210}
          stacked
          legend
          labels={keys.map((k) => WEEKDAYS_SHORT[weekdayOf(k)])}
          series={[
            { label: 'Completed', data: keys.map((k) => (dayStats.get(k)?.completed ?? 0) + (dayStats.get(k)?.countActivity ?? 0)), color: t.accent },
            { label: 'Missed', data: keys.map((k) => dayStats.get(k)?.missed ?? 0), color: t.bad },
            { label: 'Remaining', data: keys.map((k) => (dayStats.get(k)?.pending ?? 0) + (dayStats.get(k)?.upcoming ?? 0)), color: hexToRgba(t.muted.startsWith('#') ? t.muted : '#9a97ad', 0.35) },
          ]}
        />
      </div>
    </Card>
  );
}

export default function HomePage() {
  const { prefs } = useData();
  const ui = useUI();
  const { params } = useRoute();
  const wantsNew = params.get('new');

  useEffect(() => {
    if (wantsNew === 'task') {
      ui.openTaskEditor();
      navigate('/home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  const widgets = prefs.widgets.filter((w) => w.visible);
  const render = (id: WidgetId) => {
    switch (id) {
      case 'tasks':
        return <TasksWidget />;
      case 'heatmap':
        return <HeatmapWidget />;
      case 'streak':
        return <StreakWidget />;
      case 'reminders':
        return <RemindersWidget />;
      case 'notes':
        return <NotesWidget />;
      case 'achievements':
        return <AchievementsWidget />;
      case 'weekly':
        return <WeeklyWidget />;
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <Greeting />
      <StatCards />
      {widgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid />}
            title="All dashboard widgets are hidden"
            message="Turn widgets back on and rearrange them in Settings → Dashboard."
            action={<Button onClick={() => navigate('/settings?section=dashboard')}>Customise dashboard</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-12">
          {widgets.map((w) => (
            <div key={w.id} className={cn('min-w-0', WIDGET_META[w.id].span, !w.mobile && 'hidden md:block')}>
              {render(w.id)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
