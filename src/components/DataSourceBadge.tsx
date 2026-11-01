import type { DataSource } from '../lib/api';

interface Props {
  source: DataSource;
  /** Why demo data is showing (shown as a tooltip). */
  reason?: string | null;
}

/** Small pill showing whether a screen shows live data (MongoDB + Fabric) or its built-in demo data. */
export default function DataSourceBadge({ source, reason }: Props) {
  if (source === 'loading') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
        Loading…
      </span>
    );
  }
  if (source === 'live') {
    return (
      <span
        title="Live data from MongoDB and the Hyperledger Fabric ledger"
        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        Live data
      </span>
    );
  }
  return (
    <span
      title={`${reason ?? 'The API server is not running'}. Start it with: pnpm dev:full`}
      className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200"
    >
      Demo data · API offline
    </span>
  );
}
