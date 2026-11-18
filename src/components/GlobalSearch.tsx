import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText, ListChecks, Search, StickyNote, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { useClickOutside } from '../hooks';
import { currentVersion, describeRecurrence } from '../lib/recurrence';
import { cn } from '../lib/utils';

export function GlobalSearch({ autoFocus, onDone, className }: { autoFocus?: boolean; onDone?: () => void; className?: string }) {
  const data = useData();
  const ui = useUI();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [autoFocus]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return { tasks: [], notes: [] };
    return {
      tasks: data.tasks
        .filter((t) => `${t.title} ${t.description} ${data.categoryMap.get(t.categoryId)?.name ?? ''}`.toLowerCase().includes(s))
        .slice(0, 6),
      notes: data.notes.filter((n) => `${n.title} ${n.text} ${n.tags.join(' ')} ${n.folder}`.toLowerCase().includes(s)).slice(0, 6),
    };
  }, [q, data.tasks, data.notes, data.categoryMap]);

  const pick = (fn: () => void) => {
    fn();
    setQ('');
    setOpen(false);
    onDone?.();
  };
  const hasQuery = q.trim().length > 0;
  const empty = hasQuery && !results.tasks.length && !results.notes.length;

  return (
    <div ref={ref} className={cn('relative w-full', className)}>
      <div className="flex h-10 items-center gap-2 rounded-xl border border-line bg-card-2 px-3 transition focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
        <Search className="h-4 w-4 shrink-0 text-faint" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setQ('');
              setOpen(false);
              onDone?.();
            }
          }}
          placeholder="Search tasks, notes…"
          aria-label="Search tasks and notes"
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-faint outline-none"
        />
        {q ? (
          <button aria-label="Clear search" onClick={() => setQ('')} className="rounded p-0.5 text-faint hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        ) : (
          <kbd className="hidden rounded-md border border-line px-1.5 py-0.5 text-[10px] font-semibold text-faint lg:inline">Ctrl K</kbd>
        )}
      </div>
      {open && hasQuery && (
        <div className="absolute inset-x-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-card-2 p-2 shadow-2xl animate-scale-in">
          {empty && <p className="px-3 py-6 text-center text-sm text-muted">No tasks or notes match “{q}”.</p>}
          {results.tasks.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Tasks</p>}
          {results.tasks.map((t) => (
            <button
              key={t.id}
              onClick={() => pick(() => ui.openTaskDetails(t.id))}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-fg/[0.06]"
            >
              <ListChecks className="h-4 w-4 shrink-0 text-accent" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{t.title}</span>
                <span className="block truncate text-xs text-muted">{describeRecurrence(currentVersion(t))}</span>
              </span>
              {t.status !== 'active' && <span className="text-[10px] font-semibold uppercase text-faint">{t.status}</span>}
            </button>
          ))}
          {results.notes.length > 0 && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-faint">Notes</p>}
          {results.notes.map((n) => (
            <button key={n.id} onClick={() => pick(() => ui.openNote(n.id))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-fg/[0.06]">
              {n.type === 'quick' ? <StickyNote className="h-4 w-4 shrink-0 text-warn" /> : <FileText className="h-4 w-4 shrink-0 text-info" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{n.title || 'Untitled note'}</span>
                <span className="block truncate text-xs text-muted">{n.text || 'Empty note'}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
