import { useMemo, useState } from 'react';
import { Archive, Flame, ListChecks, Pause, Pencil, Play, Plus, Search, Trash2, ArchiveRestore } from 'lucide-react';
import type { Task } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { REPEAT_LABEL } from '../constants';
import { addDays, formatTimeRange, relativeDayLabel } from '../lib/dates';
import { currentVersion, describeRecurrence, nextOccurrenceKey } from '../lib/recurrence';
import { taskStreak } from '../lib/engine';
import { cn } from '../lib/utils';
import { PageHeader } from '../components/Layout';
import { Button, Card, CategoryChip, EmptyState, inputClass, Menu, Pill, Segmented } from '../components/ui';

type Filter = 'active' | 'paused' | 'archived' | 'all';

export default function TasksPage() {
  const data = useData();
  const ui = useUI();
  const [filter, setFilter] = useState<Filter>('active');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.tasks
      .filter((t) => filter === 'all' || t.status === filter)
      .filter((t) => !cat || t.categoryId === cat)
      .filter((t) => !s || `${t.title} ${t.description}`.toLowerCase().includes(s))
      .sort((a, b) => (a.priority === b.priority ? a.title.localeCompare(b.title) : a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : a.priority === 'medium' ? -1 : 1));
  }, [data.tasks, filter, q, cat]);
  const counts = {
    active: data.tasks.filter((t) => t.status === 'active').length,
    paused: data.tasks.filter((t) => t.status === 'paused').length,
    archived: data.tasks.filter((t) => t.status === 'archived').length,
  };
  return (
    <div>
      <PageHeader
        title="All Tasks"
        subtitle="Manage, pause, archive and review every task"
        actions={
          <Button icon={<Plus />} onClick={() => ui.openTaskEditor()}>
            New task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={filter}
          onChange={setFilter}
          className="w-full sm:w-auto"
          options={[
            { value: 'active', label: `Active ${counts.active}` },
            { value: 'paused', label: `Paused ${counts.paused}` },
            { value: 'archived', label: `Archived ${counts.archived}` },
            { value: 'all', label: 'All' },
          ]}
        />
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tasks…" aria-label="Search tasks" className={cn(inputClass, 'pl-9')} />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category" className={cn(inputClass, 'w-auto')}>
          <option value="">All categories</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks />}
            title={data.tasks.length ? 'No tasks match these filters' : 'No tasks yet'}
            message={data.tasks.length ? 'Try another filter.' : 'Create a daily habit, a weekly practice, a monthly review or a count-based goal.'}
            action={!data.tasks.length && <Button icon={<Plus />} onClick={() => ui.openTaskEditor()}>Create a task</Button>}
          />
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {list.map((t) => (
            <TaskListRow key={t.id} task={t} />
          ))}
        </Card>
      )}
    </div>
  );
}

function TaskListRow({ task }: { task: Task }) {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const v = currentVersion(task);
  const isCount = v.recurrence.type === 'count';
  const next = useMemo(() => (isCount || task.status !== 'active' ? null : nextOccurrenceKey(task, stats.todayKey, 120)), [task, isCount, stats.todayKey]);
  const streak = useMemo(() => taskStreak(task, data.completions, stats.ctx, data.prefs.weekStart, addDays(stats.todayKey, -120)), [task, data.completions, stats.ctx, data.prefs.weekStart, stats.todayKey]);
  const remove = async () => {
    if (await ui.confirm({ title: `Delete "${task.title}"?`, message: 'This also deletes its completion history. Archive instead to keep it.', confirmText: 'Delete', danger: true })) void data.deleteTask(task);
  };
  return (
    <div role="button" tabIndex={0} onClick={() => ui.openTaskDetails(task.id)} onKeyDown={(e) => e.key === 'Enter' && ui.openTaskDetails(task.id)} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-fg/[0.03]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-fg">{task.title}</p>
          {task.priority === 'high' && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-bad" aria-label="High priority" />}
        </div>
        <p className="truncate text-xs text-muted">
          {describeRecurrence(v)}
          {!isCount && v.startTime != null && ` · ${formatTimeRange(v.startTime, v.endTime, data.prefs.timeFormat)}`}
          {isCount && ` · ${task.count}/${v.recurrence.target ?? 1}`}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <CategoryChip category={data.categoryMap.get(task.categoryId)} />
          <Pill tone="accent" className="py-0.5">
            {REPEAT_LABEL[v.recurrence.type]}
          </Pill>
          {task.status !== 'active' && (
            <Pill tone="warn" className="py-0.5">
              {task.status}
            </Pill>
          )}
          {next && <span className="text-[11px] text-faint">Next: {relativeDayLabel(next, stats.todayKey)}</span>}
        </div>
      </div>
      {streak.current > 0 && (
        <span className="hidden items-center gap-1 rounded-full bg-orange-500/12 px-2 py-1 text-xs font-semibold text-orange-400 sm:inline-flex">
          <Flame className="h-3.5 w-3.5" />
          {streak.current}
          {streak.unit === 'day' ? 'd' : streak.unit === 'week' ? 'w' : 'mo'}
        </span>
      )}
      <Menu
        items={[
          { label: 'Edit', icon: <Pencil />, onClick: () => ui.openTaskEditor(task) },
          task.status === 'active' && { label: 'Pause', icon: <Pause />, onClick: () => data.setTaskState(task, 'pause') },
          task.status === 'paused' && { label: 'Resume', icon: <Play />, onClick: () => data.setTaskState(task, 'resume') },
          task.status !== 'archived'
            ? { label: 'Archive', icon: <Archive />, onClick: () => data.setTaskState(task, 'archive') }
            : { label: 'Unarchive', icon: <ArchiveRestore />, onClick: () => data.setTaskState(task, 'unarchive') },
          { label: 'Delete', icon: <Trash2 />, onClick: remove, danger: true },
        ]}
      />
    </div>
  );
}
