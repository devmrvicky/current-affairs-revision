// ─── Mock Report Export ─────────────────────────────────────────────────────
// "Create a clean export abstraction rather than adding a fragile dependency
// unnecessarily" — this renders the MockAnalysis into a well-structured
// Markdown document and triggers a browser download. No PDF library, no
// server round-trip, nothing that can fail beyond string-building — so the
// result page is never blocked or put at risk by this being unavailable.
// Swapping in real PDF rendering later only means replacing what this module
// exports, not how the result page calls it.

import type { MockAnalysis } from '../types/mockAnalysis';

function fmtTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}m ${s}s`;
}

function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined ? 'N/A' : `${n.toFixed(2)}%`;
}

export function buildMockReportMarkdown(analysis: MockAnalysis): string {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push(`# ${analysis.title}`);
  push(`_Test Analysis Report — generated ${new Date(analysis.completedAt).toLocaleString()}_`);
  push();
  push('## Summary');
  push(`- Score: **${analysis.summary.score} / ${analysis.summary.maxScore}** (${analysis.summary.percentage.toFixed(2)}%)`);
  push(`- Accuracy: ${fmtPct(analysis.summary.accuracy)}`);
  push(`- Correct: ${analysis.summary.correct} · Incorrect: ${analysis.summary.incorrect} · Unattempted: ${analysis.summary.unattempted}`);
  push(`- Time Taken: ${fmtTime(analysis.summary.timeTakenSeconds)}`);
  if (analysis.ranking) push(`- All India Rank: ${analysis.ranking.rank} / ${analysis.ranking.totalParticipants}`);
  if (analysis.percentile !== undefined) push(`- Percentile: ${analysis.percentile}`);
  if (analysis.cutoff && (analysis.cutoff.min !== undefined || analysis.cutoff.max !== undefined)) {
    push(`- Cut-off: ${analysis.cutoff.min ?? '—'}–${analysis.cutoff.max ?? '—'}`);
  }
  push(`- Overview: **${analysis.overview.rating}** — ${analysis.overview.message}`);
  push();

  push('## Speed Analysis');
  push(`- Overall: ${analysis.speed.questionsPerMinute ?? 'N/A'} questions/min, avg ${analysis.speed.averageTimePerQuestionSeconds ?? 'N/A'}s/question`);
  for (const s of analysis.speed.bySubject) push(`  - ${s.subjectName}: ${s.avgTimePerQuestionSeconds}s/question`);
  if (analysis.speed.byDifficulty.length > 0) {
    push('- By difficulty:');
    for (const d of analysis.speed.byDifficulty) push(`  - ${d.difficulty}: ${d.avgTimeSeconds}s avg (${d.questionCount} questions)`);
  }
  push();

  push('## Subject Performance');
  push('| Subject | Attempted | Correct | Incorrect | Unattempted | Score | Accuracy |');
  push('|---|---|---|---|---|---|---|');
  for (const s of analysis.subjectPerformance) {
    push(`| ${s.subjectName} | ${s.attempted}/${s.questionCount} | ${s.correct} | ${s.incorrect} | ${s.unattempted} | ${s.marks}/${s.maxMarks} | ${fmtPct(s.accuracy)} |`);
  }
  push();

  push('## Strong & Weak Areas');
  push(`- Strong subjects: ${analysis.strongAreas.subjects.map((a) => a.name).join(', ') || 'None yet'}`);
  push(`- Weak subjects: ${analysis.weakAreas.subjects.map((a) => a.name).join(', ') || 'None'}`);
  push(`- Strong topics: ${analysis.strongAreas.topics.map((a) => a.name).join(', ') || 'None yet'}`);
  push(`- Weak topics: ${analysis.weakAreas.topics.map((a) => a.name).join(', ') || 'None'}`);
  push();

  push('## Time Distribution');
  for (const t of analysis.timeDistribution) push(`- ${t.subjectName}: ${t.percentage}% (${fmtTime(t.timeSpentSeconds)})`);
  push();

  push('## Question Preference');
  push(`- Answered: ${analysis.questionPreference.answered}`);
  push(`- Answered & Marked: ${analysis.questionPreference.answeredAndMarked}`);
  push(`- Marked (unanswered): ${analysis.questionPreference.markedOnly}`);
  push(`- Skipped (visited, not answered): ${analysis.questionPreference.visitedNotAnswered}`);
  push(`- Not visited: ${analysis.questionPreference.notVisited}`);
  push();

  if (analysis.historicalComparison) {
    const h = analysis.historicalComparison;
    push('## Historical Comparison');
    push(`- Based on ${h.previousAttemptCount} previous attempt(s)`);
    push(`- Time taken: ${fmtTime(h.timeTakenSeconds.current)} vs previous average ${fmtTime(h.timeTakenSeconds.previousAverage)} (${h.timeTakenSeconds.changeSeconds <= 0 ? 'faster by' : 'slower by'} ${fmtTime(Math.abs(h.timeTakenSeconds.changeSeconds))})`);
    push();
  }

  push('## Solutions');
  analysis.solutions.forEach((q, i) => {
    push(`### Q${i + 1} — ${q.status.toUpperCase()}`);
    push(q.question.replace(/\n/g, ' '));
    for (const opt of q.options) push(`- ${opt.id}. ${opt.text}`);
    push(`**Your answer:** ${q.selectedAnswer ?? 'Not attempted'} · **Correct answer:** ${q.correctAnswer}`);
    if (q.explanation) push(`_Explanation: ${q.explanation}_`);
    push();
  });

  return lines.join('\n');
}

export function downloadMockReport(analysis: MockAnalysis): void {
  const markdown = buildMockReportMarkdown(analysis);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${analysis.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
