import { useState, type FormEvent } from 'react';
import type { Page, UserRole } from '../types';
import { apiSend, ApiRequestError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface LoginPageProps {
  setPage: (page: Page) => void;
}

const inputClass =
  'w-full px-4 py-2.5 rounded-xl border border-[#E8EAF0] text-sm font-body text-gray-800 placeholder-gray-300 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-50 transition-all bg-gray-50 focus:bg-white';

export default function LoginPage({ setPage }: LoginPageProps) {
  const { state, refresh, enterPreview } = useAuth();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const offline = state.status === 'signed-out' && state.offline;

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await apiSend<{ twoFactorRequired: boolean }>('POST', '/auth/login', { email, password });
      setPassword('');
      if (result.twoFactorRequired) setStep('code');
      else await refresh();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend('POST', '/auth/2fa/verify', { code: code.replace(/\s/g, '') });
      await refresh();
    } catch (err) {
      setCode('');
      if (err instanceof ApiRequestError && err.code === 'no_pending_login') setStep('password');
      setError(err instanceof ApiRequestError ? err.message : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FC] flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[480px] bg-[#1A1B2E] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 left-10 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-10 w-48 h-48 bg-orange-500/15 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
        </div>
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center text-lg font-bold text-white shadow-lg">
              W
            </div>
            <div>
              <div className="font-display font-700 text-white text-lg leading-tight">Digital Skills</div>
              <div className="font-display font-700 text-purple-300 text-lg leading-tight">Wallet</div>
            </div>
          </div>

          <div>
            <div className="font-display font-800 text-white text-4xl leading-tight mb-6">
              Assess. Learn.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Grow.</span>
            </div>
            <p className="text-white/60 text-base font-body leading-relaxed mb-10">
              A verified skills platform that connects authentic assessments to real outcomes. Build your digital credential portfolio as you learn.
            </p>

            <div className="flex flex-col gap-3">
              {[
                { color: 'bg-purple-500/20 border-purple-500/30 text-purple-300', icon: '📋', label: 'Authentic Assessment System' },
                { color: 'bg-orange-500/20 border-orange-500/30 text-orange-300', icon: '🎓', label: 'Student Skills Portfolio' },
                { color: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300', icon: '📈', label: 'Teacher Analytics Dashboard' },
              ].map((item) => (
                <div key={item.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${item.color}`}>
                  <span className="text-lg">{item.icon}</span>
                  <span className={`text-sm font-medium font-body ${item.color.split(' ').pop()}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/20 text-xs font-body">
            © {new Date().getFullYear()} Digital Skills Wallet
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-[#E8EAF0] p-8">
            {step === 'password' ? (
              <form onSubmit={submitPassword}>
                <div className="mb-8">
                  <h1 className="font-display font-700 text-2xl text-gray-900 mb-1">Welcome back</h1>
                  <p className="text-sm text-gray-500 font-body">Sign in to your Digital Skills Wallet</p>
                </div>
                <div className="flex flex-col gap-4 mb-6">
                  <div>
                    <label htmlFor="email" className="block text-xs font-semibold text-gray-600 mb-1.5 font-body uppercase tracking-wider">Email address</label>
                    <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.edu.au" className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-xs font-semibold text-gray-600 mb-1.5 font-body uppercase tracking-wider">Password</label>
                    <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setShowHelp((v) => !v)} className="text-sm text-purple-600 hover:text-purple-700 font-medium font-body">Forgot password?</button>
                  </div>
                  {showHelp && (
                    <p className="text-sm text-gray-500 font-body bg-gray-50 border border-[#E8EAF0] rounded-xl px-4 py-3">
                      Ask your school&apos;s Digital Skills Wallet administrator to reset it. They&apos;ll give you a temporary password, and you&apos;ll choose a new one when you sign in.
                    </p>
                  )}
                </div>
                {error && <p role="alert" className="text-sm text-red-600 font-body mb-4">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl font-semibold text-sm font-body text-white transition-all active:scale-95 bg-purple-600 hover:bg-purple-700 shadow-sm shadow-purple-200 disabled:opacity-60">
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <div className="mb-8">
                  <h1 className="font-display font-700 text-2xl text-gray-900 mb-1">Two-factor authentication</h1>
                  <p className="text-sm text-gray-500 font-body">Enter the 6-digit code from your authenticator app.</p>
                </div>
                <input
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]{6,7}"
                  maxLength={7}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123 456"
                  aria-label="6-digit code"
                  className={`${inputClass} text-center text-2xl tracking-[0.4em] font-mono mb-6`}
                />
                {error && <p role="alert" className="text-sm text-red-600 font-body mb-4">{error}</p>}
                <button type="submit" disabled={busy} className="w-full py-3 rounded-xl font-semibold text-sm font-body text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-60">
                  {busy ? 'Checking…' : 'Verify'}
                </button>
                <button type="button" onClick={() => { setStep('password'); setError(null); }} className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 font-body">
                  Use a different account
                </button>
                <p className="text-xs text-gray-400 font-body mt-4 text-center">Lost your phone? Ask your administrator to reset your 2FA.</p>
              </form>
            )}
          </div>

          <div className={`mt-4 ${step === 'code' ? 'hidden' : ''}`}>
            <button
              onClick={() => setPage('public-verification')}
              className="w-full bg-white border border-[#E8EAF0] rounded-xl px-4 py-3 text-sm text-gray-600 hover:border-purple-200 hover:text-purple-700 transition-all font-body"
            >
              🔗 Verify a student&apos;s credential
            </button>
          </div>

          {import.meta.env.DEV && offline && (
            <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <p className="text-xs text-amber-800 font-body mb-2">
                <strong>Development:</strong> the API server isn&apos;t running, so you can&apos;t sign in. Start it with <code>pnpm dev:full</code>, or browse the screens with sample data:
              </p>
              <div className="flex gap-2">
                {(['student', 'teacher', 'admin'] as UserRole[]).map((role) => (
                  <button key={role} onClick={() => enterPreview(role)} className="flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 hover:bg-amber-100 capitalize">
                    {role} preview
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
