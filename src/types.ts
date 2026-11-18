// ───────────────────────────────────────────────────────────────
// CONSISTO domain types (mirrors the Firestore schema in README.md)
// ───────────────────────────────────────────────────────────────

export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly' | 'count';
export type Priority = 'low' | 'medium' | 'high';
export type OccStatus = 'upcoming' | 'pending' | 'completed' | 'missed' | 'skipped';
export type ThemeMode = 'dark' | 'light' | 'amoled';
export type StreakRule = 'any' | 'half' | 'all';
export type Tone = 'ok' | 'warn' | 'bad' | 'accent' | 'muted' | 'info';

/** Recurrence rule. Only the fields relevant to `type` are set. */
export interface Recurrence {
  type: RepeatType;
  /** daily: every day or only on selected weekdays */
  dailyMode?: 'every' | 'weekdays';
  /** 0 = Sunday … 6 = Saturday (daily-selected & weekly) */
  weekdays?: number[];
  /** weekly: every N weeks · monthly: every N months */
  interval?: number;
  /** monthly: specific day of month, or nth weekday */
  monthlyMode?: 'day' | 'nth';
  monthDay?: number;
  /** 1..4, or -1 for "last" */
  nth?: number;
  nthWeekday?: number;
  /** count-based goal */
  target?: number;
  unit?: string;
}

/**
 * A versioned schedule. Editing a recurring task appends a new version effective from
 * today, so historical occurrences (and therefore streaks / missed counts) are never
 * silently rewritten.
 */
export interface ScheduleVersion {
  /** version effective from this date (inclusive) */
  from: string;
  /** user-selected start date — no occurrences before it */
  startDate: string;
  endDate: string | null;
  recurrence: Recurrence;
  /** minutes from midnight in the user's time zone */
  startTime: number | null;
  endTime: number | null;
}

export interface ReminderSettings {
  start: boolean;
  end: boolean;
  /** minutes before the start time */
  offset: number;
  sound: string;
  vibrate: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  notes: string;
  categoryId: string;
  priority: Priority;
  schedules: ScheduleVersion[];
  reminders: ReminderSettings;
  status: 'active' | 'paused' | 'archived';
  pausedRanges: { from: string; to: string | null }[];
  archivedAt: string | null;
  /** count-based tasks */
  count: number;
  /** dateKey -> amount of progress logged that day (count-based tasks) */
  progressLog: Record<string, number>;
  createdAtMs: number;
  updatedAtMs: number;
}

/** One record per occurrence. Doc id = `${taskId}_${dateKey}` (deterministic → no duplicates). */
export interface Completion {
  id: string;
  taskId: string;
  dateKey: string;
  status: 'completed' | 'skipped';
  scheduledStart: number | null;
  scheduledEnd: number | null;
  plannedMinutes: number;
  actualMinutes: number | null;
  /** actual completion timestamp (epoch ms) — stored separately from the scheduled time */
  completedAtMs: number;
  /** completed after it had become "missed" */
  late: boolean;
  /** snapshot of the task at completion time (history survives later edits) */
  title: string;
  categoryId: string;
  repeatType: RepeatType;
}

/** A computed (not stored) scheduled occurrence of a task on a date. */
export interface Occurrence {
  id: string;
  task: Task;
  dateKey: string;
  start: number | null;
  end: number | null;
  planned: number;
  version: ScheduleVersion;
}

export interface OccItem {
  occ: Occurrence;
  status: OccStatus;
  completion?: Completion;
}

export interface Note {
  id: string;
  type: 'quick' | 'detailed';
  title: string;
  /** sanitized HTML (detailed) or plain text (quick) */
  content: string;
  /** plain-text extract used for search & previews */
  text: string;
  folder: string;
  tags: string[];
  categoryId: string;
  pinned: boolean;
  favourite: boolean;
  archived: boolean;
  linkedTaskIds: string[];
  color: string;
  createdAtMs: number;
  updatedAtMs: number;
  rev: number;
  lastDevice: string;
}

export interface NoteDraft {
  noteId: string;
  title: string;
  content: string;
  text: string;
  baseRev: number;
  savedAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  custom?: boolean;
}

export type NotificationType =
  | 'start'
  | 'end'
  | 'missed'
  | 'reminder-missed'
  | 'milestone'
  | 'achievement'
  | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAtMs: number;
  read: boolean;
  cleared: boolean;
  link: string;
}

export interface AchievementRecord {
  id: string;
  unlockedAtMs: number;
}

export type WidgetId = 'tasks' | 'heatmap' | 'streak' | 'reminders' | 'notes' | 'achievements' | 'weekly';

export interface WidgetPref {
  id: WidgetId;
  visible: boolean;
  mobile: boolean;
}

export type HeatRange = '30d' | '3m' | '6m' | '12m' | 'year';

export interface NotificationPrefs {
  start: boolean;
  end: boolean;
  missed: boolean;
  milestone: boolean;
  achievement: boolean;
}

export interface Prefs {
  theme: ThemeMode;
  accent: string;
  font: string;
  density: 'comfortable' | 'compact';
  sidebarCollapsed: boolean;
  sidebarStyle: 'solid' | 'floating';
  widgets: WidgetPref[];
  heatmapPalette: string;
  heatmapRange: HeatRange;
  weekStart: 0 | 1;
  timeFormat: '12h' | '24h';
  timezone: string;
  graceMinutes: number;
  streakRule: StreakRule;
  calendarStartHour: number;
  calendarEndHour: number;
  calendarStyle: 'dots' | 'bars';
  showWeekends: boolean;
  notifications: NotificationPrefs;
  sound: string;
  soundEnabled: boolean;
  completionSound: boolean;
  vibrate: boolean;
  snoozeMinutes: number;
  defaultReminderOffset: number;
}

export interface UserStats {
  totalCompletions: number;
  longestStreak: number;
}

export interface UserProfile {
  displayName: string;
  email: string;
  photoData: string | null;
  createdAtMs: number;
  stats: UserStats;
}

export interface DayStat {
  key: string;
  /** scheduled, non-skipped occurrences */
  scheduled: number;
  completed: number;
  missed: number;
  skipped: number;
  pending: number;
  upcoming: number;
  plannedMin: number;
  actualMin: number;
  /** count-based tasks with progress logged that day */
  countActivity: number;
  /** (completed + countActivity) / (scheduled + countActivity), null when nothing scheduled */
  ratio: number | null;
  categories: Record<string, number>;
}
