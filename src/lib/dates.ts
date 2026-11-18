// Date utilities.
// All recurrence math works on timezone-agnostic "date keys" (YYYY-MM-DD) plus
// minutes-from-midnight. The user's selected IANA time zone is only used to find
// "now" and to convert a wall-clock time into an absolute timestamp for reminders.

export const DAY_MS = 86_400_000;

export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_MIN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** m is 1-12 */
export function makeKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function isValidKey(key: string | null | undefined): key is string {
  return !!key && /^\d{4}-\d{2}-\d{2}$/.test(key);
}

/** Days since 1970-01-01 */
export function dayNum(key: string): number {
  const { y, m, d } = parseKey(key);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNum(n: number): string {
  const dt = new Date(n * DAY_MS);
  return makeKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(key: string, n: number): string {
  return fromDayNum(dayNum(key) + n);
}

export function diffDays(a: string, b: string): number {
  return dayNum(b) - dayNum(a);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(key: string): number {
  return (((dayNum(key) % 7) + 7 + 4) % 7);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function startOfWeek(key: string, weekStart: number): string {
  const diff = (weekdayOf(key) - weekStart + 7) % 7;
  return addDays(key, -diff);
}

export function startOfMonth(key: string): string {
  const { y, m } = parseKey(key);
  return makeKey(y, m, 1);
}

export function endOfMonth(key: string): string {
  const { y, m } = parseKey(key);
  return makeKey(y, m, daysInMonth(y, m));
}

export function addMonths(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeKey(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function monthIndex(key: string): number {
  const { y, m } = parseKey(key);
  return y * 12 + (m - 1);
}

export function rangeKeys(from: string, to: string): string[] {
  const out: string[] = [];
  const end = dayNum(to);
  for (let n = dayNum(from); n <= end; n++) out.push(fromDayNum(n));
  return out;
}

export function maxKey(a: string, b: string): string {
  return a > b ? a : b;
}

export function minKey(a: string, b: string): string {
  return a < b ? a : b;
}

// ─── Time zone helpers ─────────────────────────────────────────

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getDtf(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = {
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    };
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: tz });
    } catch {
      f = new Intl.DateTimeFormat('en-US', opts);
    }
    dtfCache.set(tz, f);
  }
  return f;
}

export function zonedParts(epoch: number, tz: string) {
  const parts = getDtf(tz).formatToParts(new Date(epoch));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return { y: get('year'), m: get('month'), d: get('day'), hour, minute: get('minute'), second: get('second') };
}

export interface NowInfo {
  dateKey: string;
  minutes: number;
  epoch: number;
}

export function nowInTz(tz: string, epoch = Date.now()): NowInfo {
  const p = zonedParts(epoch, tz);
  return { dateKey: makeKey(p.y, p.m, p.d), minutes: p.hour * 60 + p.minute, epoch };
}

export function epochToKey(epoch: number, tz: string): string {
  const p = zonedParts(epoch, tz);
  return makeKey(p.y, p.m, p.d);
}

function tzOffsetMs(epoch: number, tz: string): number {
  const p = zonedParts(epoch, tz);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return asUTC - Math.floor(epoch / 1000) * 1000;
}

/** Wall-clock time (date key + minutes, minutes may exceed 1440 or be negative) in `tz` → epoch ms */
export function zonedToEpoch(dateKey: string, minutes: number, tz: string): number {
  const { y, m, d } = parseKey(dateKey);
  const guess = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  const off1 = tzOffsetMs(guess, tz);
  let result = guess - off1;
  const off2 = tzOffsetMs(result, tz);
  if (off2 !== off1) result = guess - off2;
  return result;
}

export function listTimezones(): string[] {
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (fn) return fn('timeZone');
  } catch {
    /* ignore */
  }
  return ['UTC', 'Asia/Kolkata', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Australia/Sydney'];
}

// ─── Formatting ────────────────────────────────────────────────

export function formatTime(minutes: number | null | undefined, fmt: '12h' | '24h'): string {
  if (minutes == null) return '';
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  if (fmt === '24h') return `${pad(h)}:${pad(mm)}`;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(mm)} ${suffix}`;
}

export function formatTimeRange(start: number | null, end: number | null, fmt: '12h' | '24h'): string {
  if (start == null) return 'Any time';
  if (end == null) return formatTime(start, fmt);
  return `${formatTime(start, fmt)} – ${formatTime(end, fmt)}${end <= start ? ' (+1d)' : ''}`;
}

export function durationBetween(start: number | null, end: number | null): number {
  if (start == null || end == null) return 0;
  let d = end - start;
  if (d <= 0) d += 1440;
  return d;
}

export function formatDuration(min: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatHours(min: number): string {
  const h = min / 60;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)}h`;
}

export function timeToInput(min: number | null): string {
  if (min == null) return '';
  const m = ((min % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function inputToTime(v: string): number | null {
  if (!v) return null;
  const [h, m] = v.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export type DateFmt = 'short' | 'long' | 'weekday' | 'monthYear' | 'dayMonth' | 'full';

export function formatDateKey(key: string, fmt: DateFmt = 'short'): string {
  const { y, m, d } = parseKey(key);
  const wd = weekdayOf(key);
  switch (fmt) {
    case 'short':
      return `${MONTHS_SHORT[m - 1]} ${d}`;
    case 'long':
      return `${WEEKDAYS_LONG[wd]}, ${MONTHS_LONG[m - 1]} ${d}, ${y}`;
    case 'weekday':
      return `${WEEKDAYS_SHORT[wd]}, ${MONTHS_SHORT[m - 1]} ${d}`;
    case 'monthYear':
      return `${MONTHS_LONG[m - 1]} ${y}`;
    case 'dayMonth':
      return `${d} ${MONTHS_SHORT[m - 1]}`;
    case 'full':
      return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
  }
}

export function relativeDayLabel(key: string, todayKey: string): string {
  const diff = diffDays(todayKey, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return formatDateKey(key, 'weekday');
}

export function formatEpoch(epoch: number, tz: string, fmt: '12h' | '24h'): string {
  const n = nowInTz(tz, epoch);
  return `${formatDateKey(n.dateKey, 'short')}, ${formatTime(n.minutes, fmt)}`;
}

export function timeAgo(epoch: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - epoch) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.round(d / 30)}mo ago`;
}

export function untilLabel(ms: number): string {
  if (ms <= 60_000) return 'Now';
  const m = Math.round(ms / 60_000);
  if (m < 60) return `In ${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm && h < 3 ? `In ${h}h ${rm}m` : `In ${h}h`;
  return `In ${Math.round(h / 24)}d`;
}

export function partOfDay(minutes: number): string {
  if (minutes >= 300 && minutes < 720) return 'Good Morning';
  if (minutes >= 720 && minutes < 1020) return 'Good Afternoon';
  if (minutes >= 1020 && minutes < 1320) return 'Good Evening';
  return 'Good Night';
}
