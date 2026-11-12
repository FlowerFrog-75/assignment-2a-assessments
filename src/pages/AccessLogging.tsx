import { useState } from 'react';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { useApiData } from '../lib/api';
import { useUser } from '../lib/auth';
import { downloadCsv, PageStatus } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

const mockLogs = [
  { id: 'LOG-0841', user: 'Jordan Smith', role: 'Student', action: 'Assessment Started', resource: 'Critical Thinking in Data Interpretation', ip: '192.168.1.42', time: '2024-10-16 14:23:11', status: 'Success', flag: false },
  { id: 'LOG-0842', user: 'Maya Patel', role: 'Student', action: 'Assessment Submitted', resource: 'Research Methods & Source Evaluation', ip: '192.168.1.55', time: '2024-10-16 14:41:07', status: 'Success', flag: false },
  { id: 'LOG-0843', user: 'Ethan Clarke', role: 'Student', action: 'Assessment Abandoned', resource: 'Decision-Making Under Uncertainty', ip: '192.168.1.38', time: '2024-10-16 13:58:33', status: 'Warning', flag: true },
  { id: 'LOG-0844', user: 'Ms. Chen', role: 'Teacher', action: 'Results Viewed', resource: 'Class 11B — Term 3 Results', ip: '10.0.0.15', time: '2024-10-16 15:02:19', status: 'Success', flag: false },
  { id: 'LOG-0845', user: 'Sofia Rodriguez', role: 'Student', action: 'Wallet Shared', resource: 'DSW-2024-SR-1148 Public Link', ip: '192.168.1.71', time: '2024-10-16 12:11:55', status: 'Success', flag: false },
  { id: 'LOG-0846', user: 'Unknown', role: 'External', action: 'Credential Verified', resource: 'DSW-2024-SR-1148', ip: '203.44.12.88', time: '2024-10-16 15:45:02', status: 'Success', flag: false },
  { id: 'LOG-0847', user: 'Liam Nguyen', role: 'Student', action: 'Login Attempt Failed', resource: 'Auth System', ip: '192.168.1.29', time: '2024-10-16 11:33:48', status: 'Error', flag: true },
  { id: 'LOG-0848', user: 'Liam Nguyen', role: 'Student', action: 'Login Success', resource: 'Auth System', ip: '192.168.1.29', time: '2024-10-16 11:34:02', status: 'Success', flag: false },
  { id: 'LOG-0849', user: 'Admin', role: 'Admin', action: 'Assessment Published', resource: 'Growth Mindset & Resilience Survey', ip: '10.0.0.1', time: '2024-10-16 09:00:00', status: 'Success', flag: false },
  { id: 'LOG-0850', user: 'Ava Thompson', role: 'Student', action: 'Assessment Time Expired', resource: 'Collaborative Problem Solving', ip: '192.168.1.91', time: '2024-10-15 16:22:10', status: 'Warning', flag: true },
  { id: 'LOG-0851', user: 'Noah Kim', role: 'Student', action: 'Wallet Accessed', resource: 'DSW-2024-NK-1152', ip: '192.168.1.67', time: '2024-10-15 15:48:33', status: 'Success', flag: false },
  { id: 'LOG-0852', user: 'Ms. Chen', role: 'Teacher', action: 'Student Record Exported', resource: 'Jordan Smith — Full Report', ip: '10.0.0.15', time: '2024-10-15 14:05:17', status: 'Success', flag: false },
];

const statusColor: Record<string, string> = {
  Success: 'bg-emerald-50 text-emerald-700',
  Warning: 'bg-yellow-50 text-yellow-700',
  Error: 'bg-red-50 text-red-700',
};

const roleColor: Record<string, string> = {
  Student: 'bg-orange-50 text-orange-700',
  Teacher: 'bg-emerald-50 text-emerald-700',
  Admin: 'bg-purple-50 text-purple-700',
  External: 'bg-blue-50 text-blue-700',
};

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/audit-logs in the same shape.
const mockAudit = {
  lastUpdated: 'October 16, 2024 at 16:02',
  chain: { ok: true, checked: mockLogs.length } as { ok: boolean; checked: number; brokenAt?: number; reason?: string },
  logs: mockLogs.map((log) => ({ ...log, reason: null as string | null, hash: '' })),
};
type LogEntry = (typeof mockAudit.logs)[number];

export default function AccessLogging({ setPage }: Props) {
  const user = useUser();
  const audit = useApiData('/audit-logs', mockAudit);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterRole, setFilterRole] = useState('All');
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  if (!audit.ready) return <PageStatus error={audit.error} onRetry={audit.reload} />;
  const { logs, chain, lastUpdated } = audit.data;
  const isStudent = user.role === 'student';
  const exportLogs = () =>
    downloadCsv('audit-log.csv', [
      ['ID', 'Time', 'User', 'Role', 'Action', 'Resource', 'IP', 'Status', 'Reason', 'Hash'],
      ...logs.map((l) => [l.id, l.time, l.user, l.role, l.action, l.resource, l.ip, l.status, l.reason ?? '', l.hash]),
    ]);

  const filtered = logs.filter(l => {
    const matchSearch = l.user.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase()) ||
      l.resource.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'All' || l.status === filterStatus;
    const matchRole = filterRole === 'All' || l.role === filterRole;
    return matchSearch && matchStatus && matchRole;
  });

  const flagged = logs.filter(l => l.flag).length;
  const errors = logs.filter(l => l.status === 'Error').length;
  const warnings = logs.filter(l => l.status === 'Warning').length;

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span className="text-xs font-mono font-600 text-emerald-600 uppercase tracking-widest">{isStudent ? 'Your privacy' : user.role === 'admin' ? 'Administration' : 'Teaching'}</span>
            <DataSourceBadge source={audit.source} reason={audit.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">{isStudent ? 'Who accessed my data' : user.role === 'admin' ? 'Audit log' : 'Access logs'}</h1>
          {!isStudent && user.role === 'teacher' && <p className="text-xs text-gray-400 font-body">Your own actions, and access to records of students in your classes.</p>}
          <p className="text-sm text-gray-500 font-body mt-0.5">
            Last updated: {lastUpdated} · {logs.length} events recorded
          </p>
          {audit.source === 'live' && (
            <p
              className={`inline-flex items-center gap-1.5 mt-2 text-xs font-body px-2.5 py-1 rounded-full ${chain.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}
              title="Each log entry stores the hash of the one before it, so any edit or deletion breaks the chain"
            >
              {chain.ok
                ? `🔗 Tamper check passed: all ${chain.checked} entries' hash chain intact`
                : `⚠️ Tamper check failed at entry #${chain.brokenAt}: ${chain.reason}`}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={exportLogs} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E8EAF0] bg-white text-sm font-medium font-body text-gray-600 hover:border-emerald-200 transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export CSV
          </button>
          {isStudent && (
            <button onClick={() => setPage('privacy')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold font-body transition-all">
              Sharing & privacy
            </button>
          )}
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Events', value: logs.length, icon: '📋', color: 'text-gray-700', bg: 'bg-gray-50' },
          { label: 'Flagged Events', value: flagged, icon: '🚩', color: 'text-yellow-700', bg: 'bg-yellow-50' },
          { label: 'Errors', value: errors, icon: '❌', color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Warnings', value: warnings, icon: '⚠️', color: 'text-orange-700', bg: 'bg-orange-50' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8EAF0] p-4 shadow-sm">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center text-lg mb-3`}>{s.icon}</div>
            <div className={`font-display font-700 text-2xl ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-400 font-body mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-5">
        {/* Log table */}
        <div className={`flex-1 bg-white rounded-xl border border-[#E8EAF0] shadow-sm ${selectedLog ? 'w-0' : ''}`}>
          {/* Filters */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#F0F2F7]">
            <div className="relative">
              <svg width="13" height="13" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="pl-8 pr-4 py-2 rounded-lg border border-[#E8EAF0] text-sm font-body focus:outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-50 w-52"
              />
            </div>
            <div className="flex gap-1">
              {['All', 'Success', 'Warning', 'Error'].map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium font-body transition-all ${
                    filterStatus === s ? 'bg-emerald-600 text-white' : 'bg-gray-50 border border-[#E8EAF0] text-gray-600 hover:border-emerald-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {['All', 'Student', 'Teacher', 'Admin', 'External'].map((r) => (
                <button
                  key={r}
                  onClick={() => setFilterRole(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium font-body transition-all ${
                    filterRole === r ? 'bg-gray-800 text-white' : 'bg-gray-50 border border-[#E8EAF0] text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-gray-400 font-body">{filtered.length} results</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                  <th className="text-left px-5 py-3 font-600">Log ID</th>
                  <th className="text-left px-3 py-3 font-600">Timestamp</th>
                  <th className="text-left px-3 py-3 font-600">User</th>
                  <th className="text-left px-3 py-3 font-600">Role</th>
                  <th className="text-left px-3 py-3 font-600">Action</th>
                  <th className="text-left px-3 py-3 font-600">Resource</th>
                  <th className="text-left px-3 py-3 font-600">IP Address</th>
                  <th className="text-left px-3 py-3 font-600">Status</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F8F9FC]">
                {filtered.map((log) => (
                  <tr
                    key={log.id}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${selectedLog?.id === log.id ? 'bg-emerald-50/50' : ''}`}
                    onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        {log.flag && <span className="text-yellow-400 text-xs">🚩</span>}
                        <span className="font-mono text-xs text-gray-500">{log.id}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="font-mono text-xs text-gray-500">{log.time}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="text-sm font-body font-600 text-gray-800">{log.user}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-body ${roleColor[log.role] || 'bg-gray-100 text-gray-600'}`}>
                        {log.role}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="text-sm font-body text-gray-700">{log.action}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="text-xs font-body text-gray-500 max-w-[180px] truncate block">{log.resource}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="font-mono text-xs text-gray-400">{log.ip}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-body font-medium ${statusColor[log.status]}`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs text-emerald-600 font-body">Details</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selectedLog && (
          <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F2F7]">
              <h3 className="font-display font-600 text-gray-900">Event Details</h3>
              <button onClick={() => setSelectedLog(null)} className="text-gray-400 hover:text-gray-600">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-1 rounded-full font-body font-medium ${statusColor[selectedLog.status]}`}>
                  {selectedLog.status}
                </span>
                {selectedLog.flag && <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700 font-body">🚩 Flagged</span>}
              </div>
              {[
                { label: 'Log ID', value: selectedLog.id, mono: true },
                { label: 'Timestamp', value: selectedLog.time, mono: true },
                { label: 'User', value: selectedLog.user, mono: false },
                { label: 'Role', value: selectedLog.role, mono: false },
                { label: 'Action', value: selectedLog.action, mono: false },
                { label: 'Resource', value: selectedLog.resource, mono: false },
                { label: 'IP Address', value: selectedLog.ip, mono: true },
                ...(selectedLog.reason ? [{ label: 'Reason', value: selectedLog.reason, mono: false }] : []),
                ...(selectedLog.hash ? [{ label: 'Entry hash (SHA-256)', value: `${selectedLog.hash.slice(0, 16)}…`, mono: true }] : []),
              ].map((field) => (
                <div key={field.label} className="border-t border-[#F8F9FC] pt-3">
                  <div className="text-xs text-gray-400 font-body mb-1">{field.label}</div>
                  <div className={`text-sm text-gray-800 ${field.mono ? 'font-mono' : 'font-body font-500'}`}>
                    {field.value}
                  </div>
                </div>
              ))}
              <button className="mt-2 w-full bg-red-50 border border-red-100 hover:bg-red-100 text-red-700 rounded-lg py-2 text-xs font-semibold font-body transition-all">
                Escalate to Admin
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
