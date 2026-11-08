import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Layers, Rocket, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { SpeakExplanationButton } from '../common/SpeakExplanationButton';
import { loadReviewItems, setSavedPurposes } from '../../services/reviewCenterService';
import {
  buildRevisionQuiz, EMPTY_FILTERS, filterReviewItems, monthSummaries, REVIEW_CATEGORIES, reviewMetrics, selectForRevision,
  type ReviewCategory, type ReviewFilters, type ReviewItem, type RevisionSpec,
} from '../../services/reviewItems';
import { getMarkPurposeInfo } from '../../types/questionMark';
import { getTopicDisplayName, subjectRegistry } from '../../data/registry/subjectRegistry';
import { useQuizStore } from '../../store/quizStore';
import { useExamStore } from '../../store/examStore';
import { getExam } from '../../services/examService';

const PAGE = 20;
const subjectName = (id: string | undefined) => (id ? subjectRegistry.getSubject(id)?.name ?? id : 'Other');
const select = 'rounded-xl px-2.5 py-2 text-xs bg-transparent';
const selectStyle = { border: '1px solid var(--border)', color: 'var(--text-primary)' };

/** The Review Center's main view: every question you've got wrong or saved, from every subject and test source. */
export function ReviewHub() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReviewFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [now] = useState(() => Date.now());

  const reload = useCallback(async () => {
    try { setItems(await loadReviewItems()); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load your Review Center.'); }
  }, []);
  useEffect(() => {
    let alive = true; // load once on mount; `reload` (above) is for refreshing after an edit
    void loadReviewItems()
      .then((loaded) => { if (alive) { setItems(loaded); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load your Review Center.'); });
    return () => { alive = false; };
  }, []);

  const metrics = useMemo(() => (items ? reviewMetrics(items) : null), [items]);
  const months = useMemo(() => (items ? monthSummaries(items) : []), [items]);
  const visible = useMemo(() => (items ? filterReviewItems(items, filters, now) : []), [items, filters, now]);
  const subjects = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.subjectId).filter((s): s is string => !!s))), [items]);
  const topics = useMemo(() => Array.from(new Set((items ?? []).filter((i) => !filters.subjectId || i.subjectId === filters.subjectId).map((i) => i.topicId).filter((t): t is string => !!t))), [items, filters.subjectId]);

  const update = (patch: Partial<ReviewFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); };
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const shown = visible.slice(page * PAGE, page * PAGE + PAGE);

  if (error) return <div className="card p-5 text-sm text-center space-y-2" role="alert"><p className="text-red-600">{error}</p><button type="button" className="btn-secondary text-xs px-4 py-2" onClick={() => void reload()}>Try again</button></div>;
  if (!items || !metrics) return <div className="space-y-2">{[1, 2, 3].map((n) => <div key={n} className="card h-16 shimmer" style={{ background: 'var(--border)' }} />)}</div>;

  const catLabel = (c: ReviewCategory) => REVIEW_CATEGORIES.find((x) => x.id === c)!.label;

  return (
    <div className="space-y-5" data-testid="review-hub">
      {/* ── Dashboard ── */}
      <section aria-label="Review summary" className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ['Total saved questions', metrics.total], ['Unresolved', metrics.unresolved], ['Repeated mistakes', metrics.repeatedMistakes],
            ['Accuracy on these', metrics.accuracy.percent === null ? '—' : `${metrics.accuracy.percent}%`],
          ].map(([label, value]) => (
            <div key={label as string} className="card p-3"><span className="block text-xl font-display font-bold" style={{ color: 'var(--text-primary)' }} data-testid={`metric-${(label as string).toLowerCase().replace(/[^a-z]+/g, '-')}`}>{value}</span><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span></div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Review categories">
          <button type="button" role="tab" aria-selected={filters.category === 'all'} onClick={() => update({ category: 'all' })} className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.category === 'all' ? 'bg-brand-500 text-white' : ''}`} style={filters.category === 'all' ? undefined : { border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>All ({metrics.total})</button>
          {REVIEW_CATEGORIES.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={filters.category === c.id} title={c.description} onClick={() => update({ category: c.id })}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${filters.category === c.id ? 'bg-brand-500 text-white' : ''}`} style={filters.category === c.id ? undefined : { border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {c.label} ({metrics.byCategory[c.id]})
            </button>
          ))}
        </div>
        {metrics.bySubject.length > 0 && (
          <div className="card p-3 space-y-1.5" aria-label="Subject-wise distribution">
            <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>By subject</p>
            {metrics.bySubject.map((s) => (
              <div key={s.subjectId} className="flex items-center gap-2 text-xs"><span className="w-32 truncate" style={{ color: 'var(--text-secondary)' }}>{subjectName(s.subjectId === 'unknown' ? undefined : s.subjectId)}</span>
                <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}><span className="block h-full bg-brand-500" style={{ width: `${(s.count / metrics.total) * 100}%` }} /></span><span style={{ color: 'var(--text-muted)' }}>{s.count}</span></div>
            ))}
          </div>
        )}
      </section>

      {/* ── Monthly Current Affairs ── */}
      {months.length > 0 && (
        <section aria-label="Monthly Current Affairs revision" className="card p-3 space-y-2">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Monthly Current Affairs</p>
          <ul className="space-y-1.5">
            {months.map((m) => (
              <li key={m.monthKey} className="flex flex-wrap items-center gap-2 text-xs" data-testid="month-row">
                <button type="button" onClick={() => update({ month: filters.month === m.monthKey ? undefined : m.monthKey, category: 'all' })} aria-pressed={filters.month === m.monthKey}
                  className={`px-2.5 py-1 rounded-lg font-semibold ${filters.month === m.monthKey ? 'bg-brand-500 text-white' : ''}`} style={filters.month === m.monthKey ? undefined : { border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{m.label}</button>
                <span style={{ color: 'var(--text-muted)' }}>{m.total} question{m.total === 1 ? '' : 's'} · {m.wrong} wrong · {m.notRevisited} saved but not revisited</span>
                <button type="button" className="btn-ghost px-2 py-1" onClick={() => update({ month: m.monthKey, category: 'wrong' })}>Wrong</button>
                <button type="button" className="btn-ghost px-2 py-1" onClick={() => { update({ month: m.monthKey, monthlyOnly: undefined, category: 'all' }); setGenerating(true); }}>Month test…</button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary text-xs px-3 py-1.5" onClick={() => { update({ month: undefined, monthlyOnly: true, category: 'all' }); setGenerating(true); }}>Mixed revision — all months…</button>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pick a month to revise it below (open any question for its answer and explanation). “Month test…” builds a test from that month; “Mixed revision” draws from every month together.</span>
          </div>
        </section>
      )}

      {/* ── Filters ── */}
      <section aria-label="Filters" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={filters.query ?? ''} onChange={(e) => update({ query: e.target.value })} placeholder="Search questions, answers, sources…" aria-label="Search review questions" data-exam-keys="off" className="flex-1 min-w-[10rem] rounded-xl px-3 py-2 text-sm bg-transparent" style={selectStyle} />
          <select aria-label="Subject" className={select} style={selectStyle} value={filters.subjectId ?? ''} onChange={(e) => update({ subjectId: e.target.value || undefined, topicId: undefined })}><option value="">All subjects</option>{subjects.map((s) => <option key={s} value={s}>{subjectName(s)}</option>)}</select>
          <select aria-label="Topic" className={select} style={selectStyle} value={filters.topicId ?? ''} onChange={(e) => update({ topicId: e.target.value || undefined })}><option value="">All topics</option>{topics.map((t) => <option key={t} value={t}>{getTopicDisplayName(filters.subjectId ?? subjects[0] ?? '', t)}</option>)}</select>
          <select aria-label="Difficulty" className={select} style={selectStyle} value={filters.difficulty ?? ''} onChange={(e) => update({ difficulty: e.target.value || undefined })}><option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
          <select aria-label="Latest result" className={select} style={selectStyle} value={filters.status ?? ''} onChange={(e) => update({ status: (e.target.value || undefined) as ReviewFilters['status'] })}><option value="">Any result</option><option value="wrong">Latest wrong</option><option value="correct">Latest correct</option><option value="unattempted">Never attempted</option></select>
          <select aria-label="Date" className={select} style={selectStyle} value={filters.dateRange ?? ''} onChange={(e) => update({ dateRange: (e.target.value || undefined) as ReviewFilters['dateRange'] })}><option value="">Any date</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!filters.repeatedOnly} onChange={(e) => update({ repeatedOnly: e.target.checked || undefined })} /> Repeated mistakes</label>
          <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={!!filters.recentlySaved} onChange={(e) => update({ recentlySaved: e.target.checked || undefined })} /> Recently saved</label>
          {filters.month && <button type="button" className="btn-ghost px-2 py-1" onClick={() => update({ month: undefined })}>Month: {months.find((m) => m.monthKey === filters.month)?.label} ✕</button>}
          {filters.monthlyOnly && <button type="button" className="btn-ghost px-2 py-1" onClick={() => update({ monthlyOnly: undefined })}>Monthly questions only ✕</button>}
          <button type="button" className="btn-ghost px-2 py-1" onClick={() => { setFilters(EMPTY_FILTERS); setPage(0); }}>Reset</button>
          <span className="ml-auto" data-testid="result-count">{visible.length} of {items.length}</span>
          <button type="button" disabled={visible.length === 0} onClick={() => setGenerating(true)} className="btn-primary px-3.5 py-1.5 inline-flex items-center gap-1.5"><Rocket size={13} /> Generate test</button>
        </div>
      </section>

      {/* ── List ── */}
      {visible.length === 0 ? (
        <div className="card p-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
          <Layers size={26} className="mx-auto mb-1 text-brand-500" aria-hidden />
          {items.length === 0 ? <><p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Nothing to review yet</p><p>Questions you get wrong, or mark as Doubtful, Further Practice, Revision or Mark for Review, collect here.</p></> : <p>No questions match these filters.</p>}
        </div>
      ) : (
        <>
          <ul className="space-y-2" aria-label="Questions to review">
            {shown.map((it) => <ReviewItemRow key={it.key} item={it} expanded={open === it.key} onToggle={() => setOpen(open === it.key ? null : it.key)} onChanged={reload} catLabel={catLabel} />)}
          </ul>
          {pages > 1 && (
            <div className="flex items-center justify-between text-xs">
              <button type="button" className="btn-ghost px-3 py-1.5" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span style={{ color: 'var(--text-muted)' }}>Page {page + 1} of {pages}</span>
              <button type="button" className="btn-ghost px-3 py-1.5" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}

      <GenerateDialog open={generating} onClose={() => setGenerating(false)} pool={visible} filters={filters} monthLabelText={filters.month ? months.find((m) => m.monthKey === filters.month)?.label : undefined} />
    </div>
  );
}

function ReviewItemRow({ item, expanded, onToggle, onChanged, catLabel }: { item: ReviewItem; expanded: boolean; onToggle: () => void; onChanged: () => Promise<void>; catLabel: (c: ReviewCategory) => string }) {
  async function dropPurpose(p: typeof item.purposes[number]) {
    if (!item.savedId) return;
    try { await setSavedPurposes(item.savedId, item.purposes.filter((x) => x !== p)); toast('Purpose removed', { id: 'purpose-toast' }); await onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Could not change that.'); }
  }
  return (
    <li className="card p-3" data-testid="review-item" data-key={item.key}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="w-full flex items-start gap-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm" style={{ color: 'var(--text-primary)' }}>{item.question}</span>
          <span className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            {item.categories.map((c) => <span key={c} className="px-1.5 py-0.5 rounded-full" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>{catLabel(c).split(' / ')[0]}</span>)}
            <span style={{ color: 'var(--text-muted)' }}>{subjectName(item.subjectId)}{item.topicId ? ` › ${getTopicDisplayName(item.subjectId ?? '', item.topicId)}` : ''}{item.difficulty ? ` · ${item.difficulty}` : ''} · {item.sourceLabel}</span>
            {item.wrong > 0 && <span className="text-red-600">{item.wrong}× wrong</span>}
            {item.priority !== undefined && <span style={{ color: 'var(--text-muted)' }}>priority {item.priority}</span>}
          </span>
        </span>
        {expanded ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {expanded && (
        <div className="mt-3 space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <ol className="grid gap-1 sm:grid-cols-2">{item.options.map((o, i) => <li key={i} className="rounded-lg px-2.5 py-1.5" style={{ border: `1px solid ${o === item.correctAnswer ? '#16a34a' : 'var(--border)'}`, background: o === item.correctAnswer ? 'rgba(22,163,74,0.08)' : undefined, color: 'var(--text-primary)' }}>{String.fromCharCode(65 + i)}. {o}</li>)}</ol>
          {item.explanation && <p className="p-2 rounded-lg" style={{ background: 'var(--border)' }}>{item.explanation}</p>}
          {item.explanation && <SpeakExplanationButton text={item.explanation} />}
          {item.purposes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5"><span>Saved as:</span>
              {item.purposes.map((p) => (
                <span key={p} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px]" style={{ background: `${getMarkPurposeInfo(p)?.color}22`, color: getMarkPurposeInfo(p)?.color }}>
                  {getMarkPurposeInfo(p)?.label.split(' / ')[0]}
                  <button type="button" aria-label={`Remove ${getMarkPurposeInfo(p)?.label.split(' / ')[0]} from this question`} onClick={() => void dropPurpose(p)} className="p-0.5 rounded-full hover:bg-black/10"><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function GenerateDialog({ open, onClose, pool, filters, monthLabelText }: { open: boolean; onClose: () => void; pool: ReviewItem[]; filters: ReviewFilters; monthLabelText?: string }) {
  const navigate = useNavigate();
  const startSession = useQuizStore((s) => s.startSession);
  const examId = useExamStore((s) => s.selectedExamId);
  const [count, setCount] = useState(20);
  const [all, setAll] = useState(false);
  const [difficulty, setDifficulty] = useState<RevisionSpec['difficulty']>('mixed');
  const [randomize, setRandomize] = useState(true);
  const [mode, setMode] = useState<'practice' | 'test'>('practice');
  const [minutes, setMinutes] = useState<number | ''>('');

  const spec: RevisionSpec = { count: all ? 'all' : count, difficulty, randomize };
  const chosen = useMemo(() => (open ? selectForRevision(pool, spec) : []), [open, pool, all, count, difficulty, randomize]); // eslint-disable-line react-hooks/exhaustive-deps
  const what = monthLabelText ? `${monthLabelText} questions` : filters.monthlyOnly ? 'monthly Current Affairs questions (all months)' : filters.category === 'all' ? 'all review questions' : REVIEW_CATEGORIES.find((c) => c.id === filters.category)!.label;
  const timerInvalid = mode === 'test' && minutes !== '' && (!Number.isInteger(minutes) || minutes < 1 || minutes > 600);

  function start() {
    if (chosen.length === 0) return void toast.error('No questions match these settings.');
    if (timerInvalid) return;
    const label = `Revision — ${what}`;
    const quiz = buildRevisionQuiz(chosen, label);
    const exam = getExam(examId);
    startSession(quiz, `review_${Date.now()}.json`, mode === 'test'
      ? { isTest: true, testType: 'full', examId, examName: exam?.name ?? 'Revision test', marking: { marksPerCorrect: 1, negativeMarks: 0 }, ...(minutes !== '' ? { durationSeconds: minutes * 60 } : {}) }
      : undefined);
    onClose();
    navigate('/quiz');
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate a revision test" description={`From ${pool.length} question${pool.length === 1 ? '' : 's'} — ${what}. Your saved questions are not changed.`}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2"><label htmlFor="rv-count" style={{ color: 'var(--text-secondary)' }}>Questions</label>
          <input id="rv-count" type="number" min={1} max={200} disabled={all} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="w-20 rounded-xl px-2.5 py-1.5 bg-transparent" style={selectStyle} />
          <label className="inline-flex items-center gap-1.5 text-xs"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All of them</label></div>
        <div className="flex items-center gap-2"><label htmlFor="rv-diff" style={{ color: 'var(--text-secondary)' }}>Difficulty</label>
          <select id="rv-diff" value={difficulty} onChange={(e) => setDifficulty(e.target.value as RevisionSpec['difficulty'])} className={select} style={selectStyle}><option value="mixed">Mixed</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={randomize} onChange={(e) => setRandomize(e.target.checked)} /> Shuffle questions <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(off = highest revision priority first)</span></label>
        <fieldset className="flex gap-4"><legend className="sr-only">Mode</legend>
          {(['practice', 'test'] as const).map((m) => <label key={m} className="inline-flex items-center gap-1.5"><input type="radio" name="rv-mode" checked={mode === m} onChange={() => setMode(m)} /> {m === 'practice' ? 'Practice (answers shown as you go)' : 'Test (answers at the end)'}</label>)}</fieldset>
        {mode === 'test' && (
          <div className="flex items-center gap-2"><label htmlFor="rv-min" style={{ color: 'var(--text-secondary)' }}>Timer (minutes)</label>
            <input id="rv-min" type="number" min={1} max={600} placeholder="none" value={minutes} onChange={(e) => setMinutes(e.target.value === '' ? '' : Number(e.target.value))} className="w-24 rounded-xl px-2.5 py-1.5 bg-transparent" style={selectStyle} />
            {timerInvalid && <span role="alert" className="text-xs text-red-600">1–600, whole minutes</span>}</div>
        )}
        <p role="status" className="text-xs" style={{ color: 'var(--text-muted)' }}>{chosen.length} question{chosen.length === 1 ? '' : 's'} will be in this test.</p>
        <div className="flex gap-2"><button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
          <button type="button" onClick={start} disabled={chosen.length === 0 || timerInvalid} className="btn-primary flex-1 py-2.5">Start test</button></div>
      </div>
    </Modal>
  );
}

