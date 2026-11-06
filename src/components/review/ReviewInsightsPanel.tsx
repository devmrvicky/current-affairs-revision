import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus, TrendingUp } from 'lucide-react';
import { markedForReviewDB, universalAttemptsDB } from '../../services/db';
import { resolveQuestionsByIds } from '../../services/questionRepository';
import {
  buildQuestionHistories, improvementByTopic, mistakesByTopic, PRIORITY_WEIGHTS, rankRevisionPriority, repeatedMistakes, MIN_ATTEMPTS_PER_PERIOD,
  type MarkInfo, type PriorityBand,
} from '../../services/reviewAnalytics';
import { getTopicDisplayName } from '../../data/registry/subjectRegistry';

const BAND_STYLE: Record<PriorityBand, { label: string; color: string }> = {
  high: { label: 'High', color: '#ef4444' }, medium: { label: 'Medium', color: '#f59e0b' }, low: { label: 'Low', color: '#0ea5e9' }, mastered: { label: 'Mastered', color: '#22c55e' },
};

type Loaded = {
  rows: Awaited<ReturnType<typeof universalAttemptsDB.getAll>>;
  marks: Map<string, MarkInfo>;
};

function truncate(text: string, n = 140) { return text.length > n ? `${text.slice(0, n - 1)}…` : text; }

/** Revision priority, repeated mistakes and improvement — computed from the learner's own stored attempts and marks. */
export function ReviewInsightsPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texts, setTexts] = useState<Map<string, string>>(new Map());
  const [textsReady, setTextsReady] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [rows, marked] = await Promise.all([universalAttemptsDB.getAll(), markedForReviewDB.getAll()]);
        const marks = new Map<string, MarkInfo>();
        for (const m of marked) if (m.universalQuestionId && m.purpose) marks.set(m.universalQuestionId, { purpose: m.purpose, markedAt: m.markedAt });
        if (alive) setData({ rows, marks });
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not read your attempts.');
      }
    })();
    return () => { alive = false; };
  }, []);

  const analysis = useMemo(() => {
    if (!data) return null;
    const histories = buildQuestionHistories(data.rows);
    return {
      histories,
      priority: rankRevisionPriority(histories, data.marks, now),
      repeated: repeatedMistakes(histories.values()),
      topicMistakes: mistakesByTopic(histories.values()),
      improvement: improvementByTopic(data.rows),
    };
  }, [data, now]);

  const priorityShown = useMemo(() => (analysis?.priority ?? []).filter((p) => p.band !== 'mastered').slice(0, 15), [analysis]);
  const repeatedShown = useMemo(() => (analysis?.repeated ?? []).slice(0, 10), [analysis]);

  // Question text only for what is on screen — never the whole bank.
  useEffect(() => {
    const ids = [...priorityShown.map((p) => p.questionId), ...repeatedShown.map((r) => r.questionId)];
    if (ids.length === 0) return;
    let alive = true;
    void resolveQuestionsByIds(Array.from(new Set(ids)))
      .then((qs) => { if (alive) { setTexts(new Map(qs.map((q) => [q.id, q.question]))); setTextsReady(true); } })
      .catch(() => { if (alive) setTextsReady(true); }); // lookup failed: stop saying "loading", fall back to the honest message
    return () => { alive = false; };
  }, [priorityShown, repeatedShown]);

  if (error) return <div className="card p-5 text-sm text-center text-red-600" role="alert">{error}</div>;
  if (!data || !analysis) return <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />;
  if (data.rows.length === 0 && data.marks.size === 0) {
    return (
      <div className="card p-8 text-center text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
        <TrendingUp size={26} className="mx-auto text-brand-500" aria-hidden />
        <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No insights yet</p>
        <p>Attempt a few practice tests or mocks. Priorities, repeated mistakes and progress are calculated from your real attempts.</p>
      </div>
    );
  }

  const nameOf = (subjectId: string, topicId: string) => getTopicDisplayName(subjectId, topicId);
  const W = PRIORITY_WEIGHTS;
  const label = (id: string) => (!textsReady ? 'Loading question…' : truncate(texts.get(id) ?? 'Question text unavailable (it may have been removed from the bank)'));

  return (
    <div className="space-y-6" data-testid="review-insights">
      <section aria-labelledby="rp-h" className="space-y-2">
        <h2 id="rp-h" className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>Revision priority</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Which questions to revisit first, from repeated mistakes, doubts, saved marks and how long since you last saw them.</p>
        {priorityShown.length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Nothing needs revision right now — no unresolved mistakes and nothing marked Doubtful, Further Practice or Revision.</p>
        ) : (
          <ul className="space-y-2">
            {priorityShown.map((p) => (
              <li key={p.questionId} className="card p-3" data-testid="priority-row">
                <div className="flex items-start gap-3">
                  <span className="shrink-0 text-center rounded-xl px-2.5 py-1.5" style={{ background: `${BAND_STYLE[p.band].color}1f`, color: BAND_STYLE[p.band].color }}>
                    <span className="block text-lg font-bold leading-none">{p.score}</span><span className="block text-[10px] font-semibold uppercase">{BAND_STYLE[p.band].label}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label(p.questionId)}</p>
                    <p className="mt-1 text-xs flex flex-wrap gap-x-2" style={{ color: 'var(--text-muted)' }}>
                      {p.factors.map((f) => <span key={f.label}>{f.label} (+{f.points})</span>)}
                      {p.masteryMultiplier < 1 && <span>× {p.masteryMultiplier} recent correct answers</span>}
                    </p>
                    {p.confidence === 'low' && <p className="mt-0.5 text-[11px] text-amber-600">Limited data — fewer than 2 attempts.</p>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <details className="card p-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <summary className="cursor-pointer font-semibold" style={{ color: 'var(--text-primary)' }}>How is this calculated?</summary>
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li>Up to <strong>{W.repeatedWrong}</strong> points for repeated wrong answers ({W.repeatedWrongCap} or more wrong = full).</li>
            <li><strong>{W.unresolved}</strong> if your latest attempt was wrong.</li>
            <li><strong>{W.doubtful}</strong> if marked Doubtful; <strong>{W.awaitingRevision}</strong> if marked Further Practice or Revision.</li>
            <li>Up to <strong>{W.staleness}</strong> for time since you last reviewed it (full at {W.stalenessDays} days), only when one of the signals above applies.</li>
            <li>Then each correct answer in a row since your last mistake reduces the score by {W.masteryDiscountPerCorrect * 100}% — {W.masteredStreak} in a row counts as mastered.</li>
            <li>High ≥ {W.highAt}, Medium ≥ {W.mediumAt}. A question with no attempts and no revision mark gets no score at all.</li>
          </ul>
        </details>
      </section>

      <section aria-labelledby="mf-h" className="space-y-2">
        <h2 id="mf-h" className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>Repeated mistakes</h2>
        {repeatedShown.length === 0 ? (
          <p className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>No question has been answered wrong more than once yet.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {repeatedShown.map((h) => (
                <li key={h.questionId} className="card p-3 flex items-start gap-3" data-testid="repeated-row">
                  <span className="shrink-0 rounded-lg px-2 py-1 text-xs font-bold bg-red-500/10 text-red-600">{h.wrong}× wrong</span>
                  <div className="min-w-0"><p className="text-sm" style={{ color: 'var(--text-primary)' }}>{label(h.questionId)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{h.topicId ? nameOf(h.subjectId, h.topicId) : h.subjectId} · {h.answered} answered · {h.trailingCorrect > 0 ? `${h.trailingCorrect} correct in a row now` : 'still wrong'}</p></div>
                </li>
              ))}
            </ul>
            {analysis.topicMistakes.length > 0 && (
              <div className="card p-3 text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>By topic</p>
                {analysis.topicMistakes.slice(0, 8).map((t) => <p key={t.topicId}>{nameOf(t.subjectId, t.topicId)} — {t.wrong} wrong answers across {t.questionsWrongAtLeastOnce} question(s), {t.repeatedQuestions} repeated</p>)}
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="im-h" className="space-y-2">
        <h2 id="im-h" className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>Improvement</h2>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your earlier answers compared with your recent ones, per topic. Needs at least {MIN_ATTEMPTS_PER_PERIOD} answered attempts in each period.</p>
        {analysis.improvement.length === 0 ? <p className="card p-4 text-sm" style={{ color: 'var(--text-secondary)' }}>No topic-tagged attempts yet.</p> : (
          <ul className="space-y-2">
            {analysis.improvement.slice(0, 20).map((t) => (
              <li key={t.topicId} className="card p-3 text-xs" data-testid="improvement-row" data-trend={t.trend}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{nameOf(t.subjectId, t.topicId)}</p>
                  <span className="inline-flex items-center gap-1 font-semibold" style={{ color: t.trend === 'improving' ? '#16a34a' : t.trend === 'declining' ? '#dc2626' : 'var(--text-muted)' }}>
                    {t.trend === 'improving' ? <ArrowUpRight size={14} /> : t.trend === 'declining' ? <ArrowDownRight size={14} /> : t.trend === 'steady' ? <Minus size={14} /> : <AlertTriangle size={13} />}
                    {t.trend === 'insufficient-data' ? 'Not enough data' : `${t.delta! > 0 ? '+' : ''}${t.delta} pts`}
                  </span>
                </div>
                <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {t.previousAccuracy ?? '–'}% over {t.previousAttempts} earlier → {t.latestAccuracy ?? '–'}% over {t.latestAttempts} recent
                </p>
                {t.note && <p className="mt-0.5" style={{ color: t.reliable ? 'var(--text-muted)' : '#d97706' }}>{t.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
