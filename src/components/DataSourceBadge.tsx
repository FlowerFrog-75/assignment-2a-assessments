import type { DataSource } from '../lib/api';

interface Props {
  source: DataSource;
  /** Why sample data is showing (shown as a tooltip). */
  reason?: string | null;
}

/** Marks screens showing built-in sample data (the design preview). Real data needs no label. */
export default function DataSourceBadge({ source, reason }: Props) {
  if (source !== 'demo') return null;
  return (
    <span
      title={reason ?? 'Design preview'}
      className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100"
    >
      Sample data · design preview
    </span>
  );
}
