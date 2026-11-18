import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, BellRing, CheckCircle2, Flame, Info, Trophy, X, XCircle } from 'lucide-react';
import type { RepeatType, Task } from '../types';
import { Button } from '../components/ui';
import { cn } from '../lib/utils';
import { playSound } from '../lib/sounds';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'reminder';

export interface ToastInput {
  type: ToastType;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number;
}
interface Toast extends ToastInput {
  id: number;
}

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface CelebrationData {
  title: string;
  subtitle: string;
  kind: 'streak' | 'achievement';
  value?: number;
}

export interface TaskDefaults {
  startDate?: string;
  startTime?: number | null;
  endTime?: number | null;
  categoryId?: string;
  type?: RepeatType;
}

export type ModalState =
  | { type: 'task-editor'; task?: Task; defaults?: TaskDefaults }
  | { type: 'task-details'; taskId: string; dateKey?: string }
  | { type: 'note'; noteId: string }
  | null;

interface UICtx {
  toast(t: ToastInput): void;
  dismissToast(id: number): void;
  confirm(o: ConfirmOptions): Promise<boolean>;
  celebrate(c: CelebrationData): void;
  modal: ModalState;
  openTaskEditor(task?: Task, defaults?: TaskDefaults): void;
  openTaskDetails(taskId: string, dateKey?: string): void;
  openNote(noteId: string): void;
  closeModal(): void;
}

const Ctx = createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const [celebrations, setCelebrations] = useState<CelebrationData[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const idRef = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const toast = useCallback(
    (t: ToastInput) => {
      const id = idRef.current++;
      setToasts((list) => [...list.slice(-3), { ...t, id }]);
      const duration = t.duration ?? (t.type === 'error' ? 6000 : t.action ? 8000 : 3500);
      window.setTimeout(() => dismissToast(id), duration);
    },
    [dismissToast]
  );

  const confirm = useCallback((o: ConfirmOptions) => {
    setConfirmState(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const closeConfirm = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  };

  const celebrate = useCallback((c: CelebrationData) => setCelebrations((q) => [...q, c]), []);

  const value = useMemo<UICtx>(
    () => ({
      toast,
      dismissToast,
      confirm,
      celebrate,
      modal,
      openTaskEditor: (task, defaults) => setModal({ type: 'task-editor', task, defaults }),
      openTaskDetails: (taskId, dateKey) => setModal({ type: 'task-details', taskId, dateKey }),
      openNote: (noteId) => setModal({ type: 'note', noteId }),
      closeModal: () => setModal(null),
    }),
    [toast, dismissToast, confirm, celebrate, modal]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
      {confirmState && <ConfirmDialog opts={confirmState} onClose={closeConfirm} />}
      {celebrations[0] && <Celebration data={celebrations[0]} onClose={() => setCelebrations((q) => q.slice(1))} />}
    </Ctx.Provider>
  );
}

export function useUI(): UICtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useUI must be used inside UIProvider');
  return c;
}

// ─── Toaster ───────────────────────────────────────────────────
const TOAST_ICON = {
  success: <CheckCircle2 className="h-5 w-5 text-ok" />,
  error: <XCircle className="h-5 w-5 text-bad" />,
  info: <Info className="h-5 w-5 text-info" />,
  warning: <AlertTriangle className="h-5 w-5 text-warn" />,
  reminder: <BellRing className="h-5 w-5 text-accent" />,
};

function Toaster({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[90] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:w-96"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-card-2/95 p-3.5 shadow-2xl backdrop-blur animate-toast-in',
            t.type === 'reminder' && 'border-accent/40'
          )}
        >
          <div className="mt-0.5 shrink-0">{TOAST_ICON[t.type]}</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{t.title}</p>
            {t.message && <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.message}</p>}
            {t.action && (
              <button
                className="mt-2 rounded-lg bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/25"
                onClick={() => {
                  t.action?.onClick();
                  onDismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
          <button aria-label="Dismiss" onClick={() => onDismiss(t.id)} className="rounded-lg p-1 text-faint hover:bg-fg/5 hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

// ─── Confirm dialog ────────────────────────────────────────────
function ConfirmDialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-end justify-center p-0 sm:items-center sm:p-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={() => onClose(false)} />
      <div className="relative w-full max-w-md rounded-t-3xl border border-line bg-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl animate-slide-up sm:rounded-2xl sm:pb-6">
        <div className="flex items-start gap-3">
          <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', opts.danger ? 'bg-bad/15 text-bad' : 'bg-accent/15 text-accent')}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg">{opts.title}</h2>
            {opts.message && <p className="mt-1 text-sm leading-relaxed text-muted">{opts.message}</p>}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => onClose(false)}>
            {opts.cancelText ?? 'Cancel'}
          </Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => onClose(true)} autoFocus>
            {opts.confirmText ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Milestone celebration ─────────────────────────────────────
const CONFETTI_COLORS = ['var(--accent)', '#22c55e', '#f59e0b', '#ec4899', '#60a5fa', '#fde047'];

function Celebration({ data, onClose }: { data: CelebrationData; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        size: 6 + Math.random() * 6,
      })),
    []
  );
  useEffect(() => {
    playSound('success', 0.9);
  }, []);
  return createPortal(
    <div className="fixed inset-0 z-[96] grid place-items-center p-6" role="dialog" aria-modal="true" aria-label={data.title}>
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              background: p.color,
              width: p.size,
              height: p.size * 0.45,
              transform: `rotate(${p.rotate}deg)`,
            }}
          />
        ))}
      </div>
      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-accent/30 bg-card p-7 text-center shadow-2xl animate-scale-in">
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-accent/25 to-transparent" />
        <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent/15 ring-8 ring-accent/10 animate-float">
          {data.kind === 'streak' ? <Flame className="h-10 w-10 text-orange-400" /> : <Trophy className="h-10 w-10 text-amber-400" />}
        </div>
        {data.value != null && <p className="relative mt-4 text-5xl font-extrabold tracking-tight text-fg">{data.value}</p>}
        <h2 className="relative mt-2 text-xl font-bold text-fg">{data.title}</h2>
        <p className="relative mt-2 text-sm leading-relaxed text-muted">{data.subtitle}</p>
        <Button className="relative mt-6 w-full" onClick={onClose}>
          Keep going
        </Button>
      </div>
    </div>,
    document.body
  );
}
