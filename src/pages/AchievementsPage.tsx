import { useMemo } from 'react';
import { Award, Flame, Lock, Trophy } from 'lucide-react';
import { useData, useStats } from '../context/DataContext';
import { MILESTONES } from '../constants';
import { ACHIEVEMENTS, computeMetrics, TIER_COLORS } from '../lib/achievements';
import { epochToKey, formatDateKey } from '../lib/dates';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { Card, HexBadge, ProgressBar } from '../components/ui';

export default function AchievementsPage() {
  const data = useData();
  const s = useStats();
  const metrics = useMemo(
    () =>
      computeMetrics({
        completions: [...data.completions.values()],
        stats: s.dayStats,
        windowStart: data.windowStart,
        todayKey: s.todayKey,
        weekStart: data.prefs.weekStart,
        tz: data.prefs.timezone,
        totalCompletions: s.totalCompletions,
        longest: s.longestStreak,
        current: s.streak.current,
        notes: data.notes.length,
      }),
    [data.completions, s.dayStats, data.windowStart, s.todayKey, data.prefs.weekStart, data.prefs.timezone, s.totalCompletions, s.longestStreak, s.streak.current, data.notes.length]
  );
  const unlocked = ACHIEVEMENTS.filter((a) => data.achievements.has(a.id)).length;
  const nextMilestone = MILESTONES.find((m) => m > s.longestStreak);
  const milestones = ACHIEVEMENTS.filter((a) => a.kind === 'milestone');
  const others = ACHIEVEMENTS.filter((a) => a.kind === 'achievement');

  const renderCard = (a: (typeof ACHIEVEMENTS)[number]) => {
    const rec = data.achievements.get(a.id);
    const value = Math.min(a.value(metrics), a.target);
    const done = !!rec;
    return (
      <Card key={a.id} className={cn('flex items-center gap-4 p-4 transition', done ? 'border-accent/30' : 'opacity-90')}>
        <HexBadge icon={a.icon} colors={TIER_COLORS[a.tier]} locked={!done} size={54} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('truncate text-sm font-semibold', done ? 'text-fg' : 'text-muted')}>{a.title}</p>
            {!done && <Lock className="h-3 w-3 shrink-0 text-faint" />}
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{a.description}</p>
          {done ? (
            <p className="mt-1.5 text-[11px] font-semibold capitalize text-accent">
              {a.tier} · unlocked {formatDateKey(epochToKey(rec.unlockedAtMs, data.prefs.timezone), 'full')}
            </p>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <ProgressBar value={value / a.target} color="var(--accent)" className="h-1.5" />
              <span className="shrink-0 text-[11px] font-semibold text-faint">
                {value}/{a.target}
              </span>
            </div>
          )}
        </div>
      </Card>
    );
  };

  return (
    <div>
      <PageHeader title="Achievements" subtitle="Earned only through real, completed activity" />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: <Award className="h-5 w-5 text-accent" />, label: 'Badges unlocked', value: `${unlocked}/${ACHIEVEMENTS.length}`, bg: 'bg-accent/15 ring-1 ring-accent/20' },
          { icon: <Flame className="h-5 w-5 text-orange-400" />, label: 'Current streak', value: `${s.streak.current} days`, bg: 'bg-orange-500/15 ring-1 ring-orange-500/20' },
          { icon: <Trophy className="h-5 w-5 text-amber-400" />, label: 'Longest streak', value: `${s.longestStreak} days`, bg: 'bg-amber-400/15 ring-1 ring-amber-400/20' },
          { icon: <Award className="h-5 w-5 text-ok" />, label: 'Total completions', value: `${s.totalCompletions}`, bg: 'bg-ok/15 ring-1 ring-ok/20' },
        ].map((x) => (
          <Card key={x.label} className="relative overflow-hidden p-4">
            <span className={cn('grid h-10 w-10 place-items-center rounded-2xl', x.bg)}>{x.icon}</span>
            <p className="mt-3 text-xl font-extrabold text-fg md:text-2xl">{x.value}</p>
            <p className="text-xs text-muted">{x.label}</p>
          </Card>
        ))}
      </div>

      <Card className="mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-fg">Streak milestones</h2>
            <p className="text-xs text-muted">
              {nextMilestone ? `${nextMilestone - s.longestStreak} more consistent days to reach ${nextMilestone} days.` : 'Every milestone reached — legendary consistency!'}
            </p>
          </div>
          <p className="text-xs text-faint">Days without scheduled tasks never break a streak.</p>
        </div>
        <div className="no-scrollbar overflow-x-auto pb-1">
          <div className="relative flex min-w-[560px] items-center justify-between px-4">
            <div className="absolute inset-x-6 top-1/2 h-1 -translate-y-1/2 rounded-full bg-fg/10" />
            <div
              className="absolute left-6 top-1/2 h-1 -translate-y-1/2 rounded-full bg-gradient-to-r from-accent to-orange-400 transition-all"
              style={{ width: `calc(${(Math.max(0, MILESTONES.filter((m) => m <= s.longestStreak).length - 1) / (MILESTONES.length - 1)) * 100}% - 0px)` }}
            />
            {MILESTONES.map((m) => {
              const reached = s.longestStreak >= m;
              const isNext = m === nextMilestone;
              return (
                <div key={m} className="relative flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      'grid h-11 w-11 place-items-center rounded-full border-2 text-xs font-bold transition',
                      reached ? 'border-transparent bg-accent text-accent-fg shadow-[0_0_0_5px_color-mix(in_oklab,var(--accent)_20%,transparent)]' : isNext ? 'animate-pulse border-accent bg-card text-accent' : 'border-line bg-card text-faint'
                    )}
                  >
                    {reached ? <Flame className="h-5 w-5" /> : m}
                  </span>
                  <span className={cn('text-[11px] font-semibold', reached ? 'text-fg' : 'text-faint')}>{m}d</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Achievements</h2>
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{others.map(renderCard)}</div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Streak badges</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">{milestones.map(renderCard)}</div>
    </div>
  );
}
