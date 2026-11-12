// Sign-up panels shown on the sign-in page: joining with a code (students and
// staff), and first-time setup of a brand-new installation.
import { useState, type FormEvent, type ReactNode } from 'react';
import { apiSend, ApiRequestError } from '../lib/api';
import { useAuth } from '../lib/auth';

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-[#E8EAF0] text-sm font-body text-gray-800 placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-colors bg-gray-50 focus:bg-white';
const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5 font-body';
const primaryButton =
  'w-full py-3 rounded-xl font-semibold text-sm font-body text-white bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-200 transition-colors disabled:opacity-60';

/** "k7q2m9xd" → "K7Q2-M9XD" as the user types. */
function formatCodeInput(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return compact.match(/.{1,4}/g)?.join('-') ?? '';
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 font-body mt-1">{hint}</p>}
    </div>
  );
}

/** Rough strength guide. The server enforces the real rule (10+ characters). */
function passwordStrength(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (password.length < 10) return { score: 0, label: password ? `${10 - password.length} more character${password.length === 9 ? '' : 's'} needed` : 'At least 10 characters' };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/, / /].filter((re) => re.test(password)).length;
  if (password.length >= 16 || variety >= 3) return { score: 3, label: 'Strong' };
  if (password.length >= 12 || variety >= 2) return { score: 2, label: 'Good' };
  return { score: 1, label: 'OK, but longer is better' };
}

function PasswordFields({ password, setPassword, confirm, setConfirm }: { password: string; setPassword: (v: string) => void; confirm: string; setConfirm: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const strength = passwordStrength(password);
  const barColor = ['bg-gray-200', 'bg-amber-400', 'bg-emerald-500', 'bg-emerald-600'][strength.score];
  return (
    <>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="new-password" className="text-xs font-semibold text-gray-600 font-body">Password</label>
          <button type="button" onClick={() => setShow((v) => !v)} className="text-xs text-purple-600 hover:text-purple-700 font-medium font-body">
            {show ? 'Hide' : 'Show'}
          </button>
        </div>
        <input id="new-password" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        <div className="flex gap-1 mt-2" aria-hidden="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${strength.score >= i ? barColor : 'bg-gray-200'}`} />
          ))}
        </div>
        <p className="text-xs text-gray-500 font-body mt-1" aria-live="polite">{strength.label}. A short phrase of a few words works well.</p>
      </div>
      <Field id="confirm-password" label="Confirm password">
        <input id="confirm-password" type={show ? 'text' : 'password'} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </Field>
    </>
  );
}

interface Lookup {
  kind: 'student' | 'staff';
  school: string | null;
  className?: string;
  subject?: string;
  yearLevel?: number | null;
  teachers?: string[];
}

/** Sign up with a class code (students) or the school's staff code (teachers). */
export function SignUpPanel({ initialCode = '', onCancel }: { initialCode?: string; onCancel: () => void }) {
  const { refresh } = useAuth();
  const [code, setCode] = useState(formatCodeInput(initialCode));
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', yearLevel: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const found = await apiSend<Lookup>('POST', '/signup/lookup', { code });
      setLookup(found);
      if (found.yearLevel) setForm((f) => ({ ...f, yearLevel: String(found.yearLevel) }));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not check the code');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The passwords don't match");
    setBusy(true);
    try {
      await apiSend('POST', '/signup', { code, ...form, password });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not create the account');
      setBusy(false);
    }
  };

  if (!lookup) {
    return (
      <form onSubmit={checkCode}>
        <div className="mb-6">
          <h1 className="font-display font-700 text-2xl text-gray-900 mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 font-body">Enter the join code from your teacher (students) or your school (staff).</p>
        </div>
        <Field id="join-code" label="Join code" hint="Looks like K7Q2-M9XD. Ask your teacher if you don't have one.">
          <input
            id="join-code"
            autoFocus
            required
            autoComplete="off"
            spellCheck={false}
            value={code}
            onChange={(e) => setCode(formatCodeInput(e.target.value))}
            placeholder="XXXX-XXXX"
            className={`${inputClass} font-mono text-lg tracking-[0.2em] text-center`}
          />
        </Field>
        {error && <p role="alert" className="text-sm text-red-600 font-body mt-4">{error}</p>}
        <button type="submit" disabled={busy || code.replace(/-/g, '').length < 8} className={`${primaryButton} mt-6`}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button type="button" onClick={onCancel} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 font-body">
          Already have an account? <span className="text-purple-600 font-medium">Sign in</span>
        </button>
      </form>
    );
  }

  const student = lookup.kind === 'student';
  return (
    <form onSubmit={submit}>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl text-gray-900 mb-1">{student ? 'Join your class' : 'Create your staff account'}</h1>
        <p className="text-sm text-gray-500 font-body">{lookup.school ?? 'Digital Skills Wallet'}</p>
      </div>
      <div className={`flex items-start gap-3 rounded-xl px-4 py-3 mb-5 border ${student ? 'bg-orange-50 border-orange-100' : 'bg-emerald-50 border-emerald-100'}`}>
        <span className="text-lg" aria-hidden="true">{student ? '🎓' : '👩‍🏫'}</span>
        <div className="text-sm font-body min-w-0">
          {student ? (
            <>
              <div className="font-semibold text-gray-900">{lookup.className}</div>
              <div className="text-gray-600">{[lookup.subject, lookup.teachers?.join(', ')].filter(Boolean).join(' · ')}</div>
            </>
          ) : (
            <>
              <div className="font-semibold text-gray-900">Teacher account</div>
              <div className="text-gray-600">You&apos;ll set up two-factor authentication next.</div>
            </>
          )}
        </div>
        <button type="button" onClick={() => { setLookup(null); setError(null); }} className="ml-auto text-xs text-gray-500 hover:text-gray-800 font-body whitespace-nowrap">
          Change code
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field id="first-name" label="First name">
          <input id="first-name" autoComplete="given-name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
        </Field>
        <Field id="last-name" label="Last name">
          <input id="last-name" autoComplete="family-name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-col gap-3">
        <Field id="signup-email" label={student ? 'School email' : 'Work email'}>
          <input id="signup-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@school.edu.au" className={inputClass} />
        </Field>
        {student && (
          <Field id="year-level" label="Year level">
            <select id="year-level" value={form.yearLevel} onChange={(e) => setForm({ ...form, yearLevel: e.target.value })} className={inputClass}>
              <option value="">Choose…</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((y) => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </Field>
        )}
        <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600 font-body mt-4">{error}</p>}
      <button type="submit" disabled={busy} className={`${primaryButton} mt-6`}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
      <p className="text-xs text-gray-400 font-body mt-3 text-center">
        Your school can see your account. Your results are only shared with teachers you allow.
      </p>
    </form>
  );
}

/** First-time setup: create the school and its first administrator. */
export function SetupPanel({ onCancel }: { onCancel?: () => void }) {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ setupCode: '', schoolName: '', firstName: '', lastName: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The passwords don't match");
    setBusy(true);
    try {
      await apiSend('POST', '/signup/setup', { ...form, password });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Setup failed');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <div className="mb-5">
        <h1 className="font-display font-700 text-2xl text-gray-900 mb-1">Set up your school</h1>
        <p className="text-sm text-gray-500 font-body">This installation is new. Create the school and the first administrator account.</p>
      </div>
      <div className="flex flex-col gap-3">
        <Field id="setup-code" label="Setup code" hint={<>Printed in the server log when the app starts (e.g. <code className="text-gray-500">docker compose logs app</code>).</>}>
          <input id="setup-code" required autoComplete="off" spellCheck={false} value={form.setupCode} onChange={(e) => setForm({ ...form, setupCode: formatCodeInput(e.target.value) })} placeholder="XXXX-XXXX-XXXX" className={`${inputClass} font-mono tracking-[0.15em]`} />
        </Field>
        <Field id="school-name" label="School name">
          <input id="school-name" required value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value })} placeholder="e.g. Kelvin Grove State College" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="setup-first" label="Your first name">
            <input id="setup-first" autoComplete="given-name" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className={inputClass} />
          </Field>
          <Field id="setup-last" label="Last name">
            <input id="setup-last" autoComplete="family-name" required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className={inputClass} />
          </Field>
        </div>
        <Field id="setup-email" label="Work email">
          <input id="setup-email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
        </Field>
        <PasswordFields password={password} setPassword={setPassword} confirm={confirm} setConfirm={setConfirm} />
      </div>
      {error && <p role="alert" className="text-sm text-red-600 font-body mt-4">{error}</p>}
      <button type="submit" disabled={busy} className={`${primaryButton} mt-6`}>
        {busy ? 'Setting up…' : 'Create school and admin account'}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 font-body">
          Back to sign in
        </button>
      )}
    </form>
  );
}
