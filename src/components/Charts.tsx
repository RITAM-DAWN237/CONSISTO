// Chart.js wrappers that follow the active theme / accent colour.
import { useEffect, useMemo, useState } from 'react';
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useData } from '../context/DataContext';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

export interface ChartTheme {
  accent: string;
  accent2: string;
  ok: string;
  warn: string;
  bad: string;
  fg: string;
  muted: string;
  grid: string;
  card: string;
  track: string;
}

export function useChartTheme(): ChartTheme {
  const { prefs } = useData();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    // Theme variables are applied in an effect; read them one frame later.
    const id = requestAnimationFrame(() => setTick((t) => t + 1));
    return () => cancelAnimationFrame(id);
  }, [prefs.theme, prefs.accent, prefs.font]);
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
    ChartJS.defaults.font.family = v('--app-font', 'Inter, system-ui, sans-serif');
    return {
      accent: v('--accent', '#8b5cf6'),
      accent2: v('--accent-strong', '#7c3aed'),
      ok: v('--ok', '#22c55e'),
      warn: v('--warn', '#f59e0b'),
      bad: v('--bad', '#ef4444'),
      fg: v('--fg', '#ecebf5'),
      muted: v('--muted', '#9a97ad'),
      grid: v('--line', 'rgba(255,255,255,0.07)'),
      card: v('--card-2', '#1b1828'),
      track: prefs.theme === 'light' ? 'rgba(17,12,46,0.08)' : 'rgba(255,255,255,0.08)',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, prefs.theme]);
}

/** Canvas cannot parse CSS color-mix(), so derive translucent colours manually. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  if (c.startsWith('#')) {
    const h = c.slice(1);
    const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
    const n = parseInt(full, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }
  const m = c.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((x) => x.trim());
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return c;
}

function tooltip(t: ChartTheme) {
  return {
    backgroundColor: t.card,
    titleColor: t.fg,
    bodyColor: t.muted,
    borderColor: t.grid,
    borderWidth: 1,
    padding: 10,
    cornerRadius: 10,
    boxPadding: 4,
  };
}

export interface Series {
  label: string;
  data: number[];
  color: string;
  stack?: string;
}

export function BarChart({
  labels,
  series,
  height = 220,
  stacked,
  legend,
  unit,
}: {
  labels: string[];
  series: Series[];
  height?: number;
  stacked?: boolean;
  legend?: boolean;
  unit?: string;
}) {
  const t = useChartTheme();
  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: !!legend, position: 'bottom', labels: { color: t.muted, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } } },
      tooltip: { ...tooltip(t), callbacks: unit ? { label: (c) => `${c.dataset.label}: ${c.parsed.y}${unit}` } : undefined },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: t.muted, font: { size: 11 } }, border: { display: false } },
      y: { stacked, beginAtZero: true, grid: { color: t.grid }, ticks: { color: t.muted, font: { size: 11 }, precision: 0 }, border: { display: false } },
    },
  };
  return (
    <div style={{ height }}>
      <Bar
        options={options}
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.data,
            backgroundColor: s.color,
            borderRadius: 6,
            borderSkipped: false,
            maxBarThickness: 28,
            stack: stacked ? s.stack ?? 'a' : undefined,
          })),
        }}
      />
    </div>
  );
}

export function LineChart({
  labels,
  series,
  height = 220,
  legend,
  percent,
}: {
  labels: string[];
  series: (Series & { fill?: boolean; axis?: 'y' | 'y2' })[];
  height?: number;
  legend?: boolean;
  percent?: boolean;
}) {
  const t = useChartTheme();
  const hasY2 = series.some((s) => s.axis === 'y2');
  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: !!legend, position: 'bottom', labels: { color: t.muted, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } } },
      tooltip: tooltip(t),
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.muted, font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, border: { display: false } },
      y: {
        beginAtZero: true,
        max: percent ? 100 : undefined,
        grid: { color: t.grid },
        ticks: { color: t.muted, font: { size: 11 }, precision: 0, callback: percent ? (v) => `${v}%` : undefined },
        border: { display: false },
      },
      ...(hasY2
        ? { y2: { position: 'right' as const, beginAtZero: true, max: 100, grid: { display: false }, ticks: { color: t.muted, font: { size: 11 }, callback: (v: string | number) => `${v}%` }, border: { display: false } } }
        : {}),
    },
  };
  return (
    <div style={{ height }}>
      <Line
        options={options}
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: s.fill ? withAlpha(s.color, 0.18) : s.color,
            fill: !!s.fill,
            tension: 0.35,
            pointRadius: labels.length > 20 ? 0 : 3,
            pointHoverRadius: 5,
            borderWidth: 2,
            yAxisID: s.axis ?? 'y',
          })),
        }}
      />
    </div>
  );
}

export function DoughnutChart({ labels, data, colors, height = 220 }: { labels: string[]; data: number[]; colors: string[]; height?: number }) {
  const t = useChartTheme();
  const options: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    plugins: {
      legend: { display: true, position: 'right', labels: { color: t.muted, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 }, padding: 10 } },
      tooltip: tooltip(t),
    },
  };
  return (
    <div style={{ height }}>
      <Doughnut options={options} data={{ labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 6 }] }} />
    </div>
  );
}

/** Small inline sparkline (SVG) used in stat cards. */
export function Sparkline({ values, color = 'var(--accent)', height = 28 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const w = 100;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - (v / max) * (height - 4) - 2]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={`${d} L${w} ${height} L0 ${height} Z`} fill={color} opacity={0.12} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MiniBars({ values, color = 'var(--accent)', highlight }: { values: number[]; color?: string; highlight?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex h-9 items-end gap-1" aria-hidden>
      {values.map((v, i) => (
        <span
          key={i}
          className="w-2 rounded-sm transition-all"
          style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: color, opacity: i === highlight ? 1 : 0.45 + (0.4 * v) / max }}
        />
      ))}
    </div>
  );
}
