// Achievement definitions. Every achievement is derived from real completion records —
// nothing is awarded for simply opening the app.
import type { Completion, DayStat } from '../types';
import { MILESTONES } from '../constants';
import { addDays, addMonths, endOfMonth, rangeKeys, startOfMonth, startOfWeek, weekdayOf, zonedParts } from './dates';
import { aggregate } from './engine';

export type Tier = 'bronze' | 'silver' | 'gold' | 'legendary';

export interface Metrics {
  total: number;
  longest: number;
  current: number;
  earlyBird: number;
  nightOwl: number;
  weekend: number;
  cat: Record<string, number>;
  perfectWeeks: number;
  masterMonths: number;
  goals: number;
  notes: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: string;
  tier: Tier;
  target: number;
  value: (m: Metrics) => number;
  kind: 'milestone' | 'achievement';
}

const streakTitle = (n: number) =>
  n === 7 ? 'First 7-Day Streak' : n === 30 ? '30-Day Consistency' : n === 100 ? 'Century Streak' : n === 365 ? 'Year of Consistency' : `${n}-Day Streak`;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_task', title: 'First Task Completed', description: 'Complete your very first task.', icon: 'check', tier: 'bronze', target: 1, value: (m) => m.total, kind: 'achievement' },
  ...MILESTONES.map<AchievementDef>((n) => ({
    id: `streak_${n}`,
    title: streakTitle(n),
    description: `Keep your consistency streak alive for ${n} scheduled days.`,
    icon: 'flame',
    tier: n >= 100 ? 'legendary' : n >= 30 ? 'gold' : n >= 7 ? 'silver' : 'bronze',
    target: n,
    value: (m) => m.longest,
    kind: 'milestone',
  })),
  { id: 'tasks_10', title: 'Getting Started', description: 'Complete 10 tasks.', icon: 'zap', tier: 'bronze', target: 10, value: (m) => m.total, kind: 'achievement' },
  { id: 'tasks_100', title: '100 Tasks Completed', description: 'Complete 100 tasks.', icon: 'medal', tier: 'gold', target: 100, value: (m) => m.total, kind: 'achievement' },
  { id: 'tasks_500', title: '500 Tasks Completed', description: 'Complete 500 tasks.', icon: 'crown', tier: 'legendary', target: 500, value: (m) => m.total, kind: 'achievement' },
  { id: 'early_bird', title: 'Early Bird', description: 'Complete 10 tasks before 8:00 AM.', icon: 'sunrise', tier: 'silver', target: 10, value: (m) => m.earlyBird, kind: 'achievement' },
  { id: 'night_owl', title: 'Night Owl', description: 'Complete 10 tasks after 10:00 PM.', icon: 'moon', tier: 'silver', target: 10, value: (m) => m.nightOwl, kind: 'achievement' },
  { id: 'weekend_warrior', title: 'Weekend Warrior', description: 'Complete 20 tasks scheduled on weekends.', icon: 'swords', tier: 'silver', target: 20, value: (m) => m.weekend, kind: 'achievement' },
  { id: 'study_champion', title: 'Study Champion', description: 'Complete 25 Study tasks.', icon: 'grad', tier: 'gold', target: 25, value: (m) => m.cat.study ?? 0, kind: 'achievement' },
  { id: 'code_crafter', title: 'Code Crafter', description: 'Complete 25 Coding tasks.', icon: 'code', tier: 'gold', target: 25, value: (m) => m.cat.coding ?? 0, kind: 'achievement' },
  { id: 'fitness_fanatic', title: 'Fitness Fanatic', description: 'Complete 25 Fitness tasks.', icon: 'dumbbell', tier: 'gold', target: 25, value: (m) => m.cat.fitness ?? 0, kind: 'achievement' },
  { id: 'bookworm', title: 'Bookworm', description: 'Complete 25 Reading tasks.', icon: 'book', tier: 'gold', target: 25, value: (m) => m.cat.reading ?? 0, kind: 'achievement' },
  { id: 'perfect_week', title: 'Perfect Week', description: 'Finish every scheduled task in a full week (min. 5 tasks).', icon: 'star', tier: 'gold', target: 1, value: (m) => m.perfectWeeks, kind: 'achievement' },
  { id: 'monthly_master', title: 'Monthly Master', description: "Complete 90% of a full month's scheduled tasks (min. 20).", icon: 'calendar', tier: 'legendary', target: 1, value: (m) => m.masterMonths, kind: 'achievement' },
  { id: 'goal_getter', title: 'Goal Getter', description: 'Reach the target of a count-based goal.', icon: 'target', tier: 'silver', target: 1, value: (m) => m.goals, kind: 'achievement' },
  { id: 'note_taker', title: 'Knowledge Keeper', description: 'Write 10 notes.', icon: 'notebook', tier: 'bronze', target: 10, value: (m) => m.notes, kind: 'achievement' },
];

export const TIER_COLORS: Record<Tier, [string, string]> = {
  bronze: ['#f59e0b', '#b45309'],
  silver: ['#c4b5fd', '#7c3aed'],
  gold: ['#fde047', '#f59e0b'],
  legendary: ['#f0abfc', '#7c3aed'],
};

export function computeMetrics(args: {
  completions: Completion[];
  stats: Map<string, DayStat>;
  windowStart: string;
  todayKey: string;
  weekStart: number;
  tz: string;
  totalCompletions: number;
  longest: number;
  current: number;
  notes: number;
}): Metrics {
  const m: Metrics = {
    total: args.totalCompletions,
    longest: args.longest,
    current: args.current,
    earlyBird: 0,
    nightOwl: 0,
    weekend: 0,
    cat: {},
    perfectWeeks: 0,
    masterMonths: 0,
    goals: 0,
    notes: args.notes,
  };
  for (const c of args.completions) {
    if (c.status !== 'completed') continue;
    const hour = zonedParts(c.completedAtMs, args.tz).hour;
    if (hour < 8 && hour >= 3) m.earlyBird++;
    if (hour >= 22 || hour < 3) m.nightOwl++;
    const wd = weekdayOf(c.dateKey);
    if (wd === 0 || wd === 6) m.weekend++;
    m.cat[c.categoryId] = (m.cat[c.categoryId] ?? 0) + 1;
    if (c.repeatType === 'count') m.goals++;
  }
  // Perfect weeks: full weeks strictly before the current week.
  const currentWeek = startOfWeek(args.todayKey, args.weekStart);
  for (let wk = addDays(startOfWeek(args.windowStart, args.weekStart), 7); wk < currentWeek; wk = addDays(wk, 7)) {
    const a = aggregate(args.stats, rangeKeys(wk, addDays(wk, 6)));
    if (a.total >= 5 && a.missed === 0 && a.done === a.total) m.perfectWeeks++;
  }
  // Monthly master: full calendar months strictly before the current month.
  const currentMonth = startOfMonth(args.todayKey);
  for (let mk = addMonths(startOfMonth(args.windowStart), 1); mk < currentMonth; mk = addMonths(mk, 1)) {
    const a = aggregate(args.stats, rangeKeys(mk, endOfMonth(mk)));
    if (a.total >= 20 && a.done / a.total >= 0.9) m.masterMonths++;
  }
  return m;
}
