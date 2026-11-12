import { useState, type FormEvent } from 'react';
import type { Page } from '../types';
import { apiSend, ApiRequestError } from '../lib/api';
import { useAuth, useUser } from '../lib/auth';
import { Alert, Button, Card, Field, Input, PageHeader } from '../components/ui';

interface Props {
  setPage: (p: Page) => void;
  /** First sign-in: must finish before using the app. */
  setup?: boolean;
}

function PasswordForm({ onDone, temporary }: { onDone: () => void; temporary: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("The new passwords don't match");
    setBusy(true);
    try {
      await apiSend('POST', '/auth/password', { currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not change the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={temporary ? 'Temporary password' : 'Current password'}>
        <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 10 characters. A short phrase of a few words is easy to remember and hard to guess.">
        <Input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <Field label="Confirm new password">
        <Input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      {error && <Alert>{error}</Alert>}
      {saved && !temporary && <Alert tone="green">Password changed. You've been signed out on other devices.</Alert>}
      <Button type="submit" busy={busy}>Change password</Button>
    </form>
  );
}

function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setSetup(await apiSend<{ secret: string; qrCode: string }>('POST', '/auth/2fa/setup'));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start 2FA setup');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/auth/2fa/enable', { code: code.replace(/\s/g, '') });
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That code was not accepted');
    } finally {
      setBusy(false);
    }
  };

  if (!setup) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600 font-body leading-relaxed">
          Staff accounts can see students&apos; records, so they need a second step at sign-in: a 6-digit code from an authenticator app on your phone
          (Microsoft Authenticator, Google Authenticator, 1Password and similar).
        </p>
        {error && <Alert>{error}</Alert>}
        <Button onClick={start} busy={busy}>Set up two-factor authentication</Button>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="space-y-4">
      <ol className="text-sm text-gray-600 font-body space-y-1 list-decimal pl-5">
        <li>Open your authenticator app and add an account.</li>
        <li>Scan this QR code (or type the key below).</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-6">
        <img src={setup.qrCode} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl border border-[#E8EAF0]" />
        <div className="text-xs text-gray-500 font-body">
          Key (if you can&apos;t scan):
          <div className="font-mono text-sm text-gray-800 mt-1 break-all max-w-[260px]">{setup.secret.match(/.{1,4}/g)?.join(' ')}</div>
        </div>
      </div>
      <Field label="6-digit code">
        <Input inputMode="numeric" autoComplete="one-time-code" required maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="font-mono tracking-widest max-w-[180px]" />
      </Field>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" busy={busy}>Turn on 2FA</Button>
    </form>
  );
}

export default function AccountPage({ setup }: Props) {
  const user = useUser();
  const { refresh, signOut, state } = useAuth();
  const school = state.status === 'signed-in' ? state.school : null;
  const needsPassword = user.mustChangePassword;
  const needsTwoFactor = user.twoFactorRequired && !user.twoFactorEnabled;

  if (setup) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6">
            <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-lg font-bold text-white mb-3">W</div>
            <h1 className="font-display font-bold text-2xl text-gray-900">Welcome, {user.firstName}</h1>
            <p className="text-sm text-gray-500 font-body">Finish setting up your account{school ? ` for ${school.name}` : ''}.</p>
          </div>
          <Card>
            <div className="flex items-center gap-3 mb-5 text-xs font-body">
              <span className={`px-2 py-1 rounded-full ${needsPassword ? 'bg-purple-100 text-purple-700 font-semibold' : 'bg-emerald-50 text-emerald-700'}`}>1. New password {needsPassword ? '' : '✓'}</span>
              {user.twoFactorRequired && (
                <span className={`px-2 py-1 rounded-full ${!needsPassword && needsTwoFactor ? 'bg-purple-100 text-purple-700 font-semibold' : needsTwoFactor ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'}`}>
                  2. Two-factor authentication {needsTwoFactor ? '' : '✓'}
                </span>
              )}
            </div>
            {needsPassword ? (
              <>
                <h2 className="font-display font-semibold text-gray-900 mb-1">Choose your own password</h2>
                <p className="text-sm text-gray-500 font-body mb-4">You signed in with a temporary password from your administrator.</p>
                <PasswordForm temporary onDone={refresh} />
              </>
            ) : (
              <>
                <h2 className="font-display font-semibold text-gray-900 mb-3">Set up two-factor authentication</h2>
                <TwoFactorSetup onDone={refresh} />
              </>
            )}
          </Card>
          <button onClick={signOut} className="w-full mt-4 text-sm text-gray-500 hover:text-gray-700 font-body">Sign out</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <PageHeader eyebrow="Account" title="My account" subtitle={`${user.firstName} ${user.lastName} · ${user.email}`} />
      <div className="grid gap-6">
        <Card>
          <h2 className="font-display font-semibold text-gray-900 mb-4">Details</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm font-body">
            <dt className="text-gray-500">Role</dt>
            <dd className="text-gray-900 capitalize">{user.role}</dd>
            {user.walletId && (
              <>
                <dt className="text-gray-500">Wallet ID</dt>
                <dd className="text-gray-900 font-mono">{user.walletId}</dd>
              </>
            )}
            {school && (
              <>
                <dt className="text-gray-500">School</dt>
                <dd className="text-gray-900">{school.name}</dd>
              </>
            )}
            <dt className="text-gray-500">Two-factor authentication</dt>
            <dd className="text-gray-900">{user.twoFactorEnabled ? 'On' : user.twoFactorRequired ? 'Required (not set up)' : 'Not used for student accounts'}</dd>
          </dl>
          <p className="text-xs text-gray-400 font-body mt-4">To change your name or email, ask your school administrator.</p>
        </Card>
        <Card>
          <h2 className="font-display font-semibold text-gray-900 mb-4">Change password</h2>
          <PasswordForm temporary={false} onDone={refresh} />
        </Card>
        {user.twoFactorRequired && !user.twoFactorEnabled && (
          <Card>
            <h2 className="font-display font-semibold text-gray-900 mb-4">Two-factor authentication</h2>
            <TwoFactorSetup onDone={refresh} />
          </Card>
        )}
      </div>
    </div>
  );
}
