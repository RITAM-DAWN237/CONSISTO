import type { Category, Prefs, WidgetId, WidgetPref, RepeatType } from './types';

export const APP_NAME = 'CONSISTO';
export const TAGLINE = 'Build habits. Keep promises. Stay consistent.';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'study', name: 'Study', color: '#8b5cf6', icon: '📚' },
  { id: 'coding', name: 'Coding', color: '#22d3ee', icon: '💻' },
  { id: 'fitness', name: 'Fitness', color: '#22c55e', icon: '💪' },
  { id: 'personal', name: 'Personal', color: '#f472b6', icon: '🌱' },
  { id: 'projects', name: 'Projects', color: '#f59e0b', icon: '🚀' },
  { id: 'work', name: 'Work', color: '#60a5fa', icon: '💼' },
  { id: 'reading', name: 'Reading', color: '#a3e635', icon: '📖' },
  { id: 'other', name: 'Other', color: '#94a3b8', icon: '✨' },
];

export const CATEGORY_COLORS = [
  '#8b5cf6', '#6366f1', '#3b82f6', '#22d3ee', '#14b8a6', '#22c55e',
  '#a3e635', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#94a3b8',
];

export const CATEGORY_ICONS = ['📚', '💻', '💪', '🌱', '🚀', '💼', '📖', '✨', '🎯', '🧘', '🎨', '🎵', '🍳', '💰', '🧠', '🏃', '✍️', '🧪'];

export const ACCENTS = [
  { id: 'purple', name: 'Royal Purple', color: '#8b5cf6', strong: '#7c3aed' },
  { id: 'indigo', name: 'Indigo', color: '#6366f1', strong: '#4f46e5' },
  { id: 'blue', name: 'Blue', color: '#3b82f6', strong: '#2563eb' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4', strong: '#0891b2' },
  { id: 'teal', name: 'Teal', color: '#14b8a6', strong: '#0d9488' },
  { id: 'green', name: 'Green', color: '#22c55e', strong: '#16a34a' },
  { id: 'amber', name: 'Amber', color: '#f59e0b', strong: '#d97706' },
  { id: 'orange', name: 'Orange', color: '#f97316', strong: '#ea580c' },
  { id: 'pink', name: 'Pink', color: '#ec4899', strong: '#db2777' },
  { id: 'red', name: 'Red', color: '#ef4444', strong: '#dc2626' },
];

export interface HeatPalette {
  id: string;
  name: string;
  /** [low, moderate, high] for dark / AMOLED themes */
  dark: [string, string, string];
  /** [low, moderate, high] for the light theme */
  light: [string, string, string];
}

/** 15 heatmap palettes — single-hue and multi-hue. */
export const HEATMAP_PALETTES: HeatPalette[] = [
  { id: 'green', name: 'GitHub Green', dark: ['#0e4429', '#006d32', '#39d353'], light: ['#9be9a8', '#40c463', '#216e39'] },
  { id: 'purple', name: 'Royal Purple', dark: ['#3b1f75', '#6d3fd6', '#b197fc'], light: ['#ddd6fe', '#a78bfa', '#6d28d9'] },
  { id: 'indigo', name: 'Indigo Night', dark: ['#25226b', '#4f46e5', '#a5b4fc'], light: ['#c7d2fe', '#818cf8', '#4338ca'] },
  { id: 'blue', name: 'Ocean Blue', dark: ['#0c2d5e', '#1d64d8', '#60a5fa'], light: ['#bfdbfe', '#60a5fa', '#1d4ed8'] },
  { id: 'cyan', name: 'Arctic Ice', dark: ['#083344', '#0e7490', '#22d3ee'], light: ['#a5f3fc', '#22d3ee', '#0e7490'] },
  { id: 'teal', name: 'Mint Teal', dark: ['#083f3a', '#0f8a7e', '#2dd4bf'], light: ['#99f6e4', '#2dd4bf', '#0f766e'] },
  { id: 'lime', name: 'Neon Lime', dark: ['#2a3d0a', '#4d7c0f', '#a3e635'], light: ['#d9f99d', '#84cc16', '#3f6212'] },
  { id: 'amber', name: 'Golden Amber', dark: ['#4a2604', '#b45309', '#fbbf24'], light: ['#fde68a', '#f59e0b', '#b45309'] },
  { id: 'sunset', name: 'Sunset', dark: ['#5b2333', '#d9480f', '#fcc419'], light: ['#ffe8a3', '#ff922b', '#c2255c'] },
  { id: 'halloween', name: 'Halloween', dark: ['#6b3d00', '#fe9600', '#ffee4a'], light: ['#ffee4a', '#ffc501', '#fe9600'] },
  { id: 'pink', name: 'Sakura Pink', dark: ['#500724', '#be185d', '#f472b6'], light: ['#fbcfe8', '#f472b6', '#be185d'] },
  { id: 'red', name: 'Ruby Red', dark: ['#4c0d0d', '#b91c1c', '#f87171'], light: ['#fecaca', '#f87171', '#b91c1c'] },
  { id: 'aurora', name: 'Aurora', dark: ['#1e3a8a', '#7c3aed', '#2dd4bf'], light: ['#c7d2fe', '#a78bfa', '#0d9488'] },
  { id: 'traffic', name: 'Traffic Light', dark: ['#b91c1c', '#d97706', '#16a34a'], light: ['#f87171', '#fbbf24', '#16a34a'] },
  { id: 'mono', name: 'Graphite', dark: ['#3f3f46', '#a1a1aa', '#fafafa'], light: ['#d4d4d8', '#71717a', '#18181b'] },
];

export const FONTS = [
  { id: 'inter', name: 'Inter', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  { id: 'jakarta', name: 'Plus Jakarta Sans', stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" },
  { id: 'grotesk', name: 'Space Grotesk', stack: "'Space Grotesk', ui-sans-serif, system-ui, sans-serif" },
  { id: 'mono', name: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace" },
  { id: 'system', name: 'System UI', stack: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
];

export const SOUNDS = [
  { id: 'chime', name: 'Chime' },
  { id: 'bell', name: 'Bell' },
  { id: 'marimba', name: 'Marimba' },
  { id: 'digital', name: 'Digital alarm' },
  { id: 'soft', name: 'Soft pulse' },
  { id: 'none', name: 'Silent' },
];

export const WIDGET_META: Record<WidgetId, { title: string; description: string; span: string }> = {
  tasks: { title: "Today's Tasks", description: 'Scheduled occurrences for today', span: 'md:col-span-2 lg:col-span-7 lg:row-span-2' },
  heatmap: { title: 'Consistency Heatmap', description: 'GitHub-style completion calendar', span: 'md:col-span-2 lg:col-span-5' },
  streak: { title: 'Streak Banner', description: 'Current streak and next milestone', span: 'md:col-span-2 lg:col-span-5' },
  reminders: { title: 'Upcoming Reminders', description: 'Next start and end alarms', span: 'lg:col-span-4' },
  notes: { title: 'Quick Notes', description: 'Pinned and recently edited notes', span: 'lg:col-span-4' },
  achievements: { title: 'Achievements', description: 'Badges and milestones', span: 'md:col-span-2 lg:col-span-4' },
  weekly: { title: 'Weekly Activity', description: 'Completed vs scheduled this week', span: 'md:col-span-2 lg:col-span-12' },
};

export const DEFAULT_WIDGETS: WidgetPref[] = [
  { id: 'tasks', visible: true, mobile: true },
  { id: 'heatmap', visible: true, mobile: true },
  { id: 'streak', visible: true, mobile: true },
  { id: 'reminders', visible: true, mobile: true },
  { id: 'notes', visible: true, mobile: false },
  { id: 'achievements', visible: true, mobile: false },
  { id: 'weekly', visible: true, mobile: false },
];

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'dark',
  accent: 'purple',
  font: 'inter',
  density: 'comfortable',
  sidebarCollapsed: false,
  sidebarStyle: 'solid',
  widgets: DEFAULT_WIDGETS,
  heatmapPalette: 'green',
  heatmapRange: '3m',
  weekStart: 1,
  timeFormat: '12h',
  timezone: browserTimezone(),
  graceMinutes: 60,
  streakRule: 'any',
  calendarStartHour: 6,
  calendarEndHour: 24,
  calendarStyle: 'dots',
  showWeekends: true,
  notifications: { start: true, end: true, missed: true, milestone: true, achievement: true },
  sound: 'chime',
  soundEnabled: true,
  completionSound: true,
  vibrate: true,
  snoozeMinutes: 10,
  defaultReminderOffset: 0,
};

export const MILESTONES = [3, 7, 14, 30, 50, 100, 365];

export const GRACE_OPTIONS = [
  { v: 0, l: 'No grace period' },
  { v: 15, l: '15 minutes' },
  { v: 30, l: '30 minutes' },
  { v: 60, l: '1 hour' },
  { v: 120, l: '2 hours' },
  { v: 240, l: '4 hours' },
  { v: 720, l: '12 hours' },
  { v: 1440, l: '24 hours' },
];

export const REMINDER_OFFSETS = [
  { v: 0, l: 'At start time' },
  { v: 5, l: '5 min before' },
  { v: 10, l: '10 min before' },
  { v: 15, l: '15 min before' },
  { v: 30, l: '30 min before' },
  { v: 60, l: '1 hour before' },
];

export const SNOOZE_OPTIONS = [5, 10, 15, 30];

export const REPEAT_LABEL: Record<RepeatType, string> = {
  once: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  count: 'Goal',
};

export const MOTIVATION = [
  'Small steps. Big changes.',
  'Consistency beats intensity.',
  'Show up today. Future you is watching.',
  'Keep the promise you made to yourself.',
  'Progress, not perfection.',
  'One task at a time.',
  'Discipline is choosing what you want most.',
];

export const NOTE_COLORS = ['', '#8b5cf6', '#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#ef4444'];
