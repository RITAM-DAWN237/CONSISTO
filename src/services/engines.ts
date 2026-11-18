// Background engines that run while CONSISTO is open:
//  • Reminder engine — best-effort start/end alarms, snooze, cancellation on completion,
//    and reconciliation of reminders missed while the app was closed.
//  • Achievement engine — unlocks achievements / streak milestones from real activity.
//
// Platform note: a standard PWA cannot guarantee exact alarms while the browser is fully
// closed or the device is asleep. Reminders fire while the app (or installed app window) is
// running; anything missed is reconciled into the Notification Centre on next open.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useData, useStats } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { deadlineRel, occurrenceStatus, reminderEvents, type ReminderEvent } from '../lib/engine';
import { addDays, formatEpoch, formatTime, nowInTz, relativeDayLabel, zonedToEpoch } from '../lib/dates';
import { occurrencesOn } from '../lib/recurrence';
import { idbGet, idbSet } from '../lib/utils';
import { playSound, vibrate } from '../lib/sounds';
import { navigate } from '../hooks';
import { ACHIEVEMENTS, computeMetrics, type AchievementDef } from '../lib/achievements';

const LIVE_WINDOW_MS = 10 * 60_000;

export async function showSystemNotification(
  title: string,
  body: string,
  opts: { tag: string; link: string; eventId?: string; vibrate?: boolean; snoozeMinutes?: number; actions?: boolean }
): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options = {
    body,
    tag: opts.tag,
    icon: './icons/icon-192.png',
    badge: './icons/badge-72.png',
    data: { link: opts.link, eventId: opts.eventId },
    vibrate: opts.vibrate ? [200, 100, 200] : undefined,
    renotify: true,
    actions: opts.actions
      ? [
          { action: 'snooze', title: `Snooze ${opts.snoozeMinutes ?? 10} min` },
          { action: 'open', title: 'Open' },
        ]
      : undefined,
  } as NotificationOptions;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, { body, tag: opts.tag, icon: './icons/icon-192.png' });
    return true;
  } catch {
    try {
      new Notification(title, { body, tag: opts.tag });
      return true;
    } catch {
      return false;
    }
  }
}

export function useReminderEngine() {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const [leader, setLeader] = useState(false);
  const live = useRef({ data, stats, ui });
  live.current = { data, stats, ui };
  const running = useRef(false);
  const uid = data.uid;

  // Only one tab runs the engine (Web Locks), so reminders are never duplicated across tabs.
  useEffect(() => {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks) {
      setLeader(true);
      return;
    }
    let release: (() => void) | null = null;
    const ac = new AbortController();
    locks
      .request(`consisto-reminders-${uid}`, { signal: ac.signal }, () =>
        new Promise<void>((resolve) => {
          release = resolve;
          setLeader(true);
        })
      )
      .catch(() => undefined);
    return () => {
      ac.abort();
      release?.();
      setLeader(false);
    };
  }, [uid]);

  const snooze = useCallback(
    async (ev: ReminderEvent) => {
      const { data: d, ui: u } = live.current;
      const minutes = d.prefs.snoozeMinutes;
      const list = (await idbGet<ReminderEvent[]>(`snoozes:${uid}`)) ?? [];
      const baseId = ev.id.split('|snooze|')[0];
      list.push({
        ...ev,
        id: `${baseId}|snooze|${Date.now()}`,
        fireAt: Date.now() + minutes * 60_000,
        title: ev.title.startsWith('⏰') ? ev.title : `⏰ ${ev.title}`,
      });
      await idbSet(`snoozes:${uid}`, list.filter((s) => s.fireAt > Date.now() - 86_400_000));
      u.toast({ type: 'info', title: `Snoozed for ${minutes} minutes`, message: 'Keep CONSISTO open or installed so the reminder can fire.' });
    },
    [uid]
  );

  const snoozeById = useCallback(
    (eventId: string) => {
      const { data: d } = live.current;
      const base = eventId.split('|snooze|')[0];
      const [taskId, dateKey, type] = base.split('|');
      if (!taskId || !dateKey) return;
      const ev = reminderEvents(d.tasks.filter((t) => t.id === taskId), dateKey, dateKey, d.prefs.timezone, d.prefs.timeFormat).find(
        (e) => e.type === type
      );
      if (ev) void snooze(ev);
    },
    [snooze]
  );

  const fireLive = useCallback(
    async (ev: ReminderEvent) => {
      const { data: d, ui: u } = live.current;
      const p = d.prefs;
      await showSystemNotification(ev.title, ev.body, {
        tag: ev.id.split('|snooze|')[0],
        link: '/home',
        eventId: ev.id,
        vibrate: ev.vibrate && p.vibrate,
        snoozeMinutes: p.snoozeMinutes,
        actions: true,
      });
      if (p.soundEnabled) playSound(ev.sound || p.sound);
      if (ev.vibrate && p.vibrate) vibrate([200, 100, 200]);
      u.toast({
        type: 'reminder',
        title: ev.title,
        message: ev.body,
        duration: 20_000,
        action: { label: `Snooze ${p.snoozeMinutes} min`, onClick: () => void snooze(ev) },
      });
      d.pushNotification({ id: `rem_${ev.id.replace(/\|/g, '_')}`, type: ev.type, title: ev.title, body: ev.body, link: '/home' });
    },
    [snooze]
  );

  useEffect(() => {
    if (!leader || !data.ready) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || running.current) return;
      running.current = true;
      try {
        const d = live.current.data;
        const p = d.prefs;
        const tz = p.timezone;
        const nowMs = Date.now();
        const now = nowInTz(tz, nowMs);
        let engineStart = await idbGet<number>(`engineStart:${uid}`);
        if (!engineStart) {
          engineStart = nowMs;
          await idbSet(`engineStart:${uid}`, nowMs);
        }
        const fired = (await idbGet<Record<string, number>>(`fired:${uid}`)) ?? {};
        const snoozes = (await idbGet<ReminderEvent[]>(`snoozes:${uid}`)) ?? [];
        const events = [...reminderEvents(d.tasks, addDays(now.dateKey, -1), addDays(now.dateKey, 1), tz, p.timeFormat), ...snoozes];
        let changed = false;

        for (const ev of events) {
          if (ev.fireAt > nowMs || fired[ev.id]) continue;
          fired[ev.id] = nowMs;
          changed = true;
          if (ev.fireAt < engineStart) continue;
          const nid = `rem_${ev.id.replace(/\|/g, '_')}`;
          if (d.notificationIds.has(nid)) continue; // already delivered on another device
          if (d.completions.has(ev.occId)) continue; // completed / skipped → reminder cancelled
          const task = d.taskMap.get(ev.taskId);
          if (!task || task.status !== 'active') continue;
          if (!p.notifications[ev.type]) continue;
          if (nowMs - ev.fireAt <= LIVE_WINDOW_MS) await fireLive(ev);
          else
            d.pushNotification({
              id: nid,
              type: 'reminder-missed',
              title: `Missed reminder · ${task.title}`,
              body: `${ev.type === 'start' ? 'Start' : 'End'} reminder was due ${formatEpoch(ev.fireAt, tz, p.timeFormat)} while CONSISTO was closed.`,
              link: '/home',
              createdAtMs: ev.fireAt,
            });
        }

        if (p.notifications.missed) {
          for (let i = 0; i <= 2; i++) {
            const key = addDays(now.dateKey, -i);
            for (const occ of occurrencesOn(d.tasks, key)) {
              const fid = `missed|${occ.id}`;
              if (fired[fid]) continue;
              const status = occurrenceStatus(occ, d.completions.get(occ.id), { todayKey: now.dateKey, nowMin: now.minutes, grace: p.graceMinutes });
              if (status !== 'missed') continue;
              fired[fid] = nowMs;
              changed = true;
              const deadline = zonedToEpoch(key, deadlineRel(occ, p.graceMinutes), tz);
              if (deadline < engineStart) continue;
              const nid = `missed_${occ.id}`;
              if (d.notificationIds.has(nid)) continue;
              d.pushNotification({
                id: nid,
                type: 'missed',
                title: `Missed: ${occ.task.title}`,
                body: `Scheduled ${relativeDayLabel(key, now.dateKey).toLowerCase()}${occ.start != null ? ` at ${formatTime(occ.start, p.timeFormat)}` : ''}. You can still tick it — it will be recorded as late.`,
                link: `/calendar?date=${key}&view=day`,
                createdAtMs: deadline,
              });
            }
          }
        }

        if (changed) {
          const cutoff = nowMs - 4 * 86_400_000;
          for (const k of Object.keys(fired)) if (fired[k] < cutoff) delete fired[k];
          await idbSet(`fired:${uid}`, fired);
          const remaining = snoozes.filter((s) => s.fireAt > nowMs);
          if (remaining.length !== snoozes.length) await idbSet(`snoozes:${uid}`, remaining);
        }
      } catch (e) {
        console.warn('[consisto] reminder tick failed', e);
      } finally {
        running.current = false;
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 15_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [leader, data.ready, uid, fireLive]);

  // Notification actions from the service worker (works in any tab).
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const onMsg = (e: MessageEvent) => {
      const msg = e.data || {};
      if (msg.type === 'SNOOZE' && msg.eventId) snoozeById(msg.eventId);
      if (msg.type === 'NAVIGATE' && msg.link) navigate(msg.link);
    };
    sw.addEventListener('message', onMsg);
    return () => sw.removeEventListener('message', onMsg);
  }, [snoozeById]);

  // Cold start from a notification "Snooze" action.
  useEffect(() => {
    if (!data.ready) return;
    const m = window.location.hash.match(/snooze=([^&]+)/);
    if (m) {
      snoozeById(decodeURIComponent(m[1]));
      navigate('/home');
    }
  }, [data.ready, snoozeById]);
}

export function useUpcomingReminders(max = 4): ReminderEvent[] {
  const data = useData();
  const { todayKey, now } = useStats();
  return useMemo(() => {
    const nowMs = Date.now();
    return reminderEvents(data.tasks, todayKey, addDays(todayKey, 1), data.prefs.timezone, data.prefs.timeFormat)
      .filter((e) => e.fireAt > nowMs - 60_000 && !data.completions.has(e.occId))
      .slice(0, max);
    // `now` re-evaluates the list every minute
  }, [data.tasks, data.completions, data.prefs.timezone, data.prefs.timeFormat, todayKey, now, max]); // eslint-disable-line react-hooks/exhaustive-deps
}

const rank = (a: AchievementDef) => (a.kind === 'milestone' ? 1000 + a.target : a.target);

export function useAchievementEngine() {
  const data = useData();
  const stats = useStats();
  const ui = useUI();
  const unlockedThisSession = useRef(new Set<string>());

  useEffect(() => {
    if (!data.ready || !data.achievementsLoaded) return;
    const metrics = computeMetrics({
      completions: [...data.completions.values()],
      stats: stats.dayStats,
      windowStart: data.windowStart,
      todayKey: stats.todayKey,
      weekStart: data.prefs.weekStart,
      tz: data.prefs.timezone,
      totalCompletions: stats.totalCompletions,
      longest: stats.longestStreak,
      current: stats.streak.current,
      notes: data.notes.length,
    });
    const newly = ACHIEVEMENTS.filter(
      (a) => !data.achievements.has(a.id) && !unlockedThisSession.current.has(a.id) && a.value(metrics) >= a.target
    );
    if (!newly.length) return;
    newly.forEach((a) => unlockedThisSession.current.add(a.id));
    data.unlockAchievements(newly.map((a) => a.id));
    const np = data.prefs.notifications;
    for (const a of newly) {
      const milestone = a.kind === 'milestone';
      if ((milestone && np.milestone) || (!milestone && np.achievement)) {
        data.pushNotification({
          id: `ach_${a.id}`,
          type: milestone ? 'milestone' : 'achievement',
          title: milestone ? `🔥 ${a.title}!` : `🏆 Achievement unlocked: ${a.title}`,
          body: a.description,
          link: '/achievements',
        });
      }
    }
    const best = [...newly].sort((x, y) => rank(y) - rank(x))[0];
    if (best.kind === 'milestone' && np.milestone) {
      ui.celebrate({ kind: 'streak', value: best.target, title: `${best.target} Day Streak!`, subtitle: "You're on fire! Every day you show up makes the next one easier." });
    } else if (best.kind === 'achievement' && np.achievement) {
      ui.celebrate({ kind: 'achievement', title: best.title, subtitle: best.description });
    }
    if (newly.length > 1) ui.toast({ type: 'success', title: `${newly.length} achievements unlocked`, message: newly.map((a) => a.title).join(' · ') });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.ready, data.achievementsLoaded, data.achievements, data.completions, data.notes.length, stats.totalCompletions, stats.longestStreak]);
}
