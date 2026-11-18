import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Bell, BellRing, Check, Clock, Flag, Info, Plus, Volume2, X } from 'lucide-react';
import type { Priority, Recurrence, RepeatType, Task } from '../types';
import { useData, useStats, type TaskInput } from '../context/DataContext';
import { useUI, type TaskDefaults } from '../context/UIContext';
import { CATEGORY_COLORS, CATEGORY_ICONS, REMINDER_OFFSETS, SOUNDS } from '../constants';
import {
  addDays,
  durationBetween,
  formatDateKey,
  formatDuration,
  formatTimeRange,
  inputToTime,
  parseKey,
  timeToInput,
  WEEKDAYS_SHORT,
  weekdayOf,
} from '../lib/dates';
import { currentVersion, firstVersion, isScheduledOn, makeOccurrence, absRange, occurrencesOn } from '../lib/recurrence';
import { playSound, unlockAudio } from '../lib/sounds';
import { cn } from '../lib/utils';
import { useNotificationPermission } from '../hooks';
import { Button, Field, inputClass, Modal, Segmented, Toggle } from './ui';

const ORDINALS = [
  { v: 1, l: 'First' },
  { v: 2, l: 'Second' },
  { v: 3, l: 'Third' },
  { v: 4, l: 'Fourth' },
  { v: -1, l: 'Last' },
];

export function TaskEditor({ task, defaults, onClose }: { task?: Task; defaults?: TaskDefaults; onClose: () => void }) {
  const data = useData();
  const { todayKey } = useStats();
  const ui = useUI();
  const { permission, request } = useNotificationPermission();
  const prefs = data.prefs;
  const cur = task ? currentVersion(task) : null;
  const started = !!task && (firstVersion(task)?.from ?? todayKey) <= todayKey;

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [categoryId, setCategoryId] = useState(task?.categoryId ?? defaults?.categoryId ?? 'study');
  const [priority, setPriority] = useState<Priority>(task?.priority ?? 'medium');
  const [type, setType] = useState<RepeatType>(cur?.recurrence.type ?? defaults?.type ?? 'daily');
  const [startDate, setStartDate] = useState(cur?.startDate ?? defaults?.startDate ?? todayKey);
  const [endDate, setEndDate] = useState(cur?.endDate && cur.recurrence.type !== 'once' ? cur.endDate : '');
  const [dailyMode, setDailyMode] = useState<'every' | 'weekdays'>(cur?.recurrence.dailyMode ?? 'every');
  const [weekdays, setWeekdays] = useState<number[]>(cur?.recurrence.weekdays ?? [weekdayOf(defaults?.startDate ?? todayKey)]);
  const [every, setEvery] = useState(cur?.recurrence.interval ?? 1);
  const [monthlyMode, setMonthlyMode] = useState<'day' | 'nth'>(cur?.recurrence.monthlyMode ?? 'day');
  const [monthDay, setMonthDay] = useState(cur?.recurrence.monthDay ?? parseKey(defaults?.startDate ?? todayKey).d);
  const [nth, setNth] = useState(cur?.recurrence.nth ?? 1);
  const [nthWeekday, setNthWeekday] = useState(cur?.recurrence.nthWeekday ?? weekdayOf(defaults?.startDate ?? todayKey));
  const [target, setTarget] = useState(cur?.recurrence.target ?? 10);
  const [unit, setUnit] = useState(cur?.recurrence.unit ?? '');
  const [hasTime, setHasTime] = useState(cur ? cur.startTime != null : defaults?.startTime != null);
  const [startTime, setStartTime] = useState(timeToInput(cur?.startTime ?? defaults?.startTime ?? 19 * 60));
  const [endTime, setEndTime] = useState(timeToInput(cur?.endTime ?? defaults?.endTime ?? (defaults?.startTime != null ? defaults.startTime + 60 : 21 * 60)));
  const [rStart, setRStart] = useState(task?.reminders.start ?? true);
  const [rEnd, setREnd] = useState(task?.reminders.end ?? true);
  const [offset, setOffset] = useState(task?.reminders.offset ?? prefs.defaultReminderOffset);
  const [sound, setSound] = useState(task?.reminders.sound ?? prefs.sound);
  const [vib, setVib] = useState(task?.reminders.vibrate ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [newCat, setNewCat] = useState<{ name: string; color: string; icon: string } | null>(null);

  const weekOrder = prefs.weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  const isCount = type === 'count';
  const st = hasTime && !isCount ? inputToTime(startTime) : null;
  const et = hasTime && !isCount ? inputToTime(endTime) : null;
  const duration = durationBetween(st, et);

  const recurrence: Recurrence = useMemo(() => {
    switch (type) {
      case 'once':
        return { type };
      case 'daily':
        return dailyMode === 'weekdays' ? { type, dailyMode, weekdays } : { type, dailyMode: 'every' };
      case 'weekly':
        return { type, weekdays, interval: every };
      case 'monthly':
        return monthlyMode === 'nth' ? { type, monthlyMode, nth, nthWeekday, interval: every } : { type, monthlyMode, monthDay, interval: every };
      case 'count':
        return { type, target, unit };
    }
  }, [type, dailyMode, weekdays, every, monthlyMode, monthDay, nth, nthWeekday, target, unit]);

  // Scheduling-conflict preview for the next 14 days.
  const conflicts = useMemo(() => {
    if (st == null || et == null || isCount) return [];
    const draft: Task = {
      id: '__draft',
      title: title || 'This task',
      description: '',
      notes: '',
      categoryId,
      priority,
      schedules: [{ from: startDate, startDate, endDate: type === 'once' ? startDate : endDate || null, recurrence, startTime: st, endTime: et }],
      reminders: { start: false, end: false, offset: 0, sound: 'none', vibrate: false },
      status: 'active',
      pausedRanges: [],
      archivedAt: null,
      count: 0,
      progressLog: {},
      createdAtMs: 0,
      updatedAtMs: 0,
    };
    const others = data.tasks.filter((t) => t.id !== task?.id);
    const out: { date: string; title: string; range: string }[] = [];
    const from = startDate > todayKey ? startDate : todayKey;
    for (let i = 0; i < 14 && out.length < 3; i++) {
      const k = addDays(from, i);
      const v = isScheduledOn(draft, k);
      if (!v) continue;
      const mine = absRange(makeOccurrence(draft, v, k))!;
      for (const o of occurrencesOn(others, k)) {
        const r = absRange(o);
        if (r && mine[0] < r[1] && r[0] < mine[1]) {
          out.push({ date: k, title: o.task.title, range: formatTimeRange(o.start, o.end, prefs.timeFormat) });
          if (out.length >= 3) break;
        }
      }
    }
    return out;
  }, [st, et, isCount, title, categoryId, priority, startDate, endDate, type, recurrence, data.tasks, task?.id, todayKey, prefs.timeFormat]);

  const toggleDay = (d: number) => setWeekdays((w) => (w.includes(d) ? w.filter((x) => x !== d) : [...w, d]));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give your task a name.';
    else if (title.trim().length > 120) e.title = 'Keep the name under 120 characters.';
    if (!startDate) e.startDate = 'Pick a start date.';
    if ((type === 'weekly' || (type === 'daily' && dailyMode === 'weekdays')) && !weekdays.length) e.weekdays = 'Select at least one day.';
    if (type === 'monthly' && monthlyMode === 'day' && (monthDay < 1 || monthDay > 31)) e.monthDay = 'Day must be between 1 and 31.';
    if (isCount && (!Number.isFinite(target) || target < 1)) e.target = 'Target must be at least 1.';
    if (endDate && type !== 'once' && endDate < startDate) e.endDate = 'End date must be after the start date.';
    if (hasTime && !isCount) {
      if (st == null || et == null) e.time = 'Set both a start and an end time.';
      else if (st === et) e.time = 'Start and end time cannot be the same.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = () => {
    if (!validate()) return;
    const input: TaskInput = {
      title,
      description,
      notes,
      categoryId,
      priority,
      recurrence,
      startDate,
      endDate: type === 'once' ? startDate : endDate || null,
      startTime: st,
      endTime: et,
      reminders: { start: rStart, end: rEnd, offset, sound, vibrate: vib },
    };
    data.saveTask(input, task);
    ui.toast({ type: 'success', title: task ? 'Task updated' : 'Task created', message: task && started ? 'Schedule changes apply from today — history is preserved.' : undefined });
    onClose();
  };

  const addCategory = () => {
    if (!newCat || !newCat.name.trim()) return;
    data.saveCategory(newCat);
    setNewCat(null);
    ui.toast({ type: 'success', title: `Category "${newCat.name.trim()}" added` });
  };

  const sectionTitle = 'text-xs font-semibold uppercase tracking-wide text-muted';

  return (
    <Modal open onClose={onClose} variant="full" size="lg" label={task ? 'Edit task' : 'Add task'}>
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 pt-[env(safe-area-inset-top)] md:h-16 md:px-5 md:pt-0">
        <button onClick={onClose} aria-label="Close" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-fg/[0.06] hover:text-fg md:hidden">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="flex-1 text-center text-base font-semibold text-fg md:text-left md:text-lg">{task ? 'Edit Task' : 'Add Task'}</h2>
        <button onClick={save} aria-label="Save task" className="grid h-10 w-10 place-items-center rounded-xl text-accent hover:bg-accent/10 md:hidden">
          <Check className="h-5 w-5" />
        </button>
        <button onClick={onClose} aria-label="Close" className="hidden h-9 w-9 place-items-center rounded-lg text-muted hover:bg-fg/[0.06] hover:text-fg md:grid">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 md:px-6">
        <Field label="Task name" error={errors.title} htmlFor="task-title">
          <input
            id="task-title"
            className={inputClass}
            value={title}
            maxLength={120}
            autoFocus={!task}
            placeholder="e.g. DSA Practice"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
        </Field>

        {/* Repeat */}
        <section className="space-y-3">
          <p className={sectionTitle}>Repeat</p>
          <Segmented
            value={type}
            onChange={setType}
            options={[
              { value: 'once', label: 'Once' },
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'monthly', label: 'Monthly' },
              { value: 'count', label: 'Count' },
            ]}
          />

          {type === 'daily' && (
            <div className="space-y-3">
              <Segmented
                size="sm"
                value={dailyMode}
                onChange={setDailyMode}
                className="max-w-xs"
                options={[
                  { value: 'every', label: 'Every day' },
                  { value: 'weekdays', label: 'Selected days' },
                ]}
              />
              {dailyMode === 'weekdays' && <DayPicker order={weekOrder} value={weekdays} onToggle={toggleDay} error={errors.weekdays} />}
            </div>
          )}

          {type === 'weekly' && (
            <div className="space-y-3">
              <DayPicker order={weekOrder} value={weekdays} onToggle={toggleDay} error={errors.weekdays} />
              <IntervalInput label="Repeat every" unit="week" value={every} onChange={setEvery} />
            </div>
          )}

          {type === 'monthly' && (
            <div className="space-y-3">
              <Segmented
                size="sm"
                value={monthlyMode}
                onChange={setMonthlyMode}
                className="max-w-xs"
                options={[
                  { value: 'day', label: 'Day of month' },
                  { value: 'nth', label: 'Nth weekday' },
                ]}
              />
              {monthlyMode === 'day' ? (
                <Field error={errors.monthDay} hint={monthDay > 28 ? `In months without day ${monthDay}, the task falls on the month's last day.` : undefined}>
                  <div className="flex items-center gap-2 text-sm text-muted">
                    On day
                    <input type="number" min={1} max={31} value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))} className={cn(inputClass, 'w-20')} />
                  </div>
                </Field>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  On the
                  <select value={nth} onChange={(e) => setNth(Number(e.target.value))} className={cn(inputClass, 'w-auto')}>
                    {ORDINALS.map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.l}
                      </option>
                    ))}
                  </select>
                  <select value={nthWeekday} onChange={(e) => setNthWeekday(Number(e.target.value))} className={cn(inputClass, 'w-auto')}>
                    {weekOrder.map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAYS_SHORT[d]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <IntervalInput label="Repeat every" unit="month" value={every} onChange={setEvery} />
            </div>
          )}

          {isCount && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Target" error={errors.target}>
                <input type="number" min={1} value={target} onChange={(e) => setTarget(Math.round(Number(e.target.value)))} className={inputClass} />
              </Field>
              <Field label="Unit (optional)">
                <input value={unit} maxLength={24} placeholder="problems, chapters…" onChange={(e) => setUnit(e.target.value)} className={inputClass} />
              </Field>
              <p className="col-span-2 text-xs text-faint">Update the count manually with + / −. Progress, remaining count and percentage are tracked for you.</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={type === 'once' ? 'Date' : 'Start date'} error={errors.startDate}>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
            </Field>
            {type !== 'once' && (
              <Field label={isCount ? 'Deadline (optional)' : 'End date (optional)'} error={errors.endDate}>
                <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
              </Field>
            )}
          </div>
          {task && started && !isCount && (
            <p className="flex items-start gap-2 rounded-xl bg-info/10 p-3 text-xs leading-relaxed text-info">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Schedule changes apply from today onward. Past occurrences and completion history are never rewritten.
            </p>
          )}
        </section>

        {/* Time range */}
        {!isCount && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={sectionTitle}>Time range</p>
              <Toggle checked={hasTime} onChange={setHasTime} label="Schedule a time" />
            </div>
            {hasTime ? (
              <>
                <div className="flex items-center gap-2">
                  <label className="relative flex-1">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warn" />
                    <input type="time" aria-label="Start time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={cn(inputClass, 'pl-9')} />
                  </label>
                  <span className="text-faint">→</span>
                  <label className="relative flex-1">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
                    <input type="time" aria-label="End time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={cn(inputClass, 'pl-9')} />
                  </label>
                </div>
                {errors.time ? (
                  <p className="text-xs font-medium text-bad">{errors.time}</p>
                ) : (
                  st != null &&
                  et != null && (
                    <p className="text-xs text-muted">
                      Duration <span className="font-semibold text-fg">{formatDuration(duration)}</span>
                      {et <= st && ' · ends the next day'}
                    </p>
                  )
                )}
              </>
            ) : (
              <p className="text-xs text-faint">No fixed time — the task can be done any time during the day.</p>
            )}
          </section>
        )}

        {/* Reminders */}
        {!isCount && hasTime && (
          <section className="space-y-2 rounded-2xl border border-line bg-card-2/50 p-4">
            <p className={cn(sectionTitle, 'mb-1')}>Reminders</p>
            <ReminderRow
              icon={<BellRing className="h-4 w-4 text-ok" />}
              title="Start reminder"
              subtitle={`Notify ${REMINDER_OFFSETS.find((o) => o.v === offset)?.l.toLowerCase() ?? ''}`}
              checked={rStart}
              onChange={setRStart}
            />
            {rStart && (
              <select value={offset} onChange={(e) => setOffset(Number(e.target.value))} className={cn(inputClass, 'ml-7 w-[calc(100%-1.75rem)]')} aria-label="Start reminder timing">
                {REMINDER_OFFSETS.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.l}
                  </option>
                ))}
              </select>
            )}
            <ReminderRow icon={<Bell className="h-4 w-4 text-warn" />} title="End reminder" subtitle="Notify when the session ends (never auto-completes)" checked={rEnd} onChange={setREnd} />
            {(rStart || rEnd) && (
              <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <select value={sound} onChange={(e) => setSound(e.target.value)} className={inputClass} aria-label="Reminder sound">
                    {SOUNDS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label="Preview sound"
                    onClick={() => {
                      unlockAudio();
                      playSound(sound);
                    }}
                  >
                    <Volume2 />
                  </Button>
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm text-fg">
                  Vibrate (where supported)
                  <Toggle checked={vib} onChange={setVib} label="Vibrate" />
                </label>
              </div>
            )}
            {(rStart || rEnd) && permission !== 'granted' && (
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warn/10 p-3 text-xs text-warn">
                <span>{permission === 'unsupported' ? 'This browser does not support system notifications — in-app alerts will be used.' : 'Allow notifications so reminders can alert you.'}</span>
                {permission === 'default' && (
                  <Button size="sm" variant="soft" onClick={() => void request()}>
                    Enable
                  </Button>
                )}
              </div>
            )}
          </section>
        )}

        {conflicts.length > 0 && (
          <div className="rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-warn">
              <AlertTriangle className="h-4 w-4" /> Scheduling conflict
            </p>
            <ul className="mt-2 space-y-1 text-xs text-fg/80">
              {conflicts.map((c, i) => (
                <li key={i}>
                  Overlaps with <span className="font-semibold">{c.title}</span> ({c.range}) on {formatDateKey(c.date, 'weekday')}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Category */}
        <section className="space-y-3">
          <p className={sectionTitle}>Category</p>
          <div className="flex flex-wrap gap-2">
            {data.categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
                className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition', categoryId === c.id ? 'border-transparent text-fg' : 'border-line text-muted hover:text-fg')}
                style={categoryId === c.id ? { background: `color-mix(in oklab, ${c.color} 22%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${c.color}` } : undefined}
              >
                <span aria-hidden>{c.icon}</span>
                {c.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNewCat({ name: '', color: CATEGORY_COLORS[0], icon: CATEGORY_ICONS[8] })}
              className="inline-flex items-center gap-1 rounded-xl border border-dashed border-line px-3 py-2 text-sm text-muted hover:text-fg"
            >
              <Plus className="h-4 w-4" /> New
            </button>
          </div>
          {newCat && (
            <div className="space-y-3 rounded-2xl border border-line bg-card-2/50 p-3">
              <input
                autoFocus
                className={inputClass}
                placeholder="Category name"
                maxLength={32}
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCategory();
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_ICONS.map((ic) => (
                  <button key={ic} type="button" onClick={() => setNewCat({ ...newCat, icon: ic })} className={cn('grid h-8 w-8 place-items-center rounded-lg text-base', newCat.icon === ic ? 'bg-accent/20 ring-1 ring-accent' : 'hover:bg-fg/[0.06]')}>
                    {ic}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_COLORS.map((col) => (
                  <button key={col} type="button" aria-label={`Colour ${col}`} onClick={() => setNewCat({ ...newCat, color: col })} className={cn('h-7 w-7 rounded-full', newCat.color === col && 'ring-2 ring-fg ring-offset-2 ring-offset-card')} style={{ background: col }} />
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setNewCat(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={addCategory} disabled={!newCat.name.trim()}>
                  Add category
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Priority */}
        <section className="space-y-3">
          <p className={sectionTitle}>Priority</p>
          <Segmented
            value={priority}
            onChange={setPriority}
            className="max-w-sm"
            options={[
              { value: 'low', label: <span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-info" />Low</span> },
              { value: 'medium', label: <span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-warn" />Medium</span> },
              { value: 'high', label: <span className="inline-flex items-center gap-1.5"><Flag className="h-3.5 w-3.5 text-bad" />High</span> },
            ]}
          />
        </section>

        <Field label="Description (optional)">
          <textarea rows={2} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputClass, 'resize-y')} placeholder="What does done look like?" />
        </Field>
        <Field label="Notes (optional)">
          <textarea rows={3} maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className={cn(inputClass, 'resize-y')} placeholder="Links, resources, ideas…" />
        </Field>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:flex md:justify-end md:gap-2 md:px-6 md:pb-3">
        <Button variant="secondary" className="hidden md:inline-flex" onClick={onClose}>
          Cancel
        </Button>
        <Button size="lg" className="w-full md:w-auto" onClick={save}>
          {task ? 'Save Changes' : 'Save Task'}
        </Button>
      </div>
    </Modal>
  );
}

function DayPicker({ order, value, onToggle, error }: { order: number[]; value: number[]; onToggle: (d: number) => void; error?: string }) {
  return (
    <div>
      <div className="flex gap-1.5">
        {order.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={value.includes(d)}
            onClick={() => onToggle(d)}
            className={cn('h-10 flex-1 rounded-xl text-xs font-semibold transition', value.includes(d) ? 'bg-accent text-accent-fg' : 'border border-line bg-card-2 text-muted hover:text-fg')}
          >
            {WEEKDAYS_SHORT[d]}
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}

function IntervalInput({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      {label}
      <input type="number" min={1} max={12} value={value} onChange={(e) => onChange(Math.max(1, Math.min(12, Math.round(Number(e.target.value)) || 1)))} className={cn(inputClass, 'w-20')} />
      {value === 1 ? unit : `${unit}s`}
    </div>
  );
}

function ReminderRow({ icon, title, subtitle, checked, onChange }: { icon: React.ReactNode; title: string; subtitle: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}
