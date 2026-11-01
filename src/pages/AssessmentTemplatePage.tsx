import { useState } from 'react';
import type { Page } from '../types';
import DataSourceBadge from '../components/DataSourceBadge';
import { apiSend, ApiRequestError, selectTemplate, useApiData } from '../lib/api';
import { Alert, PageStatus } from '../components/ui';

interface Props { setPage: (p: Page) => void; }

const templates = [
  {
    id: '1',
    title: 'Critical Thinking in Data Interpretation',
    subject: 'Science',
    grade: 'Grade 10–12',
    duration: '45 min',
    questions: 24,
    skills: ['Critical Thinking', 'Analytical Thinking', 'Research'],
    difficulty: 'Advanced',
    status: 'Published',
    lastUsed: '3 days ago',
    completions: 142,
  },
  {
    id: '2',
    title: 'Collaborative Problem Solving',
    subject: 'Mathematics',
    grade: 'Grade 9–11',
    duration: '30 min',
    questions: 18,
    skills: ['Collaboration', 'Decision-Making', 'Analytical Thinking'],
    difficulty: 'Intermediate',
    status: 'Published',
    lastUsed: '1 week ago',
    completions: 89,
  },
  {
    id: '3',
    title: 'Creative Writing & Adaptability Challenge',
    subject: 'English',
    grade: 'Grade 8–10',
    duration: '60 min',
    questions: 32,
    skills: ['Creativity', 'Adaptability / Growth Mindset', 'Research'],
    difficulty: 'Intermediate',
    status: 'Draft',
    lastUsed: 'Never',
    completions: 0,
  },
  {
    id: '4',
    title: 'Research Methods & Source Evaluation',
    subject: 'Humanities',
    grade: 'Grade 11–12',
    duration: '50 min',
    questions: 28,
    skills: ['Research', 'Critical Thinking', 'Analytical Thinking'],
    difficulty: 'Advanced',
    status: 'Published',
    lastUsed: '2 days ago',
    completions: 67,
  },
  {
    id: '5',
    title: 'Decision-Making Under Uncertainty',
    subject: 'Economics',
    grade: 'Grade 10–12',
    duration: '35 min',
    questions: 20,
    skills: ['Decision-Making', 'Analytical Thinking', 'Critical Thinking'],
    difficulty: 'Intermediate',
    status: 'Published',
    lastUsed: '5 days ago',
    completions: 201,
  },
  {
    id: '6',
    title: 'Growth Mindset & Resilience Survey',
    subject: 'Personal Development',
    grade: 'Grade 7–12',
    duration: '20 min',
    questions: 15,
    skills: ['Adaptability / Growth Mindset', 'Collaboration'],
    difficulty: 'Foundation',
    status: 'Published',
    lastUsed: 'Today',
    completions: 318,
  },
];

const difficultyColor: Record<string, string> = {
  Foundation: 'bg-blue-50 text-blue-600',
  Intermediate: 'bg-yellow-50 text-yellow-700',
  Advanced: 'bg-red-50 text-red-600',
};

const skillColor = [
  'bg-purple-50 text-purple-700',
  'bg-pink-50 text-pink-700',
  'bg-indigo-50 text-indigo-700',
];

// Demo data, shown when the API server isn't running. The live version comes
// from GET /api/templates in the same shape.
const mockLibrary = {
  stats: { total: 24, drafts: 3, active: 8, inProgress: 3, completions: 1247, completionsThisWeek: 142, averageScore: 71 },
  templates,
};

export default function AssessmentTemplatePage({ setPage }: Props) {
  const library = useApiData('/templates', mockLibrary);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [error, setError] = useState<string | null>(null);
  if (!library.ready) return <PageStatus error={library.error} onRetry={library.reload} />;
  const { stats, templates } = library.data;
  const open = (id: string) => {
    selectTemplate(id);
    setPage('template-editor');
  };
  const duplicate = async (id: string) => {
    try {
      const copy = await apiSend<{ id: string }>('POST', `/templates/${id}/duplicate`);
      open(copy.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not duplicate');
    }
  };

  const filtered = templates.filter((t) => {
    const matchSearch = t.title.toLowerCase().includes(search.toLowerCase()) || t.subject.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'All' || t.status === filter || t.difficulty === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="min-h-screen bg-[#F8F9FC] p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full bg-purple-500"></div>
            <span className="text-xs font-mono font-600 text-purple-600 uppercase tracking-widest">Assessment System</span>
            <DataSourceBadge source={library.source} reason={library.offlineReason} />
          </div>
          <h1 className="font-display font-700 text-2xl text-gray-900">Assessment Templates</h1>
          <p className="text-sm text-gray-500 font-body mt-0.5">{templates.length} templates available across all subjects</p>
        </div>
        <button onClick={() => open('new')} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold font-body transition-all shadow-sm shadow-purple-200 active:scale-95">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          New Template
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Templates', value: String(stats.total), icon: '📋', change: `${stats.drafts} in draft` },
          { label: 'Active Assessments', value: String(stats.active), icon: '✏️', change: `${stats.inProgress} in progress` },
          { label: 'Total Completions', value: stats.completions.toLocaleString(), icon: '✅', change: `+${stats.completionsThisWeek} this week` },
          { label: 'Avg. Score', value: `${stats.averageScore}%`, icon: '📊', change: 'Across all released results' },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#E8EAF0] p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-sm font-body">{s.label}</span>
              <span className="text-lg">{s.icon}</span>
            </div>
            <div className="font-display font-700 text-2xl text-gray-900">{s.value}</div>
            <div className="text-xs text-purple-600 font-body mt-1">{s.change}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg width="15" height="15" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-[#E8EAF0] text-sm font-body bg-white focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-50"
          />
        </div>
        {['All', 'Published', 'Draft', 'Foundation', 'Intermediate', 'Advanced'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium font-body transition-all ${
              filter === f ? 'bg-purple-600 text-white' : 'bg-white border border-[#E8EAF0] text-gray-600 hover:border-purple-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      {templates.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E8EAF0] p-10 text-center text-sm text-gray-500 font-body">
          No assessment templates yet. Create one with “New Template”: choose the skills, then how many questions to draw from the question bank.
        </div>
      )}

      {/* Template grid */}
      <div className="grid grid-cols-2 gap-4">
        {filtered.map((t) => (
          <div
            key={t.id}
            onClick={() => open(t.id)}
            className="bg-white rounded-xl border border-[#E8EAF0] p-5 hover:border-purple-200 hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono text-gray-400">{t.subject}</span>
                  <span className="text-gray-200">·</span>
                  <span className="text-xs font-body text-gray-400">{t.grade}</span>
                </div>
                <h3 className="font-display font-600 text-gray-900 text-base leading-snug group-hover:text-purple-700 transition-colors">
                  {t.title}
                </h3>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-body ${t.status === 'Published' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {t.status}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium font-body ${difficultyColor[t.difficulty]}`}>
                  {t.difficulty}
                </span>
              </div>
            </div>

            {/* Skills */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {t.skills.map((s, i) => (
                <span key={s} className={`text-xs px-2 py-0.5 rounded-full font-body ${skillColor[i % skillColor.length]}`}>
                  {s}
                </span>
              ))}
            </div>

            {/* Meta */}
            <div className="flex items-center gap-4 text-xs text-gray-400 font-body mb-4 border-t border-[#F0F2F7] pt-3">
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {t.duration}
              </span>
              <span className="flex items-center gap-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/></svg>
                {t.questions} questions
              </span>
              <span>{t.completions} completions</span>
              <span className="ml-auto">Last used: {t.lastUsed}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); open(t.id); }}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2 text-xs font-semibold font-body transition-all"
              >
                {t.status === 'Published' ? 'Open & assign' : 'Edit'}
              </button>
              <button onClick={(e) => { e.stopPropagation(); duplicate(t.id); }} className="px-3 py-2 rounded-lg border border-[#E8EAF0] text-gray-500 hover:border-purple-200 hover:text-purple-600 text-xs font-medium font-body transition-all">
                Duplicate
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
