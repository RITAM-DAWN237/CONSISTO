// GitHub-style consistency heatmap (intensity = completed / scheduled occurrences).
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight, Palette } from 'lucide-react';
import type { HeatRange } from '../types';
import { useData, useStats } from '../context/DataContext';
import { HEATMAP_PALETTES } from '../constants';
import { aggregate, heatLevel, type HeatLevel } from '../lib/engine';
import { addDays, dayNum, formatDateKey, formatDuration, makeKey, MONTHS_SHORT, parseKey, rangeKeys, startOfWeek, WEEKDAYS_SHORT } from '../lib/dates';
import { navigate, useClickOutside } from '../hooks';
import { cn } from '../lib/utils';
import { Segmented } from './ui';

export function usePalette(): [string, string, string] {
  const { prefs } = useData();
  const p = HEATMAP_PALETTES.find((x) => x.id === prefs.heatmapPalette) ?? HEATMAP_PALETTES[0];
  return prefs.theme === 'light' ? p.light : p.dark;
}

export function levelStyle(level: HeatLevel, colors: [string, string, string]): CSSProperties {
  switch (level) {
    case 1:
      return { background: colors[0] };
    case 2:
      return { background: colors[1] };
    case 3:
      return { background: colors[2] };
    case 'missed':
      return { background: 'var(--heat-empty)', boxShadow: 'inset 0 0 0 1.5px var(--heat-missed)' };
    case 'pending':
      return { background: 'var(--heat-empty)', boxShadow: 'inset 0 0 0 1.5px color-mix(in oklab, var(--accent) 65%, transparent)' };
    case 'future':
      return { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line)' };
    case 'nodata':
      return { background: 'transparent' };
    default:
      return { background: 'var(--heat-empty)' };
  }
}

const RANGE_DAYS: Record<Exclude<HeatRange, 'year'>, number> = { '30d': 30, '3m': 91, '6m': 182, '12m': 365 };

export function PalettePicker({ value, onChange, theme }: { value: string; onChange: (id: string) => void; theme: string }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {HEATMAP_PALETTES.map((p) => {
        const c = theme === 'light' ? p.light : p.dark;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            aria-pressed={value === p.id}
            className={cn('rounded-xl border p-2 text-left transition', value === p.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong')}
          >
            <div className="flex gap-1">
              <span className="h-4 flex-1 rounded" style={{ background: 'var(--heat-empty)' }} />
              {c.map((col) => (
                <span key={col} className="h-4 flex-1 rounded" style={{ background: col }} />
              ))}
            </div>
            <p className="mt-1.5 truncate text-[11px] font-semibold text-muted">{p.name}</p>
          </button>
        );
      })}
    </div>
  );
}

export function HeatLegend({ colors, className }: { colors: [string, string, string]; className?: string }) {
  const items: [HeatLevel, string][] = [
    ['none', 'No tasks'],
    ['missed', 'Missed'],
    [1, 'Low'],
    [2, 'Moderate'],
    [3, 'High'],
  ];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted', className)}>
      {items.map(([lvl, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={levelStyle(lvl, colors)} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function Heatmap({ initialRange, showControls = true, compact }: { initialRange?: HeatRange; showControls?: boolean; compact?: boolean }) {
  const data = useData();
  const { dayStats, todayKey } = useStats();
  const [range, setRange] = useState<HeatRange>(initialRange ?? data.prefs.heatmapRange);
  const [year, setYear] = useState(() => parseKey(todayKey).y);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const colors = usePalette();
  const weekStart = data.prefs.weekStart;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useClickOutside(paletteRef, () => setPaletteOpen(false), paletteOpen);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { from, to } = useMemo(() => {
    if (range === 'year') return { from: makeKey(year, 1, 1), to: makeKey(year, 12, 31) };
    return { from: addDays(todayKey, -(RANGE_DAYS[range] - 1)), to: todayKey };
  }, [range, year, todayKey]);

  const gridStart = startOfWeek(from, weekStart);
  const weeks = Math.ceil((dayNum(to) - dayNum(gridStart) + 1) / 7);
  const labelW = 30;
  const gap = 3;
  const maxCell = range === '30d' ? 34 : range === '3m' ? 22 : 16;
  const cell = Math.max(10, Math.min(maxCell, Math.floor((width - labelW) / weeks) - gap));
  const columns = useMemo(
    () => Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d))),
    [weeks, gridStart]
  );
  const monthLabels = useMemo(() => {
    const out: { col: number; label: string }[] = [];
    let last = -1;
    columns.forEach((col, i) => {
      const firstInRange = col.find((k) => k >= from && k <= to);
      if (!firstInRange) return;
      const m = parseKey(firstInRange).m;
      if (m !== last && (i === 0 || col.some((k) => parseKey(k).d === 1))) {
        out.push({ col: i, label: MONTHS_SHORT[m - 1] });
        last = m;
      }
    });
    return out;
  }, [columns, from, to]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = range === 'year' && year < parseKey(todayKey).y ? 0 : scrollRef.current.scrollWidth;
  }, [range, year, cell, todayKey]);

  const totals = useMemo(() => {
    const keys = rangeKeys(from, to < todayKey ? to : todayKey).filter((k) => k >= data.windowStart);
    const a = aggregate(dayStats, keys);
    const active = keys.filter((k) => (dayStats.get(k)?.completed ?? 0) + (dayStats.get(k)?.countActivity ?? 0) > 0).length;
    return { ...a, active };
  }, [from, to, todayKey, dayStats, data.windowStart]);

  const minYear = parseKey(data.windowStart).y;
  const maxYear = parseKey(todayKey).y;
  const showAllLabels = cell >= 13;
  const detailKey = selected ?? null;
  const detail = detailKey ? dayStats.get(detailKey) : undefined;
  const hoverStat = hover ? dayStats.get(hover.key) : undefined;

  const describe = (key: string) => {
    const st = dayStats.get(key);
    const lvl = heatLevel(st, key, todayKey, data.windowStart);
    if (lvl === 'future') return 'Upcoming';
    if (lvl === 'nodata') return 'No data loaded';
    if (!st || st.ratio == null) return st?.skipped ? `${st.skipped} skipped · no scheduled tasks` : 'No scheduled tasks';
    const total = st.scheduled + st.countActivity;
    const done = st.completed + st.countActivity;
    return `${done}/${total} completed (${Math.round((st.ratio ?? 0) * 100)}%)${st.missed ? ` · ${st.missed} missed` : ''}`;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {showControls && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Segmented
            size="sm"
            value={range}
            onChange={(r) => {
              setRange(r);
              setSelected(null);
            }}
            className="min-w-0 flex-1 sm:flex-none"
            options={[
              { value: '30d', label: '30D' },
              { value: '3m', label: '3M' },
              { value: '6m', label: '6M' },
              { value: '12m', label: '12M' },
              { value: 'year', label: 'Year' },
            ]}
          />
          {range === 'year' && (
            <div className="flex items-center gap-1 rounded-xl border border-line bg-card-2 px-1 py-0.5">
              <button aria-label="Previous year" disabled={year <= minYear} onClick={() => setYear((y) => y - 1)} className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1 text-xs font-semibold text-fg">{year}</span>
              <button aria-label="Next year" disabled={year >= maxYear} onClick={() => setYear((y) => y + 1)} className="rounded-lg p-1 text-muted hover:text-fg disabled:opacity-30">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <div ref={paletteRef} className="relative ml-auto">
            <button
              aria-label="Heatmap colours"
              onClick={() => setPaletteOpen((o) => !o)}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-line bg-card-2 px-2 text-xs font-semibold text-muted hover:text-fg"
            >
              <Palette className="h-3.5 w-3.5" />
              <span className="flex gap-0.5">
                {colors.map((c) => (
                  <span key={c} className="h-3 w-2 rounded-sm" style={{ background: c }} />
                ))}
              </span>
            </button>
            {paletteOpen && (
              <div className="absolute right-0 top-10 z-40 w-[min(92vw,420px)] rounded-2xl border border-line bg-card-2 p-3 shadow-2xl animate-scale-in">
                <p className="mb-2 text-xs font-semibold text-muted">Heatmap colours</p>
                <PalettePicker
                  value={data.prefs.heatmapPalette}
                  theme={data.prefs.theme}
                  onChange={(id) => {
                    data.updatePrefs({ heatmapPalette: id });
                    setPaletteOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="no-scrollbar overflow-x-auto">
        <div className="inline-flex flex-col" style={{ minWidth: labelW + weeks * (cell + gap) }}>
          <div className="relative mb-1 h-4" style={{ marginLeft: labelW }}>
            {monthLabels.map((m) => (
              <span key={`${m.col}-${m.label}`} className="absolute text-[10px] font-medium text-faint" style={{ left: m.col * (cell + gap) }}>
                {m.label}
              </span>
            ))}
          </div>
          <div className="flex">
            <div className="flex flex-col" style={{ width: labelW, gap }}>
              {Array.from({ length: 7 }, (_, i) => {
                const wd = (weekStart + i) % 7;
                return (
                  <span key={i} className="flex items-center text-[10px] text-faint" style={{ height: cell }}>
                    {showAllLabels || i % 2 === 0 ? WEEKDAYS_SHORT[wd] : ''}
                  </span>
                );
              })}
            </div>
            <div className="flex" style={{ gap }}>
              {columns.map((col, ci) => (
                <div key={ci} className="flex flex-col" style={{ gap }}>
                  {col.map((key) => {
                    const inRange = key >= from && key <= to;
                    if (!inRange) return <span key={key} style={{ width: cell, height: cell }} />;
                    const lvl = heatLevel(dayStats.get(key), key, todayKey, data.windowStart);
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`${formatDateKey(key, 'long')}: ${describe(key)}`}
                        onMouseEnter={(e) => {
                          const r = e.currentTarget.getBoundingClientRect();
                          const c = containerRef.current!.getBoundingClientRect();
                          setHover({ key, x: r.left - c.left + r.width / 2, y: r.top - c.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setSelected((s) => (s === key ? null : key))}
                        className={cn('heat-cell rounded-[4px] transition-transform hover:scale-110', key === todayKey && 'ring-1 ring-accent ring-offset-1 ring-offset-card', selected === key && 'ring-2 ring-fg')}
                        style={{ width: cell, height: cell, ...levelStyle(lvl, colors) }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-30 hidden -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-line bg-card-2 px-2.5 py-1.5 text-[11px] shadow-xl md:block"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          <p className="font-semibold text-fg">{formatDateKey(hover.key, 'weekday')}</p>
          <p className="text-muted">{describe(hover.key)}</p>
          {hoverStat && hoverStat.countActivity > 0 && <p className="text-muted">+{hoverStat.countActivity} goal progress</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <HeatLegend colors={colors} />
        {!compact && (
          <p className="text-[11px] text-faint">
            {totals.done} completions · {totals.active} active days{totals.rate != null ? ` · ${Math.round(totals.rate * 100)}% consistency` : ''}
          </p>
        )}
      </div>

      {detailKey && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-line bg-card-2 p-3 animate-fade-in">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{formatDateKey(detailKey, 'long')}</p>
            <p className="text-xs text-muted">{describe(detailKey)}</p>
            {detail && (detail.skipped > 0 || detail.plannedMin > 0) && (
              <p className="text-xs text-faint">
                {detail.skipped ? `${detail.skipped} skipped · ` : ''}
                {detail.plannedMin ? `${formatDuration(detail.plannedMin)} planned` : ''}
              </p>
            )}
          </div>
          <button onClick={() => navigate(`/calendar?date=${detailKey}&view=day`)} className="shrink-0 rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25">
            Open day →
          </button>
        </div>
      )}
    </div>
  );
}
