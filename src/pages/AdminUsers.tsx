import { useState } from 'react';
import type { Page, UserRole } from '../types';
import { apiSend, ApiRequestError, selectStudent, useApiData } from '../lib/api';
import { useUser } from '../lib/auth';
import { Alert, Badge, Button, Card, copyText, downloadCsv, EmptyState, Field, Input, Modal, PageHeader, PageStatus, Select, Textarea } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: 'active' | 'deactivated';
  yearLevel: number | null;
  walletId: string | null;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLogin: string | null;
  created: string;
}

const sample: { users: UserRow[] } = {
  users: [
    { id: '1', email: 'jordan.smith@school.edu.au', firstName: 'Jordan', lastName: 'Smith', role: 'student', status: 'active', yearLevel: 11, walletId: 'DSW-2024-JS-1147', twoFactorEnabled: false, mustChangePassword: false, locked: false, lastLogin: '1 Nov 2026, 9:12 am', created: '3 Feb 2026' },
    { id: '2', email: 's.chen@school.edu.au', firstName: 'Sarah', lastName: 'Chen', role: 'teacher', status: 'active', yearLevel: null, walletId: null, twoFactorEnabled: true, mustChangePassword: false, locked: false, lastLogin: '1 Nov 2026, 8:40 am', created: '1 Feb 2026' },
  ],
};

type Credential = { name: string; email: string; password: string; walletId?: string | null };

function CredentialsModal({ title, credentials, onClose }: { title: string; credentials: Credential[]; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title={title}
      onClose={onClose}
      wide={credentials.length > 1}
      footer={
        <>
          {credentials.length > 1 && (
            <Button variant="secondary" onClick={() => downloadCsv('new-accounts.csv', [['Name', 'Email', 'Temporary password', 'Wallet ID'], ...credentials.map((c) => [c.name, c.email, c.password, c.walletId ?? ''])])}>
              Download CSV
            </Button>
          )}
          <Button accent="blue" onClick={onClose}>Done</Button>
        </>
      }
    >
      <Alert tone="amber">
        Give each person their temporary password privately. It is shown <strong>only now</strong>. They&apos;ll choose their own password at first sign-in
        {credentials.some((c) => !c.walletId) ? ', and staff will set up two-factor authentication' : ''}.
      </Alert>
      <table className="w-full text-sm font-body mt-4">
        <thead>
          <tr className="text-left text-xs text-gray-400 uppercase">
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2">Temporary password</th>
          </tr>
        </thead>
        <tbody>
          {credentials.map((c) => (
            <tr key={c.email} className="border-t border-[#E8EAF0]">
              <td className="py-2 pr-3">{c.name}</td>
              <td className="py-2 pr-3 text-gray-500">{c.email}</td>
              <td className="py-2 font-mono">{c.password}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {credentials.length === 1 && (
        <Button variant="secondary" className="mt-4" onClick={async () => setCopied(await copyText(credentials[0].password))}>
          {copied ? 'Copied ✓' : 'Copy password'}
        </Button>
      )}
    </Modal>
  );
}

function UserForm({ user, onClose, onSaved }: { user: UserRow | null; onClose: () => void; onSaved: (credential?: Credential) => void }) {
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    role: user?.role ?? ('student' as UserRole),
    yearLevel: user?.yearLevel ? String(user.yearLevel) : '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await apiSend('PATCH', `/admin/users/${user.id}`, { ...form, yearLevel: form.yearLevel || null });
        onSaved();
      } else {
        const created = await apiSend<{ user: UserRow; temporaryPassword: string }>('POST', '/admin/users', { ...form, yearLevel: form.yearLevel || undefined });
        onSaved({ name: `${created.user.firstName} ${created.user.lastName}`, email: created.user.email, password: created.temporaryPassword, walletId: created.user.walletId });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={user ? `Edit ${user.firstName} ${user.lastName}` : 'New account'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button accent="blue" busy={busy} onClick={save}>{user ? 'Save' : 'Create account'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="First name"><Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last name"><Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Email" className="col-span-2"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role" hint={user?.role === 'student' ? 'Student accounts stay students (their wallet belongs to them).' : undefined}>
          <Select value={form.role} disabled={user?.role === 'student'} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
            {(!user || user.role === 'student') && <option value="student">Student</option>}
            <option value="teacher">Teacher</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        {form.role === 'student' && (
          <Field label="Year level">
            <Select value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}>
              <option value="">Not set</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </Select>
          </Field>
        )}
        {!user && form.role === 'student' && <p className="col-span-2 text-xs text-gray-500 font-body">A wallet ID is created automatically.</p>}
        {error && <div className="col-span-2"><Alert>{error}</Alert></div>}
      </div>
    </Modal>
  );
}

/** Paste rows from a spreadsheet: first name, last name, email, year level. */
function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (credentials: Credential[], failures: string[]) => void }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');

  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split(/[,\t]/).map((cell) => cell.trim().replace(/^"|"$/g, '')))
    .filter((cells) => cells.length >= 3 && cells[2].includes('@'));

  const run = async () => {
    setBusy(true);
    const credentials: Credential[] = [];
    const failures: string[] = [];
    for (const [i, [firstName, lastName, email, yearLevel]] of rows.entries()) {
      setProgress(`Creating ${i + 1} of ${rows.length}…`);
      try {
        const created = await apiSend<{ user: UserRow; temporaryPassword: string }>('POST', '/admin/users', { firstName, lastName, email, role, yearLevel: role === 'student' ? yearLevel || undefined : undefined });
        credentials.push({ name: `${firstName} ${lastName}`, email, password: created.temporaryPassword, walletId: created.user.walletId });
      } catch (err) {
        failures.push(`${email}: ${err instanceof ApiRequestError ? err.message : 'failed'}`);
      }
    }
    setBusy(false);
    onDone(credentials, failures);
  };

  return (
    <Modal
      title="Import accounts"
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button accent="blue" busy={busy} disabled={rows.length === 0} onClick={run}>{busy ? progress : `Create ${rows.length} account${rows.length === 1 ? '' : 's'}`}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 font-body">
          Paste rows from a spreadsheet or CSV file, one person per line: <code>first name, last name, email, year level</code>. The year level is only used
          for students. A header row is ignored.
        </p>
        <Field label="Create as">
          <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="max-w-xs">
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
          </Select>
        </Field>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} placeholder={'Jordan,Smith,jordan.smith@school.edu.au,11\nMaya,Patel,maya.patel@school.edu.au,11'} className="font-mono text-xs" />
        <p className="text-xs text-gray-500 font-body">{rows.length} valid row{rows.length === 1 ? '' : 's'} found.</p>
      </div>
    </Modal>
  );
}

export default function AdminUsers({ setPage }: Props) {
  const me = useUser();
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const params = new URLSearchParams({ ...(role && { role }), ...(status && { status }), ...(search && { q: search }) });
  const list = useApiData(`/admin/users?${params}`, sample);
  const [editing, setEditing] = useState<UserRow | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const [credentials, setCredentials] = useState<{ title: string; list: Credential[] } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (user: UserRow, action: 'reset-password' | 'reset-2fa' | 'unlock' | 'sign-out' | 'deactivate' | 'reactivate') => {
    const name = `${user.firstName} ${user.lastName}`;
    const confirmText: Partial<Record<typeof action, string>> = {
      'reset-password': `Reset ${name}'s password? They'll be signed out and need the new temporary password.`,
      'reset-2fa': `Reset ${name}'s two-factor authentication? Use this if they lost their phone. They'll set it up again at next sign-in.`,
      deactivate: `Deactivate ${name}? They won't be able to sign in. Their records are kept.`,
    };
    if (confirmText[action] && !window.confirm(confirmText[action])) return;
    setBusyId(user.id);
    setNotice(null);
    try {
      if (action === 'reset-password') {
        const result = await apiSend<{ temporaryPassword: string }>('POST', `/admin/users/${user.id}/reset-password`);
        setCredentials({ title: 'Password reset', list: [{ name, email: user.email, password: result.temporaryPassword }] });
      } else if (action === 'deactivate' || action === 'reactivate') {
        await apiSend('PATCH', `/admin/users/${user.id}`, { status: action === 'deactivate' ? 'deactivated' : 'active' });
        setNotice({ tone: 'green', text: `${name} ${action === 'deactivate' ? 'deactivated' : 'reactivated'}.` });
      } else {
        await apiSend('POST', `/admin/users/${user.id}/${action}`);
        setNotice({ tone: 'green', text: { 'reset-2fa': `${name}'s 2FA was reset.`, unlock: `${name} was unlocked.`, 'sign-out': `${name} was signed out everywhere.` }[action] });
      }
      list.reload();
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'That didn’t work' });
    } finally {
      setBusyId(null);
    }
  };

  if (!list.ready && !list.error) return <PageStatus error={null} />;

  return (
    <div className="p-8">
      <PageHeader
        eyebrow="Administration"
        accent="blue"
        title="Users"
        subtitle="Create accounts, reset passwords and 2FA, and deactivate people who leave."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>Import from spreadsheet</Button>
            <Button accent="blue" onClick={() => setEditing('new')}>+ New account</Button>
          </>
        }
      />

      <Card className="mb-4" padded={false}>
        <form className="flex flex-wrap gap-3 p-4" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()); }}>
          <Input placeholder="Search name, email or wallet ID" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="max-w-[160px]">
            <option value="">All roles</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
            <option value="admin">Administrators</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[160px]">
            <option value="active">Active</option>
            <option value="deactivated">Deactivated</option>
            <option value="">All</option>
          </Select>
          <Button type="submit" variant="secondary">Search</Button>
        </form>
      </Card>

      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}

      {list.error ? (
        <PageStatus error={list.error} onRetry={list.reload} />
      ) : (
        <Card padded={false}>
          {list.data.users.length === 0 ? (
            <EmptyState icon="👥" title="No accounts match">Create accounts with “New account”, or import a class list from a spreadsheet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-[#E8EAF0]">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Last sign-in</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.users.map((u) => (
                    <tr key={u.id} className="border-b border-[#E8EAF0] last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{u.firstName} {u.lastName}{u.id === me.id && <span className="text-gray-400 font-normal"> (you)</span>}</div>
                        <div className="text-xs text-gray-500">{u.email}{u.walletId && <span className="font-mono"> · {u.walletId}</span>}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={u.role === 'student' ? 'orange' : u.role === 'teacher' ? 'green' : 'blue'}>{u.role === 'admin' ? 'Admin' : u.role === 'teacher' ? 'Teacher' : `Student${u.yearLevel ? ` · Yr ${u.yearLevel}` : ''}`}</Badge>
                      </td>
                      <td className="px-4 py-3 space-x-1">
                        {u.status === 'deactivated' ? <Badge tone="gray">Deactivated</Badge> : u.locked ? <Badge tone="red">Locked</Badge> : u.mustChangePassword ? <Badge tone="amber">Not signed in yet</Badge> : <Badge tone="green">Active</Badge>}
                        {u.role !== 'student' && u.status === 'active' && !u.twoFactorEnabled && !u.mustChangePassword && <Badge tone="amber">2FA not set up</Badge>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{u.lastLogin ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => setEditing(u)}>Edit</Button>
                          {u.role === 'student' && u.walletId && (
                            <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => { selectStudent(u.walletId!); setPage('teacher-individual'); }}>Results</Button>
                          )}
                          <Button variant="ghost" className="!px-2 !py-1 text-xs" busy={busyId === u.id} onClick={() => act(u, 'reset-password')}>Reset password</Button>
                          {u.twoFactorEnabled && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => act(u, 'reset-2fa')}>Reset 2FA</Button>}
                          {u.locked && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => act(u, 'unlock')}>Unlock</Button>}
                          {u.id !== me.id && u.status === 'active' && <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={() => act(u, 'sign-out')}>Sign out</Button>}
                          {u.id !== me.id && (
                            <Button variant="ghost" className={`!px-2 !py-1 text-xs ${u.status === 'active' ? 'text-red-600' : ''}`} onClick={() => act(u, u.status === 'active' ? 'deactivate' : 'reactivate')}>
                              {u.status === 'active' ? 'Deactivate' : 'Reactivate'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {editing && (
        <UserForm
          user={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(credential) => {
            setEditing(null);
            list.reload();
            if (credential) setCredentials({ title: 'Account created', list: [credential] });
            else setNotice({ tone: 'green', text: 'Account updated.' });
          }}
        />
      )}
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={(created, failures) => {
            setImporting(false);
            list.reload();
            if (created.length) setCredentials({ title: `${created.length} account${created.length === 1 ? '' : 's'} created`, list: created });
            if (failures.length) setNotice({ tone: 'amber', text: `${failures.length} row(s) were not imported: ${failures.join('; ')}` });
          }}
        />
      )}
      {credentials && <CredentialsModal title={credentials.title} credentials={credentials.list} onClose={() => setCredentials(null)} />}
    </div>
  );
}
