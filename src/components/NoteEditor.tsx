import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Bold,
  CloudOff,
  Code,
  Code2,
  Copy,
  FileText,
  Folder,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Pin,
  PinOff,
  Quote,
  Redo2,
  Star,
  StickyNote,
  Strikethrough,
  Tag,
  Trash2,
  Underline,
  Undo2,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import type { Note } from '../types';
import { useData } from '../context/DataContext';
import { useUI } from '../context/UIContext';
import { NOTE_COLORS } from '../constants';
import { timeAgo } from '../lib/dates';
import { cn, getDeviceId, hexToRgba, htmlToText, isSafeUrl, sanitizeHtml } from '../lib/utils';
import { Button, EmptyState, inputClass, Menu, Modal, Spinner } from './ui';

type SaveStatus = 'saved' | 'saving' | 'offline';

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function NoteEditor({ noteId, onClose }: { noteId: string; onClose: () => void }) {
  const data = useData();
  const note = data.notes.find((n) => n.id === noteId);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 4000);
    return () => window.clearTimeout(t);
  }, []);
  if (!note) {
    return (
      <Modal open onClose={onClose} size="sm" label="Note">
        {timedOut ? (
          <EmptyState title="Note not found" message="It may have been deleted on another device." action={<Button onClick={onClose}>Close</Button>} />
        ) : (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        )}
      </Modal>
    );
  }
  return <NoteEditorBody key={`${note.id}-${note.type}`} note={note} onClose={onClose} />;
}

function NoteEditorBody({ note, onClose }: { note: Note; onClose: () => void }) {
  const data = useData();
  const ui = useUI();
  const draft = data.noteDrafts[note.id];
  const baseRev = useRef(draft ? draft.baseRev : note.rev);
  const dirty = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const titleRef = useRef(note.title);
  const quickRef = useRef(note.type === 'quick' ? note.content : '');
  const [title, setTitle] = useState(note.title);
  const [quickText, setQuickText] = useState(note.type === 'quick' ? note.content : '');
  const [status, setStatus] = useState<SaveStatus>(draft ? 'offline' : 'saved');
  const [conflict, setConflict] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const getContent = useCallback(() => {
    if (note.type === 'quick') return { content: quickRef.current, text: quickRef.current };
    const html = sanitizeHtml(editorRef.current?.getHTML() ?? note.content);
    return { content: html, text: htmlToText(html) };
  }, [note.type, note.content]);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!dirty.current) return;
    const { content, text } = getContent();
    const r = data.saveNoteContent(note.id, { title: titleRef.current, content, text }, baseRev.current);
    baseRev.current = r.rev;
    dirty.current = false;
    setStatus(r.mode === 'online' ? 'saved' : 'offline');
  }, [data, note.id, getContent]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus('saving');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 900);
  }, [flush]);

  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true, defaultProtocol: 'https' } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Placeholder.configure({ placeholder: 'Start writing… Markdown shortcuts work: # heading, - list, 1. list, [ ] checklist, ``` code, > quote' }),
      ],
      content: note.type === 'detailed' ? sanitizeHtml(note.content) : '',
      editorProps: { attributes: { class: 'prose-note focus:outline-none', 'aria-label': 'Note content' } },
      onUpdate: () => schedule(),
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
    },
    [note.id]
  );
  editorRef.current = editor;

  // Remote changes from another device.
  useEffect(() => {
    if (note.rev > baseRev.current && note.lastDevice !== getDeviceId()) {
      if (dirty.current) setConflict(true);
      else {
        baseRev.current = note.rev;
        loadRemote(note);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.rev, note.lastDevice]);

  const loadRemote = (n: Note) => {
    titleRef.current = n.title;
    setTitle(n.title);
    if (n.type === 'quick') {
      quickRef.current = n.content;
      setQuickText(n.content);
    } else editorRef.current?.commands.setContent(sanitizeHtml(n.content), { emitUpdate: false });
  };

  const resolve = (choice: 'mine' | 'theirs' | 'copy') => {
    if (choice === 'copy') {
      const { content, text } = getContent();
      data.createNote({ type: note.type, title: `${titleRef.current || 'Untitled'} (my copy)`, content, text, folder: note.folder, tags: note.tags, categoryId: note.categoryId });
      ui.toast({ type: 'success', title: 'Your version was saved as a copy' });
    }
    baseRev.current = note.rev;
    if (choice === 'mine') {
      dirty.current = true;
      flush();
    } else {
      dirty.current = false;
      window.clearTimeout(timer.current);
      loadRemote(note);
      setStatus('saved');
    }
    setConflict(false);
  };

  const remove = async () => {
    const ok = await ui.confirm({ title: 'Delete this note?', message: 'This permanently deletes the note on all devices.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    dirty.current = false;
    window.clearTimeout(timer.current);
    data.deleteNote(note.id);
    ui.toast({ type: 'success', title: 'Note deleted' });
    onClose();
  };

  const convert = () => {
    flush();
    const html = quickRef.current
      .split('\n')
      .map((l) => `<p>${escapeHtml(l)}</p>`)
      .join('');
    data.updateNote(note.id, { type: 'detailed', content: sanitizeHtml(html), text: quickRef.current });
  };

  const accent = note.color || '';

  return (
    <Modal open onClose={onClose} variant="full" size="xl" label={title || 'Note'}>
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 pt-[env(safe-area-inset-top)] md:h-16 md:px-4 md:pt-0">
        <button onClick={onClose} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-xl text-muted hover:bg-fg/[0.06] hover:text-fg">
          <ArrowLeft className="h-5 w-5 md:hidden" />
          <X className="hidden h-5 w-5 md:block" />
        </button>
        <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-fg/[0.06] px-2.5 py-1 text-[11px] font-semibold text-muted">
          {note.type === 'quick' ? <StickyNote className="h-3.5 w-3.5 text-warn" /> : <FileText className="h-3.5 w-3.5 text-info" />}
          {note.type === 'quick' ? 'Quick note' : 'Detailed note'}
        </span>
        <SaveIndicator status={status} updatedAt={note.updatedAtMs} />
        <div className="ml-auto flex items-center gap-0.5">
          <IconToggle label={note.pinned ? 'Unpin' : 'Pin'} active={note.pinned} onClick={() => data.updateNote(note.id, { pinned: !note.pinned })}>
            {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </IconToggle>
          <IconToggle label={note.favourite ? 'Remove favourite' : 'Favourite'} active={note.favourite} onClick={() => data.updateNote(note.id, { favourite: !note.favourite })}>
            <Star className={cn('h-4 w-4', note.favourite && 'fill-current')} />
          </IconToggle>
          <Menu
            items={[
              note.type === 'quick' && { label: 'Convert to detailed note', icon: <FileText />, onClick: convert },
              {
                label: 'Copy text',
                icon: <Copy />,
                onClick: () => {
                  void navigator.clipboard?.writeText(getContent().text);
                  ui.toast({ type: 'success', title: 'Copied to clipboard' });
                },
              },
              note.archived
                ? { label: 'Unarchive', icon: <ArchiveRestore />, onClick: () => data.updateNote(note.id, { archived: false }) }
                : { label: 'Archive', icon: <Archive />, onClick: () => { data.updateNote(note.id, { archived: true }); onClose(); } },
              { label: 'Delete note', icon: <Trash2 />, onClick: remove, danger: true },
            ]}
          />
        </div>
      </div>

      {conflict && (
        <div className="flex flex-wrap items-center gap-2 border-b border-warn/30 bg-warn/10 px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-warn" />
          <span className="flex-1 text-fg">This note was changed on another device while you were editing.</span>
          <Button size="sm" variant="secondary" onClick={() => resolve('theirs')}>
            Load theirs
          </Button>
          <Button size="sm" variant="secondary" onClick={() => resolve('copy')}>
            Save mine as copy
          </Button>
          <Button size="sm" onClick={() => resolve('mine')}>
            Keep mine
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto" style={accent ? { background: `linear-gradient(180deg, ${hexToRgba(accent, 0.07)}, transparent 240px)` } : undefined}>
        <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8">
          <input
            value={title}
            maxLength={200}
            placeholder="Untitled"
            aria-label="Note title"
            onChange={(e) => {
              setTitle(e.target.value);
              titleRef.current = e.target.value;
              schedule();
            }}
            className="w-full bg-transparent text-2xl font-bold tracking-tight text-fg placeholder:text-faint outline-none md:text-3xl"
          />
          <NoteMeta note={note} />
          {note.type === 'quick' ? (
            <textarea
              value={quickText}
              autoFocus={!quickText}
              placeholder="Jot down a quick idea…"
              aria-label="Quick note text"
              onChange={(e) => {
                setQuickText(e.target.value);
                quickRef.current = e.target.value;
                schedule();
              }}
              className="mt-4 min-h-[45vh] w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg placeholder:text-faint outline-none"
            />
          ) : (
            editor && (
              <>
                <Toolbar editor={editor} />
                <EditorContent editor={editor} className="mt-3 min-h-[45vh]" />
              </>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}

function SaveIndicator({ status, updatedAt }: { status: SaveStatus; updatedAt: number }) {
  if (status === 'saving')
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-faint">
        <Loader2 className="h-3 w-3 animate-spin" /> Saving…
      </span>
    );
  if (status === 'offline')
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-warn" title="Saved on this device. It will sync safely when you're back online.">
        <CloudOff className="h-3 w-3" /> Saved offline
      </span>
    );
  return (
    <span className="ml-2 hidden items-center gap-1 text-[11px] text-faint sm:inline-flex">
      <Check className="h-3 w-3 text-ok" /> Saved {updatedAt ? timeAgo(updatedAt) : ''}
    </span>
  );
}

function IconToggle({ label, active, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-label={label} title={label} aria-pressed={active} onClick={onClick} className={cn('grid h-9 w-9 place-items-center rounded-lg transition', active ? 'text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}>
      {children}
    </button>
  );
}

function NoteMeta({ note }: { note: Note }) {
  const data = useData();
  const [tagInput, setTagInput] = useState('');
  const [folder, setFolder] = useState(note.folder);
  const folders = useMemo(() => [...new Set(data.notes.map((n) => n.folder).filter(Boolean))].sort(), [data.notes]);
  const linkable = data.tasks.filter((t) => !note.linkedTaskIds.includes(t.id) && t.status !== 'archived');

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '').toLowerCase().slice(0, 24);
    if (!t || note.tags.includes(t) || note.tags.length >= 10) {
      setTagInput('');
      return;
    }
    data.updateNote(note.id, { tags: [...note.tags, t] });
    setTagInput('');
  };

  return (
    <div className="mt-3 space-y-2.5 border-b border-line pb-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 rounded-lg border border-line bg-card-2 px-2 py-1">
          <Folder className="h-3.5 w-3.5 text-faint" />
          <input
            list={`folders-${note.id}`}
            value={folder}
            maxLength={40}
            placeholder="No folder"
            aria-label="Folder"
            onChange={(e) => setFolder(e.target.value)}
            onBlur={() => folder.trim() !== note.folder && data.updateNote(note.id, { folder: folder.trim() })}
            className="w-28 bg-transparent text-xs text-fg placeholder:text-faint outline-none"
          />
          <datalist id={`folders-${note.id}`}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <select
          value={note.categoryId}
          aria-label="Category"
          onChange={(e) => data.updateNote(note.id, { categoryId: e.target.value })}
          className="rounded-lg border border-line bg-card-2 px-2 py-1 text-xs text-fg outline-none"
        >
          <option value="">No category</option>
          {data.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Note colour">
          {NOTE_COLORS.map((c) => (
            <button
              key={c || 'none'}
              role="radio"
              aria-checked={note.color === c}
              aria-label={c ? `Colour ${c}` : 'No colour'}
              onClick={() => data.updateNote(note.id, { color: c })}
              className={cn('h-5 w-5 rounded-full border border-line', note.color === c && 'ring-2 ring-fg ring-offset-1 ring-offset-card')}
              style={{ background: c || 'transparent' }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Tag className="h-3.5 w-3.5 text-faint" />
        {note.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-md bg-accent/12 px-2 py-0.5 text-xs font-medium text-accent">
            #{t}
            <button aria-label={`Remove tag ${t}`} onClick={() => data.updateNote(note.id, { tags: note.tags.filter((x) => x !== t) })} className="opacity-70 hover:opacity-100">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          placeholder="Add tag…"
          aria-label="Add tag"
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addTag();
            }
          }}
          onBlur={addTag}
          className="w-24 bg-transparent text-xs text-fg placeholder:text-faint outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-faint" />
        {note.linkedTaskIds.map((id) => {
          const t = data.taskMap.get(id);
          if (!t) return null;
          return (
            <span key={id} className="inline-flex items-center gap-1 rounded-md bg-fg/[0.06] px-2 py-0.5 text-xs text-fg">
              {t.title}
              <button aria-label={`Unlink ${t.title}`} onClick={() => data.updateNote(note.id, { linkedTaskIds: note.linkedTaskIds.filter((x) => x !== id) })} className="text-faint hover:text-fg">
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {linkable.length > 0 && (
          <select
            value=""
            aria-label="Link a task"
            onChange={(e) => e.target.value && data.updateNote(note.id, { linkedTaskIds: [...note.linkedTaskIds, e.target.value] })}
            className="rounded-md bg-transparent px-1 py-0.5 text-xs text-muted outline-none"
          >
            <option value="">+ Link task</option>
            {linkable.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [url, setUrl] = useState('');
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      code: e.isActive('code'),
      codeBlock: e.isActive('codeBlock'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const applyLink = () => {
    let href = url.trim();
    if (!href) {
      chain().extendMarkRange('link').unsetLink().run();
    } else {
      if (!/^[a-z]+:/i.test(href)) href = `https://${href}`;
      if (isSafeUrl(href)) chain().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkOpen(false);
    setUrl('');
  };
  const B = ({ on, label, onClick, children, disabled }: { on?: boolean; label: string; onClick: () => void; children: ReactNode; disabled?: boolean }) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg transition disabled:opacity-30', on ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-fg/[0.06] hover:text-fg')}
    >
      {children}
    </button>
  );
  const sep = <span className="mx-0.5 h-5 w-px shrink-0 bg-line" />;
  const ic = 'h-4 w-4';
  return (
    <div className="sticky top-0 z-10 -mx-1 mt-3 rounded-xl border border-line bg-card/95 px-1 py-1 backdrop-blur">
      <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
        <B label="Heading 1" on={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}><Heading1 className={ic} /></B>
        <B label="Heading 2" on={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className={ic} /></B>
        <B label="Heading 3" on={s.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className={ic} /></B>
        {sep}
        <B label="Bold" on={s.bold} onClick={() => chain().toggleBold().run()}><Bold className={ic} /></B>
        <B label="Italic" on={s.italic} onClick={() => chain().toggleItalic().run()}><Italic className={ic} /></B>
        <B label="Underline" on={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline className={ic} /></B>
        <B label="Strikethrough" on={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough className={ic} /></B>
        {sep}
        <B label="Bullet list" on={s.bullet} onClick={() => chain().toggleBulletList().run()}><List className={ic} /></B>
        <B label="Numbered list" on={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className={ic} /></B>
        <B label="Checklist" on={s.task} onClick={() => chain().toggleTaskList().run()}><ListChecks className={ic} /></B>
        {sep}
        <B label="Inline code" on={s.code} onClick={() => chain().toggleCode().run()}><Code className={ic} /></B>
        <B label="Code block" on={s.codeBlock} onClick={() => chain().toggleCodeBlock().run()}><Code2 className={ic} /></B>
        <B label="Quote" on={s.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className={ic} /></B>
        <B
          label="Link"
          on={s.link || linkOpen}
          onClick={() => {
            setUrl((editor.getAttributes('link').href as string) ?? '');
            setLinkOpen((o) => !o);
          }}
        >
          <Link2 className={ic} />
        </B>
        {sep}
        <B label="Undo" disabled={!s.canUndo} onClick={() => chain().undo().run()}><Undo2 className={ic} /></B>
        <B label="Redo" disabled={!s.canRedo} onClick={() => chain().redo().run()}><Redo2 className={ic} /></B>
      </div>
      {linkOpen && (
        <div className="flex items-center gap-2 border-t border-line px-1 pb-1 pt-2">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                applyLink();
              }
              if (e.key === 'Escape') setLinkOpen(false);
            }}
            placeholder="https://example.com (leave empty to remove)"
            className={cn(inputClass, 'py-1.5 text-xs')}
          />
          <Button size="sm" onClick={applyLink}>
            Apply
          </Button>
        </div>
      )}
    </div>
  );
}
