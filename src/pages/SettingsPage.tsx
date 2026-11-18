import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  LayoutDashboard,
  ListChecks,
  Monitor,
  Moon,
  Palette,
  Send,
  Smartphone,
  Sun,
  Trash2,
  User,
  Volume2,
  X,
  Grid3x3,
} from 'lucide-react';
import type { Prefs, ThemeMode, WidgetPref } from '../types';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useAuth } from '../context/AuthContext';
import { ACCENTS, CATEGORY_COLORS, CATEGORY_ICONS, DEFAULT_WIDGETS, FONTS, GRACE_OPTIONS, REMINDER_OFFSETS, SNOOZE_OPTIONS, SOUNDS, WIDGET_META } from '../constants';
import { listTimezones } from '../lib/dates';
import { cn, downloadJson } from '../lib/utils';
import { playSound, unlockAudio } from '../lib/sounds';
import { navigate, useIsMobile, useNotificationPermission, useRoute } from '../hooks';
import { showSystemNotification } from '../services/engines';
import { PageHeader, useInstallAction } from '../components/Layout';
import { PalettePicker, HeatLegend, usePalette } from '../components/Heatmap';
import { Button, Card, inputClass, Modal, Segmented, Toggle } from '../components/ui';

type SectionId = 'appearance' | 'dashboard' | 'heatmap' | 'calendar' | 'datetime' | 'tasks' | 'notifications' | 'app' | 'account';

const SECTIONS: { id: SectionId; label: string; icon: typeof Palette; desc: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, desc: 'Theme, accent, font, density, sidebar' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, desc: 'Widget visibility and order' },
  { id: 'heatmap', label: 'Heatmap', icon: Grid3x3, desc: 'Colour palette and default range' },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, desc: 'Week start, hours, appearance' },
  { id: 'datetime', label: 'Date & time', icon: Clock, desc: 'Time format and time zone' },
  { id: 'tasks', label: 'Tasks & streaks', icon: ListChecks, desc: 'Grace period, streak rule, categories' },
  { id: 'notifications', label: 'Notifications', icon: Bell, desc: 'Permissions, types, sounds, snooze' },
  { id: 'app', label: 'App & offline', icon: Smartphone, desc: 'Install, offline mode, updates' },
  { id: 'account', label: 'Account', icon: User, desc: 'Profile, export, sign out' },
];

export default function SettingsPage() {
  const isMobile = useIsMobile();
  const { params } = useRoute();
  const q = params.get('section') as SectionId | null;
  const [active, setActive] = useState<SectionId>(q && SECTIONS.some((s) => s.id === q) ? q : 'appearance');
  const [sheet, setSheet] = useState<SectionId | null>(isMobile && q ? q : null);

  useEffect(() => {
    if (q && SECTIONS.some((s) => s.id === q)) {
      setActive(q);
      if (isMobile) setSheet(q);
    }
  }, [q, isMobile]);

  if (isMobile) {
    const current = SECTIONS.find((s) => s.id === sheet);
    return (
      <div>
        <Card className="divide-y divide-line">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setSheet(s.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/12 text-accent">
                <s.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg">{s.label}</span>
                <span className="block truncate text-xs text-muted">{s.desc}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-faint" />
            </button>
          ))}
        </Card>
        {current && (
          <Modal open onClose={() => { setSheet(null); if (q) navigate('/settings'); }} label={current.label}>
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <h2 className="text-lg font-bold text-fg">{current.label}</h2>
              <button aria-label="Close" onClick={() => { setSheet(null); if (q) navigate('/settings'); }} className="rounded-lg p-2 text-muted">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <SectionBody id={current.id} />
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="All preferences sync across your devices" />
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition', active === s.id ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-fg/[0.04] hover:text-fg')}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>
        <Card className="p-5 md:p-6">
          <h2 className="mb-1 text-lg font-bold text-fg">{SECTIONS.find((s) => s.id === active)?.label}</h2>
          <p className="mb-5 text-sm text-muted">{SECTIONS.find((s) => s.id === active)?.desc}</p>
          <SectionBody id={active} />
        </Card>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 first:pt-0 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionBody({ id }: { id: SectionId }) {
  switch (id) {
    case 'appearance':
      return <Appearance />;
    case 'dashboard':
      return <Dashboard />;
    case 'heatmap':
      return <HeatmapSettings />;
    case 'calendar':
      return <CalendarSettings />;
    case 'datetime':
      return <DateTime />;
    case 'tasks':
      return <TaskSettings />;
    case 'notifications':
      return <Notifications />;
    case 'app':
      return <AppSettings />;
    case 'account':
      return <AccountSettings />;
  }
}

function usePref() {
  const { prefs, updatePrefs } = useData();
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => updatePrefs({ [k]: v } as Partial<Prefs>);
  return { prefs, set };
}

function Appearance() {
  const { prefs, set } = usePref();
  const themes: { id: ThemeMode; label: string; icon: ReactNode; preview: string }[] = [
    { id: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" />, preview: '#13111d' },
    { id: 'light', label: 'Light', icon: <Sun className="h-4 w-4" />, preview: '#f6f5fb' },
    { id: 'amoled', label: 'AMOLED', icon: <Monitor className="h-4 w-4" />, preview: '#000000' },
  ];
  return (
    <div>
      <Row label="Theme" hint="AMOLED uses true black to save battery on OLED screens.">
        <div className="grid grid-cols-3 gap-2">
          {themes.map((t) => (
            <button key={t.id} onClick={() => set('theme', t.id)} aria-pressed={prefs.theme === t.id} className={cn('flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs font-semibold transition', prefs.theme === t.id ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg')}>
              <span className="h-9 w-16 rounded-lg border border-line" style={{ background: t.preview }} />
              <span className="flex items-center gap-1">
                {t.icon}
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </Row>
      <Row label="Accent colour" hint="Royal purple is the CONSISTO default.">
        <div className="flex max-w-[280px] flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <button key={a.id} title={a.name} aria-label={a.name} aria-pressed={prefs.accent === a.id} onClick={() => set('accent', a.id)} className={cn('h-8 w-8 rounded-full transition', prefs.accent === a.id && 'ring-2 ring-fg ring-offset-2 ring-offset-card')} style={{ background: a.color }} />
          ))}
        </div>
      </Row>
      <Row label="Font">
        <select value={prefs.font} onChange={(e) => set('font', e.target.value)} className={cn(inputClass, 'w-56')}>
          {FONTS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Task card density" hint="Compact shows more tasks on screen.">
        <Segmented value={prefs.density} onChange={(v) => set('density', v)} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} />
      </Row>
      <Row label="Sidebar style" hint="Desktop and tablet only.">
        <Segmented value={prefs.sidebarStyle} onChange={(v) => set('sidebarStyle', v)} options={[{ value: 'solid', label: 'Solid' }, { value: 'floating', label: 'Floating' }]} />
      </Row>
      <Row label="Collapse sidebar" hint="Show icons only on large screens.">
        <Toggle checked={prefs.sidebarCollapsed} onChange={(v) => set('sidebarCollapsed', v)} label="Collapse sidebar" />
      </Row>
    </div>
  );
}

function Dashboard() {
  const { prefs, set } = usePref();
  const widgets = prefs.widgets;
  const update = (list: WidgetPref[]) => set('widgets', list);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= widgets.length) return;
    const list = [...widgets];
    [list[i], list[j]] = [list[j], list[i]];
    update(list);
  };
  return (
    <div className="space-y-2">
      <p className="mb-3 text-xs text-muted">Reorder widgets, hide the ones you don't need, and choose which appear on mobile (kept light by default).</p>
      {widgets.map((w, i) => (
        <div key={w.id} className="flex items-center gap-3 rounded-xl border border-line bg-card-2/50 p-3">
          <div className="flex flex-col">
            <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30">
              <ArrowUp className="h-4 w-4" />
            </button>
            <button aria-label="Move down" disabled={i === widgets.length - 1} onClick={() => move(i, 1)} className="rounded p-0.5 text-muted hover:text-fg disabled:opacity-30">
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{WIDGET_META[w.id].title}</p>
            <p className="truncate text-xs text-muted">{WIDGET_META[w.id].description}</p>
          </div>
          <label className="flex flex-col items-center gap-1 text-[10px] text-faint">
            <Toggle checked={w.visible} onChange={(v) => update(widgets.map((x) => (x.id === w.id ? { ...x, visible: v } : x)))} label={`Show ${WIDGET_META[w.id].title}`} />
            Show
          </label>
          <label className="flex flex-col items-center gap-1 text-[10px] text-faint">
            <Toggle checked={w.mobile} disabled={!w.visible} onChange={(v) => update(widgets.map((x) => (x.id === w.id ? { ...x, mobile: v } : x)))} label={`Show ${WIDGET_META[w.id].title} on mobile`} />
            Mobile
          </label>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => update(DEFAULT_WIDGETS)}>
        Reset to default layout
      </Button>
    </div>
  );
}

function HeatmapSettings() {
  const { prefs, set } = usePref();
  const colors = usePalette();
  return (
    <div>
      <Row label="Default range">
        <Segmented
          size="sm"
          value={prefs.heatmapRange}
          onChange={(v) => set('heatmapRange', v)}
          options={[
            { value: '30d', label: '30D' },
            { value: '3m', label: '3M' },
            { value: '6m', label: '6M' },
            { value: '12m', label: '12M' },
            { value: 'year', label: 'Year' },
          ]}
        />
      </Row>
      <div className="pt-4">
        <p className="mb-1 text-sm font-medium text-fg">Colour palette</p>
        <p className="mb-3 text-xs text-muted">15 palettes. Days with scheduled-but-missed tasks get a red outline so they never look like empty days.</p>
        <PalettePicker value={prefs.heatmapPalette} onChange={(id) => set('heatmapPalette', id)} theme={prefs.theme} />
        <HeatLegend colors={colors} className="mt-4" />
      </div>
    </div>
  );
}

function CalendarSettings() {
  const { prefs, set } = usePref();
  const hours = Array.from({ length: 25 }, (_, i) => i);
  return (
    <div>
      <Row label="Week starts on">
        <Segmented value={prefs.weekStart} onChange={(v) => set('weekStart', v)} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }]} />
      </Row>
      <Row label="Timetable hours" hint="Visible hours in day and week views.">
        <div className="flex items-center gap-2">
          <select value={prefs.calendarStartHour} onChange={(e) => set('calendarStartHour', Number(e.target.value))} className={cn(inputClass, 'w-24')}>
            {hours.slice(0, 23).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
          <span className="text-faint">→</span>
          <select value={prefs.calendarEndHour} onChange={(e) => set('calendarEndHour', Number(e.target.value))} className={cn(inputClass, 'w-24')}>
            {hours.filter((h) => h > prefs.calendarStartHour).map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>
      </Row>
      <Row label="Month view style" hint="Coloured dots, or task titles as bars (desktop).">
        <Segmented value={prefs.calendarStyle} onChange={(v) => set('calendarStyle', v)} options={[{ value: 'dots', label: 'Dots' }, { value: 'bars', label: 'Bars' }]} />
      </Row>
    </div>
  );
}

function DateTime() {
  const { prefs, set } = usePref();
  const zones = useMemo(() => listTimezones(), []);
  return (
    <div>
      <Row label="Time format">
        <Segmented value={prefs.timeFormat} onChange={(v) => set('timeFormat', v)} options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]} />
      </Row>
      <Row label="Time zone" hint="Used for 'today', recurrence and reminder times.">
        <select value={prefs.timezone} onChange={(e) => set('timezone', e.target.value)} className={cn(inputClass, 'w-64')}>
          {!zones.includes(prefs.timezone) && <option value={prefs.timezone}>{prefs.timezone}</option>}
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Row>
    </div>
  );
}

function TaskSettings() {
  const data = useData();
  const ui = useUI();
  const { prefs, set } = usePref();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[1]);
  const [icon, setIcon] = useState(CATEGORY_ICONS[8]);
  const custom = data.categories.filter((c) => c.custom);
  const add = () => {
    if (!name.trim()) return;
    data.saveCategory({ name, color, icon });
    setName('');
  };
  return (
    <div>
      <Row label="Grace period" hint="How long after a task's end time (or end of day) before it counts as missed.">
        <select value={prefs.graceMinutes} onChange={(e) => set('graceMinutes', Number(e.target.value))} className={cn(inputClass, 'w-48')}>
          {GRACE_OPTIONS.map((g) => (
            <option key={g.v} value={g.v}>
              {g.l}
            </option>
          ))}
        </select>
      </Row>
      <Row label="A day counts toward your streak when you complete…" hint="Days with nothing scheduled never break a streak.">
        <Segmented
          size="sm"
          value={prefs.streakRule}
          onChange={(v) => set('streakRule', v)}
          options={[
            { value: 'any', label: 'Any task' },
            { value: 'half', label: '≥ 50%' },
            { value: 'all', label: 'All tasks' },
          ]}
        />
      </Row>
      <Row label="Default start reminder">
        <select value={prefs.defaultReminderOffset} onChange={(e) => set('defaultReminderOffset', Number(e.target.value))} className={cn(inputClass, 'w-48')}>
          {REMINDER_OFFSETS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
      </Row>
      <div className="pt-4">
        <p className="text-sm font-medium text-fg">Custom categories</p>
        <p className="mb-3 text-xs text-muted">Default categories: Study, Coding, Fitness, Personal, Projects, Work, Reading, Other.</p>
        <div className="mb-3 space-y-2">
          {custom.length === 0 && <p className="text-xs text-faint">No custom categories yet.</p>}
          {custom.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
              <span className="text-lg">{c.icon}</span>
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
              <span className="flex-1 text-sm text-fg">{c.name}</span>
              <button
                aria-label={`Delete ${c.name}`}
                onClick={async () => {
                  if (await ui.confirm({ title: `Delete "${c.name}"?`, message: 'Tasks in this category will show as "Other". Their history is not affected.', confirmText: 'Delete', danger: true })) data.deleteCategory(c.id);
                }}
                className="rounded-lg p-1.5 text-faint hover:bg-bad/10 hover:text-bad"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="space-y-2 rounded-xl border border-dashed border-line p-3">
          <div className="flex gap-2">
            <select value={icon} onChange={(e) => setIcon(e.target.value)} className={cn(inputClass, 'w-20')} aria-label="Icon">
              {CATEGORY_ICONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New category name" className={inputClass} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} aria-label={`Colour ${c}`} onClick={() => setColor(c)} className={cn('h-6 w-6 rounded-full', color === c && 'ring-2 ring-fg ring-offset-2 ring-offset-card')} style={{ background: c }} />
            ))}
            <Button size="sm" className="ml-auto" onClick={add} disabled={!name.trim()}>
              Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Notifications() {
  const data = useData();
  const ui = useUI();
  const { prefs, set } = usePref();
  const { permission, request } = useNotificationPermission();
  const np = prefs.notifications;
  const setType = (k: keyof typeof np, v: boolean) => set('notifications', { ...np, [k]: v });
  const test = async () => {
    unlockAudio();
    const ok = await showSystemNotification('CONSISTO test reminder', 'Reminders will look like this. Tap to open the app.', { tag: 'consisto-test', link: '/home', vibrate: prefs.vibrate });
    if (prefs.soundEnabled) playSound(prefs.sound);
    ui.toast({ type: 'reminder', title: 'Test reminder', message: ok ? 'A system notification was sent.' : 'System notifications are unavailable — in-app alerts will be used.' });
  };
  return (
    <div>
      <div className="mb-4 rounded-2xl border border-line bg-card-2/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-fg">Browser permission</p>
            <p className="text-xs text-muted">
              {permission === 'granted' && 'Allowed — system notifications are enabled.'}
              {permission === 'default' && 'Not requested yet.'}
              {permission === 'denied' && 'Blocked — allow notifications for this site in your browser settings.'}
              {permission === 'unsupported' && 'This browser does not support notifications.'}
            </p>
          </div>
          <div className="flex gap-2">
            {permission === 'default' && <Button onClick={() => void request()}>Allow notifications</Button>}
            <Button variant="secondary" icon={<Send />} onClick={test}>
              Send test
            </Button>
          </div>
        </div>
      </div>
      <Row label="Start reminders">
        <Toggle checked={np.start} onChange={(v) => setType('start', v)} label="Start reminders" />
      </Row>
      <Row label="End reminders" hint="End alarms never mark a task complete.">
        <Toggle checked={np.end} onChange={(v) => setType('end', v)} label="End reminders" />
      </Row>
      <Row label="Missed task alerts">
        <Toggle checked={np.missed} onChange={(v) => setType('missed', v)} label="Missed task alerts" />
      </Row>
      <Row label="Streak milestones">
        <Toggle checked={np.milestone} onChange={(v) => setType('milestone', v)} label="Streak milestones" />
      </Row>
      <Row label="Achievements">
        <Toggle checked={np.achievement} onChange={(v) => setType('achievement', v)} label="Achievements" />
      </Row>
      <Row label="Reminder sounds">
        <Toggle checked={prefs.soundEnabled} onChange={(v) => set('soundEnabled', v)} label="Reminder sounds" />
      </Row>
      <Row label="Default reminder sound">
        <div className="flex items-center gap-2">
          <select value={prefs.sound} onChange={(e) => set('sound', e.target.value)} className={cn(inputClass, 'w-44')}>
            {SOUNDS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="icon" aria-label="Preview sound" onClick={() => { unlockAudio(); playSound(prefs.sound); }}>
            <Volume2 />
          </Button>
        </div>
      </Row>
      <Row label="Tick sound" hint="A soft pop when you complete a task.">
        <Toggle checked={prefs.completionSound} onChange={(v) => set('completionSound', v)} label="Tick sound" />
      </Row>
      <Row label="Vibration" hint="Android devices with vibration support.">
        <Toggle checked={prefs.vibrate} onChange={(v) => set('vibrate', v)} label="Vibration" />
      </Row>
      <Row label="Snooze duration">
        <Segmented size="sm" value={prefs.snoozeMinutes} onChange={(v) => set('snoozeMinutes', v)} options={SNOOZE_OPTIONS.map((m) => ({ value: m, label: `${m}m` }))} />
      </Row>
      <div className="mt-4 rounded-2xl border border-info/25 bg-info/10 p-4 text-xs leading-relaxed text-fg/85">
        <p className="mb-1 font-semibold text-info">How reminders work (honest limitations)</p>
        Reminders are <b>best-effort</b>. CONSISTO schedules start and end alarms while the app — or the installed app window — is open or running in the background.
        Browsers may delay or pause timers when the device sleeps or the app is fully closed, so exact alarm timing can't be guaranteed by a standard PWA.
        Reminders missed while the app was closed are reconciled into the Notification Centre the next time you open it. Guaranteed exact alarms on Android
        require a native wrapper (e.g. Capacitor with the exact-alarm permission) or server push via Firebase Cloud Messaging.
        {data.prefs.timezone && <span className="mt-1 block text-faint">Reminder times use your time zone: {data.prefs.timezone}.</span>}
      </div>
    </div>
  );
}

function AppSettings() {
  const install = useInstallAction();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => undefined);
    void navigator.storage
      ?.estimate?.()
      .then((e) => setUsage(e.usage != null ? `${(e.usage / 1024 / 1024).toFixed(1)} MB used` : null))
      .catch(() => undefined);
  }, []);
  return (
    <div>
      <Row label="Install CONSISTO" hint={install.canShow ? 'Install as an app for a full-screen experience and better reminder reliability.' : 'Already running as an installed app.'}>
        {install.canShow ? (
          <Button icon={<Download />} onClick={install.run}>
            Install app
          </Button>
        ) : (
          <span className="text-xs font-semibold text-ok">Installed ✓</span>
        )}
      </Row>
      <Row label="Offline mode" hint="Tasks, completions and notes are cached in IndexedDB. Changes made offline are queued and synced when you reconnect; note edits made offline are reconciled safely (conflicts are saved as copies).">
        <span className="text-xs font-semibold text-ok">Enabled</span>
      </Row>
      <Row label="Persistent storage" hint="Asks the browser not to evict your offline cache.">
        {persisted ? (
          <span className="text-xs font-semibold text-ok">Granted ✓</span>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => void navigator.storage?.persist?.().then(setPersisted)}>
            Request
          </Button>
        )}
      </Row>
      {usage && (
        <Row label="Local storage">
          <span className="text-xs text-muted">{usage}</span>
        </Row>
      )}
      <Row label="Check for updates" hint="New versions are detected automatically; you'll see a banner to reload.">
        <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new Event('consisto:check-update'))}>
          Check now
        </Button>
      </Row>
    </div>
  );
}

function AccountSettings() {
  const data = useData();
  const auth = useAuth();
  const ui = useUI();
  return (
    <div>
      <Row label={data.profile.displayName} hint={data.profile.email}>
        <Button variant="secondary" onClick={() => navigate('/profile')}>
          Open profile
        </Button>
      </Row>
      <Row label="Export your data" hint="Download tasks, completions, notes and settings as JSON.">
        <Button variant="secondary" icon={<Download />} onClick={() => downloadJson(`consisto-export-${new Date().toISOString().slice(0, 10)}.json`, data.exportData())}>
          Export
        </Button>
      </Row>
      <Row label="Sign out" hint="Your data stays safely in your private cloud workspace.">
        <Button
          variant="danger"
          onClick={async () => {
            if (await ui.confirm({ title: 'Sign out of CONSISTO?', confirmText: 'Sign out' })) void auth.logOut();
          }}
        >
          Sign out
        </Button>
      </Row>
    </div>
  );
}
