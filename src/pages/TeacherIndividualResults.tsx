import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { useState } from 'react';
import { apiSend, ApiRequestError, isPreviewMode, selectedStudent, useApiData } from '../lib/api';
import { PageStatus } from '../components/ui';
import { ChartCard, CompareLegend, comparisonFinding, HeatCell, levelOf, SkillBullets, skillFinding, TrendChart, type BulletRow } from '../components/charts';

interface Props { setPage: (p: Page) => void; }

const mockStudent = {
  name: 'Jordan Smith',
  id: 'DSW-2024-JS-1147',
  grade: 'Grade 11',
  avatar: 'JS',
  overall: 79,
  topSkill: 'Collaboration',
  focusArea: 'Decision-Making',
  trend: '+6% this term',
  assessments: [
    { title: 'Critical Thinking in Data Interpretation', subject: 'Science', date: 'Oct 16', score: 79, status: 'Graded' },
    { title: 'Collaborative Problem Solving', subject: 'Mathematics', date: 'Oct 14', score: 84, status: 'Graded' },
    { title: 'Growth Mindset & Resilience Survey', subject: 'Personal Dev.', date: 'Oct 9', score: 91, status: 'Graded' },
    { title: 'Creative Writing Challenge', subject: 'English', date: 'Oct 2', score: 73, status: 'Graded' },
    { title: 'Research Methods & Source Evaluation', subject: 'Humanities', date: 'Oct 9', score: 67, status: 'In Progress' },
  ],
  skills: [
    { name: 'Analytical Thinking', short: 'Analytical', score: 78, level: 4, classAvg: 77 },
    { name: 'Research', short: 'Research', score: 65, level: 3, classAvg: 73 },
    { name: 'Critical Thinking', short: 'Critical', score: 82, level: 4, classAvg: 77 },
    { name: 'Creativity', short: 'Creativity', score: 71, level: 3, classAvg: 78 },
    { name: 'Decision-Making', short: 'Decision', score: 59, level: 3, classAvg: 71 },
    { name: 'Collaboration', short: 'Collab.', score: 88, level: 4, classAvg: 80 },
    { name: 'Adaptability', short: 'Adaptability', score: 74, level: 3, classAvg: 78 },
  ],
  notes: [
    { date: 'Oct 14', teacher: 'Ms. Chen', note: 'Shows strong verbal reasoning but struggles with quantitative analysis. Recommend additional data literacy resources.' },
    { date: 'Sep 30', teacher: 'Ms. Chen', note: 'Excellent collaboration in group tasks. Leadership potential observed. Encourage more independent research practice.' },
  ],
};

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/students/:walletId/profile in the same shape.
const mockProfile = { student: mockStudent };

export default function TeacherIndividualResults({ setPage }: Props) {
  const walletId = selectedStudent();
  const profile = useApiData(walletId ? `/students/${encodeURIComponent(walletId)}/profile` : null, mockProfile);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  if (!walletId && !isPreviewMode()) {
    return (
      <PageStatus error={{ status: 404, code: 'no_student', message: 'Choose a student from Class Results to see their individual results.' }}>
        <button onClick={() => setPage('teacher-class')} className="text-sm text-emerald-600 font-semibold">Go to Class Results →</button>
      </PageStatus>
    );
  }
  if (!profile.ready && !(profile.error && profile.error.status === 403)) return <PageStatus error={profile.error} onRetry={profile.reload} />;
  const { student } = profile.data;
  const addNote = async () => {
    setSaving(true);
    setNoteError(null);
    try {
      await apiSend('POST', `/students/${encodeURIComponent(walletId ?? '')}/notes`, { body: note });
      setNote('');
      setNoteOpen(false);
      profile.reload();
    } catch (err) {
      setNoteError(err instanceof ApiRequestError ? err.message : 'Could not save the note');
    } finally {
      setSaving(false);
    }
  };
  const firstName = student.name.split(' ')[0];
  type SkillRow = (typeof student.skills)[number] & { assessed?: boolean };
  const bulletRows: BulletRow[] = (student.skills as SkillRow[]).map((s) => ({
    key: s.name,
    name: s.name,
    score: s.assessed === false ? null : s.score,
    compare: (s.classAvg as number | null) ?? null,
  }));
  const trend = student.assessments
    .filter((a) => a.status === 'Graded')
    .slice()
    .reverse()
    .map((a) => ({ label: a.date, value: a.score, detail: a.title }));

  // The API refuses (403) when the student hasn't consented. The attempt is still audit-logged.
  if (profile.error) {
    return (
      <div className="min-h-screen bg-[#F8F9FC] p-6">
        <button
          onClick={() => setPage('teacher-class')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 font-body transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          Class View
        </button>
        <div className="max-w-lg mx-auto mt-16 bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-8 text-center">
          <div className="text-4xl mb-3">🔒</div>
          <h1 className="font-display font-700 text-xl text-gray-900 mb-2">
            {profile.error.code === 'consent_required' ? 'Student consent required' : 'Results unavailable'}
          </h1>
          <p className="text-sm text-gray-500 font-body leading-relaxed">{profile.error.message}</p>
          <p className="text-xs text-gray-400 font-body mt-4">This access attempt has been recorded in the Access Logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPage('teacher-class')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-emerald-700 font-body transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Class View
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-xs font-mono font-600 text-emerald-600 uppercase tracking-widest">Individual Results</span>
              <DataSourceBadge source={profile.source} reason={profile.offlineReason} />
            </div>
            <h1 className="font-display font-700 text-2xl text-gray-900">{student.name}</h1>
            <p className="text-sm text-gray-500 font-body mt-0.5">{student.grade} · {student.id} · {student.trend}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setNoteOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold font-body transition-all shadow-sm shadow-emerald-200"
          >
            📝 Add note
          </button>
        </div>
      </div>

      {/* Student card */}
      <div className="bg-white rounded-2xl border border-[#E8EAF0] shadow-sm p-5 mb-5 flex items-center gap-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center text-xl font-bold text-white shadow-sm">
          {student.avatar}
        </div>
        <div className="flex-1 grid grid-cols-5 gap-6">
          {[
            { label: `Overall · ${levelOf(student.overall)}`, value: `${student.overall}%`, color: 'text-gray-900' },
            { label: 'Assessments', value: student.assessments.length, color: 'text-gray-900' },
            { label: 'Completed', value: student.assessments.filter(a => a.status === 'Graded').length, color: 'text-gray-900' },
            { label: 'Top Skill', value: student.topSkill, color: 'text-purple-700' },
            { label: 'Focus Area', value: student.focusArea, color: 'text-orange-700' },
          ].map((m) => (
            <div key={m.label}>
              <div className="text-xs text-gray-400 font-body mb-0.5">{m.label}</div>
              <div className={`font-display font-700 text-xl ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Left: Assessment list */}
        <div className="flex flex-col gap-5">
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="px-5 py-4 border-b border-[#F0F2F7]">
              <h2 className="font-display font-600 text-gray-900">Assessment History</h2>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {student.assessments.map((a, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-body font-600 text-gray-800 truncate">{a.title}</div>
                      <div className="text-xs text-gray-400 font-body mt-0.5">{a.subject} · {a.date}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {a.status === 'Graded' ? (
                        <HeatCell value={a.score} label={a.title} />
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-body whitespace-nowrap">{a.status}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Teacher notes */}
          <div className="bg-white rounded-xl border border-[#E8EAF0] shadow-sm">
            <div className="px-5 py-4 border-b border-[#F0F2F7] flex items-center justify-between">
              <h2 className="font-display font-600 text-gray-900">Teacher Notes</h2>
              <button onClick={() => setNoteOpen(true)} className="text-xs text-emerald-600 font-semibold font-body hover:text-emerald-700">+ Add Note</button>
            </div>
            <div className="divide-y divide-[#F0F2F7]">
              {noteOpen && (
                <div className="px-5 py-4">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} aria-label="Note" placeholder="Visible to staff who can see this student's results" className="w-full p-3 rounded-xl border border-[#E8EAF0] text-sm font-body focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                  {noteError && <p className="text-xs text-red-600 font-body mt-1">{noteError}</p>}
                  <div className="flex gap-2 mt-2">
                    <button onClick={addNote} disabled={saving || !note.trim()} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save note'}</button>
                    <button onClick={() => setNoteOpen(false)} className="px-3 py-1.5 rounded-lg text-xs text-gray-500">Cancel</button>
                  </div>
                </div>
              )}
              {student.notes.length === 0 && !noteOpen && <div className="px-5 py-4 text-xs text-gray-400 font-body">No notes yet.</div>}
              {student.notes.map((n, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-gray-400">{n.date}</span>
                    <span className="text-gray-200">·</span>
                    <span className="text-xs font-body text-emerald-600">{n.teacher}</span>
                  </div>
                  <p className="text-xs text-gray-600 font-body leading-relaxed">{n.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: analysis */}
        <div className="col-span-2 flex flex-col gap-5">
          <ChartCard
            title={comparisonFinding(bulletRows, `${firstName} is above`) ?? skillFinding(bulletRows)}
            subtitle="Each skill across all released results. The tick is the class average for the same skill."
            legend={<CompareLegend you={firstName} />}
          >
            <SkillBullets rows={bulletRows} compareLabel="Class average" />
          </ChartCard>
          <ChartCard title="Results over time" subtitle="Overall score on each released assessment">
            <TrendChart points={trend} height={200} emptyText="A trend appears after two released results." />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
