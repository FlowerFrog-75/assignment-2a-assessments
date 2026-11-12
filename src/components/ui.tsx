// Small shared building blocks for the admin, teacher and student screens,
// styled to match the original Figma Make designs.
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import type { ApiError } from '../lib/api';

export type Accent = 'purple' | 'orange' | 'emerald' | 'blue' | 'slate';

const accentText: Record<Accent, string> = {
  purple: 'text-purple-600',
  orange: 'text-orange-600',
  emerald: 'text-emerald-600',
  blue: 'text-blue-600',
  slate: 'text-slate-600',
};

export function PageHeader({ eyebrow, title, subtitle, accent = 'purple', actions }: { eyebrow?: string; title: string; subtitle?: ReactNode; accent?: Accent; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className={`text-xs font-mono font-semibold uppercase tracking-widest mb-1 ${accentText[accent]}`}>{eyebrow}</div>}
        <h1 className="font-display font-bold text-2xl text-gray-900">{title}</h1>
        {subtitle && <div className="text-sm text-gray-500 font-body mt-1">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={`bg-white rounded-xl border border-[#E8EAF0] shadow-sm ${padded ? 'p-6' : ''} ${className}`}>{children}</div>;
}

export function Stat({ label, value, hint, tone = 'gray' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'gray' | 'amber' | 'red' | 'emerald' | 'purple' | 'blue' }) {
  const tones = { gray: 'text-gray-900', amber: 'text-amber-600', red: 'text-red-600', emerald: 'text-emerald-600', purple: 'text-purple-600', blue: 'text-blue-600' };
  return (
    <Card>
      <div className="text-xs text-gray-500 font-body mb-1">{label}</div>
      <div className={`font-display font-bold text-2xl ${tones[tone]}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 font-body mt-1">{hint}</div>}
    </Card>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

export function Button({ variant = 'primary', accent = 'purple', busy, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; accent?: Accent; busy?: boolean }) {
  const primary: Record<Accent, string> = {
    purple: 'bg-purple-600 hover:bg-purple-700 text-white',
    orange: 'bg-orange-500 hover:bg-orange-600 text-white',
    emerald: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    blue: 'bg-blue-600 hover:bg-blue-700 text-white',
    slate: 'bg-slate-800 hover:bg-slate-900 text-white',
  };
  const styles: Record<ButtonVariant, string> = {
    primary: primary[accent],
    secondary: 'bg-white border border-[#E8EAF0] text-gray-700 hover:bg-gray-50',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    ghost: 'text-gray-600 hover:bg-gray-100',
  };
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold font-body transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
    >
      {busy && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 font-body mb-1.5">{label}</span>
        {children}
      </label>
      {hint && <span className="block text-xs text-gray-400 font-body mt-1">{hint}</span>}
    </div>
  );
}

const control = 'w-full px-3 py-2 rounded-xl border border-[#E8EAF0] bg-white text-sm font-body text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 disabled:bg-gray-50 disabled:text-gray-500';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${props.className ?? ''}`} />;
}

export function Select({ children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${control} ${props.className ?? ''}`}>
      {children}
    </select>
  );
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${control} min-h-[90px] ${props.className ?? ''}`} />;
}

export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'gray' | 'green' | 'amber' | 'red' | 'purple' | 'blue' | 'orange' }) {
  const tones = {
    gray: 'bg-gray-100 text-gray-600',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold font-body whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'amber' | 'green' | 'blue'; children: ReactNode }) {
  const tones = {
    red: 'bg-red-50 border-red-100 text-red-700',
    amber: 'bg-amber-50 border-amber-100 text-amber-800',
    green: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    blue: 'bg-blue-50 border-blue-100 text-blue-800',
  };
  return <div className={`px-4 py-3 rounded-xl border text-sm font-body ${tones[tone]}`}>{children}</div>;
}

export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white rounded-2xl shadow-xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8EAF0]">
          <h2 className="font-display font-bold text-lg text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700">✕</button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#E8EAF0] flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-12 px-6">
      <div className="text-4xl mb-3">{icon}</div>
      <div className="font-display font-semibold text-gray-900 mb-1">{title}</div>
      {children && <div className="text-sm text-gray-500 font-body max-w-md mx-auto">{children}</div>}
    </div>
  );
}

/** What a screen shows instead of its content while loading, or when it can't load. */
export function PageStatus({ error, onRetry, children }: { error: ApiError | null; onRetry?: () => void; children?: ReactNode }) {
  if (!error) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400 text-sm font-body gap-3">
        <span className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        Loading…
      </div>
    );
  }
  const offline = error.code === 'offline';
  return (
    <div className="p-8">
      <Card className="max-w-xl mx-auto text-center">
        <div className="text-4xl mb-3">{offline ? '📡' : error.status === 404 ? '🗂️' : error.status === 403 ? '🔒' : '⚠️'}</div>
        <div className="font-display font-bold text-lg text-gray-900 mb-2">
          {offline ? "Can't reach the server" : error.status === 403 ? 'Access restricted' : error.status === 404 ? 'Nothing here yet' : 'Something went wrong'}
        </div>
        <p className="text-sm text-gray-500 font-body leading-relaxed mb-4">{error.message}</p>
        {children}
        {onRetry && (offline || error.status >= 500) && (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Card>
    </div>
  );
}

/** Copies text, returning whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function downloadCsv(filename: string, rows: (string | number | null)[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const SKILL_OPTIONS = [
  { key: 'analytical-thinking', label: 'Analytical Thinking' },
  { key: 'research', label: 'Research' },
  { key: 'critical-thinking', label: 'Critical Thinking' },
  { key: 'creativity', label: 'Creativity' },
  { key: 'decision-making', label: 'Decision-Making' },
  { key: 'collaboration', label: 'Collaboration' },
  { key: 'adaptability', label: 'Adaptability' },
] as const;

export const skillLabel = (key: string) => SKILL_OPTIONS.find((s) => s.key === key)?.label ?? key;

// ------------------------------------------------------------ AI patterns
// One visual language for anything the AI touched: a violet accent, a clear
// label of where it came from, and the teacher always in control.

/** Where a question came from, so AI work is never mistaken for a teacher's. */
export function AiBadge({ model, passed }: { model?: string | null; passed?: boolean | null }) {
  if (model === 'offline-demo') {
    return (
      <span title="Made by the offline stand-in, not a real AI model" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-body whitespace-nowrap bg-amber-50 text-amber-800 border border-amber-200">
        ✦ Offline demo · not real AI{passed === false ? ' · failed review' : ''}
      </span>
    );
  }
  return (
    <span title={model ? `Drafted by ${model}` : 'Drafted by AI'} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-body whitespace-nowrap bg-violet-50 text-violet-700 border border-violet-200">
      ✦ AI-drafted{passed === true ? ' · passed review' : passed === false ? ' · failed review' : ''}
    </span>
  );
}

export interface AgentStep {
  at: string;
  actor: 'author' | 'validator' | 'system';
  text: string;
}

const ACTOR_STYLE: Record<AgentStep['actor'], { label: string; chip: string }> = {
  author: { label: 'Author agent', chip: 'bg-violet-100 text-violet-800' },
  validator: { label: 'Validator agent', chip: 'bg-sky-100 text-sky-800' },
  system: { label: 'App', chip: 'bg-gray-100 text-gray-700' },
};

/** The agents' steps as they happen, so teachers can see how each question was made and checked. */
export function AgentTimeline({ steps, running }: { steps: AgentStep[]; running: boolean }) {
  return (
    <ol className="space-y-2 font-body" aria-live="polite">
      {steps.map((step, i) => (
        <li key={i} className="grid gap-3 items-start" style={{ gridTemplateColumns: '7.5rem 1fr 3.5rem' }}>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full text-center ${ACTOR_STYLE[step.actor].chip}`}>{ACTOR_STYLE[step.actor].label}</span>
          <span className="text-sm text-gray-800 leading-snug">{step.text}</span>
          <span className="text-[11px] text-gray-400 text-right tabular-nums">{new Date(step.at).toLocaleTimeString([], { minute: '2-digit', second: '2-digit' })}</span>
        </li>
      ))}
      {running && (
        <li className="flex items-center gap-2 text-sm text-gray-500 pl-1">
          <span className="w-3.5 h-3.5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          Working…
        </li>
      )}
    </ol>
  );
}

/** A suggestion from the AI that the teacher can accept or ignore. Nothing is saved until they do. */
export function AiSuggestion({ children, onAccept, acceptLabel = 'Use this' }: { children: ReactNode; onAccept?: () => void; acceptLabel?: string }) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 text-sm font-body">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-semibold text-violet-700">✦ Suggested by AI · check before saving</span>
        {onAccept && (
          <button type="button" onClick={onAccept} className="text-xs font-semibold text-violet-700 hover:text-violet-900">
            {acceptLabel}
          </button>
        )}
      </div>
      <div className="text-gray-700">{children}</div>
    </div>
  );
}
