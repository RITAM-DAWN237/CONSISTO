import { useMemo, useState } from 'react';
import { BarChart3, CalendarRange, ChevronLeft, ChevronRight, Clock, Flame, PieChart, Target, TrendingUp, Trophy, XCircle, CheckCircle2, ListChecks } from 'lucide-react';
import { useData, useStats } from '../context/DataContext';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatDateKey,
  formatHours,
  minKey,
  parseKey,
  rangeKeys,
  startOfMonth,
  startOfWeek,
  WEEKDAYS_LONG,
  WEEKDAYS_SHORT,
  weekdayOf,
} from '../lib/dates';
import { aggregate, categoryBreakdown, dayUnitState, heatLevel, streakFromUnits } from '../lib/engine';
import { cn, hexToRgba } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { Heatmap, levelStyle, usePalette } from '../components/Heatmap';
import { BarChart, DoughnutChart, LineChart, useChartTheme } from '../components/Charts';
import { Button, Card, CardHeader, EmptyState, Ring, Segmented } from '../components/ui';

type Tab = 'overview' | 'weekly' | 'monthly';

function Metric({ icon, label, value, sub, tone = 'text-fg' }: { icon: React.ReactNode; label: string; value: string; sub?: string; tone?: string }) {
  return (
    <Card className="p-3.5 md:p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {icon}
        {label}
      </div>
      <p className={cn('mt-1.5 text-xl font-extrabold md:text-2xl', tone)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-faint">{sub}</p>}
    </Card>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const { tasks } = useData();
  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Calculated from your real completion records"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
            ]}
          />
        }
      />
      {tasks.length === 0 ? (
        <Card>
          <EmptyState icon={<BarChart3 />} title="No data yet" message="Create tasks and tick them off — your analytics, heatmap and streaks build up from real activity only." />
        </Card>
      ) : tab === 'overview' ? (
        <Overview />
      ) : tab === 'weekly' ? (
        <Weekly />
      ) : (
        <Monthly />
      )}
    </div>
  );
}

function Overview() {
  const data = useData();
  const s = useStats();
  const t = useChartTheme();
  const today = s.todayStat;
  const last30 = rangeKeys(addDays(s.todayKey, -29), s.todayKey);
  const agg30 = aggregate(s.dayStats, last30);
  const last7 = rangeKeys(addDays(s.todayKey, -6), s.todayKey);
  const cats = categoryBreakdown(s.dayStats, last30);
  const catEntries = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Today</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric icon={<ListChecks />} label="Scheduled" value={`${(today?.scheduled ?? 0) + (today?.countActivity ?? 0)}`} />
          <Metric icon={<CheckCircle2 />} label="Completed" value={`${(today?.completed ?? 0) + (today?.countActivity ?? 0)}`} tone="text-ok" />
          <Metric icon={<XCircle />} label="Missed" value={`${today?.missed ?? 0}`} tone={today?.missed ? 'text-bad' : 'text-fg'} />
          <Metric icon={<Target />} label="Completion" value={pct(today?.ratio ?? null)} />
          <Metric icon={<Clock />} label="Planned hours" value={formatHours(today?.plannedMin ?? 0)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card className="flex flex-col items-center gap-5 p-5 sm:flex-row">
          <Ring value={agg30.rate ?? 0} size={140} stroke={12}>
            <div>
              <p className="text-3xl font-extrabold text-fg">{pct(agg30.rate)}</p>
              <p className="text-[11px] text-muted">30-day consistency</p>
            </div>
          </Ring>
          <div className="grid w-full flex-1 grid-cols-2 gap-3">
            <div>
              <p className="flex items-center gap-1 text-xs text-muted">
                <Flame className="h-3.5 w-3.5 text-orange-400" /> Current streak
              </p>
              <p className="text-2xl font-extrabold text-fg">{s.streak.current}d</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-xs text-muted">
                <Trophy className="h-3.5 w-3.5 text-amber-400" /> Longest
              </p>
              <p className="text-2xl font-extrabold text-fg">{s.longestStreak}d</p>
            </div>
            <div>
              <p className="text-xs text-muted">Weekly streak</p>
              <p className="text-2xl font-extrabold text-fg">{s.weeklyStreak.current}w</p>
            </div>
            <div>
              <p className="text-xs text-muted">This month</p>
              <p className="text-2xl font-extrabold text-fg">{pct(s.monthlyConsistency)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted">Total completions</p>
              <p className="text-2xl font-extrabold text-fg">{s.totalCompletions}</p>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader icon={<TrendingUp />} title="Your Activity" subtitle="Last 7 days" />
          <div className="px-3 pb-4 md:px-5">
            <BarChart
              height={210}
              stacked
              legend
              labels={last7.map((k) => WEEKDAYS_SHORT[weekdayOf(k)])}
              series={[
                { label: 'Completed', data: last7.map((k) => (s.dayStats.get(k)?.completed ?? 0) + (s.dayStats.get(k)?.countActivity ?? 0)), color: t.ok },
                { label: 'Missed', data: last7.map((k) => s.dayStats.get(k)?.missed ?? 0), color: t.bad },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader icon={<CalendarRange />} title="Consistency Heatmap" subtitle="Completed ÷ scheduled occurrences per day" />
        <div className="px-4 pb-5 md:px-5">
          <Heatmap initialRange={data.prefs.heatmapRange} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<PieChart />} title="By category" subtitle="Completions · last 30 days" />
          <div className="px-4 pb-4 md:px-5">
            {catEntries.length ? (
              <DoughnutChart
                height={240}
                labels={catEntries.map(([id]) => data.categoryMap.get(id)?.name ?? 'Other')}
                data={catEntries.map(([, n]) => n)}
                colors={catEntries.map(([id]) => data.categoryMap.get(id)?.color ?? '#94a3b8')}
              />
            ) : (
              <p className="py-10 text-center text-xs text-muted">No completions in the last 30 days.</p>
            )}
          </div>
        </Card>
        <PlannedVsActual keys={last7} title="Planned vs actual" subtitle="Hours · last 7 days" />
      </div>
    </div>
  );
}

function PlannedVsActual({ keys, title, subtitle }: { keys: string[]; title: string; subtitle: string }) {
  const s = useStats();
  const t = useChartTheme();
  return (
    <Card>
      <CardHeader icon={<Clock />} title={title} subtitle={subtitle} />
      <div className="px-3 pb-4 md:px-5">
        <BarChart
          height={240}
          legend
          unit="h"
          labels={keys.map((k) => WEEKDAYS_SHORT[weekdayOf(k)])}
          series={[
            { label: 'Planned', data: keys.map((k) => +((s.dayStats.get(k)?.plannedMin ?? 0) / 60).toFixed(1)), color: hexToRgba(t.accent.startsWith('#') ? t.accent : '#8b5cf6', 0.45) },
            { label: 'Actual (completed)', data: keys.map((k) => +((s.dayStats.get(k)?.actualMin ?? 0) / 60).toFixed(1)), color: t.accent },
          ]}
        />
        <p className="mt-2 text-[11px] text-faint">Actual time uses the minutes you log on a completed occurrence, or its planned duration if you didn't log any.</p>
      </div>
    </Card>
  );
}

function Weekly() {
  const data = useData();
  const s = useStats();
  const t = useChartTheme();
  const [offset, setOffset] = useState(0);
  const ws = addDays(startOfWeek(s.todayKey, data.prefs.weekStart), offset * 7);
  const keys = rangeKeys(ws, addDays(ws, 6));
  const pastKeys = keys.filter((k) => k <= s.todayKey);
  const a = aggregate(s.dayStats, pastKeys);
  const full = aggregate(s.dayStats, keys);
  const best = pastKeys.reduce<{ k: string; n: number } | null>((acc, k) => {
    const n = (s.dayStats.get(k)?.completed ?? 0) + (s.dayStats.get(k)?.countActivity ?? 0);
    return n > 0 && (!acc || n > acc.n) ? { k, n } : acc;
  }, null);
  const canBack = addDays(ws, -1) >= data.windowStart;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Previous week" disabled={!canBack} onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft />
        </Button>
        <p className="flex-1 text-center text-sm font-semibold text-fg sm:flex-none sm:px-4">
          {formatDateKey(ws, 'short')} – {formatDateKey(addDays(ws, 6), 'short')}
          {offset === 0 && <span className="ml-1 text-muted">(this week)</span>}
        </p>
        <Button variant="secondary" size="icon" aria-label="Next week" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<Target />} label="Completion rate" value={pct(a.rate)} sub={`${a.done} done · ${a.missed} missed`} />
        <Metric icon={<CheckCircle2 />} label="Completed" value={`${a.done}`} sub={`of ${full.total} scheduled`} tone="text-ok" />
        <Metric icon={<Clock />} label="Scheduled hours" value={formatHours(full.plannedMin)} sub={`${formatHours(a.actualMin)} completed`} />
        <Metric icon={<Trophy />} label="Most productive day" value={best ? WEEKDAYS_LONG[weekdayOf(best.k)] : '—'} sub={best ? `${best.n} completed` : 'No completions yet'} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader icon={<BarChart3 />} title="Tasks per day" subtitle="Completed, missed and remaining" />
          <div className="px-3 pb-4 md:px-5">
            <BarChart
              height={240}
              stacked
              legend
              labels={keys.map((k) => WEEKDAYS_SHORT[weekdayOf(k)])}
              series={[
                { label: 'Completed', data: keys.map((k) => (s.dayStats.get(k)?.completed ?? 0) + (s.dayStats.get(k)?.countActivity ?? 0)), color: t.ok },
                { label: 'Missed', data: keys.map((k) => s.dayStats.get(k)?.missed ?? 0), color: t.bad },
                { label: 'Remaining', data: keys.map((k) => (s.dayStats.get(k)?.pending ?? 0) + (s.dayStats.get(k)?.upcoming ?? 0)), color: hexToRgba(t.muted.startsWith('#') ? t.muted : '#9a97ad', 0.35) },
              ]}
            />
          </div>
        </Card>
        <PlannedVsActual keys={keys} title="Planned vs actual" subtitle="Hours per day" />
      </div>
    </div>
  );
}

function Monthly() {
  const data = useData();
  const s = useStats();
  const t = useChartTheme();
  const colors = usePalette();
  const [offset, setOffset] = useState(0);
  const ms = addMonths(startOfMonth(s.todayKey), offset);
  const me = endOfMonth(ms);
  const keys = rangeKeys(ms, me);
  const pastKeys = keys.filter((k) => k <= s.todayKey && k >= data.windowStart);
  const a = aggregate(s.dayStats, pastKeys);
  const monthStreak = useMemo(
    () => streakFromUnits(pastKeys.map((k) => dayUnitState(s.dayStats.get(k), data.prefs.streakRule, k === s.todayKey))),
    [pastKeys, s.dayStats, data.prefs.streakRule, s.todayKey]
  );
  const cats = Object.entries(categoryBreakdown(s.dayStats, pastKeys)).sort((x, y) => y[1] - x[1]);
  const canBack = addDays(ms, -1) >= data.windowStart;
  const gridStart = startOfWeek(ms, data.prefs.weekStart);
  const gridDays = rangeKeys(gridStart, addDays(startOfWeek(me, data.prefs.weekStart), 6));
  const chartKeys = keys.filter((k) => k <= minKey(me, s.todayKey));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon" aria-label="Previous month" disabled={!canBack} onClick={() => setOffset((o) => o - 1)}>
          <ChevronLeft />
        </Button>
        <p className="flex-1 text-center text-sm font-semibold text-fg sm:flex-none sm:px-4">{formatDateKey(ms, 'monthYear')}</p>
        <Button variant="secondary" size="icon" aria-label="Next month" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<Target />} label="Monthly completion" value={pct(a.rate)} />
        <Metric icon={<CheckCircle2 />} label="Total completed" value={`${a.done}`} tone="text-ok" />
        <Metric icon={<XCircle />} label="Total missed" value={`${a.missed}`} tone={a.missed ? 'text-bad' : 'text-fg'} />
        <Metric icon={<Flame />} label="Longest streak" value={`${monthStreak.best}d`} sub={`All-time best ${s.longestStreak}d`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader icon={<TrendingUp />} title="Monthly activity" subtitle="Completions and daily completion %" />
          <div className="px-3 pb-4 md:px-5">
            {chartKeys.length ? (
              <LineChart
                height={250}
                legend
                labels={chartKeys.map((k) => String(parseKey(k).d))}
                series={[
                  { label: 'Completed', data: chartKeys.map((k) => (s.dayStats.get(k)?.completed ?? 0) + (s.dayStats.get(k)?.countActivity ?? 0)), color: t.accent, fill: true },
                  { label: 'Completion %', data: chartKeys.map((k) => Math.round((s.dayStats.get(k)?.ratio ?? 0) * 100)), color: t.ok, axis: 'y2' },
                ]}
              />
            ) : (
              <p className="py-10 text-center text-xs text-muted">No data for this month yet.</p>
            )}
          </div>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="mb-3 text-sm font-semibold text-fg">Month at a glance</p>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className="text-[10px] font-semibold text-faint">
                {WEEKDAYS_SHORT[(data.prefs.weekStart + i) % 7].slice(0, 2)}
              </span>
            ))}
            {gridDays.map((k) => {
              const inMonth = k >= ms && k <= me;
              const lvl = heatLevel(s.dayStats.get(k), k, s.todayKey, data.windowStart);
              return (
                <span
                  key={k}
                  title={`${formatDateKey(k, 'weekday')}`}
                  className={cn('grid aspect-square place-items-center rounded-md text-[10px] font-medium', !inMonth && 'opacity-0', typeof lvl === 'number' && lvl >= 2 ? 'text-white' : 'text-muted')}
                  style={inMonth ? levelStyle(lvl, colors) : undefined}
                >
                  {parseKey(k).d}
                </span>
              );
            })}
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader icon={<PieChart />} title="Category breakdown" subtitle={formatDateKey(ms, 'monthYear')} />
        <div className="px-4 pb-4 md:px-5">
          {cats.length ? (
            <DoughnutChart
              height={240}
              labels={cats.map(([id]) => data.categoryMap.get(id)?.name ?? 'Other')}
              data={cats.map(([, n]) => n)}
              colors={cats.map(([id]) => data.categoryMap.get(id)?.color ?? '#94a3b8')}
            />
          ) : (
            <p className="py-10 text-center text-xs text-muted">No completions this month.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
