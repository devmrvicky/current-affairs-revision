import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, AlertTriangle } from 'lucide-react';
import { getMockDefinition } from '../services/mockDefinitionRepository';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { mockAttemptsDB } from '../services/db';
import { analyzeMockAttempt } from '../services/mockAnalysisService';
import { downloadMockReport } from '../services/mockReportExportService';
import { AnalysisView } from '../components/mock-analysis/AnalysisView';
import type { UniversalQuestion } from '../types/universalQuestion';
import type { MockDefinition } from '../types/examMock';
import type { MockAnalysis } from '../types/mockAnalysis';

type LoadState = 'loading' | 'ready' | 'not-found';

export default function MockResultPage() {
  const { mockId, attemptId } = useParams<{ mockId: string; attemptId?: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>('loading');
  const [notFoundReason, setNotFoundReason] = useState<string>('');
  const [definition, setDefinition] = useState<MockDefinition | null>(null);
  const [analysis, setAnalysis] = useState<MockAnalysis | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!mockId) { setState('not-found'); setNotFoundReason('No mock was specified.'); return; }

      const def = await getMockDefinition(mockId);
      if (!def) {
        if (!cancelled) { setState('not-found'); setNotFoundReason("This mock couldn't be found — it may have been removed or renamed."); }
        return;
      }

      const attempt = attemptId ? await mockAttemptsDB.get(attemptId) : await mockAttemptsDB.getMostRecentForMock(mockId);
      if (!attempt) {
        if (!cancelled) { setState('not-found'); setNotFoundReason(attemptId ? 'This attempt is no longer available on this device.' : "You haven't completed this test yet."); }
        return;
      }

      const allIds = attempt.sections.flatMap((s) => s.questionIds);
      const questions = await resolveQuestionsByIds(allIds);
      const questionsById = new Map<string, UniversalQuestion>(questions.map((q) => [q.id, q]));

      const result = await analyzeMockAttempt(attempt, def, questionsById);
      if (cancelled) return;
      setDefinition(def);
      setAnalysis(result);
      setState('ready');
    }

    load();
    return () => { cancelled = true; };
  }, [mockId, attemptId]);

  if (state === 'loading') {
    return (
      <div className="max-w-4xl mx-auto pt-6 pb-10 space-y-3">
        <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />
        <div className="card h-64 shimmer" style={{ background: 'var(--border)' }} />
      </div>
    );
  }

  if (state === 'not-found' || !analysis || !definition) {
    return (
      <div className="max-w-lg mx-auto pt-16 text-center px-4">
        <AlertTriangle size={32} className="mx-auto mb-3 text-amber-500" />
        <h1 className="font-display font-bold text-lg mb-1" style={{ color: 'var(--text-primary)' }}>Result not available</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>{notFoundReason}</p>
        <button onClick={() => navigate('/mock-tests')} className="btn-primary px-5 py-2.5 text-sm">Back to Mock Tests</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pt-4 pb-12 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => navigate('/mock-tests')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
          <ArrowLeft size={14} /> Back
        </button>
        <h1 className="font-display font-semibold text-sm sm:text-base" style={{ color: 'var(--text-primary)' }}>Test Analysis</h1>
        <button
          onClick={() => downloadMockReport(analysis)}
          className="flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <Download size={14} /> <span className="hidden sm:inline">Download Report</span>
        </button>
      </div>

      {/* Test title */}
      <div>
        <h2 className="font-display text-lg sm:text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{analysis.title}</h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Completed {new Date(analysis.completedAt).toLocaleString()}</p>
      </div>

      <AnalysisView analysis={analysis} variant="mock" />
    </div>
  );
}

