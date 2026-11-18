// Status, statistics, streak and reminder computations (pure functions).
import type { Completion, DayStat, OccStatus, Occurrence, StreakRule, Task, Tone } from '../types';
import { REPEAT_LABEL } from '../constants';
import {
  addDays,
  dayNum,
  endOfMonth,
  formatDuration,
  formatTime,
  fromDayNum,
  minKey,
  maxKey,
  rangeKeys,
  startOfWeek,
  zonedToEpoch,
} from './dates';
import { firstVersion, isCountTask, isScheduledOn, makeOccurrence, repeatType } from './recurrence';

export interface StatusCtx {
  todayKey: string;
  nowMin: number;
  grace: number;
}

/** Minutes after the start of the occurrence's day at which it becomes "missed". */
export function deadlineRel(o: Occurrence, grace: number): number {
  const endRel = o.start != null && o.end != null ? (o.end <= o.start ? o.end + 1440 : o.end) : 1440;
  return endRel + grace;
}

/**
 * Status of a scheduled occurrence. Completion is ALWAYS manual: reaching the end time
 * never completes a task — it only moves from pending to missed after the grace period.
 */
export function occurrenceStatus(o: Occurrence, c: Completion | undefined, ctx: StatusCtx): OccStatus {
  if (c?.status === 'completed') return 'completed';
  if (c?.status === 'skipped') return 'skipped';
  const today = dayNum(ctx.todayKey);
  const od = dayNum(o.dateKey);
  if (od > today) return 'upcoming';
  const nowAbs = today * 1440 + ctx.nowMin;
  const base = od * 1440;
  if (nowAbs >= base + deadlineRel(o, ctx.grace)) return 'missed';
  if (o.start != null && nowAbs < base + o.start) return 'upcoming';
  return 'pending';
}

export function statusInfo(
  status: OccStatus,
  o: Occurrence,
  ctx: StatusCtx,
  c?: Completion
): { label: string; tone: Tone; soon?: boolean } {
  switch (status) {
    case 'completed':
      return { label: c?.late ? 'Done late' : 'Completed', tone: 'ok' };
    case 'skipped':
      return { label: 'Skipped', tone: 'muted' };
    case 'missed':
      return { label: 'Missed', tone: 'bad' };
    case 'pending': {
      if (o.dateKey === ctx.todayKey && o.start != null && o.end != null) {
        const endRel = o.end <= o.start ? o.end + 1440 : o.end;
        if (ctx.nowMin < endRel) return { label: 'In progress', tone: 'accent' };
      }
      return { label: 'Pending', tone: 'warn' };
    }
    case 'upcoming': {
      if (o.dateKey === ctx.todayKey && o.start != null) {
        const diff = o.start - ctx.nowMin;
        if (diff <= 60) return { label: diff <= 1 ? 'Starting now' : 'Start soon', tone: 'accent', soon: true };
        return { label: 'Upcoming', tone: 'muted' };
      }
      return { label: REPEAT_LABEL[o.version.recurrence.type], tone: 'muted' };
    }
  }
}

export function emptyStat(key: string): DayStat {
  return {
    key,
    scheduled: 0,
    completed: 0,
    missed: 0,
    skipped: 0,
    pending: 0,
    upcoming: 0,
    plannedMin: 0,
    actualMin: 0,
    countActivity: 0,
    ratio: null,
    categories: {},
  };
}

export function computeDayStats(
  tasks: Task[],
  completions: Map<string, Completion>,
  from: string,
  to: string,
  ctx: StatusCtx
): Map<string, DayStat> {
  const map = new Map<string, DayStat>();
  const countTasks = tasks.filter(isCountTask);
  const end = dayNum(to);
  for (let n = dayNum(from); n <= end; n++) {
    const key = fromDayNum(n);
    const st = emptyStat(key);
    for (const t of tasks) {
      const v = isScheduledOn(t, key);
      if (!v) continue;
      const o = makeOccurrence(t, v, key);
      const c = completions.get(o.id);
      const s = occurrenceStatus(o, c, ctx);
      if (s === 'skipped') {
        st.skipped++;
        continue;
      }
      st.scheduled++;
      st.plannedMin += o.planned;
      if (s === 'completed') {
        st.completed++;
        st.actualMin += c?.actualMinutes ?? o.planned;
        st.categories[t.categoryId] = (st.categories[t.categoryId] ?? 0) + 1;
      } else if (s === 'missed') st.missed++;
      else if (s === 'pending') st.pending++;
      else st.upcoming++;
    }
    for (const t of countTasks) {
      if ((t.progressLog?.[key] ?? 0) > 0) {
        st.countActivity++;
        st.categories[t.categoryId] = (st.categories[t.categoryId] ?? 0) + 1;
      }
    }
    const total = st.scheduled + st.countActivity;
    st.ratio = total > 0 ? (st.completed + st.countActivity) / total : null;
    map.set(key, st);
  }
  return map;
}

export interface Aggregate {
  scheduled: number;
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
  upcoming: number;
  plannedMin: number;
  actualMin: number;
  countActivity: number;
  done: number;
  total: number;
  /** done / (done + missed): resolved occurrences only */
  rate: number | null;
  /** done / total */
  progress: number | null;
}

export function aggregate(stats: Map<string, DayStat>, keys: string[]): Aggregate {
  const a: Aggregate = {
    scheduled: 0, completed: 0, missed: 0, skipped: 0, pending: 0, upcoming: 0,
    plannedMin: 0, actualMin: 0, countActivity: 0, done: 0, total: 0, rate: null, progress: null,
  };
  for (const k of keys) {
    const s = stats.get(k);
    if (!s) continue;
    a.scheduled += s.scheduled;
    a.completed += s.completed;
    a.missed += s.missed;
    a.skipped += s.skipped;
    a.pending += s.pending;
    a.upcoming += s.upcoming;
    a.plannedMin += s.plannedMin;
    a.actualMin += s.actualMin;
    a.countActivity += s.countActivity;
  }
  a.done = a.completed + a.countActivity;
  a.total = a.scheduled + a.countActivity;
  a.rate = a.done + a.missed > 0 ? a.done / (a.done + a.missed) : null;
  a.progress = a.total > 0 ? a.done / a.total : null;
  return a;
}

export function categoryBreakdown(stats: Map<string, DayStat>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const s = stats.get(k);
    if (!s) continue;
    for (const [cat, n] of Object.entries(s.categories)) out[cat] = (out[cat] ?? 0) + n;
  }
  return out;
}

// ─── Streaks ───────────────────────────────────────────────────

export type UnitState = 'kept' | 'broken' | 'neutral' | 'inprogress';

export function ratioKept(done: number, total: number, rule: StreakRule): boolean {
  if (total <= 0) return false;
  if (rule === 'any') return done >= 1;
  if (rule === 'half') return done / total >= 0.5;
  return done >= total;
}

/** neutral = nothing scheduled (never breaks a streak). */
export function dayUnitState(st: DayStat | undefined, rule: StreakRule, isToday: boolean): UnitState {
  if (!st || st.ratio == null) return 'neutral';
  const total = st.scheduled + st.countActivity;
  const done = st.completed + st.countActivity;
  if (ratioKept(done, total, rule)) return 'kept';
  if (isToday || st.pending > 0 || st.upcoming > 0) return 'inprogress';
  return 'broken';
}

/** Neutral and in-progress units neither add to nor break a streak. */
export function streakFromUnits(states: UnitState[]): { current: number; best: number } {
  let best = 0;
  let run = 0;
  for (const s of states) {
    if (s === 'kept') {
      run++;
      if (run > best) best = run;
    } else if (s === 'broken') run = 0;
  }
  return { current: run, best };
}

export function overallStreak(stats: Map<string, DayStat>, from: string, todayKey: string, rule: StreakRule) {
  const states: UnitState[] = [];
  for (const k of rangeKeys(from, todayKey)) states.push(dayUnitState(stats.get(k), rule, k === todayKey));
  return streakFromUnits(states);
}

export function weeklyStreak(
  stats: Map<string, DayStat>,
  from: string,
  todayKey: string,
  rule: StreakRule,
  weekStart: number
) {
  const states: UnitState[] = [];
  const currentWeek = startOfWeek(todayKey, weekStart);
  for (let wk = startOfWeek(from, weekStart); wk <= currentWeek; wk = addDays(wk, 7)) {
    const a = aggregate(stats, rangeKeys(maxKey(wk, from), minKey(addDays(wk, 6), todayKey)));
    if (a.total === 0) states.push('neutral');
    else if (ratioKept(a.done, a.total, rule)) states.push('kept');
    else states.push(wk === currentWeek ? 'inprogress' : 'broken');
  }
  return streakFromUnits(states);
}

/** Last N days of completion ratio (for sparklines). */
export function recentRatios(stats: Map<string, DayStat>, todayKey: string, days: number): number[] {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(stats.get(addDays(todayKey, -i))?.ratio ?? 0);
  return out;
}

export interface TaskStreak {
  current: number;
  best: number;
  unit: 'day' | 'week' | 'month';
  completed: number;
  missed: number;
  rate: number | null;
}

/** Recurrence-aware streak for an individual task. */
export function taskStreak(
  task: Task,
  completions: Map<string, Completion>,
  ctx: StatusCtx,
  weekStart: number,
  windowStart: string
): TaskStreak {
  const type = repeatType(task);
  const first = firstVersion(task);
  const start = maxKey(first?.startDate ?? ctx.todayKey, windowStart);

  if (type === 'count') {
    const states: UnitState[] = [];
    let completed = 0;
    if (start <= ctx.todayKey) {
      for (const k of rangeKeys(start, ctx.todayKey)) {
        if ((task.progressLog?.[k] ?? 0) > 0) {
          states.push('kept');
          completed++;
        } else states.push(k === ctx.todayKey ? 'inprogress' : 'broken');
      }
    }
    return { ...streakFromUnits(states), unit: 'day', completed, missed: 0, rate: null };
  }

  const occs: { key: string; status: OccStatus }[] = [];
  if (start <= ctx.todayKey) {
    for (const k of rangeKeys(start, ctx.todayKey)) {
      const v = isScheduledOn(task, k);
      if (!v) continue;
      const o = makeOccurrence(task, v, k);
      occs.push({ key: k, status: occurrenceStatus(o, completions.get(o.id), ctx) });
    }
  }
  const completed = occs.filter((o) => o.status === 'completed').length;
  const missed = occs.filter((o) => o.status === 'missed').length;
  const rate = completed + missed > 0 ? completed / (completed + missed) : null;

  if (type === 'weekly' || type === 'monthly') {
    const groupKey = (k: string) => (type === 'weekly' ? startOfWeek(k, weekStart) : k.slice(0, 7));
    const groups = new Map<string, OccStatus[]>();
    for (const o of occs) {
      const g = groupKey(o.key);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(o.status);
    }
    const currentGroup = groupKey(ctx.todayKey);
    const groupEnd = type === 'weekly' ? addDays(startOfWeek(ctx.todayKey, weekStart), 6) : endOfMonth(ctx.todayKey);
    let remaining = false;
    for (let k = addDays(ctx.todayKey, 1); k <= groupEnd; k = addDays(k, 1)) {
      if (isScheduledOn(task, k)) {
        remaining = true;
        break;
      }
    }
    const states: UnitState[] = [];
    for (const [g, list] of [...groups.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (list.includes('missed')) states.push('broken');
      else if (list.some((s) => s === 'pending' || s === 'upcoming') || (g === currentGroup && remaining)) states.push('inprogress');
      else if (list.includes('completed')) states.push('kept');
      else states.push('neutral');
    }
    return { ...streakFromUnits(states), unit: type === 'weekly' ? 'week' : 'month', completed, missed, rate };
  }

  const states: UnitState[] = occs.map((o) =>
    o.status === 'completed' ? 'kept' : o.status === 'missed' ? 'broken' : o.status === 'skipped' ? 'neutral' : 'inprogress'
  );
  return { ...streakFromUnits(states), unit: 'day', completed, missed, rate };
}

// ─── Heatmap ───────────────────────────────────────────────────

export type HeatLevel = 'future' | 'nodata' | 'none' | 'missed' | 'pending' | 1 | 2 | 3;

export function heatLevel(st: DayStat | undefined, key: string, todayKey: string, windowStart: string): HeatLevel {
  if (key > todayKey) return 'future';
  if (key < windowStart) return 'nodata';
  if (!st || st.ratio == null) return 'none';
  if (st.ratio === 0) return key === todayKey && st.pending + st.upcoming > 0 ? 'pending' : 'missed';
  if (st.ratio < 0.4) return 1;
  if (st.ratio < 0.75) return 2;
  return 3;
}

// ─── Reminders ─────────────────────────────────────────────────

export interface ReminderEvent {
  id: string;
  occId: string;
  taskId: string;
  dateKey: string;
  type: 'start' | 'end';
  fireAt: number;
  title: string;
  body: string;
  sound: string;
  vibrate: boolean;
}

/** Start / end reminder events for active tasks between two date keys (inclusive). */
export function reminderEvents(tasks: Task[], fromKey: string, toKey: string, tz: string, fmt: '12h' | '24h'): ReminderEvent[] {
  const out: ReminderEvent[] = [];
  for (const k of rangeKeys(fromKey, toKey)) {
    for (const t of tasks) {
      if (t.status !== 'active') continue;
      const r = t.reminders;
      if (!r || (!r.start && !r.end)) continue;
      const v = isScheduledOn(t, k);
      if (!v || v.startTime == null) continue;
      const occId = `${t.id}_${k}`;
      const range = v.endTime != null ? `${formatTime(v.startTime, fmt)} – ${formatTime(v.endTime, fmt)}` : formatTime(v.startTime, fmt);
      if (r.start) {
        out.push({
          id: `${t.id}|${k}|start`,
          occId,
          taskId: t.id,
          dateKey: k,
          type: 'start',
          fireAt: zonedToEpoch(k, v.startTime - (r.offset || 0), tz),
          title: r.offset ? `${t.title} starts in ${formatDuration(r.offset)}` : `Time to start: ${t.title}`,
          body: `Scheduled ${range}.`,
          sound: r.sound,
          vibrate: r.vibrate,
        });
      }
      if (r.end && v.endTime != null) {
        const endRel = v.endTime <= v.startTime ? v.endTime + 1440 : v.endTime;
        out.push({
          id: `${t.id}|${k}|end`,
          occId,
          taskId: t.id,
          dateKey: k,
          type: 'end',
          fireAt: zonedToEpoch(k, endRel, tz),
          title: `Session ended: ${t.title}`,
          body: `Your ${range} block is over. Tick it off manually if you finished.`,
          sound: r.sound,
          vibrate: r.vibrate,
        });
      }
    }
  }
  return out.sort((a, b) => a.fireAt - b.fireAt);
}
