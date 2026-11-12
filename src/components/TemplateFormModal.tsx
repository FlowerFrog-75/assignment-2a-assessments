import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../lib/api';

export interface TemplateOptions {
  skills: { key: string; name: string }[];
  difficulties: string[];
  complexity: { min: number; max: number };
}

/** A template card in the same shape the Assessment Templates screen lists. */
export interface TemplateCard {
  id: string;
  title: string;
  subject: string;
  grade: string;
  duration: string;
  questions: number;
  skills: string[];
  difficulty: string;
  status: string;
  lastUsed: string;
  completions: number;
}

export interface BlueprintRow {
  skill: string;
  complexity: number;
  count: number;
}

/** A template in full, as returned by GET /api/templates/:id. */
export interface TemplateDetail {
  id: string;
  title: string;
  description: string;
  subject: string;
  yearLevels: { min: number; max: number };
  skills: string[];
  difficulty: string;
  status: string;
  durationMinutes: number;
  blueprint: BlueprintRow[];
  /** How many times students have started it. Above zero, only title and description can change. */
  attempts: number;
}

interface Props {
  options: TemplateOptions;
  /** True when the API is answering. False means demo mode: changes only show on this screen. */
  live: boolean;
  /** Present when editing. */
  initial?: TemplateDetail;
  onClose: () => void;
  /** Live: card is null once the server has saved it (reload the list). Demo: the card to show. */
  onSaved: (card: TemplateCard | null, message: string) => void;
}

const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const fieldClass =
  'w-full px-3 py-2 rounded-xl border border-[#E8EAF0] text-sm font-body bg-white focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-50 disabled:bg-gray-50 disabled:text-gray-400';
const labelClass = 'block text-sm font-medium font-body text-gray-700 mb-1';

export default function TemplateFormModal({ options, live, initial, onClose, onSaved }: Props) {
  const editing = Boolean(initial);
  const locked = (initial?.attempts ?? 0) > 0;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [yearMin, setYearMin] = useState(String(initial?.yearLevels.min ?? 9));
  const [yearMax, setYearMax] = useState(String(initial?.yearLevels.max ?? 10));
  const [duration, setDuration] = useState(String(initial?.durationMinutes ?? 45));
  const [difficulty, setDifficulty] = useState(initial?.difficulty ?? options.difficulties[0] ?? '');
  const [skills, setSkills] = useState<string[]>(initial?.skills ?? []);
  const [blueprint, setBlueprint] = useState<BlueprintRow[]>(initial?.blueprint ?? []);
  const [availability, setAvailability] = useState<BlueprintRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // How many approved questions the bank holds for this subject, so rows that can't be filled are visible.
  async function loadAvailability(forSubject: string) {
    if (!live || !forSubject.trim()) return setAvailability([]);
    const result = await apiGet<BlueprintRow[]>(`/items/availability?subject=${encodeURIComponent(forSubject.trim())}`);
    if (result.kind === 'ok') setAvailability(result.data);
  }
  useEffect(() => {
    loadAvailability(initial?.subject ?? '');
    // only for the subject the form opens with; after that it reloads when the subject field loses focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skillName = (key: string) => options.skills.find((s) => s.key === key)?.name ?? key;

  function toggleSkill(key: string) {
    if (skills.includes(key)) {
      setSkills(skills.filter((k) => k !== key));
      // A blueprint row can only use a skill the template assesses.
      setBlueprint(blueprint.filter((row) => row.skill !== key));
    } else {
      setSkills([...skills, key]);
    }
  }

  const addRow = () => skills.length > 0 && setBlueprint([...blueprint, { skill: skills[0], complexity: options.complexity.min, count: 5 }]);
  const updateRow = (index: number, change: Partial<BlueprintRow>) =>
    setBlueprint(blueprint.map((row, i) => (i === index ? { ...row, ...change } : row)));

  function validate(status: string): string | null {
    if (!title.trim()) return 'Enter a title for the template.';
    if (locked) return null; // only the title and description are sent
    if (!subject.trim()) return 'Enter the subject this assessment belongs to.';
    const min = Number(yearMin);
    const max = Number(yearMax);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 12) return 'Year levels must be whole numbers from 1 to 12.';
    if (min > max) return 'The first year level can’t be higher than the last.';
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 300) return 'Duration must be between 1 and 300 minutes.';
    if (skills.length === 0) return 'Select at least one skill to assess.';
    if (blueprint.some((row) => !Number.isInteger(row.count) || row.count < 1 || row.count > 50)) return 'Each blueprint row needs between 1 and 50 questions.';
    if (status === 'published' && blueprint.length === 0) return 'Add at least one blueprint row before publishing.';
    return null;
  }

  /** `status` is undefined when saving changes to a template that is already published. */
  async function submit(status?: 'draft' | 'published') {
    const effective = status ?? initial?.status ?? 'draft';
    const problem = validate(effective);
    if (problem) return setError(problem);
    setError(null);

    const payload = locked
      ? { title: title.trim(), description: description.trim() }
      : {
          title: title.trim(),
          description: description.trim() || undefined,
          subject: subject.trim(),
          yearLevels: { min: Number(yearMin), max: Number(yearMax) },
          skills,
          difficulty,
          durationMinutes: Number(duration),
          status,
          blueprint,
        };
    const message = !editing ? (status === 'published' ? 'Template published.' : 'Draft saved.') : status === 'published' ? 'Template published.' : 'Changes saved.';

    if (!live) {
      // Demo mode: no server to save to, so show it on this screen only.
      onSaved(
        {
          id: initial?.id ?? `local-${Date.now()}`,
          title: title.trim(),
          subject: subject.trim(),
          grade: `Grade ${yearMin}–${yearMax}`,
          duration: `${duration} min`,
          questions: blueprint.reduce((total, row) => total + row.count, 0),
          skills: skills.map(skillName),
          difficulty: capitalize(difficulty),
          status: capitalize(effective),
          lastUsed: 'Never',
          completions: 0,
        },
        `${message} (Demo only: the server isn’t running, so it isn’t saved.)`,
      );
      return;
    }

    setSaving(true);
    const result = editing ? await apiPut<{ id: string }>(`/templates/${initial!.id}`, payload) : await apiPost<{ id: string }>('/templates', payload);
    setSaving(false);
    if (result.kind === 'ok') onSaved(null, message);
    else if (result.kind === 'offline') setError(`Couldn’t save: ${result.reason}.`);
    else setError(result.error.message);
  }

  const isDraft = !initial || initial.status === 'draft';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="template-form-title" className="w-full max-w-2xl bg-white rounded-2xl border border-[#E8EAF0] shadow-xl my-8">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-[#F0F2F7]">
          <div>
            <h2 id="template-form-title" className="font-display font-700 text-xl text-gray-900">{editing ? 'Edit template' : 'New template'}</h2>
            <p className="text-sm text-gray-500 font-body mt-0.5">
              {locked
                ? `Students have already started this assessment, so only the title and description can change. Duplicate it to change the questions.`
                : live
                  ? 'Questions are drawn from the question bank using the blueprint below.'
                  : 'The server isn’t running, so changes only show on this screen until you reload.'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2">×</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="tpl-title" className={labelClass}>Title</label>
            <input id="tpl-title" ref={titleRef} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Critical Thinking in Data Interpretation" className={fieldClass} />
          </div>

          <div>
            <label htmlFor="tpl-desc" className={labelClass}>Description</label>
            <textarea id="tpl-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="What students will do, and what it shows about their skills" className={fieldClass} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="tpl-subject" className={labelClass}>Subject</label>
              <input id="tpl-subject" disabled={locked} value={subject} onChange={(e) => setSubject(e.target.value)} onBlur={() => loadAvailability(subject)} maxLength={80} placeholder="e.g. Science" className={fieldClass} />
            </div>
            <div>
              <label htmlFor="tpl-duration" className={labelClass}>Duration (minutes)</label>
              <input id="tpl-duration" disabled={locked} type="number" min={1} max={300} value={duration} onChange={(e) => setDuration(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="tpl-ymin" className={labelClass}>Year level from</label>
              <input id="tpl-ymin" disabled={locked} type="number" min={1} max={12} value={yearMin} onChange={(e) => setYearMin(e.target.value)} className={fieldClass} />
            </div>
            <div>
              <label htmlFor="tpl-ymax" className={labelClass}>Year level to</label>
              <input id="tpl-ymax" disabled={locked} type="number" min={1} max={12} value={yearMax} onChange={(e) => setYearMax(e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div>
            <label htmlFor="tpl-difficulty" className={labelClass}>Difficulty</label>
            <select id="tpl-difficulty" disabled={locked} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={fieldClass}>
              {options.difficulties.map((d) => (
                <option key={d} value={d}>{capitalize(d)}</option>
              ))}
            </select>
          </div>

          <fieldset disabled={locked}>
            <legend className={labelClass}>Skills assessed</legend>
            <div className="flex flex-wrap gap-2">
              {options.skills.map((s) => {
                const on = skills.includes(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleSkill(s.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium font-body transition-all disabled:opacity-60 ${on ? 'bg-purple-600 text-white' : 'bg-white border border-[#E8EAF0] text-gray-600 hover:border-purple-200'}`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className={labelClass + ' mb-0'}>Question blueprint</span>
              <button type="button" onClick={addRow} disabled={locked || skills.length === 0} className="text-sm font-medium font-body text-purple-600 hover:text-purple-700 disabled:text-gray-300">
                Add row
              </button>
            </div>
            <p className="text-xs text-gray-500 font-body mb-2">
              Each row draws approved questions for one skill from the question bank. The total is how many questions students see.
            </p>
            {skills.length === 0 && <p className="text-sm text-gray-400 font-body">Select a skill above to start the blueprint.</p>}
            {blueprint.map((row, i) => {
              const have = availability.find((a) => a.skill === row.skill && a.complexity === row.complexity)?.count ?? 0;
              return (
                <div key={i} className="mb-3">
                  <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
                    <div>
                      <label htmlFor={`bp-skill-${i}`} className="block text-xs text-gray-500 font-body mb-0.5">Skill</label>
                      <select id={`bp-skill-${i}`} disabled={locked} value={row.skill} onChange={(e) => updateRow(i, { skill: e.target.value })} className={fieldClass}>
                        {skills.map((k) => (
                          <option key={k} value={k}>{skillName(k)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`bp-cx-${i}`} className="block text-xs text-gray-500 font-body mb-0.5">Complexity</label>
                      <input id={`bp-cx-${i}`} disabled={locked} type="number" min={options.complexity.min} max={options.complexity.max} value={row.complexity} onChange={(e) => updateRow(i, { complexity: Number(e.target.value) })} className={fieldClass + ' w-24'} />
                    </div>
                    <div>
                      <label htmlFor={`bp-n-${i}`} className="block text-xs text-gray-500 font-body mb-0.5">Questions</label>
                      <input id={`bp-n-${i}`} disabled={locked} type="number" min={1} max={50} value={row.count} onChange={(e) => updateRow(i, { count: Number(e.target.value) })} className={fieldClass + ' w-24'} />
                    </div>
                    <button type="button" disabled={locked} onClick={() => setBlueprint(blueprint.filter((_, j) => j !== i))} aria-label={`Remove row ${i + 1}`} className="px-2 py-2 text-gray-400 hover:text-red-500 text-lg leading-none disabled:opacity-30">×</button>
                  </div>
                  {live && subject.trim() && (
                    <p className={`text-xs font-body mt-1 ${have < row.count ? 'text-red-600' : 'text-gray-500'}`}>
                      {have} approved {have === 1 ? 'question' : 'questions'} in the bank for {skillName(row.skill)} at complexity {row.complexity}
                      {have < row.count ? `. You need ${row.count}, so this can’t be launched yet.` : '.'}
                    </p>
                  )}
                </div>
              );
            })}
            {blueprint.length > 0 && (
              <p className="text-xs text-gray-500 font-body">Total: {blueprint.reduce((t, r) => t + (r.count || 0), 0)} questions</p>
            )}
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-body px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#F0F2F7]">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-[#E8EAF0] text-gray-600 hover:border-purple-200 text-sm font-medium font-body">Cancel</button>
          {isDraft ? (
            <>
              <button type="button" disabled={saving} onClick={() => submit('draft')} className="px-4 py-2 rounded-xl border border-purple-200 text-purple-700 hover:bg-purple-50 text-sm font-semibold font-body disabled:opacity-50">Save draft</button>
              <button type="button" disabled={saving} onClick={() => submit('published')} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body disabled:opacity-50">
                {saving ? 'Saving…' : 'Publish'}
              </button>
            </>
          ) : (
            <button type="button" disabled={saving} onClick={() => submit()} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold font-body disabled:opacity-50">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
