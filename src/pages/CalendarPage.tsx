import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import type { OccItem } from '../types';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import {
  addDays,
  addMonths,
  formatDateKey,
  formatDuration,
  formatTime,
  formatTimeRange,
  isValidKey,
  parseKey,
  relativeDayLabel,
  startOfMonth,
  startOfWeek,
  WEEKDAYS_SHORT,
  weekdayOf,
} from '../lib/dates';
import { absRange, findConflicts, layoutDay } from '../lib/recurrence';
import { cn, hexToRgba } from '../lib/utils';
import { useIsMobile, useRoute } from '../hooks';
import { PageHeader } from '../components/Layout';
import { CountTaskRow, TaskRow, TickButton, useToggleWithFeedback } from '../components/TaskRow';
import { Button, Card, EmptyState, Segmented } from '../components/ui';

type View = 'day' | 'week' | 'month';

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--ok)',
  missed: 'var(--bad)',
  pending: 'var(--warn)',
  upcoming: 'var(--accent)',
  skipped: 'var(--faint)',
};

export default function CalendarPage() {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const isMobile = useIsMobile();
  const { params } = useRoute();
  const qDate = params.get('date');
  const qView = params.get('view') as View | null;
  const [view, setView] = useState<View>(qView && ['day', 'week', 'month'].includes(qView) ? qView : 'month');
  const [cursor, setCursor] = useState(isValidKey(qDate) ? qDate : stats.todayKey);

  useEffect(() => {
    if (isValidKey(qDate)) setCursor(qDate);
    if (qView && ['day', 'week', 'month'].includes(qView)) setView(qView);
  }, [qDate, qView]);

  const weekStart = data.prefs.weekStart;
  const move = (dir: -1 | 1) =>
    setCursor((c) => (view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(startOfMonth(c), dir)));
  const ws = startOfWeek(cursor, weekStart);
  const label =
    view === 'day'
      ? formatDateKey(cursor, isMobile ? 'weekday' : 'long')
      : view === 'week'
        ? `${formatDateKey(ws, 'short')} – ${formatDateKey(addDays(ws, 6), 'short')}`
        : formatDateKey(cursor, 'monthYear');

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Your schedule, timetable and completion status"
        actions={
          <Button icon={<Plus />} onClick={() => ui.openTaskEditor(undefined, { startDate: cursor })} className="hidden md:inline-flex">
            Add task
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={setView}
          className="w-full sm:w-auto"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
        <div className="flex flex-1 items-center gap-1 sm:flex-none">
          <Button variant="secondary" size="icon" aria-label="Previous" onClick={() => move(-1)}>
            <ChevronLeft />
          </Button>
          <p className="min-w-0 flex-1 truncate px-2 text-center text-sm font-semibold text-fg sm:min-w-[200px]">{label}</p>
          <Button variant="secondary" size="icon" aria-label="Next" onClick={() => move(1)}>
            <ChevronRight />
          </Button>
        </div>
        <Button variant="secondary" onClick={() => setCursor(stats.todayKey)}>
          Today
        </Button>
      </div>

      {view === 'month' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <MonthGrid cursor={cursor} onSelect={setCursor} onOpenDay={(k) => { setCursor(k); setView('day'); }} />
          <div className="space-y-4">
            <DayPanel dateKey={cursor} />
            <UpcomingPanel />
          </div>
        </div>
      )}
      {view === 'week' && (isMobile ? <WeekList start={ws} /> : <TimeGrid days={Array.from({ length: 7 }, (_, i) => addDays(ws, i))} onPickDay={(k) => { setCursor(k); setView('day'); }} />)}
      {view === 'day' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <TimeGrid days={[cursor]} />
          <DayPanel dateKey={cursor} timetable />
        </div>
      )}
    </div>
  );
}

function MonthGrid({ cursor, onSelect, onOpenDay }: { cursor: string; onSelect: (k: string) => void; onOpenDay: (k: string) => void }) {
  const data = useData();
  const { itemsFor, todayKey } = useStats();
  const isMobile = useIsMobile();
  const ms = startOfMonth(cursor);
  const month = parseKey(ms).m;
  const gridStart = startOfWeek(ms, data.prefs.weekStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const order = Array.from({ length: 7 }, (_, i) => (data.prefs.weekStart + i) % 7);
  const style = data.prefs.calendarStyle;
  const items = useMemo(() => new Map(days.map((k) => [k, itemsFor(k)])), [itemsFor, gridStart]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Card className="p-2 md:p-4">
      <div className="grid grid-cols-7 pb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-faint">
        {order.map((d) => (
          <span key={d}>{isMobile ? WEEKDAYS_SHORT[d].slice(0, 2) : WEEKDAYS_SHORT[d]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((k) => {
          const list = items.get(k) ?? [];
          const inMonth = parseKey(k).m === month;
          const selected = k === cursor;
          const isToday = k === todayKey;
          const done = list.filter((i) => i.status === 'completed').length;
          return (
            <button
              key={k}
              onClick={() => onSelect(k)}
              onDoubleClick={() => onOpenDay(k)}
              aria-label={`${formatDateKey(k, 'long')}, ${list.length} tasks`}
              aria-pressed={selected}
              className={cn(
                'flex min-h-[52px] flex-col items-center rounded-xl p-1 text-left transition md:min-h-[92px] md:items-stretch md:p-1.5',
                selected ? 'bg-accent/12 ring-1 ring-accent/60' : 'hover:bg-fg/[0.04]',
                !inMonth && 'opacity-40'
              )}
            >
              <span className={cn('grid h-7 w-7 place-items-center rounded-full text-xs font-semibold md:self-start', isToday ? 'bg-accent text-accent-fg' : 'text-fg')}>
                {parseKey(k).d}
              </span>
              {list.length > 0 &&
                (style === 'bars' && !isMobile ? (
                  <div className="mt-1 w-full space-y-0.5">
                    {list.slice(0, 3).map((i) => {
                      const color = data.categoryMap.get(i.occ.task.categoryId)?.color ?? '#94a3b8';
                      return (
                        <span
                          key={i.occ.id}
                          className={cn('block truncate rounded px-1 py-px text-[10px] font-medium', i.status === 'completed' && 'line-through opacity-70')}
                          style={{ background: hexToRgba(color, 0.18), color }}
                        >
                          {i.occ.task.title}
                        </span>
                      );
                    })}
                    {list.length > 3 && <span className="block px-1 text-[10px] text-faint">+{list.length - 3} more</span>}
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap justify-center gap-0.5 md:justify-start">
                    {list.slice(0, 4).map((i) => (
                      <span
                        key={i.occ.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: i.status === 'missed' ? 'var(--bad)' : data.categoryMap.get(i.occ.task.categoryId)?.color ?? 'var(--accent)', opacity: i.status === 'completed' ? 1 : 0.55 }}
                      />
                    ))}
                  </div>
                ))}
              {list.length > 0 && !isMobile && style !== 'bars' && (
                <span className="mt-auto hidden text-[10px] text-faint md:block">
                  {done}/{list.length} done
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function ConflictBanner({ items }: { items: OccItem[] }) {
  const { prefs } = useData();
  const conflicts = findConflicts(items.filter((i) => i.status !== 'skipped').map((i) => i.occ));
  if (!conflicts.length) return null;
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-warn">
        <AlertTriangle className="h-3.5 w-3.5" /> {conflicts.length} scheduling {conflicts.length === 1 ? 'conflict' : 'conflicts'}
      </p>
      <ul className="mt-1 space-y-0.5 text-fg/80">
        {conflicts.slice(0, 4).map(([a, b]) => (
          <li key={`${a.id}-${b.id}`}>
            <span className="font-semibold">{a.task.title}</span> overlaps <span className="font-semibold">{b.task.title}</span> ({formatTimeRange(b.start, b.end, prefs.timeFormat)})
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayPanel({ dateKey, timetable }: { dateKey: string; timetable?: boolean }) {
  const data = useData();
  const { itemsFor, todayKey, countTasks } = useStats();
  const ui = useUI();
  const items = itemsFor(dateKey);
  const done = items.filter((i) => i.status === 'completed').length;
  const planned = items.filter((i) => i.status !== 'skipped').reduce((s, i) => s + i.occ.planned, 0);
  const timed = items.filter((i) => i.occ.start != null);
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-fg">{relativeDayLabel(dateKey, todayKey) === formatDateKey(dateKey, 'weekday') ? formatDateKey(dateKey, 'weekday') : `${relativeDayLabel(dateKey, todayKey)} · ${formatDateKey(dateKey, 'weekday')}`}</p>
          <p className="text-xs text-muted">
            {done}/{items.length} tasks{planned ? ` · ${formatDuration(planned)} planned` : ''}
          </p>
        </div>
        <Button size="sm" variant="soft" icon={<Plus />} onClick={() => ui.openTaskEditor(undefined, { startDate: dateKey, type: dateKey > todayKey ? 'once' : undefined })}>
          Add
        </Button>
      </div>
      <ConflictBanner items={items} />
      {timetable && timed.length > 0 && (
        <div className="my-3 rounded-xl border border-line bg-card-2/50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
            <Clock className="h-3.5 w-3.5" /> Timetable
          </p>
          <ul className="space-y-1 text-xs">
            {timed.map((i) => (
              <li key={i.occ.id} className="flex gap-2">
                <span className="w-[120px] shrink-0 font-mono text-muted">{formatTimeRange(i.occ.start, i.occ.end, data.prefs.timeFormat)}</span>
                <span className="truncate font-medium text-fg">{i.occ.task.title}</span>
                <span className="ml-auto shrink-0 text-faint">{formatDuration(i.occ.planned)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={<CalendarDays />} title="Nothing scheduled" message="Enjoy the free time — or plan something small." className="py-6" />
      ) : (
        <div className="mt-2 divide-y divide-line">
          {items.map((i) => (
            <TaskRow key={i.occ.id} item={i} />
          ))}
        </div>
      )}
      {dateKey === todayKey && countTasks.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          {countTasks.map((t) => (
            <CountTaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </Card>
  );
}

function UpcomingPanel() {
  const { itemsFor, todayKey } = useStats();
  const groups = useMemo(() => {
    const out: { key: string; items: OccItem[] }[] = [];
    for (let i = 1; i <= 7; i++) {
      const k = addDays(todayKey, i);
      const list = itemsFor(k);
      if (list.length) out.push({ key: k, items: list });
    }
    return out;
  }, [itemsFor, todayKey]);
  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-semibold text-fg">Upcoming · next 7 days</p>
      {groups.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted">No upcoming tasks.</p>
      ) : (
        <div className="space-y-3">
          {groups.slice(0, 5).map((g) => (
            <div key={g.key}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{relativeDayLabel(g.key, todayKey)}</p>
              {g.items.slice(0, 4).map((i) => (
                <TaskRow key={i.occ.id} item={i} />
              ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function WeekList({ start }: { start: string }) {
  const { itemsFor, todayKey } = useStats();
  return (
    <div className="space-y-3">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((k) => {
        const items = itemsFor(k);
        return (
          <Card key={k} className={cn('p-3', k === todayKey && 'ring-1 ring-accent/50')}>
            <div className="mb-1 flex items-center justify-between px-1">
              <p className="text-sm font-semibold text-fg">{relativeDayLabel(k, todayKey) === formatDateKey(k, 'weekday') ? formatDateKey(k, 'weekday') : `${relativeDayLabel(k, todayKey)} · ${formatDateKey(k, 'short')}`}</p>
              <span className="text-xs text-muted">
                {items.filter((x) => x.status === 'completed').length}/{items.length}
              </span>
            </div>
            <ConflictBanner items={items} />
            {items.length === 0 ? <p className="px-1 py-2 text-xs text-faint">Nothing scheduled</p> : items.map((i) => <TaskRow key={i.occ.id} item={i} />)}
          </Card>
        );
      })}
    </div>
  );
}

const HOUR_PX = 56;

function TimeGrid({ days, onPickDay }: { days: string[]; onPickDay?: (k: string) => void }) {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const toggle = useToggleWithFeedback();
  const scrollRef = useRef<HTMLDivElement>(null);
  const startH = Math.min(data.prefs.calendarStartHour, 23);
  const endH = Math.max(data.prefs.calendarEndHour, startH + 1);
  const hours = Array.from({ length: endH - startH }, (_, i) => startH + i);
  const height = hours.length * HOUR_PX;
  const perDay = useMemo(() => days.map((k) => ({ key: k, items: stats.itemsFor(k) })), [days, stats]);
  const multi = days.length > 1;

  useEffect(() => {
    const target = Math.max(0, (Math.max(stats.now.minutes / 60, startH + 1) - startH - 1.5) * HOUR_PX);
    scrollRef.current?.scrollTo({ top: target });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0]]);

  return (
    <Card className="overflow-hidden">
      {/* header */}
      <div className="flex border-b border-line">
        <div className="w-14 shrink-0" />
        {perDay.map(({ key, items }) => (
          <div key={key} className="min-w-0 flex-1 border-l border-line px-1.5 py-2">
            {multi && (
              <button onClick={() => onPickDay?.(key)} className="flex w-full items-center justify-center gap-1.5 rounded-lg py-0.5 hover:bg-fg/[0.05]">
                <span className="text-[11px] font-semibold uppercase text-faint">{WEEKDAYS_SHORT[weekdayOf(key)]}</span>
                <span className={cn('grid h-6 w-6 place-items-center rounded-full text-xs font-bold', key === stats.todayKey ? 'bg-accent text-accent-fg' : 'text-fg')}>{parseKey(key).d}</span>
              </button>
            )}
            <div className="mt-1 space-y-1">
              {items
                .filter((i) => i.occ.start == null)
                .map((i) => (
                  <button
                    key={i.occ.id}
                    onClick={() => ui.openTaskDetails(i.occ.task.id, i.occ.dateKey)}
                    className={cn('block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-medium', i.status === 'completed' && 'line-through opacity-60')}
                    style={{ background: hexToRgba(data.categoryMap.get(i.occ.task.categoryId)?.color ?? '#8b5cf6', 0.16), color: 'var(--fg)' }}
                  >
                    {i.occ.task.title} <span className="text-faint">· any time</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
      {/* grid */}
      <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto">
        <div className="relative flex" style={{ height }}>
          <div className="w-14 shrink-0">
            {hours.map((h) => (
              <div key={h} className="relative text-right" style={{ height: HOUR_PX }}>
                <span className="absolute -top-2 right-2 text-[10px] text-faint">{h === startH ? '' : formatTime(h * 60, data.prefs.timeFormat).replace(':00', '')}</span>
              </div>
            ))}
          </div>
          {perDay.map(({ key, items }) => {
            const laid = layoutDay(items);
            const isToday = key === stats.todayKey;
            const nowTop = ((stats.now.minutes - startH * 60) / 60) * HOUR_PX;
            return (
              <div key={key} className="relative min-w-0 flex-1 border-l border-line">
                {hours.map((h) => (
                  <div key={h} className="border-t border-line/70" style={{ height: HOUR_PX }} />
                ))}
                {laid.map((i) => {
                  const [s, e] = absRange(i.occ)!;
                  const top = Math.max(0, ((s - startH * 60) / 60) * HOUR_PX);
                  const bottom = Math.min(height, ((e - startH * 60) / 60) * HOUR_PX);
                  if (bottom <= 0 || top >= height) return null;
                  const color = data.categoryMap.get(i.occ.task.categoryId)?.color ?? '#8b5cf6';
                  return (
                    <div
                      key={i.occ.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => ui.openTaskDetails(i.occ.task.id, i.occ.dateKey)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') ui.openTaskDetails(i.occ.task.id, i.occ.dateKey);
                      }}
                      className={cn('absolute cursor-pointer overflow-hidden rounded-lg border-l-[3px] px-2 py-1 text-left shadow-sm transition hover:brightness-110', i.status === 'completed' && 'opacity-70')}
                      style={{
                        top: top + 1,
                        height: Math.max(24, bottom - top - 2),
                        left: `calc(${(i.col / i.cols) * 100}% + 2px)`,
                        width: `calc(${100 / i.cols}% - 4px)`,
                        background: hexToRgba(color, 0.18),
                        borderLeftColor: STATUS_COLOR[i.status],
                      }}
                    >
                      <div className="flex items-start gap-1">
                        {!multi && <TickButton size="sm" status={i.status} onToggle={() => toggle(i)} />}
                        <div className="min-w-0 flex-1">
                          <p className={cn('truncate text-xs font-semibold text-fg', i.status === 'completed' && 'line-through')}>{i.occ.task.title}</p>
                          {bottom - top > 36 && <p className="truncate text-[10px] text-muted">{formatTimeRange(i.occ.start, i.occ.end, data.prefs.timeFormat)}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isToday && nowTop > 0 && nowTop < height && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-bad" />
                    <span className="h-px flex-1 bg-bad" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
