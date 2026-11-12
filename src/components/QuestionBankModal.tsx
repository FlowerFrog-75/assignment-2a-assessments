import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';
import type { TemplateOptions } from './TemplateFormModal';

export interface ItemRecord {
  id: string;
  subject: string;
  skill: string;
  complexity: number;
  type: 'multiple_choice' | 'short_response';
  prompt: string;
  options: { key: string; text: string }[];
  correctOption: string;
  modelAnswer: string;
  rubric: string;
  points: number;
  status: string;
  source?: string;
  /** Used in a student attempt: its content can no longer change, only its status. */
  used: boolean;
}

interface Props {
  options: TemplateOptions;
  live: boolean;
  /** Demo mode keeps questions in the parent, so they survive closing this window. */
  demoItems: ItemRecord[];
  onDemoItemsChange: (items: ItemRecord[]) => void;
  onClose: () => void;
}

const TYPE_LABEL = { multiple_choice: 'Multiple choice', short_response: 'Short response' } as const;
const STATUS_STYLE: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700',
  draft: 'bg-gray-100 text-gray-500',
  pending_review: 'bg-yellow-50 text-yellow-700',
  rejected: 'bg-red-50 text-red-600',
  retired: 'bg-gray-100 text-gray-400',
};
const statusLabel = (s: string) => s.replace('_', ' ').replace(/^./, (c) => c.toUpperCase());

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[#E8EAF0] text-sm font-body bg-white focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-50 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium font-body text-gray-700 mb-1';

export default function QuestionBankModal({ options, live, demoItems, onDemoItemsChange, onClose }: Props) {
  const [editing, setEditing] = useState<ItemRecord | 'new' | null>(null);
  const [fSubject, setFSubject] = useState('');
  const [fSkill, setFSkill] = useState('');
  const [fType, setFType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const skillName = (key: string) => options.skills.find((s) => s.key === key)?.name ?? key;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !editing && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editing]);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const query = new URLSearchParams();
    if (fSubject.trim()) query.set('subject', fSubject.trim());
    if (fSkill) query.set('skill', fSkill);
    if (fType) query.set('type', fType);
    if (fStatus) query.set('status', fStatus);
    setLoading(true);
    apiGet<ItemRecord[]>(`/items?${query}`).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.kind === 'ok') {
        setItems(result.data);
        setListError(null);
      } else setListError(result.kind === 'offline' ? `Couldn’t load questions: ${result.reason}.` : result.error.message);
    });
    return () => {
      cancelled = true;
    };
  }, [live, fSubject, fSkill, fType, fStatus, reloadKey]);

  const shown = live
    ? items
    : demoItems.filter(
        (i) =>
          (!fSubject.trim() || i.subject.toLowerCase().includes(fSubject.trim().toLowerCase())) &&
          (!fSkill || i.skill === fSkill) &&
          (!fType || i.type === fType) &&
          (!fStatus || i.status === fStatus),
      );

  async function setStatus(item: ItemRecord, status: string) {
    if (!live) return onDemoItemsChange(demoItems.map((i) => (i.id === item.id ? { ...i, status } : i)));
    const result = await apiPut<ItemRecord>(`/items/${item.id}`, { status });
    if (result.kind === 'ok') setReloadKey((k) => k + 1);
    else setListError(result.kind === 'offline' ? `Couldn’t update: ${result.reason}.` : result.error.message);
  }

  function saved(record: ItemRecord | null) {
    setEditing(null);
    if (record) {
      // demo mode
      onDemoItemsChange(demoItems.some((i) => i.id === record.id) ? demoItems.map((i) => (i.id === record.id ? record : i)) : [record, ...demoItems]);
    } else setReloadKey((k) => k + 1);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && !editing && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="bank-title" className="w-full max-w-3xl bg-white rounded-2xl border border-[#E8EAF0] shadow-xl my-8">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#F0F2F7]">
          <div>
            <h2 id="bank-title" className="font-display font-700 text-xl text-gray-900">{editing ? (editing === 'new' ? 'New question' : 'Edit question') : 'Question bank'}</h2>
            <p className="text-sm text-gray-500 font-body mt-0.5">
              {editing
                ? 'Only approved questions are used in assessments.'
                : live
                  ? 'Templates draw their questions from here. Only approved questions are used.'
                  : 'The server isn’t running, so questions you write here are kept until you reload the page.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">×</button>
        </div>

        {editing ? (
          <ItemEditor options={options} live={live} initial={editing === 'new' ? undefined : editing} onCancel={() => setEditing(null)} onSaved={saved} />
        ) : (
          <div className="px-6 py-5">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input value={fSubject} onChange={(e) => setFSubject(e.target.value)} placeholder="Filter by subject" aria-label="Filter by subject" className={fieldClass + ' max-w-[11rem]'} />
              <select value={fSkill} onChange={(e) => setFSkill(e.target.value)} aria-label="Filter by skill" className={fieldClass + ' max-w-[11rem]'}>
                <option value="">All skills</option>
                {options.skills.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
              <select value={fType} onChange={(e) => setFType(e.target.value)} aria-label="Filter by type" className={fieldClass + ' max-w-[10rem]'}>
                <option value="">All types</option>
                <option value="multiple_choice">Multiple choice</option>
                <option value="short_response">Short response</option>
              </select>
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Filter by status" className={fieldClass + ' max-w-[9rem]'}>
                <option value="">Any status</option>
                {['approved', 'draft', 'pending_review', 'rejected', 'retired'].map((s) => (
                  <option key={s} value={s}>{statusLabel(s)}</option>
                ))}
              </select>
              <button type="button" onClick={() => setEditing('new')} className="ml-auto px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body">
                New question
              </button>
            </div>

            {listError && <div role="alert" className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-body px-3 py-2 mb-3">{listError}</div>}
            {loading && shown.length === 0 && <p className="text-sm text-gray-400 font-body">Loading questions…</p>}
            {!loading && shown.length === 0 && !listError && (
              <p className="text-sm text-gray-500 font-body py-6 text-center">No questions match. Write the first one with New question.</p>
            )}

            <ul className="space-y-2">
              {shown.map((item) => (
                <li key={item.id} className="rounded-xl border border-[#E8EAF0] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-body text-gray-800 leading-snug line-clamp-2">{item.prompt}</p>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium font-body ${STATUS_STYLE[item.status] ?? STATUS_STYLE.draft}`}>{statusLabel(item.status)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-gray-500 font-body">
                    <span>{TYPE_LABEL[item.type]}</span>
                    <span>{item.subject}</span>
                    <span>{skillName(item.skill)}</span>
                    <span>Complexity {item.complexity}</span>
                    <span>{item.points} {item.points === 1 ? 'mark' : 'marks'}</span>
                    {item.used && <span className="text-gray-400">Used in an assessment</span>}
                    <span className="ml-auto flex items-center gap-1">
                      {item.status !== 'approved' && item.status !== 'retired' && (
                        <button type="button" onClick={() => setStatus(item, 'approved')} className="px-2 py-1 rounded-lg text-emerald-700 hover:bg-emerald-50 font-medium">Approve</button>
                      )}
                      <button type="button" onClick={() => setEditing(item)} className="px-2 py-1 rounded-lg text-purple-700 hover:bg-purple-50 font-medium">{item.used ? 'View' : 'Edit'}</button>
                      {item.status !== 'retired' && (
                        <button type="button" onClick={() => setStatus(item, 'retired')} className="px-2 py-1 rounded-lg text-gray-500 hover:bg-gray-50 font-medium">Retire</button>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemEditor({
  options,
  live,
  initial,
  onCancel,
  onSaved,
}: {
  options: TemplateOptions;
  live: boolean;
  initial?: ItemRecord;
  onCancel: () => void;
  onSaved: (record: ItemRecord | null) => void;
}) {
  const locked = Boolean(initial?.used);
  const [type, setType] = useState<ItemRecord['type']>(initial?.type ?? 'multiple_choice');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [skill, setSkill] = useState(initial?.skill ?? options.skills[0]?.key ?? '');
  const [complexity, setComplexity] = useState(String(initial?.complexity ?? options.complexity.min));
  const [points, setPoints] = useState(String(initial?.points ?? 1));
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [choices, setChoices] = useState<string[]>(initial?.options.length ? initial.options.map((o) => o.text) : ['', '', '', '']);
  const [correct, setCorrect] = useState(initial?.correctOption ?? '');
  const [modelAnswer, setModelAnswer] = useState(initial?.modelAnswer ?? '');
  const [rubric, setRubric] = useState(initial?.rubric ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const keyFor = (i: number) => String.fromCharCode(65 + i);

  function removeChoice(index: number) {
    const removedKey = keyFor(index);
    setChoices(choices.filter((_, i) => i !== index));
    // Keys are re-lettered after a removal, so keep the correct answer pointing at the same text.
    if (correct === removedKey) setCorrect('');
    else if (correct && correct.charCodeAt(0) - 65 > index) setCorrect(String.fromCharCode(correct.charCodeAt(0) - 1));
  }

  function validate(status: 'draft' | 'approved'): string | null {
    if (!subject.trim()) return 'Enter the subject this question belongs to.';
    if (!prompt.trim()) return 'Write the question.';
    const cx = Number(complexity);
    if (!Number.isInteger(cx) || cx < options.complexity.min || cx > options.complexity.max) return `Complexity must be a whole number from ${options.complexity.min} to ${options.complexity.max}.`;
    const marks = Number(points);
    if (!(marks >= 0 && marks <= 100)) return 'Marks must be between 0 and 100.';
    if (type === 'multiple_choice') {
      if (choices.some((c) => !c.trim())) return 'Fill in every option, or remove the empty ones.';
      if (choices.length < 2) return 'Add at least two options.';
      if (status === 'approved' && !correct) return 'Select the correct option before approving.';
    } else if (status === 'approved' && !modelAnswer.trim() && !rubric.trim()) {
      return 'Add a model answer or marking guide before approving.';
    }
    return null;
  }

  async function submit(status: 'draft' | 'approved') {
    const problem = locked ? null : validate(status);
    if (problem) return setError(problem);
    setError(null);

    const optionList = type === 'multiple_choice' ? choices.map((text, i) => ({ key: keyFor(i), text: text.trim() })) : [];
    const payload = locked
      ? { status }
      : {
          type,
          subject: subject.trim(),
          skill,
          complexity: Number(complexity),
          points: Number(points),
          prompt: prompt.trim(),
          options: optionList,
          correctOption: type === 'multiple_choice' ? correct || undefined : undefined,
          modelAnswer: type === 'short_response' ? modelAnswer.trim() || undefined : undefined,
          rubric: type === 'short_response' ? rubric.trim() || undefined : undefined,
          status,
        };

    if (!live) {
      onSaved({
        id: initial?.id ?? `local-${Date.now()}`,
        type,
        subject: subject.trim(),
        skill,
        complexity: Number(complexity),
        points: Number(points),
        prompt: prompt.trim(),
        options: optionList,
        correctOption: type === 'multiple_choice' ? correct : '',
        modelAnswer: type === 'short_response' ? modelAnswer.trim() : '',
        rubric: type === 'short_response' ? rubric.trim() : '',
        status,
        used: false,
      });
      return;
    }

    setSaving(true);
    const result = initial ? await apiPut<ItemRecord>(`/items/${initial.id}`, payload) : await apiPost<ItemRecord>('/items', payload);
    setSaving(false);
    if (result.kind === 'ok') onSaved(null);
    else if (result.kind === 'offline') setError(`Couldn’t save: ${result.reason}.`);
    else setError(result.error.message);
  }

  return (
    <>
      <div className="px-6 py-5 space-y-4">
        {locked && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-100 text-yellow-800 text-sm font-body px-3 py-2">
            Students have already answered this question, so its content is locked. You can still approve or retire it. To change the wording, retire it and write a new one.
          </div>
        )}

        <fieldset disabled={locked} className="space-y-4">
          <div>
            <span className={labelClass}>Question type</span>
            <div className="flex gap-2">
              {(['multiple_choice', 'short_response'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={type === t}
                  disabled={locked || Boolean(initial)}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium font-body transition-all disabled:opacity-60 ${type === t ? 'bg-purple-600 text-white' : 'bg-white border border-[#E8EAF0] text-gray-600 hover:border-purple-200'}`}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="item-subject" className={labelClass}>Subject</label>
              <input id="item-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={80} placeholder="Match the template’s subject, e.g. Science" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="item-skill" className={labelClass}>Skill</label>
              <select id="item-skill" value={skill} onChange={(e) => setSkill(e.target.value)} className={fieldClass}>
                {options.skills.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="item-cx" className={labelClass}>Complexity ({options.complexity.min} recall to {options.complexity.max} complex reasoning)</label>
              <input id="item-cx" type="number" min={options.complexity.min} max={options.complexity.max} value={complexity} onChange={(e) => setComplexity(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="item-points" className={labelClass}>Marks</label>
              <input id="item-points" type="number" min={0} max={100} value={points} onChange={(e) => setPoints(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <label htmlFor="item-prompt" className={labelClass}>Question</label>
            <textarea id="item-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={5000} rows={4} className={fieldClass} />
          </div>

          {type === 'multiple_choice' ? (
            <div>
              <span className={labelClass}>Options (select the correct one)</span>
              {choices.map((text, i) => (
                <div key={i} className="flex items-center gap-2 mb-2">
                  <input type="radio" name="correct" aria-label={`Option ${keyFor(i)} is correct`} checked={correct === keyFor(i)} onChange={() => setCorrect(keyFor(i))} className="accent-purple-600" />
                  <span className="w-5 text-sm font-display font-700 text-gray-400">{keyFor(i)}</span>
                  <input value={text} onChange={(e) => setChoices(choices.map((c, j) => (j === i ? e.target.value : c)))} maxLength={1000} aria-label={`Option ${keyFor(i)}`} className={fieldClass} />
                  <button type="button" disabled={choices.length <= 2} onClick={() => removeChoice(i)} aria-label={`Remove option ${keyFor(i)}`} className="px-2 text-gray-400 hover:text-red-500 text-lg leading-none disabled:opacity-30">×</button>
                </div>
              ))}
              {choices.length < 6 && (
                <button type="button" onClick={() => setChoices([...choices, ''])} className="text-sm font-medium font-body text-purple-600 hover:text-purple-700">Add option</button>
              )}
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="item-model" className={labelClass}>Model answer</label>
                <textarea id="item-model" value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} maxLength={5000} rows={3} placeholder="What a full-marks answer says" className={fieldClass} />
              </div>
              <div>
                <label htmlFor="item-rubric" className={labelClass}>Marking guide</label>
                <textarea id="item-rubric" value={rubric} onChange={(e) => setRubric(e.target.value)} maxLength={5000} rows={3} placeholder="How marks are awarded, e.g. 1 mark for naming the variable, 1 for explaining the control" className={fieldClass} />
              </div>
            </>
          )}
        </fieldset>

        {error && <div role="alert" className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-body px-3 py-2">{error}</div>}
      </div>

      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F0F2F7]">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-xl border border-[#E8EAF0] text-gray-600 hover:border-purple-200 text-sm font-medium font-body">Back to list</button>
        {!locked && (
          <button type="button" disabled={saving} onClick={() => submit('draft')} className="px-4 py-2 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 text-sm font-semibold font-body disabled:opacity-50">Save draft</button>
        )}
        <button type="button" disabled={saving} onClick={() => submit('approved')} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body disabled:opacity-50">
          {saving ? 'Saving…' : 'Save and approve'}
        </button>
      </div>
    </>
  );
}
