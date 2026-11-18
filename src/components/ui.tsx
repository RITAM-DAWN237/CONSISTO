// Shared UI primitives (design system).
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Code2,
  Crown,
  Dumbbell,
  Flame,
  GraduationCap,
  Loader2,
  Medal,
  MoonStar,
  MoreHorizontal,
  NotebookPen,
  Star,
  Sunrise,
  Swords,
  Target,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { Category, Tone } from '../types';
import { clamp, cn, hexToRgba, initials } from '../lib/utils';
import { useClickOutside } from '../hooks';

// ─── Button ────────────────────────────────────────────────────
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-accent to-accent-strong text-accent-fg hover:brightness-110 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_20px_-6px_var(--accent)] border border-white/10 active:scale-[0.98]',
  secondary: 'bg-card-2/90 backdrop-blur-sm text-fg border border-line hover:border-line-strong hover:bg-card-2 shadow-xs active:scale-[0.98]',
  ghost: 'text-muted hover:text-fg hover:bg-fg/[0.06] active:scale-[0.98]',
  danger: 'bg-gradient-to-r from-bad to-red-600 text-white hover:brightness-110 shadow-[0_8px_20px_-6px_rgba(239,68,68,0.5)] active:scale-[0.98]',
  soft: 'bg-accent/12 text-accent border border-accent/20 hover:bg-accent/22 active:scale-[0.98]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-sm gap-2 rounded-xl',
  icon: 'h-10 w-10 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold transition-all duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 [&>svg]:h-4 [&>svg]:w-4',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ─── Card ──────────────────────────────────────────────────────
export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  icon,
  title,
  subtitle,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 pb-3 pt-4 md:px-5', className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent ring-1 ring-accent/20 [&>svg]:h-4 [&>svg]:w-4">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-fg tracking-tight">{title}</h2>
          {subtitle && <p className="truncate text-xs text-muted/90">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function LinkAction({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = 'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/10';
  if (href)
    return (
      <a href={href} className={cls}>
        {children}
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Modal / bottom sheet ──────────────────────────────────────
export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  variant = 'sheet',
  label,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'sheet' | 'full';
  label?: string;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: 'md:max-w-md', md: 'md:max-w-xl', lg: 'md:max-w-2xl', xl: 'md:max-w-4xl' };
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px] animate-fade-in" onClick={onClose} />
      <div
        className={cn(
          'relative flex w-full flex-col overflow-hidden border-line bg-card/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/10',
          variant === 'full'
            ? 'h-[100dvh] animate-slide-up md:h-auto md:max-h-[90vh] md:rounded-2xl md:border md:animate-scale-in'
            : 'max-h-[92dvh] rounded-t-3xl border-t animate-slide-up md:max-h-[88vh] md:rounded-2xl md:border md:animate-scale-in',
          sizes[size],
          className
        )}
      >
        {variant === 'sheet' && <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-fg/15 md:hidden" />}
        {children}
      </div>
    </div>,
    document.body
  );
}

// ─── Form controls ─────────────────────────────────────────────
export const inputClass =
  'w-full rounded-xl border border-line bg-card-2/90 px-3.5 py-2.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-accent/60 focus:ring-2 focus:ring-accent/20 disabled:opacity-60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wide text-muted">
          {label}
        </label>
      )}
      {children}
      {error ? <p className="text-xs font-medium text-bad">{error}</p> : hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50',
        checked ? 'bg-accent shadow-[0_0_10px_var(--accent)]' : 'bg-fg/15'
      )}
    >
      <span className={cn('inline-block h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  className,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" className={cn('flex rounded-xl border border-line bg-card-2/80 backdrop-blur-sm p-1', className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 whitespace-nowrap rounded-lg font-semibold transition-all duration-150',
            size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-[13px]',
            o.value === value ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Status display ────────────────────────────────────────────
export const TONE: Record<Tone, string> = {
  ok: 'bg-ok/12 text-ok border border-ok/25',
  warn: 'bg-warn/12 text-warn border border-warn/25',
  bad: 'bg-bad/12 text-bad border border-bad/25',
  accent: 'bg-accent/12 text-accent border border-accent/25',
  muted: 'bg-fg/[0.05] text-muted border border-line',
  info: 'bg-info/12 text-info border border-info/25',
};

export function Pill({ tone = 'muted', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide [&>svg]:h-3 [&>svg]:w-3', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function ProgressBar({ value, className, color }: { value: number; className?: string; color?: string }) {
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-fg/10', className)}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${clamp(value, 0, 1) * 100}%`, background: color ?? 'var(--ok)' }} />
    </div>
  );
}

export function Ring({
  value,
  size = 120,
  stroke = 10,
  color = 'var(--ok)',
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp(value, 0, 1);
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="color-mix(in oklab, var(--fg) 10%, transparent)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, message, action, className }: { icon?: ReactNode; title: string; message?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-accent/10 text-accent [&>svg]:h-6 [&>svg]:w-6">{icon}</div>}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {message && <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-accent', className)} />;
}

export function Avatar({ name, photo, size = 36, className }: { name: string; photo?: string | null; size?: number; className?: string }) {
  // Falls back to initials if the image (e.g. a Google profile photo) fails to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (photo && photo !== failedSrc)
    return (
      <img
        src={photo}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(photo)}
        className={cn('shrink-0 rounded-full object-cover ring-2 ring-accent/30', className)}
        style={{ width: size, height: size }}
      />
    );
  return (
    <div className={cn('grid shrink-0 place-items-center rounded-full bg-accent font-bold text-accent-fg', className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </div>
  );
}

export function CategoryChip({ category, className }: { category?: Category; className?: string }) {
  if (!category) return null;
  return (
    <span
      className={cn('inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold', className)}
      style={{ background: hexToRgba(category.color, 0.14), color: category.color }}
    >
      <span aria-hidden>{category.icon}</span>
      {category.name}
    </span>
  );
}

// ─── Dropdown menu ─────────────────────────────────────────────
export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

export function Menu({ items, align = 'right', label = 'More options', button }: { items: (MenuItem | false | null)[]; align?: 'left' | 'right'; label?: string; button?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-fg/[0.06] hover:text-fg"
      >
        {button ?? <MoreHorizontal className="h-4 w-4" />}
      </button>
      {open && (
        <div role="menu" className={cn('absolute z-40 mt-1 min-w-[200px] rounded-xl border border-line bg-card-2/95 backdrop-blur-xl p-1 shadow-2xl ring-1 ring-white/10 animate-scale-in', align === 'right' ? 'right-0' : 'left-0')}>
          {items.filter((x): x is MenuItem => !!x).map((it, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors [&>span>svg]:h-4 [&>span>svg]:w-4', it.danger ? 'text-bad hover:bg-bad/12' : 'text-fg hover:bg-fg/[0.06]')}
            >
              {it.icon && <span>{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Achievement badge (hexagon) ───────────────────────────────
export const ACH_ICONS: Record<string, LucideIcon> = {
  check: CheckCircle2,
  flame: Flame,
  zap: Zap,
  medal: Medal,
  crown: Crown,
  sunrise: Sunrise,
  moon: MoonStar,
  swords: Swords,
  grad: GraduationCap,
  code: Code2,
  dumbbell: Dumbbell,
  book: BookOpen,
  star: Star,
  calendar: CalendarCheck,
  target: Target,
  notebook: NotebookPen,
};

export function HexBadge({ icon, colors, locked, size = 56 }: { icon: string; colors: [string, string]; locked?: boolean; size?: number }) {
  const gid = `hx${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const Icon = ACH_ICONS[icon] ?? Star;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size * 1.1 }}>
      <svg width={size} height={size * 1.1} viewBox="0 0 100 110" className="absolute inset-0" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={colors[0]} />
            <stop offset="1" stopColor={colors[1]} />
          </linearGradient>
        </defs>
        <path
          d="M50 5 L93 30 L93 80 L50 105 L7 80 L7 30 Z"
          fill={locked ? 'transparent' : `url(#${gid})`}
          fillOpacity={locked ? 0 : 0.2}
          stroke={locked ? 'var(--faint)' : `url(#${gid})`}
          strokeOpacity={locked ? 0.5 : 1}
          strokeWidth="5"
          strokeLinejoin="round"
        />
      </svg>
      <Icon className="relative" style={{ width: size * 0.4, height: size * 0.4, color: locked ? 'var(--faint)' : colors[0] }} />
    </div>
  );
}
