import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Clock, ListChecks } from 'lucide-react';
import { getMockDefinition, getValidationErrorsForMock, resolveFullMock, resolveSectionalMock } from '../services/mockDefinitionRepository';
import { useMockSessionStore } from '../store/mockSessionStore';
import type { MockDefinition } from '../types/examMock';

export default function MockInstructionsPage() {
  const { mockId } = useParams<{ mockId: string }>();
  const navigate = useNavigate();
  const { startFullMock, startSectionalMock, session } = useMockSessionStore();

  const [definition, setDefinition] = useState<MockDefinition | null>(null);
  const [notFoundReasons, setNotFoundReasons] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!mockId) return;
    getMockDefinition(mockId).then(async (def) => {
      if (cancelled) return;
      if (!def) {
        // Could be a genuinely unknown id, or a mock whose source file failed
        // content validation and was excluded entirely — surface the real
        // reason when there is one (product spec §158) instead of a bare 404.
        const reasons = await getValidationErrorsForMock(mockId);
        if (!cancelled) setNotFoundReasons(reasons.map((r) => r.reason));
      } else {
        setDefinition(def);
      }
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [mockId]);

  async function handleStart() {
    if (!definition || starting) return;
    setStarting(true);
    if (definition.mode === 'full-mock') {
      const resolved = await resolveFullMock(definition);
      if (resolved.errors.length > 0) {
        setErrors(resolved.errors.map((e) => e.reason));
        setStarting(false);
        return;
      }
      startFullMock(definition, resolved.sectionQuestionIds);
    } else {
      const resolved = await resolveSectionalMock(definition);
      if (resolved.errors.length > 0) {
        setErrors(resolved.errors.map((e) => e.reason));
        setStarting(false);
        return;
      }
      startSectionalMock(definition, resolved.questionIds);
    }
    navigate(`/mock-tests/${mockId}/session`);
  }

  if (!loaded) {
    return <div className="max-w-2xl mx-auto pt-10"><div className="card h-64 shimmer" style={{ background: 'var(--border)' }} /></div>;
  }

  if (!definition) {
    return (
      <div className="max-w-2xl mx-auto pt-10">
        <div className="card p-6 text-center">
          <AlertTriangle size={24} className="mx-auto mb-2 text-red-500" />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            {notFoundReasons.length > 0 ? 'This mock has a content problem and could not be loaded.' : "This mock couldn't be found."}
          </p>
          {notFoundReasons.length > 0 && (
            <ul className="text-xs mt-3 space-y-1 text-left list-disc pl-4" style={{ color: 'var(--text-muted)' }}>
              {notFoundReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <button onClick={() => navigate('/mock-tests')} className="btn-primary mt-5 px-5 py-2 text-sm">Back to Mock Tests</button>
        </div>
      </div>
    );
  }

  // If a different session is already active, warn rather than silently discard it.
  const hasConflictingSession = !!session && session.status === 'active' && session.mockDefinitionId !== definition.id;

  return (
    <div className="max-w-2xl mx-auto pt-4 pb-10 space-y-4">
      <button onClick={() => navigate('/mock-tests')} className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-muted)' }}>
        <ArrowLeft size={14} /> Back to Mock Tests
      </button>
      <div className="card p-5 sm:p-6 text-center border-b-0">
        <p className="text-xs uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>ExamVerse Exam Simulation</p>
        <h1 className="font-display text-lg sm:text-xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{definition.title}</h1>
      </div>

      <div className="card p-5 sm:p-6 space-y-4">
        {definition.mode === 'full-mock' ? (
          <>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Stat label="Questions" value={String(definition.totalQuestions)} />
              <Stat label="Marks" value={String(definition.totalMarks)} />
              <Stat label="Duration" value={`${Math.round(definition.durationSeconds / 60)} min`} />
            </div>

            <div>
              <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Section timing</h2>
              <div className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr style={{ background: 'var(--border)' }}>
                      <th className="text-left px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Section</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Questions</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Marks</th>
                      <th className="text-right px-3 py-2 font-medium" style={{ color: 'var(--text-secondary)' }}>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definition.sections.map((s) => (
                      <tr key={s.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--text-primary)' }}>{s.title}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{s.questionCount}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{s.questionCount * s.marksPerQuestion}</td>
                        <td className="px-3 py-2 text-right" style={{ color: 'var(--text-secondary)' }}>{Math.round(s.durationSeconds / 60)} min</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Questions" value={String(definition.section.questionCount)} />
            <Stat label="Marks" value={String(definition.section.questionCount * definition.section.marksPerQuestion)} />
            <Stat label="Duration" value={`${Math.round(definition.section.durationSeconds / 60)} min`} />
          </div>
        )}

        <div>
          <h2 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Important instructions</h2>
          <ul className="text-xs sm:text-sm space-y-1.5 list-disc pl-4" style={{ color: 'var(--text-secondary)' }}>
            {definition.mode === 'full-mock' ? (
              <>
                <li>Each section has its own separate timer.</li>
                <li>Once a section's time expires, that section is locked automatically and cannot be revisited.</li>
                <li>Unused time from one section is never transferred to the next.</li>
                <li>Answers can be changed freely while a section is active.</li>
                <li>Your responses are saved automatically as you go.</li>
                <li>The test moves forward on its own when a section's time expires.</li>
              </>
            ) : (
              <>
                <li>You have {Math.round(definition.section.durationSeconds / 60)} minutes for this section.</li>
                <li>The timer starts the moment you click Start.</li>
                <li>You may navigate freely between questions and mark any for review.</li>
                <li>The section submits automatically when time expires.</li>
              </>
            )}
            <li>Negative marking: {definition.mode === 'full-mock' ? definition.sections[0].negativeMarks : definition.section.negativeMarks} marks deducted per wrong answer.</li>
          </ul>
        </div>

        {errors.length > 0 && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}>
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Unable to start this mock.</p>
              {errors.map((e, i) => <p key={i} className="mt-0.5">{e}</p>)}
            </div>
          </div>
        )}

        {hasConflictingSession && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#b45309' }}>
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <p>You have another mock in progress ("{session!.title}"). Starting this one will replace it.</p>
          </div>
        )}

        <label className="flex items-start gap-2.5 text-sm cursor-pointer select-none">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5 w-4 h-4" />
          <span style={{ color: 'var(--text-secondary)' }}>I have read and understood the instructions.</span>
        </label>

        <button
          onClick={handleStart}
          disabled={!acknowledged || starting}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ListChecks size={16} />
          {starting ? 'Starting…' : definition.mode === 'full-mock' ? 'Start Mock Test' : 'Start Sectional Mock'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--border)' }}>
      <p className="text-base sm:text-lg font-bold flex items-center justify-center gap-1" style={{ color: 'var(--text-primary)' }}>
        {label === 'Duration' && <Clock size={13} />} {value}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}
