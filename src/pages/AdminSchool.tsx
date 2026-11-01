import { useEffect, useState, type FormEvent } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError, useApiData } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Alert, Button, Card, Field, Input, PageHeader, PageStatus, Select } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

interface School {
  name: string;
  shortName: string;
  address: string;
  contactEmail: string;
  timezone: string;
  academicYear: number;
  term: number;
  walletPrefix: string;
}

const blank: School = { name: '', shortName: '', address: '', contactEmail: '', timezone: 'Australia/Brisbane', academicYear: new Date().getFullYear(), term: 1, walletPrefix: 'DSW' };
const TIMEZONES = ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne', 'Australia/Hobart', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth', 'Pacific/Auckland'];

export default function AdminSchool(_: Props) {
  const { refresh } = useAuth();
  const loaded = useApiData<{ school: School | null }>('/admin/school', { school: { ...blank, name: 'Northview Secondary College' } });
  const [form, setForm] = useState<School>(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);

  useEffect(() => {
    if (loaded.ready) setForm(loaded.data.school ?? blank);
  }, [loaded.ready, loaded.data]);

  if (!loaded.ready) return <PageStatus error={loaded.error} onRetry={loaded.reload} />;
  const set = (key: keyof School) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiSend('PUT', '/admin/school', form);
      await refresh();
      setMessage({ tone: 'green', text: 'School settings saved.' });
    } catch (err) {
      setMessage({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader eyebrow="Administration" accent="blue" title="School settings" subtitle={loaded.data.school ? 'These details appear on student wallets and shared credentials.' : 'Enter your school’s details to get started.'} />
      <Card>
        <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
          <Field label="School name" className="sm:col-span-2">
            <Input required value={form.name} onChange={set('name')} placeholder="e.g. Kelvin Grove State College" />
          </Field>
          <Field label="Short name" hint="Shown in authenticator apps">
            <Input value={form.shortName} onChange={set('shortName')} placeholder="e.g. KGSC" />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={form.contactEmail} onChange={set('contactEmail')} placeholder="admin@school.edu.au" />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={form.address} onChange={set('address')} />
          </Field>
          <Field label="Academic year">
            <Input type="number" min={2000} max={2100} value={form.academicYear} onChange={set('academicYear')} />
          </Field>
          <Field label="Current term">
            <Select value={form.term} onChange={set('term')}>
              {[1, 2, 3, 4].map((t) => <option key={t} value={t}>Term {t}</option>)}
            </Select>
          </Field>
          <Field label="Time zone">
            <Select value={form.timezone} onChange={set('timezone')}>
              {[...new Set([form.timezone, ...TIMEZONES])].map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </Select>
          </Field>
          <Field label="Wallet ID prefix" hint={`New wallets look like ${form.walletPrefix || 'DSW'}-${form.academicYear}-JS-4821`}>
            <Input required maxLength={6} value={form.walletPrefix} onChange={(e) => setForm({ ...form, walletPrefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
          </Field>
          {message && <div className="sm:col-span-2"><Alert tone={message.tone}>{message.text}</Alert></div>}
          <div className="sm:col-span-2">
            <Button type="submit" accent="blue" busy={busy}>Save settings</Button>
          </div>
        </form>
      </Card>
      <Card className="mt-6">
        <h2 className="font-display font-semibold text-gray-900 mb-2">Blockchain identity</h2>
        <p className="text-sm text-gray-500 font-body">
          On the Hyperledger Fabric network this school is the <strong>SchoolMSP</strong> organisation. Its certificates are created when the network is set up
          on the server (see <code>fabric/README.md</code>), not here.
        </p>
      </Card>
    </div>
  );
}
