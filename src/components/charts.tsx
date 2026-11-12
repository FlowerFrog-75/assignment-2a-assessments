// Shared chart components. One visual language for every screen:
//
// - Skill levels use the same four bands everywhere (Beginning < 50,
//   Developing 50-74, Proficient 75-89, Advanced 90+), drawn as quiet gray
//   bands behind the bars so a score reads against its level.
// - The person in focus is the one coloured mark (brand purple). Comparison
//   marks (class average) are a thin dark tick: a reference, not a series.
// - Magnitude across many students uses one blue ramp, binned by level, with
//   the value printed in every cell (colour is never the only cue).
// - Values are printed next to their marks; hover/focus adds the detail.
// - Skills that haven't been assessed say so, instead of showing 0.
import { useId, type ReactNode } from 'react';
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const LEVELS = [
  { label: 'Beginning', from: 0, to: 50 },
  { label: 'Developing', from: 50, to: 75 },
  { label: 'Proficient', from: 75, to: 90 },
  { label: 'Advanced', from: 90, to: 100 },
] as const;

export type LevelLabel = (typeof LEVELS)[number]['label'];

export function levelOf(percent: number): LevelLabel {
  return [...LEVELS].reverse().find((l) => percent >= l.from)?.label ?? 'Beginning';
}

/** Ordinal blue ramp, one step per level (validated reference ramp, steps 150/300/450/600). */
export const LEVEL_FILL: Record<LevelLabel, { bg: string; text: string }> = {
  Beginning: { bg: '#b7d3f6', text: '#0d366b' },
  Developing: { bg: '#6da7ec', text: '#0b0b0b' },
  Proficient: { bg: '#2a78d6', text: '#ffffff' },
  Advanced: { bg: '#184f95', text: '#ffffff' },
};

const ACCENT = '#7c3aed'; // brand purple: the person in focus
const REFERENCE_INK = '#1f2937'; // gray-800: class-average tick

// ------------------------------------------------------------ headlines

export interface SkillValue {
  name: string;
  score: number | null; // null = not assessed yet
  compare?: number | null;
}

/** A one-line finding for a skill profile, e.g. "Strongest in Collaboration (88%) · focus on Research (41%)". */
export function skillFinding(rows: SkillValue[]): string {
  const assessed = rows.filter((r): r is SkillValue & { score: number } => r.score !== null);
  if (assessed.length === 0) return 'No skills assessed yet';
  const max = Math.max(...assessed.map((r) => r.score));
  const min = Math.min(...assessed.map((r) => r.score));
  const group = (score: number) => {
    const names = assessed.filter((r) => r.score === score).map((r) => r.name);
    return names.length > 2 ? `${names.length} skills` : names.join(' and ');
  };
  if (assessed.length === 1) return `${assessed[0].name}: ${assessed[0].score}% (${levelOf(assessed[0].score)})`;
  if (max === min) return `All ${assessed.length} assessed skills at ${max}% (${levelOf(max)})`;
  return `Strongest in ${group(max)} (${max}%) · focus on ${group(min)} (${min}%)`;
}

/** "Above the class average in 4 of 6 skills" */
export function comparisonFinding(rows: SkillValue[], who = 'Above'): string | null {
  const pairs = rows.filter((r) => r.score !== null && r.compare !== null && r.compare !== undefined);
  if (pairs.length === 0) return null;
  const above = pairs.filter((r) => (r.score as number) > (r.compare as number)).length;
  return `${who} the class average in ${above} of ${pairs.length} skill${pairs.length === 1 ? '' : 's'}`;
}

// ------------------------------------------------------- small pieces

export function Delta({ value, suffix = '', title }: { value: number | null | undefined; suffix?: string; title?: string }) {
  if (value === null || value === undefined) return <span className="text-xs text-gray-300">—</span>;
  if (value === 0) return <span className="text-xs text-gray-500 tabular-nums" title={title}>±0{suffix}</span>;
  const up = value > 0;
  return (
    <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${up ? 'text-emerald-700' : 'text-red-700'}`} title={title}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : '−'}
      {Math.abs(value)}
      {suffix}
    </span>
  );
}

export function ChartCard({ title, subtitle, legend, children, className = '', action }: { title: ReactNode; subtitle?: ReactNode; legend?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`bg-white rounded-xl border border-[#E8EAF0] shadow-sm p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-gray-900 leading-snug">{title}</h2>
          {subtitle && <p className="text-xs text-gray-500 font-body mt-0.5">{subtitle}</p>}
        </div>
        {(legend || action) && (
          <div className="flex items-center gap-3">
            {legend}
            {action}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function EmptyChart({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-center text-center text-sm text-gray-400 font-body px-6 py-10 rounded-lg bg-gray-50">{children}</div>;
}

/** Legend for a bar + reference tick. */
export function CompareLegend({ you = 'Score', reference = 'Class average' }: { you?: string; reference?: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] text-gray-500 font-body">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-4 h-2 rounded-sm" style={{ background: ACCENT }} /> {you}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-0.5 h-3.5 rounded-full" style={{ background: REFERENCE_INK }} /> {reference}
      </span>
    </div>
  );
}

// ------------------------------------------------------ skill bullets

export interface BulletRow extends SkillValue {
  key?: string;
  /** Change since last time, shown in the right column when there is no comparison. */
  change?: number | null;
  /** Extra detail for the hover card, e.g. "3/4 marks". */
  detail?: string;
  /** Text after the value, e.g. "156 coins". */
  trailing?: ReactNode;
}

/**
 * A skill profile as horizontal bullet bars: the bar is the score, the dark
 * tick the comparison (class average), quiet bands the levels. Sorted
 * strongest first so the reader sees strengths and gaps without searching.
 */
export function SkillBullets({
  rows,
  sort = true,
  compareLabel = 'Class average',
  changeLabel = 'Change',
  showAxis = true,
  color = ACCENT,
}: {
  rows: BulletRow[];
  sort?: boolean;
  compareLabel?: string;
  changeLabel?: string;
  showAxis?: boolean;
  color?: string;
}) {
  const hasCompare = rows.some((r) => r.compare !== undefined && r.compare !== null);
  const hasChange = !hasCompare && rows.some((r) => r.score !== null && typeof r.change === 'number' && r.change !== 0);
  const ordered = sort
    ? [...rows].sort((a, b) => (a.score === null ? 1 : 0) - (b.score === null ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0))
    : rows;
  const columns = `minmax(7.5rem, 11rem) 1fr 3rem${hasCompare || hasChange ? ' 4rem' : ''}`;

  return (
    <div className="font-body">
      {showAxis && (
        <div className="grid items-end gap-3 mb-1.5" style={{ gridTemplateColumns: columns }} aria-hidden="true">
          <span />
          <div className="relative h-4 text-[10px] text-gray-400">
            {LEVELS.map((l) =>
              l.to === 100 ? (
                <span key={l.label} className="absolute top-0 right-0 whitespace-nowrap">{l.label}</span>
              ) : (
                <span key={l.label} className="absolute top-0 truncate pr-1" style={{ left: `${l.from}%`, width: `${l.to - l.from}%` }}>
                  {l.label}
                </span>
              ),
            )}
          </div>
          <span className="text-[10px] text-gray-400 text-right">Score</span>
          {(hasCompare || hasChange) && <span className="text-[10px] text-gray-400 text-right">{hasCompare ? 'vs class' : changeLabel}</span>}
        </div>
      )}
      <ul className="space-y-1">
        {ordered.map((row) => {
          const assessed = row.score !== null;
          const diff = hasCompare && assessed && row.compare !== null && row.compare !== undefined ? (row.score as number) - row.compare : null;
          const description = assessed
            ? `${row.name}: ${row.score}%, ${levelOf(row.score as number)}${row.compare !== null && row.compare !== undefined ? `. ${compareLabel} ${row.compare}%` : ''}${row.detail ? `. ${row.detail}` : ''}`
            : `${row.name}: not assessed yet`;
          return (
            <li
              key={row.key ?? row.name}
              tabIndex={0}
              aria-label={description}
              className="group relative grid items-center gap-3 rounded-md px-1 -mx-1 py-1 outline-none hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-purple-300"
              style={{ gridTemplateColumns: columns }}
            >
              <span className={`text-sm truncate ${assessed ? 'text-gray-800' : 'text-gray-400'}`}>{row.name}</span>
              <div className="relative h-6">
                {/* level bands */}
                {LEVELS.map((l, i) => (
                  <div key={l.label} className="absolute inset-y-0" style={{ left: `${l.from}%`, width: `${l.to - l.from}%`, background: i % 2 ? '#ebebef' : '#f4f4f6' }} />
                ))}
                {assessed ? (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-2.5 rounded-r" style={{ width: `${Math.max(row.score as number, 1)}%`, background: color }} />
                ) : (
                  <span className="absolute inset-0 flex items-center pl-2 text-[11px] italic text-gray-400">Not assessed yet</span>
                )}
                {row.compare !== null && row.compare !== undefined && (
                  <div
                    className="absolute top-0.5 bottom-0.5 w-0.5 rounded-full"
                    style={{ left: `calc(${row.compare}% - 1px)`, background: REFERENCE_INK, boxShadow: '0 0 0 2px #fff' }}
                  />
                )}
                {/* hover / focus card */}
                <div className="pointer-events-none absolute z-10 bottom-full mb-1 left-0 hidden group-hover:block group-focus-visible:block whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                  <div className="font-semibold">{row.name}</div>
                  {assessed ? (
                    <>
                      <div>
                        {row.score}% · {levelOf(row.score as number)}
                        {row.detail ? ` · ${row.detail}` : ''}
                      </div>
                      {row.compare !== null && row.compare !== undefined && <div className="text-gray-300">{compareLabel}: {row.compare}%</div>}
                    </>
                  ) : (
                    <div className="text-gray-300">Not assessed yet</div>
                  )}
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900 text-right tabular-nums">{assessed ? `${row.score}%` : ''}</span>
              {(hasCompare || hasChange) && (
                <span className="text-right">{hasCompare ? <Delta value={diff} title={`Difference from ${compareLabel.toLowerCase()}`} /> : <Delta value={assessed ? row.change ?? null : null} />}</span>
              )}
              {row.trailing && <span className="col-start-2 -mt-1 text-[11px] text-gray-400">{row.trailing}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------- level distribution bar

/** How many people sit in each level (plus those with no results), as one 100% bar. */
export function LevelDistribution({ values, noneLabel = 'No results yet' }: { values: (number | null)[]; noneLabel?: string }) {
  const total = values.length;
  if (total === 0) return <EmptyChart>No students in this class yet.</EmptyChart>;
  const counts = LEVELS.map((l) => ({ label: l.label, count: values.filter((v) => v !== null && levelOf(v) === l.label).length }));
  const none = values.filter((v) => v === null).length;
  const segments = [...counts.map((c) => ({ ...c, fill: LEVEL_FILL[c.label as LevelLabel] })), { label: noneLabel, count: none, fill: { bg: '#e5e7eb', text: '#374151' } }].filter((s) => s.count > 0);
  return (
    <div className="font-body">
      <div className="flex h-8 w-full gap-0.5 rounded-md overflow-hidden" role="img" aria-label={segments.map((s) => `${s.label}: ${s.count}`).join(', ')}>
        {segments.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-center text-xs font-semibold tabular-nums min-w-[1.75rem]"
            style={{ flexGrow: s.count, flexBasis: 0, background: s.fill.bg, color: s.fill.text }}
            title={`${s.label}: ${s.count} student${s.count === 1 ? '' : 's'} (${Math.round((s.count / total) * 100)}%)`}
          >
            {s.count}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-gray-600">
        {[...LEVELS.map((l) => ({ label: `${l.label} ${l.from === 0 ? '<50' : l.to === 100 ? '90+' : `${l.from}–${l.to - 1}`}`, fill: LEVEL_FILL[l.label].bg })), { label: noneLabel, fill: '#e5e7eb' }].map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: item.fill }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------ heatmap cell

export function HeatCell({ value, label }: { value: number | null; label?: string }) {
  if (value === null) {
    return (
      <span className="inline-flex w-11 justify-center text-xs text-gray-300" title={`${label ?? ''} not assessed yet`.trim()}>
        —
      </span>
    );
  }
  const fill = LEVEL_FILL[levelOf(value)];
  return (
    <span
      className="inline-flex w-11 justify-center rounded px-1.5 py-1 text-xs font-semibold tabular-nums"
      style={{ background: fill.bg, color: fill.text }}
      title={`${label ? `${label}: ` : ''}${value}% (${levelOf(value)})`}
    >
      {value}
    </span>
  );
}

export function HeatLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 font-body">
      {LEVELS.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ background: LEVEL_FILL[l.label].bg }} />
          {l.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="text-gray-300">—</span> Not assessed
      </span>
    </div>
  );
}

// ------------------------------------------------------ trend line

export interface TrendPoint {
  label: string;
  value: number;
  detail?: string;
}

/** Results over time, on the 0-100 scale with the level boundaries as reference lines. */
export function TrendChart({ points, height = 200, minPoints = 2, emptyText }: { points: TrendPoint[]; height?: number; minPoints?: number; emptyText?: string }) {
  const id = useId();
  if (points.length < minPoints) {
    return <EmptyChart>{emptyText ?? `A trend appears after ${minPoints} results. ${points.length ? `So far: ${points[0].value}% (${points[0].label}).` : ''}`}</EmptyChart>;
  }
  // Two results on the same day would share an x label: number them.
  const seen = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const p of points) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
  const data = points.map((p) => {
    if ((counts.get(p.label) ?? 0) < 2) return p;
    const n = (seen.get(p.label) ?? 0) + 1;
    seen.set(p.label, n);
    return { ...p, label: `${p.label} (${n})` };
  });
  const last = data[data.length - 1];
  return (
    <div style={{ height }} aria-label={`Trend: ${points.map((p) => `${p.label} ${p.value}%`).join(', ')}`} role="img" id={id}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 40, bottom: 4, left: -16 }}>
          {/* Hairlines at the level boundaries (50 Developing, 75 Proficient, 90 Advanced). */}
          {[50, 75, 90].map((y) => (
            <ReferenceLine key={y} y={y} stroke="#e1e0d9" />
          ))}
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={{ stroke: '#d1d5db' }} tickLine={false} interval="preserveStartEnd" padding={{ left: 12, right: 12 }} />
          <YAxis domain={[0, 100]} ticks={[0, 50, 75, 90, 100]} tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ stroke: '#9ca3af', strokeWidth: 1 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TrendPoint;
              return (
                <div className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[11px] text-white shadow-lg">
                  <div className="font-semibold">{p.label}</div>
                  <div>
                    {p.value}% · {levelOf(p.value)}
                  </div>
                  {p.detail && <div className="text-gray-300">{p.detail}</div>}
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={ACCENT}
            strokeWidth={2}
            dot={{ r: 4, fill: ACCENT, stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: ACCENT, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={false}
            label={(props: { x?: number | string; y?: number | string; index?: number }) =>
              props.index === data.length - 1 ? (
                <text x={Number(props.x) + 8} y={Number(props.y) + 4} fontSize={11} fontWeight={600} fill="#111827">
                  {last.value}%
                </text>
              ) : (
                <g />
              )
            }
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------------------------------- monthly columns

/** Discrete periods as columns with value labels (e.g. coins earned per month). */
export function PeriodColumns({ data, unit, height = 120, tone = 'light' }: { data: { label: string; value: number }[]; unit: string; height?: number; tone?: 'light' | 'dark' }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const dark = tone === 'dark';
  return (
    <div className="flex items-end gap-2" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.value} ${unit}`).join(', ')}>
      {data.map((d) => (
        <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full" title={`${d.label}: ${d.value} ${unit}`}>
          <span className={`text-[11px] font-semibold tabular-nums mb-1 ${dark ? 'text-white/80' : 'text-gray-700'}`}>{d.value}</span>
          <div className="w-full max-w-10 rounded-t" style={{ height: `${Math.max((d.value / max) * 70, d.value ? 4 : 1)}%`, background: dark ? '#fdba74' : ACCENT, opacity: d.value ? 1 : 0.3 }} />
          <span className={`text-[10px] mt-1 truncate ${dark ? 'text-white/50' : 'text-gray-500'}`}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}
