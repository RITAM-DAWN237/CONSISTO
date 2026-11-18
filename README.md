# CONSISTO — Personal Productivity & Habit Tracking PWA

**Build habits. Keep promises. Stay consistent.**

CONSISTO combines a to-do manager, habit tracker, smart reminders, a timetable, recurrence-aware
streaks, a GitHub-style consistency heatmap, productivity analytics and a Notion-style notes workspace —
in an installable, offline-capable Progressive Web App backed by Firebase.

> **Core principle:** CONSISTO reminds you, tracks your consistency and motivates you — but **you** decide
> when a task is complete. Completion is always manual (tap the circle to tick, tap again to undo).
> An end-of-session alarm never completes a task.

---

## 1. Quick start

```bash
npm install
npm run dev      # local development (service worker disabled in dev)
npm run build    # production build → dist/ (single inlined index.html + PWA files)
npx vite preview # serve the production build locally
```

> **Stack note.** The brief asked for vanilla JS, but this workspace is a React + Vite + Tailwind template
> (and `App.tsx` is the required entry point), so the app is written in modular TypeScript/React. Every
> feature (Firebase, Firestore, service worker, IndexedDB, Notifications, Chart.js) uses the standard
> browser / Firebase APIs directly, with no paid dependencies.

## 2. Firebase setup (free Spark plan)

1. **Authentication → Get started → Sign-in method:** enable **Email/Password** and **Google**
   (for Google, choose a *project support email* and click Save). See [Google sign-in](#google-sign-in) below.
2. **Build → Firestore Database → Create database** (production mode, nearest region).
3. **Firestore → Rules:** paste the contents of [`firestore.rules`](firestore.rules) and **Publish**
   — or with the CLI: `npm i -g firebase-tools && firebase login && firebase deploy --only firestore:rules --project consisto-5714a`
4. **Authentication → Settings → Authorised domains:** add your Netlify domain (e.g. `consisto.netlify.app`).
5. *(Optional)* **Authentication → Templates:** customise the password-reset and verification emails.

The Firebase web config in `src/lib/firebase.ts` is a public client identifier, not a secret. Security comes
from Authentication + the per-user Firestore rules. You can override any value with environment variables:
`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`,
`VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_FIREBASE_MEASUREMENT_ID`. **Never** put service-account / Admin SDK keys in this frontend.

### Google sign-in

- **Continue with Google** appears on both the *Sign in* and *Create account* screens. A first-time Google user
  gets a new private workspace automatically (name and photo come from the Google profile).
- **Pop-up first, redirect fallback.** CONSISTO uses `signInWithPopup` (Firebase's recommended option for apps not
  hosted on Firebase Hosting). If the browser blocks the pop-up it falls back to `signInWithRedirect` — except
  inside iframes, where Google refuses to load.
- **Existing email accounts.** If Google returns an email that already has a password account, CONSISTO asks for
  that password once and then links Google to the same account (same data). Firebase links Gmail addresses
  automatically.
- **Profile → Sign-in methods:** connect / disconnect Google, or add a password to a Google-only account.
  Deleting a Google-only account re-confirms with Google instead of a password.
- **Authorised domains are required for Google.** Add every domain you use (your Netlify domain, preview domains)
  in Firebase Console → Authentication → Settings → **Authorised domains** (`localhost` is there by default).
  On other domains the app shows a clear "domain is not authorised" message.

**Most reliable setup for Safari / iOS (optional, recommended for production).** Browsers that block third-party
storage can break the *redirect* fallback while the auth helper lives on `firebaseapp.com`. Firebase's fix
("Best practices for signInWithRedirect", option 3) is to serve the helper from your own domain:

1. `netlify.toml` already proxies `/__/auth/*` and `/__/firebase/*` to `consisto-5714a.firebaseapp.com`.
2. Netlify → Site configuration → Environment variables: `VITE_FIREBASE_AUTH_DOMAIN=<your-site>.netlify.app`
   (domain only, no `https://`), then redeploy.
3. Google Cloud Console → APIs & Services → Credentials → *Web client (auto created by Google Service)* →
   **Authorised redirect URIs** → add `https://<your-site>.netlify.app/__/auth/handler`.

## 3. Deploy to Netlify

- **Git:** push the repo → Netlify → *Add new site → Import* → it reads [`netlify.toml`](netlify.toml)
  (build `npm run build`, publish `dist`, no-cache headers for `sw.js`, security headers).
- **Manual:** run `npm run build` and drag the `dist/` folder onto Netlify Drop.
- After the first deploy, add the site domain to Firebase *Authorised domains* (step 2.4).

## 4. Your logo — `public/logo/`

Upload your logo manually as **`public/logo/logo1.png`** (also detected: `logo1.svg`, `.webp`, `.jpg`,
`.jpeg`, `LOGO1.png`). It is shown in the sidebar, mobile header, sign-in screen and splash screen.
Until it exists, a built-in vector version of the CONSISTO mark is displayed, so nothing ever looks broken.
Use a square image with a transparent background. Home-screen (installed app) icons live in
`public/icons/` — replace them with exports of your logo if you like (192, 512, maskable, 180 apple).

---

## 5. Project structure

```
├── index.html                  App shell, PWA meta tags, early theme + install-prompt capture
├── netlify.toml                Netlify build + headers
├── firebase.json               Firebase CLI config (rules + indexes)
├── firestore.rules             Per-user security rules with input validation
├── firestore.indexes.json      No composite indexes needed (single-field queries only)
├── public/
│   ├── manifest.webmanifest    Installable PWA manifest (standalone, icons, shortcuts)
│   ├── sw.js                   Service worker: offline shell, runtime cache, notification actions
│   ├── icons/                  App icons (192/512/maskable/apple/favicon/badge)
│   └── logo/                   ← put logo1.png here (see README inside)
└── src/
    ├── main.tsx                React mount + service-worker registration & update detection
    ├── App.tsx                 Providers, auth gate, theming, hash router, modal host, update banner
    ├── index.css               Design tokens (dark / light / AMOLED), animations, editor styles
    ├── types.ts                Domain types (mirror the Firestore schema)
    ├── constants.ts            Categories, accents, 15 heatmap palettes, fonts, sounds, defaults
    ├── hooks.ts                Hash router, media queries, online state, install prompt, permissions
    ├── lib/
    │   ├── firebase.ts         Firebase init (Auth, Firestore + IndexedDB cache, Analytics)
    │   ├── dates.ts            Date-key math, time-zone conversion, formatting
    │   ├── recurrence.ts       Recurrence engine (once/daily/weekly/monthly/count), conflicts, layout
    │   ├── engine.ts           Occurrence status, day stats, streaks, heatmap levels, reminder events
    │   ├── achievements.ts     Achievement definitions + metrics from real completion records
    │   ├── sounds.ts           Synthesised reminder sounds (Web Audio) + vibration
    │   └── utils.ts            IndexedDB key-value store, DOMPurify sanitising, helpers
    ├── context/
    │   ├── AuthContext.tsx     Email + Google sign-in, account linking, password reset/add/change, delete account
    │   ├── UIContext.tsx       Toasts, confirm dialogs, milestone celebrations, modal state
    │   └── DataContext.tsx     Firestore subscriptions, all CRUD actions, offline drafts, derived stats
    ├── services/engines.ts     Reminder engine (best-effort alarms, snooze, reconciliation) + achievements
    ├── components/             Layout (sidebar/bottom nav/FAB), UI kit, TaskRow, TaskEditor, TaskDetails,
    │                           Heatmap, Charts, NoteEditor (TipTap), NotificationCenter, GlobalSearch, Logo
    └── pages/                  Auth, Home, Calendar, Analytics, Notes, Achievements, Settings,
                                Profile, More, Tasks
```

## 6. System architecture

```
 React UI (pages/components) ──► UIContext (toasts · modals · confirm · celebrations)
        │
        ▼
 StatsProvider (clock in user TZ → statuses, day stats, streaks, heatmap) ◄── pure lib/engine + lib/recurrence
        │
        ▼
 DataProvider ──► Firestore SDK ──► IndexedDB cache (offline reads + queued writes) ──► Cloud Firestore
        │                                                      ▲
        └─► note drafts (IndexedDB) ── reconcile on reconnect ─┘
 Engines: reminder engine (Notification API + SW) · achievement engine
 Service worker: offline app shell · fonts/icons cache · notification click/snooze
```

## 7. Firestore schema

```
users/{uid}                       displayName, email, photoData (≤160px JPEG data URL), createdAtMs,
                                  stats{ totalCompletions, longestStreak }, prefs{ …all customisation… }
users/{uid}/tasks/{taskId}        title, description, notes, categoryId, priority,
                                  schedules[ {from, startDate, endDate, recurrence{…}, startTime, endTime} ],
                                  reminders{start, end, offset, sound, vibrate}, status (active|paused|archived),
                                  pausedRanges[{from,to}], archivedAt, count, progressLog{dateKey: n}, createdAtMs, updatedAtMs
users/{uid}/completions/{taskId_YYYY-MM-DD}
                                  taskId, dateKey, status (completed|skipped), scheduledStart/End, plannedMinutes,
                                  actualMinutes, completedAtMs, late, + snapshot {title, categoryId, repeatType}
users/{uid}/notes/{noteId}        type (quick|detailed), title, content (sanitised HTML / text), text, folder, tags[],
                                  categoryId, pinned, favourite, archived, linkedTaskIds[], color, rev, lastDevice, timestamps
users/{uid}/categories/{id}       name, color, icon        (defaults are built in; custom ones stored here)
users/{uid}/notifications/{id}    type, title, body, link, createdAtMs, read, cleared   (deterministic ids → no duplicates)
users/{uid}/achievements/{id}     unlockedAtMs
users/{uid}/statistics/{period}   reserved for aggregated stats
```

- **Occurrences are computed, not stored.** Their deterministic id is `taskId_dateKey`, which is also the
  completion document id — so a completion can never be duplicated, and tick/untick is idempotent.
- **Scheduled time vs. actual time:** the scheduled date/time comes from the task's schedule version; the actual
  completion timestamp is `completedAtMs`; late completions keep `late: true`.
- **History is never rewritten:** editing a started recurring task appends a new schedule version effective
  today (or tomorrow if today is already done). Completion records also snapshot the task title/category.
- Completions are queried for a 400-day window (enough for the 12-month heatmap) to stay within free-tier reads;
  lifetime totals and the longest streak are kept in `users/{uid}.stats`.

## 8. Recurrence & streak logic

- **Once** · **Daily** (every day / selected weekdays) · **Weekly** (weekdays + every N weeks) ·
  **Monthly** (day N — months without that day use their last day — or first/second/third/fourth/last weekday,
  every N months) · **Count-based** (target, unit, manual +/−, remaining & %).
- **Status:** `upcoming` → `pending` (from start time) → `missed` after *end time (or end of day) + grace period*.
  `completed` / `skipped` only via manual action. Missed occurrences stay completable (recorded as late).
- **Overall streak:** consecutive *scheduled* days that meet your rule (any task / ≥50% / all tasks).
  Days with nothing scheduled are neutral and never break a streak; today never breaks it while in progress.
- **Per-task streaks:** daily → consecutive occurrences; weekly → consecutive fully-completed weeks;
  monthly → consecutive months; count → consecutive days with logged progress. Skips are neutral.
- **Heatmap:** completed ÷ scheduled per day → grey (nothing scheduled), red-outlined (scheduled but 0%),
  low 1–39%, moderate 40–74%, high 75–100%. 15 colour palettes.
- **Milestones:** 3, 7, 14, 30, 50, 100, 365 days — celebrated once, based on real activity only.

## 9. Reminders — honest PWA limitations

Start and end alarms are independent per task (with offset, sound, vibration and snooze). They are
**best-effort**: they fire while CONSISTO (or the installed app window) is open/running. Browsers may delay or
pause timers when the device sleeps or the app is fully closed, so a standard PWA cannot guarantee exact alarms.
Reminders missed while closed are **reconciled** into the Notification Centre on next launch. Completing a task
before its end time cancels that occurrence's end reminder and closes any shown notification. For guaranteed
exact alarms you would need a native wrapper (e.g. Capacitor + Android exact-alarm permission) or server push
(Firebase Cloud Messaging + a backend), which is outside the free static-hosting scope.

## 10. Offline & sync

- Firestore's persistent IndexedDB cache serves tasks, completions and notes offline; writes (tick/untick,
  task edits, note metadata) are queued and synced automatically on reconnect.
- Note content edited offline is saved as an IndexedDB draft; on reconnect it is compared with the server
  revision — if another device changed the note meanwhile, your version is saved as a **copy** (never lost).
  While online, concurrent edits show a conflict banner (load theirs / keep mine / save mine as copy).
- The service worker caches the app shell (network-first navigation) and static assets; Firebase traffic is never
  intercepted. New deploys are detected and an **update banner** offers a reload.

## 11. Security

Per-user rules (`request.auth.uid == userId`) on every path with field validation · no privileged keys in the
client · note HTML sanitised with DOMPurify (unsafe links stripped) and parsed through the TipTap schema ·
confirmations before destructive actions · input validation on every form · account deletion removes all data.

## 12. Test checklist

- Auth: sign up (verification email), sign in with/without "keep me signed in", wrong password, reset email.
- Google: first sign-in creates a workspace with your Google name/photo; sign out and back in; try Google with an
  email that already has a password (prompts once, then links); Profile → connect / disconnect / add password.
- Tasks: each repeat type; monthly day 31 in February; edit a started task and confirm past history is unchanged;
  pause/resume; archive/unarchive; delete.
- Completion: tick → undo; complete a missed task (shows *late*); skip; confirm the end alarm never completes.
- Reminders: allow notifications → Settings → *Send test*; create a task starting in 2 minutes; snooze.
- Offline: DevTools → Network → Offline → tick tasks, edit notes → go online → verify sync.
- Responsive: 360 / 375 / 390 / 430 px, tablet and desktop (no horizontal page overflow).
- Rules: try reading another uid's path from the console → `permission-denied`.
