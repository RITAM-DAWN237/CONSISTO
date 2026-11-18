import { useCallback, useEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { isIOS, isStandalone } from './lib/utils';

// ─── Hash router (works offline and on any static host) ─────────
function getHash() {
  return window.location.hash || '#/home';
}
function subscribeHash(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribeHash, getHash, getHash);
  const raw = hash.replace(/^#/, '') || '/home';
  const [pathPart, query = ''] = raw.split('?');
  return { path: pathPart || '/home', query, params: new URLSearchParams(query) };
}

export function navigate(to: string) {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (window.location.hash !== target) window.location.hash = target;
}

// ─── Media queries ──────────────────────────────────────────────
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query]
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)');
}

// ─── Connectivity ───────────────────────────────────────────────
export function useOnline(): boolean {
  const subscribe = useCallback((cb: () => void) => {
    window.addEventListener('online', cb);
    window.addEventListener('offline', cb);
    return () => {
      window.removeEventListener('online', cb);
      window.removeEventListener('offline', cb);
    };
  }, []);
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

// ─── PWA install prompt ─────────────────────────────────────────
export function useInstallPrompt() {
  const [available, setAvailable] = useState<boolean>(() => !!window.__deferredPrompt);
  const [installed, setInstalled] = useState<boolean>(() => isStandalone());

  useEffect(() => {
    const onAvail = () => setAvailable(!!window.__deferredPrompt);
    const onInstalled = () => {
      setInstalled(true);
      setAvailable(false);
      window.__deferredPrompt = null;
    };
    window.addEventListener('consisto:installable', onAvail);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('consisto:installable', onAvail);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const evt = window.__deferredPrompt;
    if (!evt) return 'unavailable';
    await evt.prompt();
    const choice = await evt.userChoice;
    window.__deferredPrompt = null;
    setAvailable(false);
    return choice.outcome;
  }, []);

  return { available, installed, install, ios: isIOS() };
}

// ─── Misc ──────────────────────────────────────────────────────
export function useClickOutside(ref: RefObject<HTMLElement | null>, handler: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [ref, handler, active]);
}

export function useNotificationPermission() {
  const get = () => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(get);
  useEffect(() => {
    const onVis = () => setPerm(get());
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const request = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported' as const;
    const result = await Notification.requestPermission();
    setPerm(result);
    return result;
  }, []);
  return { permission: perm, request };
}
