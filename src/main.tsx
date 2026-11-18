import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// ─── Service worker: offline shell + update notifications ─────────
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      const notify = () => window.dispatchEvent(new Event('consisto:update-available'));
      let updateRequested = false;

      if (reg.waiting && navigator.serviceWorker.controller) notify();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) notify();
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (updateRequested) window.location.reload();
      });
      (window as unknown as { __consistoApplyUpdate: () => void }).__consistoApplyUpdate = () => {
        updateRequested = true;
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        else window.location.reload();
      };

      // The app is a single inlined index.html, so compare its fingerprint to detect new deploys.
      let baseline: string | null = null;
      const fingerprint = async (): Promise<string | null> => {
        try {
          const res = await fetch('./index.html?__v=1', { cache: 'no-cache' });
          if (!res.ok) return null;
          const text = await res.text();
          let h = 0;
          for (let i = 0; i < text.length; i += 7) h = (h * 31 + text.charCodeAt(i)) | 0;
          return `${h}:${text.length}`;
        } catch {
          return null;
        }
      };
      const check = async (manual = false) => {
        try {
          await reg.update();
        } catch {
          /* offline */
        }
        const fp = await fingerprint();
        if (!fp) return;
        if (baseline == null) baseline = fp;
        else if (fp !== baseline) {
          notify();
          return;
        }
        if (manual && !reg.waiting) window.dispatchEvent(new Event('consisto:up-to-date'));
      };
      void check();
      let last = Date.now();
      setInterval(() => void check(), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - last > 10 * 60 * 1000) {
          last = Date.now();
          void check();
        }
      });
      window.addEventListener('consisto:check-update', () => void check(true));
    } catch (err) {
      console.warn('[consisto] service worker registration failed', err);
    }
  });
}

registerServiceWorker();
