// The class join code, for teachers and admins: show it, copy it or the
// join link, turn it on or off, or replace it.
import { useState } from 'react';
import { apiSend, ApiRequestError } from '../lib/api';
import { copyText } from './ui';

interface Props {
  classId: string;
  code: string | null;
  enabled: boolean;
  onChange?: (next: { joinCode: string; joinEnabled: boolean }) => void;
  compact?: boolean;
}

export default function JoinCode({ classId, code, enabled, onChange, compact }: Props) {
  const [state, setState] = useState({ code, enabled });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const update = async (body: { enabled?: boolean; regenerate?: boolean }) => {
    if (body.regenerate && !window.confirm('Make a new code? The old code stops working straight away.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const next = await apiSend<{ joinCode: string; joinEnabled: boolean }>('POST', `/classes/${classId}/join-code`, body);
      setState({ code: next.joinCode, enabled: next.joinEnabled });
      onChange?.(next);
    } catch (err) {
      setMessage(err instanceof ApiRequestError ? err.message : 'That didn’t work');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: 'code' | 'link') => {
    if (!state.code) return;
    const text = what === 'code' ? state.code : `${window.location.origin}/join/${state.code}`;
    setMessage((await copyText(text)) ? `${what === 'code' ? 'Code' : 'Link'} copied` : 'Copy failed: select it and copy by hand');
  };

  if (!state.enabled) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'px-4 py-3 rounded-xl border border-dashed border-[#E8EAF0] bg-white'}`}>
        <span className="text-sm text-gray-500 font-body">Students can’t sign up to this class yet.</span>
        <button disabled={busy} onClick={() => update({ enabled: true })} className="text-sm font-semibold text-purple-600 hover:text-purple-700 font-body disabled:opacity-50">
          Turn on class code
        </button>
        {message && <span className="text-xs text-red-600 font-body">{message}</span>}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? '' : 'px-4 py-3 rounded-xl border border-[#E8EAF0] bg-white'}`}>
      <div>
        <div className="text-[11px] text-gray-500 font-body">Class code</div>
        <div className="font-mono text-lg font-semibold tracking-[0.15em] text-gray-900 tabular-nums">{state.code}</div>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <button onClick={() => copy('code')} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 font-body">Copy code</button>
        <button onClick={() => copy('link')} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100 font-body">Copy join link</button>
        <button disabled={busy} onClick={() => update({ regenerate: true })} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 font-body disabled:opacity-50">New code</button>
        <button disabled={busy} onClick={() => update({ enabled: false })} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 font-body disabled:opacity-50">Turn off</button>
      </div>
      {message && <span className="text-xs text-gray-500 font-body" aria-live="polite">{message}</span>}
    </div>
  );
}
