import DOMPurify from 'dompurify';
export { cn } from '../utils/cn';

// ─── Tiny IndexedDB key-value store (local device cache only) ──
const DB_NAME = 'consisto-local';
const STORE = 'kv';
let dbPromise: Promise<IDBDatabase> | null = null;
const memoryFallback = new Map<string, unknown>();

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => resolve(rq.result as T | undefined);
      rq.onerror = () => reject(rq.error);
    });
  } catch {
    return memoryFallback.get(key) as T | undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  memoryFallback.set(key, value);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* memory fallback already set */
  }
}

export async function idbDel(key: string): Promise<void> {
  memoryFallback.delete(key);
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

// ─── Identity helpers ──────────────────────────────────────────
export function uid(): string {
  const raw =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return raw.replace(/-/g, '').slice(0, 20);
}

let deviceId: string | null = null;
/** Random per-device id used for note conflict detection (not personal data). */
export function getDeviceId(): string {
  if (deviceId) return deviceId;
  try {
    deviceId = localStorage.getItem('consisto-device');
  } catch {
    /* ignore */
  }
  if (!deviceId) {
    deviceId = uid();
    try {
      localStorage.setItem('consisto-device', deviceId);
    } catch {
      /* ignore */
    }
  }
  return deviceId;
}

// ─── Safe HTML (stored XSS prevention for notes) ───────────────
const SAFE_URL = /^(https?:|mailto:|tel:|#|\/)/i;
let hooked = false;

function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if ((node as Element).tagName === 'A') {
      const el = node as Element;
      const href = el.getAttribute('href') || '';
      if (!SAFE_URL.test(href.trim())) el.removeAttribute('href');
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
}

export function sanitizeHtml(html: string): string {
  ensureHooks();
  return DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: [
      'p', 'br', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'pre',
      'blockquote', 'ul', 'ol', 'li', 'a', 'hr', 'label', 'input', 'div', 'span', 'mark',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'data-type', 'data-checked', 'type', 'checked', 'start', 'disabled'],
    ALLOW_DATA_ATTR: false,
  });
}

export function isSafeUrl(url: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(url.trim());
}

export function htmlToText(html: string): string {
  if (!html) return '';
  const spaced = sanitizeHtml(html).replace(/<\/(p|h1|h2|h3|li|pre|blockquote|div)>/g, '</$1>\n').replace(/<br\s*\/?>/g, '\n');
  const doc = new DOMParser().parseFromString(spaced, 'text/html');
  return (doc.body.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── Misc ──────────────────────────────────────────────────────
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Square-crop and downscale an image to a small JPEG data URL (stored in Firestore, no Storage bucket needed). */
export function resizeImage(file: File, size = 160): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const c = canvas.getContext('2d');
      if (!c) {
        reject(new Error('Canvas unsupported'));
        return;
      }
      const s = Math.min(img.width, img.height);
      c.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read that image'));
    };
    img.src = url;
  });
}

export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** True when running inside an iframe (e.g. an embedded preview) — Google redirects can't run there. */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/** Embedded in-app browsers (Instagram, Facebook, LinkedIn, Android WebView…) where Google blocks OAuth. */
export function isInAppBrowser(): boolean {
  return /FBAN|FBAV|Instagram|LinkedInApp|Snapchat|MicroMessenger|Line\/|; wv\)/i.test(navigator.userAgent);
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}
