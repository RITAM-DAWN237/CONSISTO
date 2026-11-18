import { Bell, Check, Flag, Minus, Plus } from 'lucide-react';
import type { OccItem, OccStatus, Task } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { statusInfo } from '../lib/engine';
import { formatDuration, formatTimeRange, relativeDayLabel } from '../lib/dates';
import { currentVersion } from '../lib/recurrence';
import { playSound, unlockAudio, vibrate } from '../lib/sounds';
import { cn } from '../lib/utils';
import { CategoryChip, Pill, Ring } from './ui';

/** Circular tick. Tap once to complete, tap again to undo. */
export function TickButton({ status, onToggle, size = 'md' }: { status: OccStatus; onToggle: () => void; size?: 'sm' | 'md' }) {
  const done = status === 'completed';
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={done}
      aria-label={done ? 'Completed — tap to undo' : 'Mark as completed'}
      title={done ? 'Tap to undo' : 'Mark as completed'}
      className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span
        className={cn(
          'grid place-items-center rounded-full border-2 transition-all duration-200',
          size === 'sm' ? 'h-6 w-6' : 'h-7 w-7',
          done
            ? 'border-ok bg-ok text-white shadow-[0_0_0_4px_color-mix(in_oklab,var(--ok)_18%,transparent)] animate-pop'
            : status === 'missed'
              ? 'border-bad/70 hover:bg-bad/10'
              : status === 'skipped'
                ? 'border-dashed border-faint text-faint'
                : 'border-faint/70 hover:border-accent hover:bg-accent/10'
        )}
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : status === 'skipped' ? <Minus className="h-3.5 w-3.5" /> : null}
      </span>
    </button>
  );
}

export function useToggleWithFeedback() {
  const data = useData();
  return (item: OccItem) => {
    unlockAudio();
    const r = data.toggleComplete(item.occ);
    if (r === 'completed') {
      if (data.prefs.soundEnabled && data.prefs.completionSound) playSound('pop');
      vibrate(12);
    }
  };
}

export function TaskRow({ item, showDate }: { item: OccItem; showDate?: boolean }) {
  const data = useData();
  const { ctx, todayKey } = useStats();
  const ui = useUI();
  const toggle = useToggleWithFeedback();
  const { occ, status, completion } = item;
  const info = statusInfo(status, occ, ctx, completion);
  const cat = data.categoryMap.get(occ.task.categoryId);
  const compact = data.prefs.density === 'compact';
  const open = () => ui.openTaskDetails(occ.task.id, occ.dateKey);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter') open();
      }}
      className={cn('group flex cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors hover:bg-fg/[0.04]', compact ? 'py-1.5' : 'py-2.5')}
    >
      <TickButton status={status} onToggle={() => toggle(item)} />
      <div className="min-w-0 flex-1 pl-1">
        <p className={cn('truncate text-sm font-medium', status === 'completed' ? 'text-muted line-through decoration-faint' : 'text-fg')}>{occ.task.title}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted">
          <span className="truncate">
            {showDate && `${relativeDayLabel(occ.dateKey, todayKey)} · `}
            {formatTimeRange(occ.start, occ.end, data.prefs.timeFormat)}
            {occ.planned ? ` · ${formatDuration(occ.planned)}` : ''}
          </span>
          {!compact && <CategoryChip category={cat} className="hidden sm:inline-flex" />}
        </div>
      </div>
      {occ.task.priority === 'high' && <Flag className="h-3.5 w-3.5 shrink-0 text-bad" aria-label="High priority" />}
      {info.soon && <Bell className="h-4 w-4 shrink-0 text-accent animate-ring" aria-hidden />}
      <Pill tone={info.tone} icon={status === 'completed' ? <Check /> : undefined}>
        {info.label}
      </Pill>
    </div>
  );
}

export function CountTaskRow({ task }: { task: Task }) {
  const data = useData();
  const ui = useUI();
  const r = currentVersion(task).recurrence;
  const target = Math.max(1, r.target ?? 1);
  const pct = Math.min(1, task.count / target);
  const done = task.count >= target;
  const compact = data.prefs.density === 'compact';
  const inc = () => {
    unlockAudio();
    data.changeCount(task, 1);
    if (data.prefs.soundEnabled && data.prefs.completionSound) playSound('pop', 0.7);
    vibrate(10);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ui.openTaskDetails(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ui.openTaskDetails(task.id);
      }}
      className={cn('flex cursor-pointer items-center gap-3 rounded-xl px-2 transition-colors hover:bg-fg/[0.04]', compact ? 'py-1.5' : 'py-2.5')}
    >
      <Ring value={pct} size={38} stroke={4} color={done ? 'var(--ok)' : 'var(--accent)'}>
        <span className="text-[10px] font-bold text-fg">{Math.round(pct * 100)}%</span>
      </Ring>
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', done ? 'text-muted' : 'text-fg')}>{task.title}</p>
        <p className="text-xs text-muted">
          {task.count}/{target} {r.unit || 'times'} · {done ? 'Goal reached 🎯' : `${target - task.count} left`}
        </p>
      </div>
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          aria-label="Decrease count"
          onClick={() => data.changeCount(task, -1)}
          disabled={task.count <= 0}
          className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition hover:text-fg disabled:opacity-40"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button aria-label="Increase count" onClick={inc} className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 text-accent transition hover:bg-accent/25">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
