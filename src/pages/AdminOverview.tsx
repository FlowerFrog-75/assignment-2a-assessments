import type { Page } from '../types';
import { useApiData } from '../lib/api';
import { useUser } from '../lib/auth';
import { Alert, Button, Card, PageHeader, PageStatus, Stat } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface Overview {
  school: { name: string | null; configured: boolean };
  users: { students: number; teachers: number; admins: number };
  classes: number;
  publishedTemplates: number;
  pendingItems: number;
  marking: { toMark: number; toRelease: number };
  ledger: { committed: number; pending: number; failed: number };
  auditChain: { ok: boolean; checked: number; brokenAt?: number };
}

const sample: Overview = {
  school: { name: 'Northview Secondary College', configured: true },
  users: { students: 214, teachers: 18, admins: 2 },
  classes: 12,
  publishedTemplates: 6,
  pendingItems: 4,
  marking: { toMark: 7, toRelease: 3 },
  ledger: { committed: 1240, pending: 0, failed: 0 },
  auditChain: { ok: true, checked: 3810 },
};

export default function AdminOverview({ setPage }: Props) {
  const user = useUser();
  const overview = useApiData<Overview>('/admin/overview', sample);
  if (!overview.ready) return <PageStatus error={overview.error} onRetry={overview.reload} />;
  const d = overview.data;

  const steps = [
    { done: d.school.configured, label: 'Enter your school details', page: 'admin-school' as Page },
    { done: d.users.teachers > 0, label: 'Add teachers: create their accounts, or turn on the staff sign-up code in School Settings', page: 'admin-users' as Page },
    { done: d.classes > 0, label: 'Set up classes and choose their teachers', page: 'admin-classes' as Page },
    { done: d.users.students > 0, label: 'Add students: import a list, or turn on a class code so they can sign up and join', page: 'admin-classes' as Page },
    { done: d.publishedTemplates > 0, label: 'Teachers approve questions and publish an assessment', page: 'item-bank' as Page },
  ];
  const setupDone = steps.every((s) => s.done);

  return (
    <div className="p-8">
      <PageHeader eyebrow="Administration" accent="blue" title={d.school.name ?? 'Welcome'} subtitle={`Signed in as ${user.firstName} ${user.lastName}`} />

      {!setupDone && (
        <Card className="mb-6">
          <h2 className="font-display font-semibold text-gray-900 mb-3">Getting started</h2>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={step.label} className="flex items-center gap-3 text-sm font-body">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{step.done ? '✓' : i + 1}</span>
                <span className={step.done ? 'text-gray-400 line-through' : 'text-gray-700'}>{step.label}</span>
                {!step.done && (
                  <button onClick={() => setPage(step.page)} className="text-blue-600 hover:text-blue-700 font-semibold text-xs">Open →</button>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Students" value={d.users.students} />
        <Stat label="Teachers" value={d.users.teachers} hint={`${d.users.admins} administrator${d.users.admins === 1 ? '' : 's'}`} />
        <Stat label="Active classes" value={d.classes} />
        <Stat label="Published assessments" value={d.publishedTemplates} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <h3 className="font-display font-semibold text-gray-900 mb-3">Teaching</h3>
          <ul className="text-sm font-body space-y-2 text-gray-600">
            <li className="flex justify-between"><span>Questions waiting for review</span><strong className={d.pendingItems ? 'text-amber-600' : ''}>{d.pendingItems}</strong></li>
            <li className="flex justify-between"><span>Submissions to mark</span><strong className={d.marking.toMark ? 'text-amber-600' : ''}>{d.marking.toMark}</strong></li>
            <li className="flex justify-between"><span>Results ready to release</span><strong className={d.marking.toRelease ? 'text-amber-600' : ''}>{d.marking.toRelease}</strong></li>
          </ul>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setPage('item-bank')}>Questions</Button>
            <Button variant="secondary" onClick={() => setPage('marking')}>Marking</Button>
          </div>
        </Card>
        <Card>
          <h3 className="font-display font-semibold text-gray-900 mb-3">Blockchain</h3>
          <ul className="text-sm font-body space-y-2 text-gray-600">
            <li className="flex justify-between"><span>Coin events on the ledger</span><strong className="text-emerald-600">{d.ledger.committed}</strong></li>
            <li className="flex justify-between"><span>Waiting to sync</span><strong className={d.ledger.pending ? 'text-amber-600' : ''}>{d.ledger.pending}</strong></li>
            <li className="flex justify-between"><span>Failed (will retry)</span><strong className={d.ledger.failed ? 'text-red-600' : ''}>{d.ledger.failed}</strong></li>
          </ul>
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" onClick={() => setPage('admin-coins')}>Skill coins</Button>
            <Button variant="secondary" onClick={() => setPage('blockchain-ledger')}>Ledger</Button>
          </div>
        </Card>
        <Card>
          <h3 className="font-display font-semibold text-gray-900 mb-3">Audit log</h3>
          {d.auditChain.ok ? (
            <Alert tone="green">Hash chain intact: all {d.auditChain.checked.toLocaleString()} entries verified.</Alert>
          ) : (
            <Alert>Hash chain broken at entry {d.auditChain.brokenAt}. Someone may have edited the log directly in the database.</Alert>
          )}
          <div className="mt-4">
            <Button variant="secondary" onClick={() => setPage('access-logging')}>Open audit log</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
