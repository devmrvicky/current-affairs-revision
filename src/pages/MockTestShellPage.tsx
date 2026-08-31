import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ChevronLeft, ChevronRight, Flag, LayoutGrid, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useMockSessionStore } from '../store/mockSessionStore';
import { resolveQuestionsByIds } from '../services/questionRepository';
import { recordMockSessionAttempts } from '../services/attemptLedgerService';
import { mockAttemptsDB } from '../services/db';
import { QuizTimer } from '../components/quiz/QuizTimer';
import { MockQuestionPalette } from '../components/mock/MockQuestionPalette';
import { QuestionMarkdownRenderer, QuestionOptionContent } from '../components/mock/QuestionMarkdownRenderer';
import type { UniversalQuestion } from '../types/universalQuestion';

export default function MockTestShellPage() {
  const { mockId } = useParams<{ mockId: string }>();
  const navigate = useNavigate();
  const {
    session, visitQuestion, selectAnswer, toggleMarkForReview, recordTimeSpent,
    goToQuestion, nextQuestion, prevQuestion, advanceSection, completeSession, abandonSession,
  } = useMockSessionStore();

  const [questionsById, setQuestionsById] = useState<Map<string, UniversalQuestion>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const finishingRef = useRef(false);
  const questionEnteredAtRef = useRef(0);

  // Intercepts in-app navigation AWAY from an active session — including the
  // browser/Android back gesture, not just our own explicit Quit button —
  // and asks for confirmation rather than silently abandoning the test
  // ("native app-like routing": back from Mock Session should never just
  // vanish the test without asking).
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => {
      const s = useMockSessionStore.getState().session;
      // Only block leaving THIS mock's own in-progress session — never an
      // unrelated stale active session that just happens to exist (that
      // case is the mismatched-mockId redirect below, which must stay silent).
      return s?.status === 'active' && s.mockDefinitionId === mockId && currentLocation.pathname !== nextLocation.pathname;
    }
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Your test is in progress. If you leave, your current progress will be saved, but you may not be able to resume depending on the test rules.\n\nLeave the test?')) {
      abandonSession();
      blocker.proceed();
    } else {
      blocker.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  // Redirect away if there's no session, or it belongs to a different mock (e.g. stale URL from a previous test).
  useEffect(() => {
    if (!session || session.mockDefinitionId !== mockId) {
      navigate(mockId ? `/mock-tests/${mockId}/start` : '/mock-tests', { replace: true });
    } else if (session.status === 'completed') {
      navigate(`/mock-tests/${mockId}/result/${session.id}`, { replace: true });
    }
  }, [session, mockId, navigate]);

  // Resolve every question across every section once per session id.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const allIds = session.sections.flatMap((s) => s.questionIds);
    resolveQuestionsByIds(allIds).then((qs) => {
      if (cancelled) return;
      setQuestionsById(new Map(qs.map((q) => [q.id, q])));
      setLoaded(true);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const currentSection = session?.sections[session.currentSectionIndex];
  const currentQuestionId = currentSection?.questionIds[session?.currentQuestionIndex ?? 0];

  // Mark the question visited and reset its dwell-time clock whenever it changes.
  useEffect(() => {
    if (!currentQuestionId) return;
    visitQuestion(currentQuestionId);
    questionEnteredAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId]);

  const flushTimeSpent = useCallback(() => {
    if (!currentQuestionId) return;
    const deltaSeconds = Math.floor((Date.now() - questionEnteredAtRef.current) / 1000);
    if (deltaSeconds > 0) recordTimeSpent(currentQuestionId, deltaSeconds);
    questionEnteredAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestionId]);

  const finishAndRecord = useCallback(async () => {
    if (!session || finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    flushTimeSpent();
    try {
      const latestStates = useMockSessionStore.getState().session?.states ?? session.states;
      await recordMockSessionAttempts(
        session.id,
        session.examId,
        session.sections.map((s) => ({ sectionId: s.sectionId, questionIds: s.questionIds })),
        latestStates,
        questionsById,
        Date.now(),
        session.mockDefinitionId
      );
      completeSession();
      // Freeze the now-completed session as a durable, permalink-addressable
      // attempt (product spec: refresh/direct-load of the result route must
      // never depend on the live in-memory session).
      const completedSession = useMockSessionStore.getState().session;
      if (completedSession && completedSession.completedAt) {
        await mockAttemptsDB.save({ ...completedSession, completedAt: completedSession.completedAt });
      }
      navigate(`/mock-tests/${mockId}/result/${session.id}`);
    } catch (err) {
      console.error('Failed to record mock session attempts', err);
      toast.error("Couldn't save your results — check your connection and try submitting again.");
      finishingRef.current = false;
      setIsFinishing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, questionsById, mockId]);

  const handleSectionExpire = useCallback(() => {
    if (!session) return;
    flushTimeSpent();
    const wasLast = advanceSection();
    if (wasLast) {
      finishAndRecord();
    } else {
      const finishedTitle = session.sections[session.currentSectionIndex].title;
      const nextTitle = session.sections[session.currentSectionIndex + 1]?.title ?? '';
      setTransitionMessage(`${finishedTitle} section completed. Moving to ${nextTitle}…`);
      setTimeout(() => setTransitionMessage(null), 1800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, advanceSection, finishAndRecord]);

  // Warn on browser back/refresh during an active mock (product spec §8).
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (session?.status === 'active') { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [session?.status]);

  if (!session || !loaded || !currentSection || !currentQuestionId) {
    return (
      <div className="max-w-3xl mx-auto pt-10 space-y-3">
        <div className="card h-16 shimmer" style={{ background: 'var(--border)' }} />
        <div className="card h-72 shimmer" style={{ background: 'var(--border)' }} />
      </div>
    );
  }

  const currentQuestion = questionsById.get(currentQuestionId);
  const currentState = session.states[currentQuestionId];
  const currentIndexInSection = session.currentQuestionIndex;
  const isLastQuestionInSection = currentIndexInSection >= currentSection.questionIds.length - 1;
  const isLastSection = session.currentSectionIndex >= session.sections.length - 1;

  const sectionAnsweredCount = currentSection.questionIds.filter((qid) => session.states[qid]?.selectedAnswer !== null).length;
  const overallAnsweredCount = session.sections.flatMap((s) => s.questionIds).filter((qid) => session.states[qid]?.selectedAnswer !== null).length;
  const overallTotal = session.sections.reduce((sum, s) => sum + s.questionIds.length, 0);
  const overallIndex = session.sections.slice(0, session.currentSectionIndex).reduce((sum, s) => sum + s.questionIds.length, 0) + currentIndexInSection + 1;

  function handleSelect(optionId: string) {
    if (!currentQuestionId) return;
    selectAnswer(currentQuestionId, optionId);
  }

  function handleMarkForReview() {
    if (!currentQuestionId) return;
    flushTimeSpent();
    toggleMarkForReview(currentQuestionId);
  }

  function handleSaveAndNext() {
    flushTimeSpent();
    if (isLastQuestionInSection) {
      if (isLastSection) {
        setShowSubmitConfirm(true);
      } else {
        const wasLast = advanceSection();
        if (wasLast) { setShowSubmitConfirm(true); return; }
        const finishedTitle = currentSection!.title;
        const nextTitle = session!.sections[session!.currentSectionIndex + 1]?.title ?? '';
        setTransitionMessage(`${finishedTitle} section completed. Moving to ${nextTitle}…`);
        setTimeout(() => setTransitionMessage(null), 1800);
      }
    } else {
      nextQuestion();
    }
  }

  function handlePrevious() {
    flushTimeSpent();
    prevQuestion();
  }

  function handleJump(index: number) {
    flushTimeSpent();
    goToQuestion(index);
  }

  function handleQuit() {
    if (window.confirm('Are you sure you want to leave this test? Your progress will be saved, but you may not be able to resume depending on the test rules.')) {
      abandonSession();
      navigate('/mock-tests');
    }
  }

  const unattemptedCount = overallTotal - overallAnsweredCount;
  const markedCount = session.sections.flatMap((s) => s.questionIds).filter((qid) => session.states[qid]?.isMarkedForReview).length;

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <header className="sticky top-0 z-30 glass border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-auto min-h-14 py-2 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <button onClick={handleQuit} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0" aria-label="Quit test">
              <X size={18} style={{ color: 'var(--text-secondary)' }} />
            </button>
            <div className="min-w-0">
              <h1 className="font-display font-bold text-xs sm:text-sm truncate" style={{ color: 'var(--text-primary)' }}>{currentSection.title}</h1>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--text-muted)' }}>
                Q {currentIndexInSection + 1} / {currentSection.questionIds.length}
                {session.sections.length > 1 && <> · Section {session.currentSectionIndex + 1}/{session.sections.length} · Overall {overallIndex}/{overallTotal}</>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {currentSection.startedAt && (
              <QuizTimer
                startTime={currentSection.startedAt}
                totalPausedTime={0}
                isPaused={false}
                durationSeconds={currentSection.durationSeconds}
                onExpire={handleSectionExpire}
              />
            )}
            <span className="hidden sm:inline text-xs px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
              Answered: {sectionAnsweredCount}/{currentSection.questionIds.length}
            </span>
            <button onClick={() => setShowPalette(true)} className="lg:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Question palette">
              <LayoutGrid size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {transitionMessage && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="card px-8 py-6 text-center">
              <p className="font-display font-semibold" style={{ color: 'var(--text-primary)' }}>{transitionMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSubmitConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)' }}>
            <div className="card p-6 max-w-sm w-full text-center space-y-4">
              <h2 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Submit Test?</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {session.sections.length > 1 ? 'You have completed all sections.' : 'You have completed this section.'}
              </p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div><p className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{overallAnsweredCount}</p><p style={{ color: 'var(--text-muted)' }}>Answered</p></div>
                <div><p className="text-base font-bold text-amber-500">{markedCount}</p><p style={{ color: 'var(--text-muted)' }}>Marked</p></div>
                <div><p className="text-base font-bold" style={{ color: 'var(--text-muted)' }}>{unattemptedCount}</p><p style={{ color: 'var(--text-muted)' }}>Unanswered</p></div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSubmitConfirm(false)} className="flex-1 py-2 rounded-xl text-sm font-medium" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>Go Back</button>
                <button onClick={finishAndRecord} disabled={isFinishing} className="btn-primary flex-1 text-sm disabled:opacity-50">{isFinishing ? 'Submitting…' : 'Submit Test'}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex flex-col lg:flex-row-reverse gap-4 sm:gap-6">
          {/* Question area */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div key={currentQuestionId} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
                <div className="card p-4 sm:p-6">
                  {!currentQuestion ? (
                    <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)' }}>
                      <AlertTriangle size={20} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>This question couldn't be loaded (id: {currentQuestionId}).</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-[11px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
                        Question {currentIndexInSection + 1}
                      </p>
                      <div className="text-sm sm:text-base font-medium mb-5" style={{ color: 'var(--text-primary)' }}>
                        <QuestionMarkdownRenderer content={currentQuestion.question} baseDir={currentQuestion.sourceMockBaseDir} />
                      </div>
                      <div className="space-y-2.5">
                        {currentQuestion.options.map((opt) => {
                          const isSelected = currentState?.selectedAnswer === opt.id;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => handleSelect(opt.id)}
                              className="w-full text-left px-4 py-3 rounded-xl border-2 transition-colors flex items-start gap-3 text-sm"
                              style={{
                                borderColor: isSelected ? 'var(--brand-500, #6366f1)' : 'var(--border)',
                                background: isSelected ? 'rgba(99,102,241,0.08)' : 'var(--card)',
                                color: 'var(--text-primary)',
                              }}
                            >
                              <span
                                className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold"
                                style={{ borderColor: isSelected ? 'var(--brand-500, #6366f1)' : 'var(--border)', color: isSelected ? 'var(--brand-500, #6366f1)' : 'var(--text-muted)' }}
                              >
                                {opt.id}
                              </span>
                              <QuestionOptionContent text={opt.text} image={opt.image} baseDir={currentQuestion.sourceMockBaseDir} />
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Action bar */}
                <div className="mt-4 flex items-center justify-between gap-2 sticky bottom-2">
                  <button
                    onClick={handlePrevious}
                    disabled={currentIndexInSection === 0}
                    className="px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: 'var(--card)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    onClick={handleMarkForReview}
                    className="px-3 sm:px-4 py-2.5 rounded-xl text-xs sm:text-sm font-medium flex items-center gap-1.5"
                    style={{ background: currentState?.isMarkedForReview ? 'rgba(245,158,11,0.15)' : 'var(--card)', color: currentState?.isMarkedForReview ? '#b45309' : 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    <Flag size={14} fill={currentState?.isMarkedForReview ? 'currentColor' : 'none'} /> Mark for Review
                  </button>
                  <button onClick={handleSaveAndNext} className="btn-primary px-4 sm:px-5 py-2.5 text-xs sm:text-sm flex items-center gap-1">
                    {isLastQuestionInSection ? (isLastSection ? 'Submit' : 'Finish Section') : 'Save & Next'} <ChevronRight size={14} />
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Palette — left on desktop, drawer on mobile */}
          <div className="hidden lg:block w-64 flex-shrink-0">
            <MockQuestionPalette questionIds={currentSection.questionIds} states={session.states} currentIndex={currentIndexInSection} onJump={handleJump} />
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showPalette && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="lg:hidden fixed inset-0 z-40 flex items-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowPalette(false)}>
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30 }}
              className="w-full max-h-[75vh] overflow-y-auto rounded-t-2xl" style={{ background: 'var(--bg)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4">
                <MockQuestionPalette questionIds={currentSection.questionIds} states={session.states} currentIndex={currentIndexInSection} onJump={(i) => { handleJump(i); setShowPalette(false); }} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
