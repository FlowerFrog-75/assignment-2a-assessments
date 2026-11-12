import { useEffect, useState } from 'react';
import type { Page } from '../types';
import { apiGet, apiSend, ApiRequestError, selectTemplate, selectedTemplate, useApiData } from '../lib/api';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, PageStatus, Select, SKILL_OPTIONS, skillLabel, Textarea } from '../components/ui';
import { AgentRun } from '../components/AiQuestionGenerator';
import { AI_OFF_MESSAGE, useAiStatus } from '../lib/ai';

interface Props { setPage: (p: Page) => void; }

interface BlueprintRow { skill: string; complexity: number; count: number; available?: number }
interface Assignment { classId: string; className: string; students: number; started: number; submitted: number; due: string }
interface Template {
  id: string;
  title: string;
  description: string;
  subject: string;
  yearLevels: { min: number; max: number };
  curriculumCode: string;
  curriculumDescription: string;
  skills: string[];
  difficulty: 'foundation' | 'intermediate' | 'advanced';
  status: 'draft' | 'published' | 'archived';
  durationMinutes: number;
  blueprint: BlueprintRow[];
  createdBy: string;
  canEdit: boolean;
  locked: boolean;
  assignments: Assignment[];
  classOptions: { id: string; name: string }[];
}

const blank: Template = {
  id: '',
  title: '',
  description: '',
  subject: '',
  yearLevels: { min: 7, max: 12 },
  curriculumCode: '',
  curriculumDescription: '',
  skills: [],
  difficulty: 'intermediate',
  status: 'draft',
  durationMinutes: 30,
  blueprint: [],
  createdBy: '',
  canEdit: true,
  locked: false,
  assignments: [],
  classOptions: [],
};

export default function TemplateEditor({ setPage }: Props) {
  const id = selectedTemplate();
  const isNew = !id || id === 'new';
  const loaded = useApiData<Template>(isNew ? null : `/templates/${id}`, blank);
  const subjects = useApiData<{ subjects: string[] }>('/items?status=approved', { subjects: [] });
  const [form, setForm] = useState<Template>(blank);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'green' | 'red' | 'amber'; text: string } | null>(null);
  const [assignClass, setAssignClass] = useState('');
  const [assignDue, setAssignDue] = useState('');
  const ai = useAiStatus();
  const [aiJob, setAiJob] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && loaded.ready) setForm(loaded.data);
  }, [isNew, loaded.ready, loaded.data]);

  if (!isNew && !loaded.ready) return <PageStatus error={loaded.error} onRetry={loaded.reload} />;
  const editable = form.canEdit;

  const refreshAvailability = async (next: Template) => {
    // The server works out how many approved questions each row can draw from.
    if (!next.id) return;
    const result = await apiGet<Template>(`/templates/${next.id}`);
    if (result.kind === 'ok') setForm(result.data);
  };

  const body = () => ({
    title: form.title,
    description: form.description,
    subject: form.subject,
    yearLevels: form.yearLevels,
    curriculumCode: form.curriculumCode,
    curriculumDescription: form.curriculumDescription,
    skills: form.skills,
    difficulty: form.difficulty,
    durationMinutes: form.durationMinutes,
    blueprint: form.blueprint.map(({ skill, complexity, count }) => ({ skill, complexity, count })),
  });

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (isNew) {
        const created = await apiSend<{ id: string }>('POST', '/templates', body());
        selectTemplate(created.id);
        const result = await apiGet<Template>(`/templates/${created.id}`);
        if (result.kind === 'ok') setForm(result.data);
        setNotice({ tone: 'green', text: 'Template saved as a draft. Publish it when the questions are ready, then assign it to a class.' });
        setPage('template-editor');
      } else {
        await apiSend('PUT', `/templates/${form.id}`, body());
        await refreshAvailability(form);
        setNotice({ tone: 'green', text: 'Saved.' });
      }
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: Template['status']) => {
    setBusy(true);
    setNotice(null);
    try {
      await apiSend('PUT', `/templates/${form.id}`, body());
      await apiSend('POST', `/templates/${form.id}/status`, { status });
      await refreshAvailability(form);
      setNotice({ tone: 'green', text: status === 'published' ? 'Published. Now assign it to a class below.' : status === 'archived' ? 'Archived.' : 'Moved back to draft.' });
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not change the status' });
    } finally {
      setBusy(false);
    }
  };

  const assign = async (classId: string, due: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await apiSend('PUT', `/templates/${form.id}/assignments/${classId}`, { dueAt: due || null });
      await refreshAvailability(form);
      setAssignClass('');
      setAssignDue('');
      setNotice({ tone: 'green', text: 'Assigned. Students in the class can now start it.' });
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not assign' });
    } finally {
      setBusy(false);
    }
  };

  const unassign = async (classId: string) => {
    if (!window.confirm('Remove this assessment from the class? Students who already started keep their attempt.')) return;
    try {
      await apiSend('DELETE', `/templates/${form.id}/assignments/${classId}`);
      await refreshAvailability(form);
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not unassign' });
    }
  };

  const duplicate = async () => {
    try {
      const copy = await apiSend<{ id: string }>('POST', `/templates/${form.id}/duplicate`);
      selectTemplate(copy.id);
      const result = await apiGet<Template>(`/templates/${copy.id}`);
      if (result.kind === 'ok') setForm(result.data);
      setNotice({ tone: 'green', text: 'Copy created as a draft.' });
    } catch (err) {
      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not duplicate' });
    }
  };

  const toggleSkill = (key: string) => {
    const skills = form.skills.includes(key) ? form.skills.filter((s) => s !== key) : [...form.skills, key];
    setForm({ ...form, skills, blueprint: form.blueprint.filter((row) => skills.includes(row.skill)) });
  };
  const updateRow = (i: number, patch: Partial<BlueprintRow>) => setForm({ ...form, blueprint: form.blueprint.map((row, j) => (j === i ? { ...row, ...patch, available: undefined } : row)) });
  const totalQuestions = form.blueprint.reduce((t, r) => t + r.count, 0);
  const short = form.blueprint.filter((r) => r.available !== undefined && r.available < r.count);

  return (
    <div className="p-8 max-w-5xl">
      <button onClick={() => setPage('assessment-template')} className="text-sm text-gray-500 hover:text-gray-800 font-body mb-3">← All templates</button>
      <PageHeader
        eyebrow="Assessment template"
        accent="emerald"
        title={isNew ? 'New assessment template' : form.title || 'Untitled'}
        subtitle={!isNew && <span className="inline-flex items-center gap-2"><Badge tone={form.status === 'published' ? 'green' : form.status === 'archived' ? 'gray' : 'amber'}>{form.status}</Badge>{form.createdBy && `Created by ${form.createdBy}`}</span>}
        actions={
          !isNew && (
            <>
              <Button variant="secondary" onClick={duplicate}>Duplicate</Button>
              {editable && form.status !== 'published' && <Button accent="emerald" busy={busy} onClick={() => setStatus('published')}>Publish</Button>}
              {editable && form.status === 'published' && <Button variant="secondary" busy={busy} onClick={() => setStatus('draft')}>Unpublish</Button>}
              {editable && form.status !== 'archived' && <Button variant="ghost" busy={busy} onClick={() => setStatus('archived')}>Archive</Button>}
            </>
          )
        }
      />
      {notice && <div className="mb-4"><Alert tone={notice.tone}>{notice.text}</Alert></div>}
      {!editable && <div className="mb-4"><Alert tone="amber">Only the teacher who created this template (or an administrator) can change it. You can duplicate it, or assign it to your classes once it’s published.</Alert></div>}
      {form.locked && editable && <div className="mb-4"><Alert tone="blue">Students have already sat this assessment, so its subject and questions are fixed. You can still change the title, description and timing, or duplicate it.</Alert></div>}

      <fieldset disabled={!editable} className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h2 className="font-display font-semibold text-gray-900 mb-4">Details</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Title" className="sm:col-span-2"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Evaluating Evidence in Science" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
            <Field label="Subject" hint="Questions are drawn from this subject in the question bank">
              <Input list="tpl-subjects" disabled={form.locked} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              <datalist id="tpl-subjects">{subjects.data.subjects.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Difficulty">
              <Select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value as Template['difficulty'] })}>
                <option value="foundation">Foundation</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </Select>
            </Field>
            <Field label="Year levels">
              <div className="flex items-center gap-2">
                <Input type="number" min={1} max={12} value={form.yearLevels.min} onChange={(e) => setForm({ ...form, yearLevels: { ...form.yearLevels, min: Number(e.target.value) } })} />
                <span className="text-gray-400">to</span>
                <Input type="number" min={1} max={12} value={form.yearLevels.max} onChange={(e) => setForm({ ...form, yearLevels: { ...form.yearLevels, max: Number(e.target.value) } })} />
              </div>
            </Field>
            <Field label="Time limit (minutes)"><Input type="number" min={1} max={300} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })} /></Field>
            <Field label="Curriculum code (optional)"><Input value={form.curriculumCode} onChange={(e) => setForm({ ...form, curriculumCode: e.target.value })} placeholder="e.g. AC9S9I06" /></Field>
            <Field label="Curriculum description (optional)"><Input value={form.curriculumDescription} onChange={(e) => setForm({ ...form, curriculumDescription: e.target.value })} /></Field>
          </div>
        </Card>
        <Card>
          <h2 className="font-display font-semibold text-gray-900 mb-1">Skills assessed</h2>
          <p className="text-xs text-gray-500 font-body mb-3">Choose the skills this task evidences.</p>
          <div className="space-y-1.5">
            {SKILL_OPTIONS.map((s) => (
              <label key={s.key} className="flex items-center gap-2 text-sm font-body">
                <input type="checkbox" disabled={form.locked} checked={form.skills.includes(s.key)} onChange={() => toggleSkill(s.key)} /> {s.label}
              </label>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="font-display font-semibold text-gray-900">Questions (blueprint)</h2>
            <span className="text-sm text-gray-500 font-body">{totalQuestions} question{totalQuestions === 1 ? '' : 's'} per student</span>
          </div>
          <p className="text-xs text-gray-500 font-body mb-4">
            Each row draws questions at random from the <strong>approved</strong> questions for this subject, skill and complexity. Every student gets their own
            paper, and the random seed is stored so any paper can be rebuilt later.
          </p>
          {form.blueprint.length === 0 && <p className="text-sm text-gray-400 font-body mb-3">No rows yet.</p>}
          <div className="space-y-2">
            {form.blueprint.map((row, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select disabled={form.locked} value={row.skill} onChange={(e) => updateRow(i, { skill: e.target.value })} className="max-w-[220px]">
                  {form.skills.map((s) => <option key={s} value={s}>{skillLabel(s)}</option>)}
                </Select>
                <Select disabled={form.locked} value={row.complexity} onChange={(e) => updateRow(i, { complexity: Number(e.target.value) })} className="max-w-[160px]">
                  {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>Complexity {c}</option>)}
                </Select>
                <Input disabled={form.locked} type="number" min={1} max={50} value={row.count} onChange={(e) => updateRow(i, { count: Number(e.target.value) })} className="max-w-[90px]" aria-label="Number of questions" />
                <span className="text-xs font-body text-gray-500">question{row.count === 1 ? '' : 's'}</span>
                {row.available !== undefined && (row.available >= row.count ? <Badge tone="green">{row.available} available</Badge> : <Badge tone="red">only {row.available} approved</Badge>)}
                {!form.locked && <Button variant="ghost" className="!px-2" aria-label="Remove row" onClick={() => setForm({ ...form, blueprint: form.blueprint.filter((_, j) => j !== i) })}>✕</Button>}
              </div>
            ))}
          </div>
          {!form.locked && (
            <Button variant="ghost" className="mt-3 text-xs" disabled={form.skills.length === 0} onClick={() => setForm({ ...form, blueprint: [...form.blueprint, { skill: form.skills[0], complexity: 2, count: 1 }] })}>
              + Add row {form.skills.length === 0 && '(choose skills first)'}
            </Button>
          )}
          {short.length > 0 && (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-amber-900 font-body">Some rows need more approved questions before this can be published.</p>
              <span title={ai.ready && ai.data.mode === 'off' ? AI_OFF_MESSAGE : undefined}>
                <Button
                  className="!bg-violet-600 hover:!bg-violet-700"
                  disabled={isNew || !ai.ready || ai.data.mode === 'off'}
                  onClick={async () => {
                    setNotice(null);
                    try {
                      await apiSend('PUT', `/templates/${form.id}`, body());
                      const result = await apiSend<{ jobId: string }>('POST', `/ai/templates/${form.id}/fill`);
                      setAiJob(result.jobId);
                    } catch (err) {
                      setNotice({ tone: 'red', text: err instanceof ApiRequestError ? err.message : 'Could not start the AI' });
                    }
                  }}
                >
                  ✦ Draft the missing questions with AI
                </Button>
              </span>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <Button accent="emerald" busy={busy} onClick={save}>{isNew ? 'Save draft' : 'Save changes'}</Button>
            <Button variant="secondary" onClick={() => setPage('item-bank')}>Open question bank</Button>
          </div>
        </Card>
      </fieldset>

      {!isNew && (
        <Card className="mt-6">
          <h2 className="font-display font-semibold text-gray-900 mb-3">Assigned classes</h2>
          {form.assignments.length === 0 ? (
            <p className="text-sm text-gray-400 font-body mb-4">Not assigned to any class yet.</p>
          ) : (
            <table className="w-full text-sm font-body mb-4">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase"><th className="py-2">Class</th><th className="py-2">Due</th><th className="py-2">Started</th><th className="py-2">Submitted</th><th></th></tr>
              </thead>
              <tbody>
                {form.assignments.map((a) => (
                  <tr key={a.classId} className="border-t border-[#E8EAF0]">
                    <td className="py-2">{a.className}</td>
                    <td className="py-2">
                      <Input type="date" defaultValue={a.due} onBlur={(e) => e.target.value !== a.due && assign(a.classId, e.target.value)} className="max-w-[170px] !py-1" />
                    </td>
                    <td className="py-2">{a.started} / {a.students}</td>
                    <td className="py-2">{a.submitted}</td>
                    <td className="py-2 text-right"><Button variant="ghost" className="!py-1 text-xs text-red-600" onClick={() => unassign(a.classId)}>Unassign</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {form.status === 'published' ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Class">
                <Select value={assignClass} onChange={(e) => setAssignClass(e.target.value)} className="min-w-[200px]">
                  <option value="">Choose a class…</option>
                  {form.classOptions.filter((c) => !form.assignments.some((a) => a.classId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Due date (optional)"><Input type="date" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} /></Field>
              <Button accent="emerald" disabled={!assignClass} busy={busy} onClick={() => assign(assignClass, assignDue)}>Assign</Button>
            </div>
          ) : (
            <p className="text-xs text-gray-500 font-body">Publish the template to assign it.</p>
          )}
        </Card>
      )}
      {aiJob && (
        <AgentRun
          jobId={aiJob}
          onClose={async () => {
            setAiJob(null);
            await refreshAvailability(form);
          }}
          onReview={() => setPage('item-bank')}
        />
      )}
    </div>
  );
}
