import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Clock, ListChecks, Layers, Zap } from 'lucide-react';
import { useExamStore } from '../store/examStore';
import { getMockDefinitionsForExam } from '../services/mockDefinitionRepository';
import { QuickTestPanel } from '../components/mock/QuickTestPanel';
import type { MockDefinition, FullMockDefinition, SectionalMockDefinition } from '../types/examMock';

type Tab = 'full' | 'sectional' | 'quick';

export default function MockTestListPage() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const [tab, setTab] = useState<Tab>('full');
  const [definitions, setDefinitions] = useState<MockDefinition[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getMockDefinitionsForExam(selectedExamId).then((defs) => {
      if (!cancelled) { setDefinitions(defs); setLoaded(true); }
    });
    return () => { cancelled = true; };
  }, [selectedExamId]);

  const fullMocks = definitions.filter((d): d is FullMockDefinition => d.mode === 'full-mock');
  const sectionalMocks = definitions.filter((d): d is SectionalMockDefinition => d.mode === 'sectional-mock');

  // Grouped by subject (product spec §71-72) — e.g. "Mathematics — 3 Sectional Mocks" once mock02/mock03 exist alongside mock01.
  const sectionalBySubject = useMemo(() => {
    const map = new Map<string, SectionalMockDefinition[]>();
    for (const d of sectionalMocks) {
      const arr = map.get(d.section.subjectId) ?? [];
      arr.push(d);
      map.set(d.section.subjectId, arr);
    }
    return map;
  }, [sectionalMocks]);

  const subjectIds = Array.from(sectionalBySubject.keys());
  const effectiveSubjectId = selectedSubjectId && sectionalBySubject.has(selectedSubjectId) ? selectedSubjectId : (subjectIds[0] ?? '');
  const visibleSectionalMocks = sectionalBySubject.get(effectiveSubjectId) ?? [];

  return (
    <div className="max-w-3xl mx-auto pt-4 pb-10 space-y-5">
      <div>
        <h1 className="font-display text-xl sm:text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Mock Tests</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Full-length exam simulations with independent, locked section timers — plus standalone sectional mocks and a quick, adjustable practice test.
        </p>
      </div>

      <div className="flex gap-2 p-1 rounded-xl w-fit overflow-x-auto no-scrollbar" style={{ background: 'var(--border)' }}>
        <button
          onClick={() => setTab('full')}
          className="flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          style={tab === 'full' ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <ClipboardList size={14} /> Full Mock
        </button>
        <button
          onClick={() => setTab('sectional')}
          className="flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          style={tab === 'sectional' ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <Layers size={14} /> Sectional
        </button>
        <button
          onClick={() => setTab('quick')}
          className="flex-shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          style={tab === 'quick' ? { background: 'var(--card)', color: 'var(--text-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <Zap size={14} /> Quick Test
        </button>
      </div>

      {tab === 'quick' ? (
        <QuickTestPanel />
      ) : !loaded ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="card h-28 shimmer" style={{ background: 'var(--border)' }} />)}
        </div>
      ) : tab === 'full' ? (
        fullMocks.length === 0 ? (
          <EmptyState label="No full mocks are configured for this exam yet." />
        ) : (
          <div className="space-y-3">
            {fullMocks.map((mock) => (
              <FullMockCard key={mock.id} mock={mock} onStart={() => navigate(`/mock-tests/${mock.id}/start`)} />
            ))}
          </div>
        )
      ) : sectionalMocks.length === 0 ? (
        <EmptyState label="No sectional mocks are configured for this exam yet." />
      ) : (
        <div className="space-y-3">
          {/* Subject filter — horizontally scrollable, never wraps on mobile (product spec §104) */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
            {subjectIds.map((subjectId) => {
              const mocksForSubject = sectionalBySubject.get(subjectId) ?? [];
              const active = effectiveSubjectId === subjectId;
              return (
                <button
                  key={subjectId}
                  onClick={() => setSelectedSubjectId(subjectId)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${active ? 'bg-brand-500 text-white' : ''}`}
                  style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                >
                  {mocksForSubject[0]?.section.title ?? subjectId} ({mocksForSubject.length})
                </button>
              );
            })}
          </div>
          <div className="space-y-3">
            {visibleSectionalMocks.map((mock) => (
              <SectionalMockCard key={mock.id} mock={mock} onStart={() => navigate(`/mock-tests/${mock.id}/start`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="card p-8 text-center">
      <ListChecks size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function FullMockCard({ mock, onStart }: { mock: FullMockDefinition; onStart: () => void }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-display font-semibold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>{mock.title}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{mock.totalQuestions} Questions</span>
          <span>{mock.totalMarks} Marks</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {Math.round(mock.durationSeconds / 60)} Minutes</span>
          <span>{mock.sections.length} Sections</span>
        </div>
      </div>
      <button onClick={onStart} className="btn-primary flex-shrink-0 text-sm px-4 py-2">Start</button>
    </div>
  );
}

function SectionalMockCard({ mock, onStart }: { mock: SectionalMockDefinition; onStart: () => void }) {
  return (
    <div className="card p-4 sm:p-5 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <h3 className="font-display font-semibold text-sm sm:text-base truncate" style={{ color: 'var(--text-primary)' }}>{mock.title}</h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>{mock.section.questionCount} Questions</span>
          <span>{mock.section.questionCount * mock.section.marksPerQuestion} Marks</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {Math.round(mock.section.durationSeconds / 60)} Minutes</span>
        </div>
      </div>
      <button onClick={onStart} className="btn-primary flex-shrink-0 text-sm px-4 py-2">Start</button>
    </div>
  );
}
