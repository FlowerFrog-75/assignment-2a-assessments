import { useEffect, useState } from 'react';
import { apiPost, useApiData } from '../lib/api';

interface ClassInfo {
  id: string;
  name: string;
  yearLevel: number;
  students: number;
}

// Demo class, used when the API isn't running. The live list comes from GET /api/classes.
const mockClasses: ClassInfo[] = [{ id: 'demo-class', name: 'Year 10 Science', yearLevel: 10, students: 28 }];

interface Props {
  template: { id: string; title: string };
  live: boolean;
  onClose: () => void;
  onLaunched: (message: string) => void;
}

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[#E8EAF0] text-sm font-body bg-white focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-50';

export default function LaunchModal({ template, live, onClose, onLaunched }: Props) {
  const classes = useApiData<ClassInfo[]>('/classes', mockClasses);
  const [classId, setClassId] = useState('');
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!classId && classes.data[0]) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function launch() {
    if (!classId) return setError('Choose a class.');
    if (!due) return setError('Choose a due date.');
    // Due at the end of the chosen day, in the teacher's time zone.
    const dueAt = new Date(`${due}T23:59:00`);
    if (dueAt.getTime() <= Date.now()) return setError('Choose a due date in the future.');
    const className = classes.data.find((c) => c.id === classId)?.name ?? 'the class';
    setError(null);

    if (!live) {
      onLaunched(`Launched to ${className}, due ${due}. (Demo only: the server isn’t running, so no students were assigned.)`);
      return;
    }
    setSaving(true);
    const result = await apiPost<{ className: string }>(`/templates/${template.id}/launch`, { classGroup: classId, dueAt: dueAt.toISOString() });
    setSaving(false);
    if (result.kind === 'ok') onLaunched(`Launched to ${result.data.className}, due ${due}.`);
    else if (result.kind === 'offline') setError(`Couldn’t launch: ${result.reason}.`);
    else setError(result.error.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="w-full max-w-md bg-white rounded-2xl border border-[#E8EAF0] shadow-xl my-16">
        <div className="px-6 pt-5 pb-4 border-b border-[#F0F2F7]">
          <h2 id="launch-title" className="font-display font-700 text-xl text-gray-900">Launch assessment</h2>
          <p className="text-sm text-gray-500 font-body mt-0.5">{template.title}</p>
        </div>

        <div className="px-6 py-5 space-y-4">
          {classes.data.length === 0 ? (
            <p className="text-sm text-gray-500 font-body">You don’t have a class yet, so there’s nobody to launch this to.</p>
          ) : (
            <>
              <div>
                <label htmlFor="launch-class" className="block text-sm font-medium font-body text-gray-700 mb-1">Class</label>
                <select id="launch-class" value={classId} onChange={(e) => setClassId(e.target.value)} className={fieldClass}>
                  {classes.data.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.students} students)</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="launch-due" className="block text-sm font-medium font-body text-gray-700 mb-1">Due date</label>
                <input id="launch-due" type="date" min={today} value={due} onChange={(e) => setDue(e.target.value)} className={fieldClass} />
                <p className="text-xs text-gray-500 font-body mt-1">Students see it on their dashboard straight away.</p>
              </div>
            </>
          )}
          {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-body px-3 py-2">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F0F2F7]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E8EAF0] text-gray-600 hover:border-purple-200 text-sm font-medium font-body">Cancel</button>
          <button type="button" disabled={saving || classes.data.length === 0} onClick={launch} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body disabled:opacity-50">
            {saving ? 'Launching…' : 'Launch'}
          </button>
        </div>
      </div>
    </div>
  );
}
