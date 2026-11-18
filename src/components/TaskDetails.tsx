import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Check,
  Clock,
  FileText,
  Flag,
  Flame,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  SkipForward,
  StickyNote,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import type { OccItem, Task } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { REPEAT_LABEL } from '../constants';
import { addDays, formatDateKey, formatDuration, formatEpoch, formatTimeRange, relativeDayLabel } from '../lib/dates';
import { currentVersion, describeRecurrence, firstVersion, isScheduledOn, makeOccurrence, nextOccurrenceKey } from '../lib/recurrence';
import { occurrenceStatus, statusInfo, taskStreak } from '../lib/engine';
import { cn } from '../lib/utils';
import { Button, CategoryChip, EmptyState, inputClass, Modal, Pill, ProgressBar, Ring } from './ui';
import { TickButton, useToggleWithFeedback } from './TaskRow';

export function TaskDetails({ taskId, dateKey, onClose }: { taskId: string; dateKey?: string; onClose: () => void }) {
  const data = useData();
  const task = data.taskMap.get(taskId);
  if (!task) {
    return (
      <Modal open onClose={onClose} size="sm" label="Task not found">
        <EmptyState title="Task not found" message="It may have been deleted on another device." action={<Button onClick={onClose}>Close</Button>} />
      </Modal>
    );
  }
  return <TaskDetailsBody task={task} dateKey={dateKey} onClose={onClose} />;
}

function TaskDetailsBody({ task, dateKey, onClose }: { task: Task; dateKey?: string; onClose: () => void }) {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const toggle = useToggleWithFeedback();
  const version = currentVersion(task);
  const isCount = version.recurrence.type === 'count';
  const cat = data.categoryMap.get(task.categoryId);
  const fmt = data.prefs.timeFormat;

  const occKey = dateKey ?? (isScheduledOn(task, stats.todayKey) ? stats.todayKey : null);
  const v = occKey ? isScheduledOn(task, occKey) : null;
  const occItem: OccItem | null = useMemo(() => {
    if (!v || !occKey) return null;
    const occ = makeOccurrence(task, v, occKey);
    const completion = data.completions.get(occ.id);
    return { occ, completion, status: occurrenceStatus(occ, completion, stats.ctx) };
  }, [task, v, occKey, data.completions, stats.ctx]);

  const streak = useMemo(() => taskStreak(task, data.completions, stats.ctx, data.prefs.weekStart, data.windowStart), [task, data.completions, stats.ctx, data.prefs.weekStart, data.windowStart]);

  const history = useMemo(() => {
    if (isCount) return [] as OccItem[];
    const out: OccItem[] = [];
    const first = firstVersion(task)?.startDate ?? stats.todayKey;
    let k = stats.todayKey;
    for (let guard = 0; out.length < 30 && k >= first && k >= data.windowStart && guard < 400; guard++) {
      const vv = isScheduledOn(task, k);
      if (vv) {
        const o = makeOccurrence(task, vv, k);
        const c = data.completions.get(o.id);
        out.push({ occ: o, completion: c, status: occurrenceStatus(o, c, stats.ctx) });
      }
      k = addDays(k, -1);
    }
    return out;
  }, [task, isCount, data.completions, data.windowStart, stats.todayKey, stats.ctx]);

  const next = useMemo(() => (isCount ? null : nextOccurrenceKey(task, addDays(stats.todayKey, 1), 400)), [task, isCount, stats.todayKey]);
  const linkedNotes = data.notes.filter((n) => n.linkedTaskIds.includes(task.id));
  const unitLabel = streak.unit === 'day' ? (streak.current === 1 ? 'day' : 'days') : streak.unit === 'week' ? (streak.current === 1 ? 'week' : 'weeks') : streak.current === 1 ? 'month' : 'months';

  const remove = async () => {
    const ok = await ui.confirm({
      title: `Delete "${task.title}"?`,
      message: 'The task and its completion history will be permanently deleted. Archive it instead if you want to keep your history.',
      confirmText: 'Delete task',
      danger: true,
    });
    if (!ok) return;
    void data.deleteTask(task);
    ui.toast({ type: 'success', title: 'Task deleted' });
    onClose();
  };

  const newLinkedNote = () => {
    const id = data.createNote({ type: 'detailed', title: `${task.title} — notes`, linkedTaskIds: [task.id], categoryId: task.categoryId });
    ui.openNote(id);
  };

  return (
    <Modal open onClose={onClose} size="lg" label={task.title}>
      <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-4 md:pt-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={cat} />
            <Pill tone="accent">{REPEAT_LABEL[version.recurrence.type]}</Pill>
            {task.priority !== 'medium' && (
              <Pill tone={task.priority === 'high' ? 'bad' : 'info'} icon={<Flag />}>
                {task.priority === 'high' ? 'High' : 'Low'}
              </Pill>
            )}
            {task.status !== 'active' && <Pill tone="warn">{task.status === 'paused' ? 'Paused' : 'Archived'}</Pill>}
          </div>
          <h2 className="mt-2 text-xl font-bold leading-tight text-fg">{task.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {describeRecurrence(version)}
            {!isCount && version.startTime != null && ` · ${formatTimeRange(version.startTime, version.endTime, fmt)}`}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-fg/[0.06] hover:text-fg">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {isCount ? (
          <CountPanel task={task} />
        ) : occItem ? (
          <OccurrencePanel item={occItem} onToggle={() => toggle(occItem)} />
        ) : (
          <div className="rounded-2xl border border-line bg-card-2/50 p-4 text-sm text-muted">
            <CalendarDays className="mb-1 h-4 w-4 text-accent" />
            {next ? (
              <>
                Next occurrence: <span className="font-semibold text-fg">{relativeDayLabel(next, stats.todayKey)}</span>
              </>
            ) : (
              'No upcoming occurrences.'
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Flame className="h-4 w-4 text-orange-400" />} label="Current streak" value={`${streak.current}`} sub={unitLabel} />
          <Stat icon={<Trophy className="h-4 w-4 text-amber-400" />} label="Best streak" value={`${streak.best}`} sub={streak.unit + (streak.best === 1 ? '' : 's')} />
          <Stat icon={<Check className="h-4 w-4 text-ok" />} label={isCount ? 'Active days' : 'Completed'} value={`${streak.completed}`} sub={isCount ? 'with progress' : 'occurrences'} />
          <Stat icon={<Target className="h-4 w-4 text-accent" />} label="Completion rate" value={streak.rate == null ? '—' : `${Math.round(streak.rate * 100)}%`} sub={`${streak.missed} missed`} />
        </div>

        {(task.description || task.notes) && (
          <div className="space-y-3 rounded-2xl border border-line p-4">
            {task.description && <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{task.description}</p>}
            {task.notes && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Notes</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{task.notes}</p>
              </div>
            )}
          </div>
        )}

        {/* Linked notes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Linked notes</p>
            <Button size="sm" variant="ghost" icon={<Plus />} onClick={newLinkedNote}>
              New note
            </Button>
          </div>
          {linkedNotes.length ? (
            <div className="space-y-1.5">
              {linkedNotes.map((n) => (
                <button key={n.id} onClick={() => ui.openNote(n.id)} className="flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left hover:bg-fg/[0.04]">
                  {n.type === 'quick' ? <StickyNote className="h-4 w-4 text-warn" /> : <FileText className="h-4 w-4 text-info" />}
                  <span className="truncate text-sm text-fg">{n.title || 'Untitled note'}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-faint">No notes linked yet.</p>
          )}
        </div>

        {/* History */}
        {!isCount && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">History · last {history.length} occurrences</p>
            {history.length ? (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {history.map((h) => {
                  const info = statusInfo(h.status, h.occ, stats.ctx, h.completion);
                  return (
                    <li key={h.occ.id} className="flex items-center gap-3 px-3 py-2">
                      <TickButton size="sm" status={h.status} onToggle={() => toggle(h)} />
                      <div className="min-w-0 flex-1 pl-1">
                        <p className="text-sm text-fg">{relativeDayLabel(h.occ.dateKey, stats.todayKey)}</p>
                        <p className="truncate text-[11px] text-faint">
                          Scheduled {formatTimeRange(h.occ.start, h.occ.end, fmt)}
                          {h.completion?.status === 'completed' && ` · done ${formatEpoch(h.completion.completedAtMs, data.prefs.timezone, fmt)}`}
                        </p>
                      </div>
                      <Pill tone={info.tone}>{info.label}</Pill>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-faint">No past occurrences yet.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 border-t border-line px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
        <Button variant="secondary" icon={<Pencil />} onClick={() => ui.openTaskEditor(task)}>
          Edit
        </Button>
        {task.status === 'active' && (
          <Button variant="secondary" icon={<Pause />} onClick={() => { data.setTaskState(task, 'pause'); ui.toast({ type: 'info', title: 'Task paused', message: 'No occurrences will be scheduled until you resume it.' }); }}>
            Pause
          </Button>
        )}
        {task.status === 'paused' && (
          <Button variant="secondary" icon={<Play />} onClick={() => { data.setTaskState(task, 'resume'); ui.toast({ type: 'success', title: 'Task resumed' }); }}>
            Resume
          </Button>
        )}
        {task.status !== 'archived' ? (
          <Button variant="secondary" icon={<Archive />} onClick={() => { data.setTaskState(task, 'archive'); ui.toast({ type: 'info', title: 'Task archived', message: 'History is kept. Find it under All Tasks → Archived.' }); onClose(); }}>
            Archive
          </Button>
        ) : (
          <Button variant="secondary" icon={<ArchiveRestore />} onClick={() => { data.setTaskState(task, 'unarchive'); ui.toast({ type: 'success', title: 'Task restored' }); }}>
            Unarchive
          </Button>
        )}
        <Button variant="ghost" className="ml-auto text-bad hover:bg-bad/10 hover:text-bad" icon={<Trash2 />} onClick={remove}>
          Delete
        </Button>
      </div>
    </Modal>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card-2/50 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-xl font-bold text-fg">{value}</p>
      <p className="text-[11px] text-faint">{sub}</p>
    </div>
  );
}

function OccurrencePanel({ item, onToggle }: { item: OccItem; onToggle: () => void }) {
  const data = useData();
  const stats = useStats();
  const { occ, status, completion } = item;
  const info = statusInfo(status, occ, stats.ctx, completion);
  const fmt = data.prefs.timeFormat;
  const [actual, setActual] = useState<string>(completion?.actualMinutes != null ? String(completion.actualMinutes) : '');
  const done = status === 'completed';
  const future = occ.dateKey > stats.todayKey;
  return (
    <div className="rounded-2xl border border-line bg-card-2/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-fg">{formatDateKey(occ.dateKey, 'long')}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
            <Clock className="h-3.5 w-3.5" />
            {formatTimeRange(occ.start, occ.end, fmt)}
            {occ.planned ? ` · ${formatDuration(occ.planned)} planned` : ''}
          </p>
        </div>
        <Pill tone={info.tone}>{info.label}</Pill>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant={done ? 'secondary' : 'primary'} icon={done ? <Minus /> : <Check />} onClick={onToggle} disabled={future && !done} className={cn(done && 'text-ok')}>
          {done ? 'Completed — undo' : status === 'missed' ? 'Complete late' : 'Mark complete'}
        </Button>
        {status !== 'completed' &&
          (status === 'skipped' ? (
            <Button variant="secondary" onClick={() => data.setSkip(occ, false)}>
              Unskip
            </Button>
          ) : (
            <Button variant="secondary" icon={<SkipForward />} onClick={() => data.setSkip(occ, true)}>
              Skip this one
            </Button>
          ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Completion is always manual — end-of-session alarms never tick a task for you. Skipped occurrences don't count against your streak.
      </p>
      {done && completion && (
        <div className="mt-4 space-y-2 border-t border-line pt-4">
          <p className="text-xs text-muted">
            Completed {formatEpoch(completion.completedAtMs, data.prefs.timezone, fmt)}
            {completion.late && <span className="ml-1 font-semibold text-warn">(late)</span>}
          </p>
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted">
            Actual time spent
            <input
              type="number"
              min={0}
              max={1440}
              value={actual}
              placeholder={String(occ.planned || 0)}
              onChange={(e) => setActual(e.target.value)}
              onBlur={() => data.setActualMinutes(completion.id, actual === '' ? null : Number(actual))}
              className={cn(inputClass, 'w-24 py-1.5')}
            />
            minutes {occ.planned ? `(planned ${occ.planned})` : ''}
          </label>
        </div>
      )}
    </div>
  );
}

function CountPanel({ task }: { task: Task }) {
  const data = useData();
  const r = currentVersion(task).recurrence;
  const target = Math.max(1, r.target ?? 1);
  const pct = Math.min(1, task.count / target);
  const [value, setValue] = useState(String(task.count));
  const log = Object.entries(task.progressLog ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 10);
  const deadline = currentVersion(task).endDate;
  return (
    <div className="rounded-2xl border border-line bg-card-2/50 p-4">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <Ring value={pct} size={128} stroke={11} color={pct >= 1 ? 'var(--ok)' : 'var(--accent)'}>
          <div>
            <p className="text-2xl font-extrabold text-fg">{Math.round(pct * 100)}%</p>
            <p className="text-[11px] text-muted">complete</p>
          </div>
        </Ring>
        <div className="w-full flex-1 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-fg/[0.04] p-2">
              <p className="text-lg font-bold text-fg">{task.count}</p>
              <p className="text-[11px] text-muted">Current</p>
            </div>
            <div className="rounded-xl bg-fg/[0.04] p-2">
              <p className="text-lg font-bold text-fg">{target}</p>
              <p className="text-[11px] text-muted">Target</p>
            </div>
            <div className="rounded-xl bg-fg/[0.04] p-2">
              <p className="text-lg font-bold text-fg">{Math.max(0, target - task.count)}</p>
              <p className="text-[11px] text-muted">Remaining</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Decrease" onClick={() => { data.changeCount(task, -1); setValue(String(Math.max(0, task.count - 1))); }} disabled={task.count <= 0}>
              <Minus />
            </Button>
            <input
              type="number"
              min={0}
              value={value}
              aria-label="Set count"
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => {
                const n = Math.max(0, Math.round(Number(value) || 0));
                if (n !== task.count) data.changeCount(task, n - task.count);
              }}
              className={cn(inputClass, 'text-center')}
            />
            <Button size="icon" aria-label="Increase" onClick={() => { data.changeCount(task, 1); setValue(String(task.count + 1)); }}>
              <Plus />
            </Button>
          </div>
          {deadline && <p className="text-xs text-muted">Deadline: {formatDateKey(deadline, 'weekday')}</p>}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {[0.25, 0.5, 0.75, 1].map((m) => (
          <div key={m} className={cn('rounded-xl p-2 text-center text-xs font-semibold', pct >= m ? 'bg-ok/15 text-ok' : 'bg-fg/[0.04] text-faint')}>
            {m * 100}%{pct >= m ? ' ✓' : ''}
          </div>
        ))}
      </div>
      <ProgressBar value={pct} className="mt-3" color={pct >= 1 ? 'var(--ok)' : 'var(--accent)'} />
      {log.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">Recent progress</p>
          <ul className="space-y-1 text-xs text-muted">
            {log.map(([k, n]) => (
              <li key={k} className="flex justify-between">
                <span>{formatDateKey(k, 'weekday')}</span>
                <span className="font-semibold text-fg">
                  +{n} {r.unit || ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
