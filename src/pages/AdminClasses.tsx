import { useMemo, useState } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, PageStatus, Select } from '../components/ui';
import type { UserRow } from './AdminUsers';

interface Props { setPage: (p: Page) => void; }

interface Person { id: string; name: string; walletId: string | null }
interface ClassRow {
  id: string;
  name: string;
  subject: string;
  yearLevel: number | null;
  academicYear: number;
  term: number | null;
  archived: boolean;
  teachers: Person[];
  students: Person[];
}

const sample: { classes: ClassRow[] } = {
  classes: [{ id: '1', name: '11B', subject: 'Science', yearLevel: 11, academicYear: 2026, term: 4, archived: false, teachers: [{ id: 't', name: 'Sarah Chen', walletId: null }], students: [{ id: 's', name: 'Jordan Smith', walletId: 'DSW-2024-JS-1147' }] }],
};

function PeoplePicker({ people, selected, onChange, placeholder }: { people: UserRow[]; selected: Set<string>; onChange: (next: Set<string>) => void; placeholder: string }) {
  const [filter, setFilter] = useState('');
  const shown = people.filter((p) => `${p.firstName} ${p.lastName} ${p.email} ${p.walletId ?? ''} ${p.yearLevel ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  return (
    <div className="border border-[#E8EAF0] rounded-xl">
      <div className="flex gap-2 p-2 border-b border-[#E8EAF0]">
        <Input placeholder={placeholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Button variant="ghost" className="text-xs whitespace-nowrap" onClick={() => onChange(new Set([...selected, ...shown.map((p) => p.id)]))}>Select shown</Button>
      </div>
      <div className="max-h-52 overflow-y-auto p-1">
        {shown.length === 0 && <div className="text-xs text-gray-400 p-3 font-body">Nobody matches.</div>}
        {shown.map((p) => (
          <label key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm font-body cursor-pointer">
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <span className="text-gray-900">{p.firstName} {p.lastName}</span>
            <span className="text-xs text-gray-400">{p.role === 'student' ? `${p.yearLevel ? `Yr ${p.yearLevel} · ` : ''}${p.walletId ?? ''}` : p.email}</span>
          </label>
        ))}
      </div>
      <div className="px-3 py-1.5 text-xs text-gray-500 border-t border-[#E8EAF0] font-body">{selected.size} selected</div>
    </div>
  );
}

function ClassForm({ existing, users, onClose, onSaved }: { existing: ClassRow | null; users: UserRow[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: existing?.name ?? '',
    subject: existing?.subject ?? '',
    yearLevel: existing?.yearLevel ? String(existing.yearLevel) : '',
    academicYear: String(existing?.academicYear ?? new Date().getFullYear()),
    term: existing?.term ? String(existing.term) : '',
    archived: existing?.archived ?? false,
  });
  const [teachers, setTeachers] = useState(new Set(existing?.teachers.map((t) => t.id) ?? []));
  const [students, setStudents] = useState(new Set(existing?.students.map((s) => s.id) ?? []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const staff = users.filter((u) => u.role !== 'student');
  const pupils = users.filter((u) => u.role === 'student');

  const save = async () => {
    setBusy(true);
    setError(null);
    const body = { ...form, teacherIds: [...teachers], studentIds: [...students] };
    try {
      if (existing) await apiSend('PUT', `/admin/classes/${existing.id}`, body);
      else await apiSend('POST', '/admin/classes', body);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={existing ? `Edit ${existing.name}` : 'New class'}
      onClose={onClose}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button accent="blue" busy={busy} onClick={save}>{existing ? 'Save class' : 'Create class'}</Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-4 gap-4">
        <Field label="Class name" className="sm:col-span-2"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. 10 Science A" /></Field>
        <Field label="Subject" className="sm:col-span-2" hint="Assessments for this class draw questions from this subject"><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. General Capabilities" /></Field>
        <Field label="Year level">
          <Select value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })}>
            <option value="">Mixed</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
          </Select>
        </Field>
        <Field label="Academic year"><Input type="number" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></Field>
        <Field label="Term">
          <Select value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })}>
            <option value="">Whole year</option>
            {[1, 2, 3, 4].map((t) => <option key={t} value={t}>Term {t}</option>)}
          </Select>
        </Field>
        {existing && (
          <label className="flex items-center gap-2 text-sm font-body mt-6">
            <input type="checkbox" checked={form.archived} onChange={(e) => setForm({ ...form, archived: e.target.checked })} /> Archived
          </label>
        )}
        <div className="sm:col-span-2">
          <div className="text-xs font-semibold text-gray-700 font-body mb-1.5">Teachers</div>
          <PeoplePicker people={staff} selected={teachers} onChange={setTeachers} placeholder="Find a teacher" />
        </div>
        <div className="sm:col-span-2">
          <div className="text-xs font-semibold text-gray-700 font-body mb-1.5">Students</div>
          <PeoplePicker people={pupils} selected={students} onChange={setStudents} placeholder="Find students (name, year, wallet)" />
        </div>
        {error && <div className="sm:col-span-4"><Alert>{error}</Alert></div>}
      </div>
    </Modal>
  );
}

export default function AdminClasses(_: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const classes = useApiData(`/admin/classes${showArchived ? '?archived=true' : ''}`, sample);
  const users = useApiData<{ users: UserRow[] }>('/admin/users?status=active', { users: [] });
  const [editing, setEditing] = useState<ClassRow | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sorted = useMemo(() => classes.data.classes, [classes.data]);

  if (!classes.ready) return <PageStatus error={classes.error} onRetry={classes.reload} />;

  return (
    <div className="p-8">
      <PageHeader
        eyebrow="Administration"
        accent="blue"
        title="Classes"
        subtitle="Teachers see results and set assessments for their own classes only."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm text-gray-600 font-body mr-2">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
            </label>
            <Button accent="blue" onClick={() => setEditing('new')} disabled={!users.ready}>+ New class</Button>
          </>
        }
      />
      {notice && <div className="mb-4"><Alert tone="green">{notice}</Alert></div>}
      {sorted.length === 0 ? (
        <Card><EmptyState icon="🗂️" title="No classes yet">Create a class, choose its teacher(s) and enrol students.</EmptyState></Card>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((c) => (
            <Card key={c.id} className={c.archived ? 'opacity-60' : ''}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-display font-bold text-gray-900">{c.name}</div>
                  <div className="text-xs text-gray-500 font-body">{c.subject}{c.yearLevel ? ` · Year ${c.yearLevel}` : ''} · {c.term ? `Term ${c.term}, ` : ''}{c.academicYear}</div>
                </div>
                {c.archived && <Badge>Archived</Badge>}
              </div>
              <div className="text-sm font-body text-gray-600 mb-1"><span className="text-gray-400">Teacher{c.teachers.length === 1 ? '' : 's'}:</span> {c.teachers.map((t) => t.name).join(', ')}</div>
              <div className="text-sm font-body text-gray-600 mb-4"><span className="text-gray-400">Students:</span> {c.students.length}</div>
              <Button variant="secondary" onClick={() => setEditing(c)} disabled={!users.ready}>Edit & enrol</Button>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <ClassForm
          existing={editing === 'new' ? null : editing}
          users={users.data.users}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice(editing === 'new' ? 'Class created.' : 'Class saved.');
            setEditing(null);
            classes.reload();
          }}
        />
      )}
    </div>
  );
}
