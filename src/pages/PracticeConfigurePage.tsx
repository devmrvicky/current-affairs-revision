import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Settings2, X, ListChecks, Zap, ClipboardList, Newspaper, Search, SlidersHorizontal,
  ChevronRight, ChevronsDownUp, ChevronsUpDown, FilterX,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useExamStore } from '../store/examStore';
import { usePracticeSessionStore } from '../store/practiceSessionStore';
import { getSubjectsForExam, getExam } from '../services/examService';
import { getAvailableTopics, getAvailableSubjects, getRandomQuestions, type AvailableTopic } from '../services/questionRepository';
import { createQuestionPool } from '../services/practiceService';
import {
  applyLibraryFilters, activeFilterCount, countDistinctTopics, DEFAULT_FILTERS,
  type LibraryFilters, type SortKey, type StatusFilter, type TypeFilter,
} from '../services/testLibraryBuilder';
import { usePracticeTestLibrary } from '../hooks/usePracticeTestLibrary';
import { useStartPracticeTest } from '../hooks/useStartPracticeTest';
import { ChapterTestGroup } from '../components/tests/ChapterTestGroup';
import { ModeSwitch } from '../components/tests/ModeSwitch';
import { ErrorState } from '../components/common/EmptyState';
import type { Difficulty } from '../types/universalQuestion';
import type { PracticeConfiguration, SessionMode } from '../types/practiceSession';

const COUNT_OPTIONS = [10, 20, 25, 50];
const DIFFICULTY_OPTIONS: { id: Difficulty | 'mixed'; label: string }[] = [
  { id: 'mixed', label: 'Mixed' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
];

// Practice by Topic (product-refactor §43-53): horizontal subject selector,
// a settings gear instead of controls occupying the main screen, and a real
// list of available tests/mocks per subject — not just abstract filters.
// Every "Start" button, whichever source the card came from, ends at the
// same universal session engine (§60-63).

export default function PracticeConfigurePage() {
  const navigate = useNavigate();
  const { selectedExamId } = useExamStore();
  const exam = getExam(selectedExamId);
  const { session, startSession, clearSession } = usePracticeSessionStore();

  const subjects = getSubjectsForExam(selectedExamId);
  const [contentSubjectIds, setContentSubjectIds] = useState<Set<string>>(new Set());
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getAvailableSubjects(selectedExamId).then((avail) => {
      if (!cancelled) setContentSubjectIds(new Set(avail.map((a) => a.subjectId)));
    });
    return () => { cancelled = true; };
  }, [selectedExamId]);

  useEffect(() => {
    if (selectedSubjectId || contentSubjectIds.size === 0) return;
    const first = subjects.find((s) => contentSubjectIds.has(s.id));
    if (first) setSelectedSubjectId(first.id);
  }, [contentSubjectIds, subjects, selectedSubjectId]);

  // Settings — applies to Quick Practice and to non-mock fixed tests when
  // started in Test mode. Fixed Exam Mocks always ignore these and use
  // their own marking/mode (§100-101).
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty | 'mixed'>('mixed');
  const [questionCount, setQuestionCount] = useState(20);
  const [mode, setMode] = useState<SessionMode>('practice');

  const [topics, setTopics] = useState<AvailableTopic[]>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [quickPool, setQuickPool] = useState(0);
  const [quickPoolLoading, setQuickPoolLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  // The Subject → Chapter → Topic → Test library for the selected subject, plus
  // the learner's attempt stats for it (one cached build, one ledger read).
  const libraryData = usePracticeTestLibrary(selectedExamId, selectedSubjectId && selectedSubjectId !== 'current-affairs' ? selectedSubjectId : null);
  const { library } = libraryData;
  const { start: startTest, startingId } = useStartPracticeTest();

  const [filters, setFilters] = useState<LibraryFilters>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  // Explicit open/closed choices per chapter, scoped to the subject they were made in.
  const [openChoices, setOpenChoices] = useState<{ subjectId: string; byKey: Record<string, boolean> }>({ subjectId: '', byKey: {} });

  useEffect(() => {
    if (!selectedSubjectId) return;
    let cancelled = false;
    getAvailableTopics(selectedExamId, selectedSubjectId).then((t) => { if (!cancelled) setTopics(t); });
    setSelectedTopicIds([]);
    return () => { cancelled = true; };
  }, [selectedSubjectId, selectedExamId]);

  useEffect(() => {
    if (!selectedSubjectId) return;
    let cancelled = false;
    setQuickPoolLoading(true);
    (async () => {
      const config: PracticeConfiguration = {
        examId: selectedExamId, subjectIds: [selectedSubjectId],
        topicId: selectedTopicIds.length === 1 ? selectedTopicIds[0] : undefined,
        difficulty, questionCount: 0, mode, label: '',
      };
      let pool = await createQuestionPool(config);
      if (selectedTopicIds.length > 1) pool = pool.filter((q) => q.topicId && selectedTopicIds.includes(q.topicId));
      if (!cancelled) setQuickPool(pool.length);
    })().finally(() => { if (!cancelled) setQuickPoolLoading(false); });
    return () => { cancelled = true; };
  }, [selectedSubjectId, selectedTopicIds, difficulty, selectedExamId]);

  function toggleTopic(topicId: string) {
    setSelectedTopicIds((prev) => (prev.includes(topicId) ? prev.filter((t) => t !== topicId) : [...prev, topicId]));
  }

  async function guardActiveSession(): Promise<boolean> {
    if (session && !session.isCompleted) {
      if (!window.confirm('You have an in-progress session. Starting a new one will discard it. Continue?')) return false;
      clearSession();
    }
    return true;
  }

  async function handleStartQuickPractice() {
    if (!(await guardActiveSession())) return;
    if (quickPool === 0) { toast.error('No questions available for this selection yet'); return; }
    setIsStarting(true);
    try {
      const subject = subjects.find((s) => s.id === selectedSubjectId);
      const config: PracticeConfiguration = {
        examId: selectedExamId, subjectIds: [selectedSubjectId],
        topicId: selectedTopicIds.length === 1 ? selectedTopicIds[0] : undefined,
        difficulty, questionCount: Math.min(questionCount, quickPool), mode,
        label: subject?.name ?? 'Practice',
      };
      let pool = await createQuestionPool(config);
      if (selectedTopicIds.length > 1) pool = pool.filter((q) => q.topicId && selectedTopicIds.includes(q.topicId));
      const picked = await getRandomQuestions(config.questionCount, pool);
      startSession(config, picked.map((q) => q.id));
      navigate('/session');
    } finally {
      setIsStarting(false);
    }
  }

  // ── Library view-model: filtering, defaults and open/closed state are all derived, never mirrored into effects ──
  const filtered = useMemo(
    () => (library ? applyLibraryFilters(library, filters, libraryData.activity) : null),
    [library, filters, libraryData.activity]
  );
  const libraryTotals = useMemo(() => {
    if (!library) return null;
    const realChapters = library.chapters.filter((c) => c.kind === 'chapter');
    return {
      chapters: realChapters.length,
      topics: countDistinctTopics(library),
      tests: library.tests.length,
      questions: library.tests.reduce((n, t) => n + t.questionCount, 0),
      attempted: library.tests.filter((t) => libraryData.stats.has(t.id)).length,
    };
  }, [library, libraryData.stats]);
  const topicOptions = useMemo(
    () => (library ? Array.from(library.topicTitles, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })) : []),
    [library]
  );
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { chapter: 0, topic: 0, 'multi-topic': 0, paper: 0 };
    for (const t of library?.tests ?? []) counts[t.scope] += 1;
    return counts;
  }, [library]);
  // With nothing to go on, open the chapter the learner touched most recently (resume where they left off);
  // a single-chapter subject opens by itself.
  const defaultOpenKey = useMemo(() => {
    const chapters = library?.chapters.filter((c) => c.kind === 'chapter') ?? [];
    if (chapters.length === 1) return chapters[0].key;
    let bestKey: string | null = null;
    let bestAt = 0;
    for (const c of chapters) {
      for (const t of [...c.chapterTests, ...c.topics.flatMap((g) => g.tests)]) {
        const at = libraryData.stats.get(t.id)?.lastAttemptedAt ?? 0;
        if (at > bestAt) { bestAt = at; bestKey = c.key; }
      }
    }
    return bestKey;
  }, [library, libraryData.stats]);
  const choices = openChoices.subjectId === selectedSubjectId ? openChoices.byKey : {};
  const isChapterOpen = (key: string) => choices[key] ?? (!!filtered?.isNarrowed || key === defaultOpenKey);
  const narrowedCount = activeFilterCount(filters) + (filters.query.trim() ? 1 : 0);

  function setChapterOpen(key: string, open: boolean) {
    setOpenChoices({ subjectId: selectedSubjectId, byKey: { ...choices, [key]: open } });
  }
  function setAllChaptersOpen(open: boolean) {
    const byKey: Record<string, boolean> = {};
    for (const c of filtered?.chapters ?? []) byKey[c.key] = open;
    setOpenChoices({ subjectId: selectedSubjectId, byKey });
  }
  function patchFilters(patch: Partial<LibraryFilters>) {
    setFilters((f) => ({ ...f, ...patch }));
  }
  function selectSubject(id: string) {
    setSelectedSubjectId(id);
    setFilters(DEFAULT_FILTERS);
    setShowFilters(false);
  }

  if (!exam) {
    return (
      <div className="max-w-2xl mx-auto pt-10 text-center">
        <p style={{ color: 'var(--text-muted)' }}>No exam selected.</p>
        <button onClick={() => navigate('/exams')} className="btn-primary mt-4">Choose an Exam</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-12">
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Practice by Topic</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{exam.name}</p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
          aria-label="Practice settings"
        >
          <Settings2 size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Horizontal subject selector — scrolls, never wraps (§44) */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
        {subjects.map((subject) => {
          const hasContent = contentSubjectIds.has(subject.id) || subject.id === 'current-affairs';
          const active = selectedSubjectId === subject.id;
          return (
            <button
              key={subject.id}
              onClick={() => hasContent && selectSubject(subject.id)}
              disabled={!hasContent}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                active ? 'bg-brand-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-white/10'
              }`}
              style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
            >
              {subject.name}
            </button>
          );
        })}
      </div>

      {selectedSubjectId === 'current-affairs' ? (
        <div className="card p-5 flex items-start gap-3">
          <Newspaper size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Current Affairs has its own hub</p>
            <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Daily quiz, chapters, and mixed revision live together there.</p>
            <button onClick={() => navigate('/current-affairs')} className="btn-primary text-sm py-2 px-4">Open Current Affairs</button>
          </div>
        </div>
      ) : !selectedSubjectId ? (
        <div className="card p-6 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Pick a subject above to get started.</p>
        </div>
      ) : (
        <>
          {/* Quick Practice — topic multi-select + Start, using current settings */}
          <section className="card p-4">
            <h2 className="text-sm font-display font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
              <Zap size={14} className="text-teal-500" /> Quick Practice
            </h2>
            {topics.length > 0 && (
              <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Quick Practice topics">
                {topics.map((topic) => {
                  const active = selectedTopicIds.includes(topic.topicId);
                  return (
                    <button
                      key={topic.topicId}
                      onClick={() => toggleTopic(topic.topicId)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
                        active ? 'bg-brand-500 text-white' : ''
                      }`}
                      style={!active ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                    >
                      {active && <Check size={10} />}
                      {topic.topicName} ({topic.questionCount})
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {quickPoolLoading ? 'Checking…' : `${quickPool} available · ${DIFFICULTY_OPTIONS.find((d) => d.id === difficulty)?.label} · ${mode === 'practice' ? 'Practice' : 'Test'}`}
              </span>
              <button onClick={handleStartQuickPractice} disabled={isStarting || quickPool === 0} className="btn-primary text-sm py-2 px-5 disabled:opacity-40">
                Start ({Math.min(questionCount, quickPool)})
              </button>
            </div>
          </section>

          {/* Test library — Subject → Chapter → Topic → Test, searchable and filterable */}
          <section aria-labelledby="test-library-heading">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <h2 id="test-library-heading" className="text-sm font-display font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
                  <ListChecks size={14} className="text-purple-500" /> Test Library
                </h2>
                {libraryTotals && libraryTotals.tests > 0 && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {libraryTotals.chapters} chapter{libraryTotals.chapters === 1 ? '' : 's'} · {libraryTotals.topics} topic{libraryTotals.topics === 1 ? '' : 's'} · {libraryTotals.tests} test{libraryTotals.tests === 1 ? '' : 's'} · {libraryTotals.questions.toLocaleString()} questions
                    {libraryTotals.attempted > 0 && <> · <span className="text-brand-500">{libraryTotals.attempted} attempted</span></>}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs hidden sm:inline" style={{ color: 'var(--text-muted)' }}>Start as</span>
                <ModeSwitch mode={mode} onChange={setMode} />
              </div>
            </div>

            {/* Toolbar — stays reachable while scrolling a long library */}
            <div className="sticky top-16 z-20 -mx-4 px-4 py-2 backdrop-blur-md" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)' }}>
              <div className="flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                  <input
                    type="search"
                    value={filters.query}
                    onChange={(e) => patchFilters({ query: e.target.value })}
                    placeholder="Search tests…"
                    aria-label="Search tests, chapters and topics"
                    className="w-full pl-9 pr-8 py-2 rounded-xl text-sm outline-none border focus:border-brand-400"
                    style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                  />
                  {filters.query && (
                    <button type="button" onClick={() => patchFilters({ query: '' })} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md">
                      <X size={13} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters((v) => !v)}
                  aria-expanded={showFilters}
                  aria-controls="test-filters"
                  className={`relative flex-shrink-0 p-2.5 rounded-xl transition-colors ${showFilters ? 'bg-brand-500 text-white' : ''}`}
                  style={!showFilters ? { border: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'var(--card)' } : undefined}
                  aria-label="Filters"
                >
                  <SlidersHorizontal size={15} />
                  {activeFilterCount(filters) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">{activeFilterCount(filters)}</span>
                  )}
                </button>
                <label className="sr-only" htmlFor="test-sort">Sort tests</label>
                <select
                  id="test-sort"
                  value={filters.sort}
                  onChange={(e) => patchFilters({ sort: e.target.value as SortKey })}
                  className="flex-shrink-0 py-2.5 pl-2.5 pr-1 rounded-xl text-xs outline-none border max-w-[112px]"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                >
                  <option value="name">Name</option>
                  <option value="recent">Recent activity</option>
                  <option value="attempts">Most attempts</option>
                  <option value="best">Best score</option>
                  <option value="questions">Most questions</option>
                </select>
              </div>

              {showFilters && library && (
                <div id="test-filters" className="card mt-2 p-3 space-y-3">
                  <div>
                    <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Test type</p>
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        ['all', 'All'], ['chapter', 'Chapter'], ['topic', 'Topic'], ['multi-topic', 'Multi-topic'], ['paper', 'Mock paper'],
                      ] as [TypeFilter, string][])
                        .filter(([id]) => id === 'all' || typeCounts[id] > 0)
                        .map(([id, label]) => (
                          <button key={id} type="button" onClick={() => patchFilters({ type: id })} aria-pressed={filters.type === id}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium ${filters.type === id ? 'bg-brand-500 text-white' : ''}`}
                            style={filters.type !== id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}>
                            {label}{id !== 'all' && <span className="opacity-70"> {typeCounts[id]}</span>}
                          </button>
                        ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</p>
                    <div className="flex gap-1.5">
                      {([['all', 'All'], ['new', 'Not attempted'], ['attempted', 'Attempted']] as [StatusFilter, string][]).map(([id, label]) => (
                        <button key={id} type="button" onClick={() => patchFilters({ status: id })} aria-pressed={filters.status === id}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${filters.status === id ? 'bg-brand-500 text-white' : ''}`}
                          style={filters.status !== id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Chapter
                      <select value={filters.chapterKey} onChange={(e) => patchFilters({ chapterKey: e.target.value })}
                        className="mt-1 w-full py-2 px-2.5 rounded-xl text-sm outline-none border font-normal"
                        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        <option value="">All chapters</option>
                        {library.chapters.map((c) => <option key={c.key} value={c.key}>{c.categoryTitle ? `${c.categoryTitle} › ` : ''}{c.title}</option>)}
                      </select>
                    </label>
                    <label className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Topic
                      <select value={filters.topicId} onChange={(e) => patchFilters({ topicId: e.target.value })}
                        className="mt-1 w-full py-2 px-2.5 rounded-xl text-sm outline-none border font-normal"
                        style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                        <option value="">All topics</option>
                        {topicOptions.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                    </label>
                  </div>
                  {narrowedCount > 0 && (
                    <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })} className="text-xs font-medium flex items-center gap-1 text-brand-600 dark:text-brand-400">
                      <FilterX size={12} /> Clear search and filters
                    </button>
                  )}
                </div>
              )}
            </div>

            {libraryData.loading && !library ? (
              <div className="space-y-2 mt-2" aria-busy="true" aria-label="Loading tests">
                {[1, 2, 3, 4].map((i) => <div key={i} className="card h-14 shimmer" style={{ background: 'var(--border)' }} />)}
              </div>
            ) : libraryData.error ? (
              <div className="card mt-2"><ErrorState message="The test library couldn't be loaded." onRetry={libraryData.reload} /></div>
            ) : !library || library.tests.length === 0 ? (
              <div className="card p-5 text-center mt-2">
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No named tests for this subject yet — try Quick Practice above.</p>
              </div>
            ) : filtered && filtered.chapters.length === 0 ? (
              <div className="card p-6 text-center mt-2" role="status">
                <Search size={22} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No tests match</p>
                <p className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Try a different search or loosen the filters.</p>
                <button type="button" onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: filters.sort })} className="btn-secondary text-xs py-1.5 px-4">Clear search and filters</button>
              </div>
            ) : filtered && (
              <>
                <div className="flex items-center justify-between mt-1 mb-1.5">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }} aria-live="polite">
                    {filtered.isNarrowed
                      ? `${filtered.testCount} of ${library.tests.length} tests · ${filtered.chapters.length} chapter${filtered.chapters.length === 1 ? '' : 's'}`
                      : `${filtered.chapters.length} group${filtered.chapters.length === 1 ? '' : 's'}`}
                  </p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setAllChaptersOpen(true)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Expand all chapters" title="Expand all">
                      <ChevronsUpDown size={14} style={{ color: 'var(--text-muted)' }} />
                    </button>
                    <button type="button" onClick={() => setAllChaptersOpen(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Collapse all chapters" title="Collapse all">
                      <ChevronsDownUp size={14} style={{ color: 'var(--text-muted)' }} />
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {filtered.chapters.map((chapter) => {
                    const open = isChapterOpen(chapter.key);
                    const all = [...chapter.chapterTests, ...chapter.topics.flatMap((g) => g.tests)];
                    const attempted = all.filter((t) => libraryData.stats.has(t.id)).length;
                    const panelId = `chapter-panel-${chapter.key.replace(/[^a-z0-9]+/gi, '-')}`;
                    return (
                      <div key={chapter.key} className="card overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setChapterOpen(chapter.key, !open)}
                          aria-expanded={open}
                          aria-controls={panelId}
                          className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
                        >
                          <ChevronRight size={16} className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
                          <div className="min-w-0 flex-1">
                            <p className="font-display font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                              {chapter.categoryTitle && <span className="font-normal" style={{ color: 'var(--text-muted)' }}>{chapter.categoryTitle} › </span>}
                              {chapter.title}
                            </p>
                          </div>
                          <span className="text-xs flex-shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
                            {chapter.testCount} test{chapter.testCount === 1 ? '' : 's'} · {chapter.questionCount} Qs
                            {attempted > 0 && <span className="block text-brand-500">{attempted}/{chapter.testCount} attempted</span>}
                          </span>
                        </button>
                        {open && (
                          <div id={panelId} style={{ borderTop: '1px solid var(--border)' }}>
                            <ChapterTestGroup chapter={chapter} stats={libraryData.stats} mode={mode} startingId={startingId} onStart={startTest} forceOpen={filtered.isNarrowed} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* Settings bottom sheet (§48-51) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="card p-6 w-full sm:max-w-sm rounded-b-none sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>Practice Settings</h2>
                <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Difficulty</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDifficulty(opt.id)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${difficulty === opt.id ? 'bg-brand-500 text-white' : ''}`}
                    style={difficulty !== opt.id ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Number of Questions</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setQuestionCount(n)}
                    disabled={quickPool > 0 && n > quickPool}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${questionCount === n ? 'bg-brand-500 text-white' : ''}`}
                    style={questionCount !== n ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {n}
                  </button>
                ))}
                {quickPool > 0 && (
                  <button
                    onClick={() => setQuestionCount(quickPool)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${questionCount === quickPool ? 'bg-brand-500 text-white' : ''}`}
                    style={questionCount !== quickPool ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    All Available ({quickPool})
                  </button>
                )}
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Mode</p>
              <div className="grid grid-cols-2 gap-2 mb-5">
                <button
                  onClick={() => setMode('practice')}
                  className={`p-3 rounded-xl text-left transition-colors ${mode === 'practice' ? 'ring-2 ring-brand-500' : ''}`}
                  style={{ border: '1px solid var(--border)' }}
                >
                  <Zap size={14} style={{ color: '#22c55e' }} className="mb-1" />
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Practice</p>
                </button>
                <button
                  onClick={() => setMode('test')}
                  className={`p-3 rounded-xl text-left transition-colors ${mode === 'test' ? 'ring-2 ring-brand-500' : ''}`}
                  style={{ border: '1px solid var(--border)' }}
                >
                  <ClipboardList size={14} style={{ color: '#ef4444' }} className="mb-1" />
                  <p className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Test</p>
                </button>
              </div>

              <button onClick={() => setShowSettings(false)} className="btn-primary w-full py-2.5">Apply</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
