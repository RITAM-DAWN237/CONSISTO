import { useEffect, useMemo, useState } from 'react';
import { Archive, ArchiveRestore, FileText, Folder, LayoutGrid, List, NotebookPen, Pin, PinOff, Plus, Search, Star, StickyNote, Trash2 } from 'lucide-react';
import type { Note } from '../types';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { epochToKey, formatDateKey, timeAgo } from '../lib/dates';
import { cn, hexToRgba } from '../lib/utils';
import { navigate, useRoute } from '../hooks';
import { PageHeader } from '../components/Layout';
import { Button, Card, CategoryChip, EmptyState, inputClass, Menu } from '../components/ui';

type Sort = 'updated' | 'created' | 'title';

export default function NotesPage() {
  const data = useData();
  const ui = useUI();
  const { params } = useRoute();
  const wantsNew = params.get('new');
  const [q, setQ] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<Sort>('updated');

  useEffect(() => {
    if (wantsNew === 'note') {
      ui.openNote(data.createNote({ type: 'detailed' }));
      navigate('/notes');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  const create = (type: 'quick' | 'detailed') => ui.openNote(data.createNote({ type }));

  const { folders, tags, cats } = useMemo(() => {
    const f = new Set<string>();
    const t = new Set<string>();
    const c = new Set<string>();
    data.notes.forEach((n) => {
      if (n.folder) f.add(n.folder);
      n.tags.forEach((x) => t.add(x));
      if (n.categoryId) c.add(n.categoryId);
    });
    return { folders: [...f].sort(), tags: [...t].sort(), cats: [...c] };
  }, [data.notes]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.notes
      .filter((n) => (filter === 'archived' ? n.archived : !n.archived))
      .filter((n) => {
        if (filter === 'pinned') return n.pinned;
        if (filter === 'favourites') return n.favourite;
        if (filter === 'quick' || filter === 'detailed') return n.type === filter;
        if (filter.startsWith('cat:')) return n.categoryId === filter.slice(4);
        if (filter.startsWith('folder:')) return n.folder === filter.slice(7);
        if (filter.startsWith('tag:')) return n.tags.includes(filter.slice(4));
        return true;
      })
      .filter((n) => !s || `${n.title} ${n.text} ${n.tags.join(' ')} ${n.folder}`.toLowerCase().includes(s))
      .sort((a, b) => (sort === 'title' ? (a.title || '~').localeCompare(b.title || '~') : sort === 'created' ? b.createdAtMs - a.createdAtMs : b.updatedAtMs - a.updatedAtMs));
  }, [data.notes, filter, q, sort]);

  const sectioned = filter === 'all' && !q.trim();
  const pinned = sectioned ? filtered.filter((n) => n.pinned) : [];
  const rest = sectioned ? filtered.filter((n) => !n.pinned) : filtered;
  const recent = sectioned ? [...rest].sort((a, b) => b.updatedAtMs - a.updatedAtMs).slice(0, 4) : [];
  const recentIds = new Set(recent.map((n) => n.id));
  const others = sectioned ? rest.filter((n) => !recentIds.has(n.id)) : rest;

  const chips: { id: string; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'pinned', label: '📌 Pinned' },
    { id: 'favourites', label: '⭐ Favourites' },
    { id: 'quick', label: 'Quick' },
    { id: 'detailed', label: 'Detailed' },
    ...cats.map((id) => ({ id: `cat:${id}`, label: `${data.categoryMap.get(id)?.icon ?? ''} ${data.categoryMap.get(id)?.name ?? 'Category'}` })),
    ...folders.map((f) => ({ id: `folder:${f}`, label: `📁 ${f}` })),
    ...tags.map((t) => ({ id: `tag:${t}`, label: `#${t}` })),
    { id: 'archived', label: 'Archived' },
  ];

  const grid = (list: Note[]) =>
    view === 'grid' ? (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((n) => (
          <NoteCard key={n.id} note={n} />
        ))}
      </div>
    ) : (
      <Card className="divide-y divide-line">
        {list.map((n) => (
          <NoteCard key={n.id} note={n} list />
        ))}
      </Card>
    );

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle="Quick ideas and detailed study notes — autosaved and synced"
        actions={
          <>
            <Button variant="secondary" icon={<StickyNote />} onClick={() => create('quick')}>
              Quick note
            </Button>
            <Button icon={<Plus />} onClick={() => create('detailed')}>
              New note
            </Button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes, tags, folders…" aria-label="Search notes" className={cn(inputClass, 'pl-9')} />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort notes" className={cn(inputClass, 'w-auto')}>
          <option value="updated">Last edited</option>
          <option value="created">Date created</option>
          <option value="title">Title A–Z</option>
        </select>
        <div className="flex rounded-xl border border-line bg-card-2 p-1">
          <button aria-label="Grid view" aria-pressed={view === 'grid'} onClick={() => setView('grid')} className={cn('grid h-8 w-8 place-items-center rounded-lg', view === 'grid' ? 'bg-accent text-accent-fg' : 'text-muted')}>
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button aria-label="List view" aria-pressed={view === 'list'} onClick={() => setView('list')} className={cn('grid h-8 w-8 place-items-center rounded-lg', view === 'list' ? 'bg-accent text-accent-fg' : 'text-muted')}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        {chips.map((c) => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition', filter === c.id ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-card-2 text-muted hover:text-fg')}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<NotebookPen />}
            title={data.notes.length ? 'No notes match' : 'Your notes workspace is empty'}
            message={data.notes.length ? 'Try a different search or filter.' : 'Capture quick ideas or write detailed study notes with headings, checklists and code blocks.'}
            action={!data.notes.length && <Button icon={<Plus />} onClick={() => create('detailed')}>Create your first note</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Pin className="h-3.5 w-3.5" /> Pinned
              </h2>
              {grid(pinned)}
            </section>
          )}
          {recent.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Recently edited</h2>
              {grid(recent)}
            </section>
          )}
          {others.length > 0 && (
            <section>
              {sectioned && <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">All notes</h2>}
              {grid(others)}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function NoteCard({ note, list }: { note: Note; list?: boolean }) {
  const data = useData();
  const ui = useUI();
  const cat = data.categoryMap.get(note.categoryId);
  const remove = async () => {
    const ok = await ui.confirm({ title: 'Delete this note?', message: `"${note.title || 'Untitled note'}" will be permanently deleted.`, confirmText: 'Delete', danger: true });
    if (ok) data.deleteNote(note.id);
  };
  const menu = (
    <Menu
      items={[
        { label: note.pinned ? 'Unpin' : 'Pin', icon: note.pinned ? <PinOff /> : <Pin />, onClick: () => data.updateNote(note.id, { pinned: !note.pinned }) },
        { label: note.favourite ? 'Remove favourite' : 'Favourite', icon: <Star />, onClick: () => data.updateNote(note.id, { favourite: !note.favourite }) },
        note.archived
          ? { label: 'Unarchive', icon: <ArchiveRestore />, onClick: () => data.updateNote(note.id, { archived: false }) }
          : { label: 'Archive', icon: <Archive />, onClick: () => data.updateNote(note.id, { archived: true }) },
        { label: 'Delete', icon: <Trash2 />, onClick: remove, danger: true },
      ]}
    />
  );
  const icon = note.type === 'quick' ? <StickyNote className="h-4 w-4 shrink-0 text-warn" /> : <FileText className="h-4 w-4 shrink-0 text-info" />;
  if (list) {
    return (
      <div role="button" tabIndex={0} onClick={() => ui.openNote(note.id)} onKeyDown={(e) => e.key === 'Enter' && ui.openNote(note.id)} className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-fg/[0.04] transition-colors duration-150">
        {icon}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{note.title || 'Untitled note'}</p>
          <p className="truncate text-xs text-muted">{note.text || 'Empty note'}</p>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          {cat && <CategoryChip category={cat} />}
          {note.folder && <span className="text-[11px] text-faint">📁 {note.folder}</span>}
        </div>
        {note.pinned && <Pin className="h-3.5 w-3.5 text-accent" />}
        {note.favourite && <Star className="h-3.5 w-3.5 fill-current text-warn" />}
        <span className="hidden w-16 text-right text-[11px] text-faint sm:block">{timeAgo(note.updatedAtMs)}</span>
        {menu}
      </div>
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => ui.openNote(note.id)}
      onKeyDown={(e) => e.key === 'Enter' && ui.openNote(note.id)}
      className="card group flex min-h-[150px] cursor-pointer flex-col p-4 transition-all duration-200 hover:-translate-y-1 hover:border-line-strong hover:shadow-lg active:scale-[0.99]"
      style={note.color ? { borderLeft: `3px solid ${note.color}`, background: `linear-gradient(180deg, ${hexToRgba(note.color, 0.08)}, var(--card) 60%)` } : undefined}
    >
      <div className="flex items-start gap-2">
        {icon}
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{note.title || 'Untitled note'}</p>
        {note.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-accent" />}
        {note.favourite && <Star className="h-3.5 w-3.5 shrink-0 fill-current text-warn" />}
        <div className="-mr-2 -mt-2">{menu}</div>
      </div>
      <p className="mt-1.5 line-clamp-4 flex-1 whitespace-pre-line text-xs leading-relaxed text-muted">{note.text || 'Empty note'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {cat && <CategoryChip category={cat} />}
        {note.folder && (
          <span className="inline-flex items-center gap-1 text-[11px] text-faint">
            <Folder className="h-3 w-3" />
            {note.folder}
          </span>
        )}
        {note.tags.slice(0, 2).map((t) => (
          <span key={t} className="text-[11px] font-medium text-accent">
            #{t}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-faint">{formatDateKey(epochToKey(note.updatedAtMs || note.createdAtMs, data.prefs.timezone), 'short')}</span>
      </div>
    </div>
  );
}
