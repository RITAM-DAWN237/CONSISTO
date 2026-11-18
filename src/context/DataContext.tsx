// Data layer: Firestore realtime subscriptions + all write actions + derived statistics.
// Writes are fire-and-forget: Firestore applies them to the local (IndexedDB) cache immediately,
// queues them while offline and syncs when connectivity returns.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  arrayRemove,
  collection,
  deleteDoc,
  doc,
  FieldPath,
  getDocFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type FirestoreError,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type {
  AchievementRecord,
  AppNotification,
  Category,
  Completion,
  DayStat,
  Note,
  NoteDraft,
  OccItem,
  Occurrence,
  Prefs,
  Priority,
  Recurrence,
  ReminderSettings,
  ScheduleVersion,
  Task,
  UserProfile,
  WidgetPref,
} from '../types';
import { DEFAULT_CATEGORIES, DEFAULT_PREFS, DEFAULT_WIDGETS } from '../constants';
import { addDays, nowInTz, rangeKeys, startOfMonth, type NowInfo } from '../lib/dates';
import { currentVersion, firstVersion, isCountTask, occurrencesOn } from '../lib/recurrence';
import { aggregate, computeDayStats, occurrenceStatus, overallStreak, weeklyStreak, type StatusCtx } from '../lib/engine';
import { clamp, getDeviceId, idbGet, idbSet } from '../lib/utils';
import { useUI } from './UIContext';
import { newUserDoc } from './AuthContext';

// ─── Normalisers (defensive defaults for older / partial documents) ─────
function normalizeVersion(s: DocumentData): ScheduleVersion {
  return {
    from: s.from,
    startDate: s.startDate ?? s.from,
    endDate: s.endDate ?? null,
    recurrence: { type: 'daily', dailyMode: 'every', ...(s.recurrence ?? {}) },
    startTime: s.startTime ?? null,
    endTime: s.endTime ?? null,
  };
}

function normalizeTask(id: string, d: DocumentData): Task {
  const schedules: ScheduleVersion[] = Array.isArray(d.schedules)
    ? d.schedules.filter((s: DocumentData) => s && s.from).map(normalizeVersion).sort((a: ScheduleVersion, b: ScheduleVersion) => (a.from < b.from ? -1 : 1))
    : [];
  return {
    id,
    title: d.title ?? 'Untitled task',
    description: d.description ?? '',
    notes: d.notes ?? '',
    categoryId: d.categoryId ?? 'other',
    priority: d.priority ?? 'medium',
    schedules,
    reminders: { start: false, end: false, offset: 0, sound: 'chime', vibrate: true, ...(d.reminders ?? {}) },
    status: d.status ?? 'active',
    pausedRanges: Array.isArray(d.pausedRanges) ? d.pausedRanges : [],
    archivedAt: d.archivedAt ?? null,
    count: typeof d.count === 'number' ? d.count : 0,
    progressLog: d.progressLog ?? {},
    createdAtMs: d.createdAtMs ?? 0,
    updatedAtMs: d.updatedAtMs ?? 0,
  };
}

function normalizeCompletion(id: string, d: DocumentData): Completion {
  return {
    id,
    taskId: d.taskId,
    dateKey: d.dateKey,
    status: d.status === 'skipped' ? 'skipped' : 'completed',
    scheduledStart: d.scheduledStart ?? null,
    scheduledEnd: d.scheduledEnd ?? null,
    plannedMinutes: d.plannedMinutes ?? 0,
    actualMinutes: d.actualMinutes ?? null,
    completedAtMs: d.completedAtMs ?? 0,
    late: !!d.late,
    title: d.title ?? '',
    categoryId: d.categoryId ?? 'other',
    repeatType: d.repeatType ?? 'daily',
  };
}

function normalizeNote(id: string, d: DocumentData): Note {
  return {
    id,
    type: d.type === 'quick' ? 'quick' : 'detailed',
    title: d.title ?? '',
    content: d.content ?? '',
    text: d.text ?? '',
    folder: d.folder ?? '',
    tags: Array.isArray(d.tags) ? d.tags : [],
    categoryId: d.categoryId ?? '',
    pinned: !!d.pinned,
    favourite: !!d.favourite,
    archived: !!d.archived,
    linkedTaskIds: Array.isArray(d.linkedTaskIds) ? d.linkedTaskIds : [],
    color: d.color ?? '',
    createdAtMs: d.createdAtMs ?? 0,
    updatedAtMs: d.updatedAtMs ?? 0,
    rev: d.rev ?? 0,
    lastDevice: d.lastDevice ?? '',
  };
}

function mergeWidgets(w?: WidgetPref[]): WidgetPref[] {
  if (!Array.isArray(w) || !w.length) return DEFAULT_WIDGETS;
  const known = new Set(DEFAULT_WIDGETS.map((x) => x.id));
  const out = w.filter((x) => known.has(x.id));
  for (const d of DEFAULT_WIDGETS) if (!out.find((x) => x.id === d.id)) out.push(d);
  return out;
}

export function mergePrefs(p?: Partial<Prefs>): Prefs {
  return {
    ...DEFAULT_PREFS,
    ...(p ?? {}),
    notifications: { ...DEFAULT_PREFS.notifications, ...(p?.notifications ?? {}) },
    widgets: mergeWidgets(p?.widgets),
  };
}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${k}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function cleanRecurrence(r: Recurrence): Recurrence {
  const interval = Math.max(1, Math.min(12, Math.round(r.interval ?? 1)));
  switch (r.type) {
    case 'once':
      return { type: 'once' };
    case 'daily':
      return r.dailyMode === 'weekdays'
        ? { type: 'daily', dailyMode: 'weekdays', weekdays: [...new Set(r.weekdays ?? [])].sort() }
        : { type: 'daily', dailyMode: 'every' };
    case 'weekly':
      return { type: 'weekly', weekdays: [...new Set(r.weekdays ?? [])].sort(), interval };
    case 'monthly':
      return r.monthlyMode === 'nth'
        ? { type: 'monthly', monthlyMode: 'nth', nth: r.nth ?? 1, nthWeekday: r.nthWeekday ?? 1, interval }
        : { type: 'monthly', monthlyMode: 'day', monthDay: clamp(Math.round(r.monthDay ?? 1), 1, 31), interval };
    case 'count':
      return { type: 'count', target: Math.max(1, Math.min(100000, Math.round(r.target ?? 1))), unit: (r.unit ?? '').trim().slice(0, 24) };
  }
}

export interface TaskInput {
  title: string;
  description: string;
  notes: string;
  categoryId: string;
  priority: Priority;
  recurrence: Recurrence;
  startDate: string;
  endDate: string | null;
  startTime: number | null;
  endTime: number | null;
  reminders: ReminderSettings;
}

type NotificationInput = Omit<AppNotification, 'read' | 'cleared' | 'createdAtMs'> & { createdAtMs?: number };

interface DataCtx {
  uid: string;
  ready: boolean;
  dbError: string | null;
  syncing: boolean;
  windowStart: string;
  profile: UserProfile;
  prefs: Prefs;
  tasks: Task[];
  taskMap: Map<string, Task>;
  completions: Map<string, Completion>;
  notes: Note[];
  noteDrafts: Record<string, NoteDraft>;
  categories: Category[];
  categoryMap: Map<string, Category>;
  notifications: AppNotification[];
  notificationIds: Set<string>;
  achievements: Map<string, AchievementRecord>;
  achievementsLoaded: boolean;
  dismissDbError(): void;
  updatePrefs(patch: Partial<Prefs>): void;
  updateProfileData(patch: { displayName?: string; photoData?: string | null; photoURL?: string | null }): void;
  saveTask(input: TaskInput, existing?: Task): string;
  deleteTask(task: Task): Promise<void>;
  setTaskState(task: Task, action: 'pause' | 'resume' | 'archive' | 'unarchive'): void;
  toggleComplete(occ: Occurrence): 'completed' | 'undone' | 'blocked';
  setSkip(occ: Occurrence, skip: boolean): void;
  setActualMinutes(completionId: string, minutes: number | null): void;
  changeCount(task: Task, delta: number): void;
  createNote(partial?: Partial<Note>): string;
  updateNote(id: string, patch: Partial<Note>): void;
  saveNoteContent(id: string, data: { title: string; content: string; text: string }, baseRev: number): { mode: 'online' | 'offline'; rev: number };
  deleteNote(id: string): void;
  saveCategory(cat: Partial<Category> & { name: string; color: string; icon: string }): void;
  deleteCategory(id: string): void;
  pushNotification(n: NotificationInput): void;
  markNotificationsRead(ids?: string[]): void;
  clearNotifications(ids?: string[]): void;
  unlockAchievements(ids: string[]): void;
  recordLongestStreak(n: number): void;
  exportData(): Record<string, unknown>;
}

const Ctx = createContext<DataCtx | null>(null);

export function DataProvider({ user, children }: { user: User; children: ReactNode }) {
  const uid = user.uid;
  const { toast } = useUI();
  const [userDoc, setUserDoc] = useState<DocumentData | null>(null);
  const [loaded, setLoaded] = useState({ user: false, tasks: false, completions: false });
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Map<string, Completion>>(new Map());
  const [notes, setNotes] = useState<Note[]>([]);
  const [customCats, setCustomCats] = useState<Category[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [achievements, setAchievements] = useState<Map<string, AchievementRecord>>(new Map());
  const [achievementsLoaded, setAchievementsLoaded] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, NoteDraft>>({});

  const prefs = useMemo(() => mergePrefs(userDoc?.prefs), [userDoc]);
  const windowStart = useMemo(() => addDays(nowInTz(prefs.timezone).dateKey, -400), [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refs keep action callbacks stable while reading the latest state.
  const tasksRef = useRef(tasks);
  const completionsRef = useRef(completions);
  const notesRef = useRef(notes);
  const prefsRef = useRef(prefs);
  const notificationsRef = useRef(notifications);
  const userDocRef = useRef(userDoc);
  const authUserRef = useRef(user);
  authUserRef.current = user;
  tasksRef.current = tasks;
  completionsRef.current = completions;
  notesRef.current = notes;
  prefsRef.current = prefs;
  notificationsRef.current = notifications;
  userDocRef.current = userDoc;

  const userRef = useMemo(() => doc(db, 'users', uid), [uid]);
  const col = useCallback((name: string) => collection(db, 'users', uid, name), [uid]);
  const draftsKey = `noteDrafts:${uid}`;

  const fire = useCallback(
    (p: Promise<unknown>, what: string) => {
      p.catch((e: FirestoreError) => {
        console.error(`[consisto] failed to ${what}`, e);
        toast({
          type: 'error',
          title: `Couldn't ${what}`,
          message: e?.code === 'permission-denied' ? 'Permission denied — check your Firestore security rules.' : e?.message,
        });
      });
    },
    [toast]
  );

  // ─── Subscriptions ────────────────────────────────────────────
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    const track = (name: string, pending: boolean) => setPendingMap((m) => (m[name] === pending ? m : { ...m, [name]: pending }));
    const onErr = (name: string) => (e: FirestoreError) => {
      console.error(`[consisto] ${name} listener`, e);
      setDbError(e.code === 'permission-denied' ? 'permission' : e.code === 'not-found' || e.code === 'failed-precondition' ? 'missing' : e.message);
      setLoaded((l) => ({ ...l, [name]: true }));
    };
    const opts = { includeMetadataChanges: true };

    unsubs.push(
      onSnapshot(
        userRef,
        opts,
        (snap) => {
          track('user', snap.metadata.hasPendingWrites);
          if (!snap.exists()) {
            if (!snap.metadata.fromCache) {
              // First sign-in (e.g. a new Google user): create the private workspace from the auth profile.
              const u = authUserRef.current;
              void setDoc(userRef, newUserDoc(u.displayName || u.email?.split('@')[0] || 'Friend', u.email || '', u.photoURL ?? null), { merge: true }).catch(
                () => undefined
              );
            }
            setUserDoc(null);
          } else setUserDoc(snap.data());
          setLoaded((l) => (l.user ? l : { ...l, user: true }));
        },
        onErr('user')
      )
    );
    unsubs.push(
      onSnapshot(
        col('tasks'),
        opts,
        (snap) => {
          track('tasks', snap.metadata.hasPendingWrites);
          setTasks(snap.docs.map((d) => normalizeTask(d.id, d.data())).filter((t) => t.schedules.length > 0));
          setLoaded((l) => (l.tasks ? l : { ...l, tasks: true }));
        },
        onErr('tasks')
      )
    );
    unsubs.push(
      onSnapshot(
        query(col('completions'), where('dateKey', '>=', windowStart)),
        opts,
        (snap) => {
          track('completions', snap.metadata.hasPendingWrites);
          const m = new Map<string, Completion>();
          snap.docs.forEach((d) => m.set(d.id, normalizeCompletion(d.id, d.data())));
          setCompletions(m);
          setLoaded((l) => (l.completions ? l : { ...l, completions: true }));
        },
        onErr('completions')
      )
    );
    unsubs.push(
      onSnapshot(
        col('notes'),
        opts,
        (snap) => {
          track('notes', snap.metadata.hasPendingWrites);
          setNotes(snap.docs.map((d) => normalizeNote(d.id, d.data())));
        },
        onErr('notes')
      )
    );
    unsubs.push(
      onSnapshot(
        col('categories'),
        (snap) => setCustomCats(snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color ?? '#94a3b8', icon: d.data().icon ?? '🏷️', custom: true }))),
        onErr('categories')
      )
    );
    unsubs.push(
      onSnapshot(
        query(col('notifications'), orderBy('createdAtMs', 'desc'), limit(150)),
        (snap) =>
          setNotifications(
            snap.docs.map((d) => {
              const x = d.data();
              return { id: d.id, type: x.type, title: x.title ?? '', body: x.body ?? '', createdAtMs: x.createdAtMs ?? 0, read: !!x.read, cleared: !!x.cleared, link: x.link ?? '/home' };
            })
          ),
        onErr('notifications')
      )
    );
    unsubs.push(
      onSnapshot(
        col('achievements'),
        (snap) => {
          const m = new Map<string, AchievementRecord>();
          snap.docs.forEach((d) => m.set(d.id, { id: d.id, unlockedAtMs: d.data().unlockedAtMs ?? 0 }));
          setAchievements(m);
          setAchievementsLoaded(true);
        },
        onErr('achievements')
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [uid, userRef, col, windowStart]);

  // Cache appearance locally (UI cache only) to avoid a theme flash on next launch.
  useEffect(() => {
    if (!userDoc) return;
    try {
      const prev = JSON.parse(localStorage.getItem('consisto-ui') || '{}');
      localStorage.setItem('consisto-ui', JSON.stringify({ ...prev, theme: prefs.theme }));
    } catch {
      /* ignore */
    }
  }, [userDoc, prefs.theme]);

  // ─── Offline note drafts: load + reconcile on reconnect ───────
  const syncDrafts = useCallback(async () => {
    const drafts = (await idbGet<Record<string, NoteDraft>>(draftsKey)) ?? {};
    if (!Object.keys(drafts).length || !navigator.onLine) {
      setNoteDrafts(drafts);
      return;
    }
    const deviceId = getDeviceId();
    for (const d of Object.values(drafts)) {
      const ref = doc(col('notes'), d.noteId);
      let server;
      try {
        server = await getDocFromServer(ref);
      } catch {
        continue; // still offline — keep the draft
      }
      const payload = { title: d.title, content: d.content, text: d.text, updatedAtMs: d.savedAt, lastDevice: deviceId };
      if (!server.exists()) {
        // Created offline: the queued create (with its type) is applied first, so merge content only.
        if (d.baseRev === 0) fire(setDoc(ref, { ...payload, rev: 1 }, { merge: true }), 'sync an offline note');
        else {
          const copy = doc(col('notes'));
          fire(setDoc(copy, { ...normalizeNote(copy.id, {}), ...payload, id: undefined, type: 'detailed', title: `${d.title || 'Untitled'} (recovered)`, createdAtMs: Date.now(), rev: 1 }), 'recover a note');
        }
      } else {
        const s = server.data();
        if ((s.rev ?? 0) <= d.baseRev || s.lastDevice === deviceId) {
          fire(updateDoc(ref, { ...payload, rev: (s.rev ?? 0) + 1 }), 'sync an offline note');
        } else {
          // Edited elsewhere while this device was offline: never overwrite — keep both versions.
          const copy = doc(col('notes'));
          fire(
            setDoc(copy, {
              ...normalizeNote(copy.id, s),
              ...payload,
              id: undefined,
              title: `${d.title || 'Untitled'} (offline copy)`,
              createdAtMs: Date.now(),
              rev: 1,
              pinned: false,
            }),
            'save an offline copy'
          );
          toast({ type: 'warning', title: 'Note conflict handled safely', message: `"${d.title || 'Untitled'}" changed on another device while you were offline. Your version was saved as a copy.` });
        }
      }
      delete drafts[d.noteId];
    }
    await idbSet(draftsKey, drafts);
    setNoteDrafts({ ...drafts });
  }, [col, draftsKey, fire, toast]);

  useEffect(() => {
    void syncDrafts();
    const onOnline = () => void syncDrafts();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [syncDrafts]);

  // Purge notifications cleared more than 7 days ago (keeps reads within the free tier).
  const purged = useRef(false);
  useEffect(() => {
    if (purged.current || !notifications.length) return;
    purged.current = true;
    const old = notifications.filter((n) => n.cleared && Date.now() - n.createdAtMs > 7 * 86_400_000);
    if (!old.length) return;
    const b = writeBatch(db);
    old.slice(0, 400).forEach((n) => b.delete(doc(col('notifications'), n.id)));
    b.commit().catch(() => undefined);
  }, [notifications, col]);

  // ─── Actions ─────────────────────────────────────────────────
  const updatePrefs = useCallback(
    (patch: Partial<Prefs>) => {
      fire(setDoc(userRef, { prefs: patch }, { merge: true }), 'save settings');
    },
    [fire, userRef]
  );

  const updateProfileData = useCallback(
    (patch: { displayName?: string; photoData?: string | null; photoURL?: string | null }) => {
      fire(setDoc(userRef, patch, { merge: true }), 'update your profile');
    },
    [fire, userRef]
  );

  const saveTask = useCallback(
    (input: TaskInput, existing?: Task): string => {
      const { dateKey: today } = nowInTz(prefsRef.current.timezone);
      const recurrence = cleanRecurrence(input.recurrence);
      const isCount = recurrence.type === 'count';
      const startDate = input.startDate || today;
      const endDate = recurrence.type === 'once' ? startDate : input.endDate || null;
      const startTime = isCount ? null : input.startTime;
      const endTime = isCount || input.startTime == null ? null : input.endTime;
      const base = {
        title: input.title.trim().slice(0, 120),
        description: input.description.trim().slice(0, 2000),
        notes: input.notes.trim().slice(0, 5000),
        categoryId: input.categoryId || 'other',
        priority: input.priority,
        reminders: {
          ...input.reminders,
          start: startTime != null && input.reminders.start,
          end: endTime != null && input.reminders.end,
        },
        updatedAtMs: Date.now(),
      };
      const version = (from: string): ScheduleVersion => ({ from, startDate, endDate, recurrence, startTime, endTime });

      if (!existing) {
        const ref = doc(col('tasks'));
        fire(
          setDoc(ref, {
            ...base,
            schedules: [version(startDate)],
            status: 'active',
            pausedRanges: [],
            archivedAt: null,
            count: 0,
            progressLog: {},
            createdAtMs: Date.now(),
          }),
          'create the task'
        );
        return ref.id;
      }

      const first = firstVersion(existing)!;
      const cur = currentVersion(existing);
      const todayDone = completionsRef.current.has(`${existing.id}_${today}`);
      const strip = (v: ScheduleVersion) => ({ startDate: v.startDate, endDate: v.endDate, recurrence: cleanRecurrence(v.recurrence), startTime: v.startTime, endTime: v.endTime });
      const changed = stable(strip(cur)) !== stable(strip(version(startDate)));
      let schedules = existing.schedules;
      if (first.from > today || (first.from === today && !todayDone)) {
        // Not started yet → replace the schedule entirely.
        schedules = [version(startDate)];
      } else if (changed) {
        // Started → keep history, new rules apply from today (or tomorrow if today is already done).
        const effective = todayDone ? addDays(today, 1) : today;
        schedules = [...existing.schedules.filter((s) => s.from < effective), version(effective)];
      }
      fire(updateDoc(doc(col('tasks'), existing.id), { ...base, schedules }), 'update the task');
      return existing.id;
    },
    [col, fire]
  );

  const deleteTask = useCallback(
    async (task: Task) => {
      fire(deleteDoc(doc(col('tasks'), task.id)), 'delete the task');
      try {
        const snap = await getDocs(query(col('completions'), where('taskId', '==', task.id)));
        for (let i = 0; i < snap.docs.length; i += 400) {
          const b = writeBatch(db);
          snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
          fire(b.commit(), 'clean up task history');
        }
      } catch {
        /* offline without cache — history will remain orphaned and is ignored by stats */
      }
      for (const n of notesRef.current) {
        if (n.linkedTaskIds.includes(task.id)) fire(updateDoc(doc(col('notes'), n.id), { linkedTaskIds: arrayRemove(task.id) }), 'unlink notes');
      }
    },
    [col, fire]
  );

  const setTaskState = useCallback(
    (task: Task, action: 'pause' | 'resume' | 'archive' | 'unarchive') => {
      const { dateKey: today } = nowInTz(prefsRef.current.timezone);
      const todayDone = completionsRef.current.has(`${task.id}_${today}`);
      const startKey = todayDone ? addDays(today, 1) : today;
      const yesterday = addDays(today, -1);
      let ranges = [...(task.pausedRanges ?? [])];
      let patch: Record<string, unknown> = {};
      if (action === 'pause') {
        ranges = ranges.filter((r) => r.to != null);
        ranges.push({ from: startKey, to: null });
        patch = { status: 'paused', pausedRanges: ranges };
      } else if (action === 'resume') {
        ranges = ranges.map((r) => (r.to == null ? { ...r, to: yesterday } : r)).filter((r) => r.to == null || r.to >= r.from);
        patch = { status: 'active', pausedRanges: ranges };
      } else if (action === 'archive') {
        ranges = ranges.map((r) => (r.to == null ? { ...r, to: addDays(startKey, -1) } : r)).filter((r) => r.to == null || r.to >= r.from);
        patch = { status: 'archived', archivedAt: startKey, pausedRanges: ranges };
      } else {
        if (task.archivedAt && yesterday >= task.archivedAt) ranges.push({ from: task.archivedAt, to: yesterday });
        patch = { status: 'active', archivedAt: null, pausedRanges: ranges };
      }
      fire(updateDoc(doc(col('tasks'), task.id), { ...patch, updatedAtMs: Date.now() }), 'update the task');
    },
    [col, fire]
  );

  const closeSystemNotifications = useCallback(async (prefix: string) => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const list = await reg?.getNotifications();
      list?.forEach((n) => {
        if (n.tag.startsWith(prefix)) n.close();
      });
    } catch {
      /* ignore */
    }
  }, []);

  const toggleComplete = useCallback(
    (occ: Occurrence): 'completed' | 'undone' | 'blocked' => {
      const now = nowInTz(prefsRef.current.timezone);
      const ref = doc(col('completions'), occ.id);
      const existing = completionsRef.current.get(occ.id);
      const batch = writeBatch(db);
      if (existing?.status === 'completed') {
        batch.delete(ref);
        batch.set(userRef, { stats: { totalCompletions: increment(-1) } }, { merge: true });
        fire(batch.commit(), 'undo the completion');
        return 'undone';
      }
      if (occ.dateKey > now.dateKey) {
        toast({ type: 'info', title: "That occurrence hasn't happened yet", message: 'You can tick it on or after its scheduled day.' });
        return 'blocked';
      }
      const status = occurrenceStatus(occ, undefined, { todayKey: now.dateKey, nowMin: now.minutes, grace: prefsRef.current.graceMinutes });
      batch.set(ref, {
        taskId: occ.task.id,
        dateKey: occ.dateKey,
        status: 'completed',
        scheduledStart: occ.start,
        scheduledEnd: occ.end,
        plannedMinutes: occ.planned,
        actualMinutes: null,
        completedAtMs: Date.now(),
        late: status === 'missed',
        title: occ.task.title,
        categoryId: occ.task.categoryId,
        repeatType: occ.version.recurrence.type,
      });
      batch.set(userRef, { stats: { totalCompletions: increment(1) } }, { merge: true });
      fire(batch.commit(), 'save the completion');
      void closeSystemNotifications(`${occ.task.id}|${occ.dateKey}|`);
      return 'completed';
    },
    [col, fire, userRef, toast, closeSystemNotifications]
  );

  const setSkip = useCallback(
    (occ: Occurrence, skip: boolean) => {
      const ref = doc(col('completions'), occ.id);
      const existing = completionsRef.current.get(occ.id);
      if (!skip) {
        if (existing?.status === 'skipped') fire(deleteDoc(ref), 'unskip the occurrence');
        return;
      }
      const batch = writeBatch(db);
      batch.set(ref, {
        taskId: occ.task.id,
        dateKey: occ.dateKey,
        status: 'skipped',
        scheduledStart: occ.start,
        scheduledEnd: occ.end,
        plannedMinutes: occ.planned,
        actualMinutes: null,
        completedAtMs: Date.now(),
        late: false,
        title: occ.task.title,
        categoryId: occ.task.categoryId,
        repeatType: occ.version.recurrence.type,
      });
      if (existing?.status === 'completed') batch.set(userRef, { stats: { totalCompletions: increment(-1) } }, { merge: true });
      fire(batch.commit(), 'skip the occurrence');
    },
    [col, fire, userRef]
  );

  const setActualMinutes = useCallback(
    (completionId: string, minutes: number | null) => {
      fire(
        updateDoc(doc(col('completions'), completionId), { actualMinutes: minutes == null ? null : clamp(Math.round(minutes), 0, 1440) }),
        'save the actual time'
      );
    },
    [col, fire]
  );

  const changeCount = useCallback(
    (task: Task, delta: number) => {
      const now = nowInTz(prefsRef.current.timezone);
      const target = Math.max(1, currentVersion(task).recurrence.target ?? 1);
      const next = clamp(task.count + delta, 0, 100000);
      if (next === task.count) return;
      const real = next - task.count;
      const todayLog = Math.max(0, (task.progressLog?.[now.dateKey] ?? 0) + real);
      const batch = writeBatch(db);
      batch.update(doc(col('tasks'), task.id), 'count', next, new FieldPath('progressLog', now.dateKey), todayLog, 'updatedAtMs', Date.now());
      const goalRef = doc(col('completions'), `${task.id}_goal`);
      if (task.count < target && next >= target) {
        batch.set(goalRef, {
          taskId: task.id,
          dateKey: now.dateKey,
          status: 'completed',
          scheduledStart: null,
          scheduledEnd: null,
          plannedMinutes: 0,
          actualMinutes: null,
          completedAtMs: Date.now(),
          late: false,
          title: task.title,
          categoryId: task.categoryId,
          repeatType: 'count',
        });
        batch.set(userRef, { stats: { totalCompletions: increment(1) } }, { merge: true });
        toast({ type: 'success', title: 'Goal reached! 🎯', message: `${task.title}: ${next}/${target} ${currentVersion(task).recurrence.unit || ''}` });
      } else if (task.count >= target && next < target) {
        batch.delete(goalRef);
        batch.set(userRef, { stats: { totalCompletions: increment(-1) } }, { merge: true });
      }
      fire(batch.commit(), 'update progress');
    },
    [col, fire, userRef, toast]
  );

  const createNote = useCallback(
    (partial: Partial<Note> = {}): string => {
      const ref = doc(col('notes'));
      const now = Date.now();
      const data = {
        type: 'detailed',
        title: '',
        content: '',
        text: '',
        folder: '',
        tags: [],
        categoryId: '',
        pinned: false,
        favourite: false,
        archived: false,
        linkedTaskIds: [],
        color: '',
        createdAtMs: now,
        updatedAtMs: now,
        rev: 0,
        lastDevice: getDeviceId(),
        ...partial,
      };
      delete (data as Partial<Note>).id;
      fire(setDoc(ref, data), 'create the note');
      return ref.id;
    },
    [col, fire]
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Note>) => {
      const p = { ...patch, updatedAtMs: Date.now() };
      delete (p as Partial<Note>).id;
      fire(updateDoc(doc(col('notes'), id), p), 'update the note');
    },
    [col, fire]
  );

  const saveNoteContent = useCallback(
    (id: string, data: { title: string; content: string; text: string }, baseRev: number) => {
      const payload = { title: data.title.slice(0, 200), content: data.content.slice(0, 400000), text: data.text.slice(0, 4000) };
      if (navigator.onLine) {
        fire(updateDoc(doc(col('notes'), id), { ...payload, rev: baseRev + 1, lastDevice: getDeviceId(), updatedAtMs: Date.now() }), 'save the note');
        return { mode: 'online' as const, rev: baseRev + 1 };
      }
      // Offline: keep the edit in IndexedDB and reconcile safely when back online.
      setNoteDrafts((prev) => {
        const next = { ...prev, [id]: { noteId: id, ...payload, baseRev, savedAt: Date.now() } };
        void idbSet(draftsKey, next);
        return next;
      });
      return { mode: 'offline' as const, rev: baseRev };
    },
    [col, fire, draftsKey]
  );

  const deleteNote = useCallback(
    (id: string) => {
      fire(deleteDoc(doc(col('notes'), id)), 'delete the note');
      setNoteDrafts((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        void idbSet(draftsKey, next);
        return next;
      });
    },
    [col, fire, draftsKey]
  );

  const saveCategory = useCallback(
    (cat: Partial<Category> & { name: string; color: string; icon: string }) => {
      const ref = cat.id ? doc(col('categories'), cat.id) : doc(col('categories'));
      fire(setDoc(ref, { name: cat.name.trim().slice(0, 32), color: cat.color, icon: cat.icon }), 'save the category');
    },
    [col, fire]
  );

  const deleteCategory = useCallback((id: string) => fire(deleteDoc(doc(col('categories'), id)), 'delete the category'), [col, fire]);

  const pushNotification = useCallback(
    (n: NotificationInput) => {
      if (notificationsRef.current.some((x) => x.id === n.id)) return;
      fire(
        setDoc(doc(col('notifications'), n.id), {
          type: n.type,
          title: n.title.slice(0, 300),
          body: n.body.slice(0, 1000),
          link: n.link,
          createdAtMs: n.createdAtMs ?? Date.now(),
          read: false,
          cleared: false,
        }),
        'save a notification'
      );
    },
    [col, fire]
  );

  const markNotificationsRead = useCallback(
    (ids?: string[]) => {
      const targets = notificationsRef.current.filter((n) => !n.read && (!ids || ids.includes(n.id)));
      if (!targets.length) return;
      const b = writeBatch(db);
      targets.slice(0, 400).forEach((n) => b.update(doc(col('notifications'), n.id), { read: true }));
      fire(b.commit(), 'update notifications');
    },
    [col, fire]
  );

  const clearNotifications = useCallback(
    (ids?: string[]) => {
      const targets = notificationsRef.current.filter((n) => !n.cleared && (!ids || ids.includes(n.id)));
      if (!targets.length) return;
      const b = writeBatch(db);
      targets.slice(0, 400).forEach((n) => b.update(doc(col('notifications'), n.id), { cleared: true, read: true }));
      fire(b.commit(), 'clear notifications');
    },
    [col, fire]
  );

  const unlockAchievements = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const b = writeBatch(db);
      ids.forEach((id) => b.set(doc(col('achievements'), id), { unlockedAtMs: Date.now() }));
      fire(b.commit(), 'save achievements');
    },
    [col, fire]
  );

  const recordLongestStreak = useCallback(
    (n: number) => {
      fire(setDoc(userRef, { stats: { longestStreak: n } }, { merge: true }), 'save your streak');
    },
    [fire, userRef]
  );

  const exportData = useCallback(
    () => ({
      exportedAt: new Date().toISOString(),
      profile: userDocRef.current,
      tasks: tasksRef.current,
      completions: [...completionsRef.current.values()],
      notes: notesRef.current,
    }),
    []
  );

  const categories = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const taskMap = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const notificationIds = useMemo(() => new Set(notifications.map((n) => n.id)), [notifications]);
  const displayNotes = useMemo(
    () =>
      notes.map((n) => {
        const d = noteDrafts[n.id];
        return d ? { ...n, title: d.title, content: d.content, text: d.text, updatedAtMs: Math.max(n.updatedAtMs, d.savedAt) } : n;
      }),
    [notes, noteDrafts]
  );

  const profile: UserProfile = useMemo(
    () => ({
      displayName: userDoc?.displayName || user.displayName || user.email?.split('@')[0] || 'Friend',
      email: userDoc?.email || user.email || '',
      // Uploaded photo → Google profile photo (stored, or from the auth profile for older docs) → initials.
      photoData: userDoc?.photoData || (userDoc && 'photoURL' in userDoc ? userDoc.photoURL : user.photoURL) || null,
      createdAtMs: userDoc?.createdAtMs ?? (user.metadata.creationTime ? Date.parse(user.metadata.creationTime) : Date.now()),
      stats: { totalCompletions: userDoc?.stats?.totalCompletions ?? 0, longestStreak: userDoc?.stats?.longestStreak ?? 0 },
    }),
    [userDoc, user]
  );

  const ready = loaded.user && loaded.tasks && loaded.completions;
  const syncing = Object.values(pendingMap).some(Boolean);

  const value: DataCtx = {
    uid,
    ready,
    dbError,
    syncing,
    windowStart,
    profile,
    prefs,
    tasks,
    taskMap,
    completions,
    notes: displayNotes,
    noteDrafts,
    categories,
    categoryMap,
    notifications,
    notificationIds,
    achievements,
    achievementsLoaded,
    dismissDbError: () => setDbError(null),
    updatePrefs,
    updateProfileData,
    saveTask,
    deleteTask,
    setTaskState,
    toggleComplete,
    setSkip,
    setActualMinutes,
    changeCount,
    createNote,
    updateNote,
    saveNoteContent,
    deleteNote,
    saveCategory,
    deleteCategory,
    pushNotification,
    markNotificationsRead,
    clearNotifications,
    unlockAchievements,
    recordLongestStreak,
    exportData,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData(): DataCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useData must be used inside DataProvider');
  return c;
}

// ───────────────────────────────────────────────────────────────
// Stats provider: clock + derived statistics (recomputed every minute)
// ───────────────────────────────────────────────────────────────
interface StatsCtx {
  now: NowInfo;
  ctx: StatusCtx;
  todayKey: string;
  dayStats: Map<string, DayStat>;
  todayStat: DayStat | undefined;
  todayItems: OccItem[];
  overdueItems: OccItem[];
  countTasks: Task[];
  streak: { current: number; best: number };
  weeklyStreak: { current: number; best: number };
  monthlyConsistency: number | null;
  longestStreak: number;
  totalCompletions: number;
  itemsFor(key: string): OccItem[];
}

const SCtx = createContext<StatsCtx | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const data = useData();
  const [epoch, setEpoch] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setEpoch(Date.now()), 20_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') setEpoch(Date.now());
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, []);

  const tz = data.prefs.timezone;
  const nowFull = useMemo(() => nowInTz(tz, epoch), [tz, epoch]);
  const minuteKey = `${nowFull.dateKey}|${nowFull.minutes}`;
  const now = useMemo(() => nowFull, [minuteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const grace = data.prefs.graceMinutes;
  const ctx = useMemo<StatusCtx>(() => ({ todayKey: now.dateKey, nowMin: now.minutes, grace }), [now, grace]);
  const rule = data.prefs.streakRule;
  const weekStart = data.prefs.weekStart;

  const dayStats = useMemo(
    () => computeDayStats(data.tasks, data.completions, data.windowStart, addDays(ctx.todayKey, 7), ctx),
    [data.tasks, data.completions, data.windowStart, ctx]
  );
  const streak = useMemo(() => overallStreak(dayStats, data.windowStart, ctx.todayKey, rule), [dayStats, data.windowStart, ctx.todayKey, rule]);
  const wStreak = useMemo(() => weeklyStreak(dayStats, data.windowStart, ctx.todayKey, rule, weekStart), [dayStats, data.windowStart, ctx.todayKey, rule, weekStart]);
  const monthlyConsistency = useMemo(() => aggregate(dayStats, rangeKeys(startOfMonth(ctx.todayKey), ctx.todayKey)).rate, [dayStats, ctx.todayKey]);

  const itemsFor = useCallback(
    (key: string): OccItem[] =>
      occurrencesOn(data.tasks, key).map((occ) => {
        const completion = data.completions.get(occ.id);
        return { occ, completion, status: occurrenceStatus(occ, completion, ctx) };
      }),
    [data.tasks, data.completions, ctx]
  );

  const todayItems = useMemo(() => itemsFor(ctx.todayKey), [itemsFor, ctx.todayKey]);
  const overdueItems = useMemo(() => {
    const out: OccItem[] = [];
    for (let i = 1; i <= 3; i++) out.push(...itemsFor(addDays(ctx.todayKey, -i)).filter((x) => x.status === 'missed'));
    return out;
  }, [itemsFor, ctx.todayKey]);
  const countTasks = useMemo(() => data.tasks.filter((t) => isCountTask(t) && t.status === 'active'), [data.tasks]);

  const completedInWindow = useMemo(() => {
    let n = 0;
    data.completions.forEach((c) => {
      if (c.status === 'completed') n++;
    });
    return n;
  }, [data.completions]);

  const longestStreak = Math.max(streak.best, data.profile.stats.longestStreak);
  const totalCompletions = Math.max(data.profile.stats.totalCompletions, completedInWindow);

  const { ready, recordLongestStreak } = data;
  const storedLongest = data.profile.stats.longestStreak;
  useEffect(() => {
    if (ready && streak.best > storedLongest) recordLongestStreak(streak.best);
  }, [ready, streak.best, storedLongest, recordLongestStreak]);

  const value: StatsCtx = {
    now,
    ctx,
    todayKey: ctx.todayKey,
    dayStats,
    todayStat: dayStats.get(ctx.todayKey),
    todayItems,
    overdueItems,
    countTasks,
    streak,
    weeklyStreak: wStreak,
    monthlyConsistency,
    longestStreak,
    totalCompletions,
    itemsFor,
  };
  return <SCtx.Provider value={value}>{children}</SCtx.Provider>;
}

export function useStats(): StatsCtx {
  const c = useContext(SCtx);
  if (!c) throw new Error('useStats must be used inside StatsProvider');
  return c;
}
