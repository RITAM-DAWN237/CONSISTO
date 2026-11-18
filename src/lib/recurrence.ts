// Recurrence engine — decides whether a task is scheduled on a given date key.
// Occurrences are computed (not stored); their deterministic id is `${taskId}_${dateKey}`.
import type { Occurrence, Recurrence, ScheduleVersion, Task } from '../types';
import {
  addDays,
  dayNum,
  daysInMonth,
  durationBetween,
  formatDateKey,
  makeKey,
  monthIndex,
  parseKey,
  startOfWeek,
  WEEKDAYS_SHORT,
  weekdayOf,
} from './dates';

export function firstVersion(task: Task): ScheduleVersion | undefined {
  return task.schedules[0];
}

export function currentVersion(task: Task): ScheduleVersion {
  return task.schedules[task.schedules.length - 1];
}

export function repeatType(task: Task) {
  return currentVersion(task)?.recurrence.type ?? 'once';
}

export function isCountTask(task: Task): boolean {
  return repeatType(task) === 'count';
}

/** Schedule version effective on `key` (latest version whose `from` <= key). */
export function versionFor(task: Task, key: string): ScheduleVersion | null {
  let v: ScheduleVersion | null = null;
  for (const s of task.schedules) {
    if (s.from <= key) v = s;
    else break;
  }
  return v;
}

export function isPausedOn(task: Task, key: string): boolean {
  return (task.pausedRanges ?? []).some((r) => key >= r.from && (r.to == null || key <= r.to));
}

/** Day of month of the nth weekday (nth = 1..4, or -1 for last). */
export function nthWeekdayDay(y: number, m: number, weekday: number, nth: number): number | null {
  const dim = daysInMonth(y, m);
  if (nth === -1) {
    const lastWd = weekdayOf(makeKey(y, m, dim));
    return dim - ((lastWd - weekday + 7) % 7);
  }
  const firstWd = weekdayOf(makeKey(y, m, 1));
  const day = 1 + ((weekday - firstWd + 7) % 7) + (nth - 1) * 7;
  return day <= dim ? day : null;
}

export function matchesRecurrence(r: Recurrence, v: ScheduleVersion, key: string): boolean {
  switch (r.type) {
    case 'once':
      return key === v.startDate;
    case 'daily':
      return r.dailyMode === 'weekdays' ? (r.weekdays ?? []).includes(weekdayOf(key)) : true;
    case 'weekly': {
      if (!(r.weekdays ?? []).includes(weekdayOf(key))) return false;
      const interval = Math.max(1, r.interval ?? 1);
      if (interval === 1) return true;
      const weeks = Math.round((dayNum(startOfWeek(key, 1)) - dayNum(startOfWeek(v.startDate, 1))) / 7);
      return weeks >= 0 && weeks % interval === 0;
    }
    case 'monthly': {
      const interval = Math.max(1, r.interval ?? 1);
      const diff = monthIndex(key) - monthIndex(v.startDate);
      if (diff < 0 || diff % interval !== 0) return false;
      const { y, m, d } = parseKey(key);
      if (r.monthlyMode === 'nth') return d === nthWeekdayDay(y, m, r.nthWeekday ?? 1, r.nth ?? 1);
      // Months without the selected day (e.g. 31st) fall back to the month's last day.
      return d === Math.min(r.monthDay ?? 1, daysInMonth(y, m));
    }
    default:
      return false;
  }
}

/** Returns the schedule version if `task` has an occurrence on `key`, otherwise null. */
export function isScheduledOn(task: Task, key: string): ScheduleVersion | null {
  if (!task.schedules?.length) return null;
  const v = versionFor(task, key);
  if (!v) return null;
  if (v.recurrence.type === 'count') return null;
  if (key < v.startDate) return null;
  if (v.endDate && key > v.endDate) return null;
  if (task.archivedAt && key >= task.archivedAt) return null;
  if (isPausedOn(task, key)) return null;
  return matchesRecurrence(v.recurrence, v, key) ? v : null;
}

export function makeOccurrence(task: Task, v: ScheduleVersion, key: string): Occurrence {
  return {
    id: `${task.id}_${key}`,
    task,
    dateKey: key,
    start: v.startTime,
    end: v.endTime,
    planned: durationBetween(v.startTime, v.endTime),
    version: v,
  };
}

export function compareOcc(a: Occurrence, b: Occurrence): number {
  const sa = a.start ?? 99_999;
  const sb = b.start ?? 99_999;
  return sa - sb || a.task.title.localeCompare(b.task.title);
}

export function occurrencesOn(tasks: Task[], key: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const t of tasks) {
    const v = isScheduledOn(t, key);
    if (v) out.push(makeOccurrence(t, v, key));
  }
  return out.sort(compareOcc);
}

export function nextOccurrenceKey(task: Task, fromKey: string, maxDays = 400): string | null {
  for (let i = 0; i <= maxDays; i++) {
    const k = addDays(fromKey, i);
    if (isScheduledOn(task, k)) return k;
  }
  return null;
}

const ORDINAL: Record<number, string> = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', [-1]: 'last' };

export function describeWeekdays(days: number[]): string {
  const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  const set = sorted.join(',');
  if (set === '1,2,3,4,5') return 'weekdays';
  if (set === '6,0') return 'weekends';
  if (sorted.length === 7) return 'every day';
  return sorted.map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

export function describeRecurrence(v: ScheduleVersion | undefined): string {
  if (!v) return '';
  const r = v.recurrence;
  switch (r.type) {
    case 'once':
      return `One-time · ${formatDateKey(v.startDate, 'weekday')}`;
    case 'daily':
      return r.dailyMode === 'weekdays' ? `Daily on ${describeWeekdays(r.weekdays ?? [])}` : 'Every day';
    case 'weekly': {
      const n = Math.max(1, r.interval ?? 1);
      const days = describeWeekdays(r.weekdays ?? []);
      return n === 1 ? `Weekly on ${days}` : `Every ${n} weeks on ${days}`;
    }
    case 'monthly': {
      const n = Math.max(1, r.interval ?? 1);
      const prefix = n === 1 ? 'Monthly' : `Every ${n} months`;
      if (r.monthlyMode === 'nth') return `${prefix} on the ${ORDINAL[r.nth ?? 1]} ${WEEKDAYS_SHORT[r.nthWeekday ?? 1]}`;
      const day = r.monthDay ?? 1;
      return `${prefix} on day ${day}${day > 28 ? ' (last day in shorter months)' : ''}`;
    }
    case 'count':
      return `Goal · ${r.target ?? 1} ${r.unit || 'times'}`;
  }
}

/** [start, end] in minutes relative to the occurrence's day, or null when untimed. */
export function absRange(o: Occurrence): [number, number] | null {
  if (o.start == null || o.end == null) return null;
  const e = o.end <= o.start ? o.end + 1440 : o.end;
  return [o.start, e];
}

export function findConflicts(occs: Occurrence[]): [Occurrence, Occurrence][] {
  const timed = occs.filter((o) => absRange(o));
  const pairs: [Occurrence, Occurrence][] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const [s1, e1] = absRange(timed[i])!;
      const [s2, e2] = absRange(timed[j])!;
      if (s1 < e2 && s2 < e1) pairs.push([timed[i], timed[j]]);
    }
  }
  return pairs;
}

/** Column layout for overlapping timed events in a day timetable. */
export function layoutDay<T extends { occ: Occurrence }>(items: T[]): (T & { col: number; cols: number })[] {
  const timed = items
    .filter((i) => absRange(i.occ))
    .sort((a, b) => absRange(a.occ)![0] - absRange(b.occ)![0]);
  const result: (T & { col: number; cols: number })[] = [];
  let cluster: (T & { col: number; cols: number })[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    cluster.forEach((c) => (c.cols = cols));
    result.push(...cluster);
    cluster = [];
  };
  for (const item of timed) {
    const [s, e] = absRange(item.occ)!;
    if (cluster.length && s >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = new Set(cluster.filter((c) => absRange(c.occ)![1] > s).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ ...item, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return result;
}
