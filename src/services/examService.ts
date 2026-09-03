// ─── ExamService ────────────────────────────────────────────────────────────
// Thin facade over examRegistry/subjectRegistry (master prompt §44). Pages/
// components should import from here, not reach into the registries directly —
// keeps a single swap point if exam config ever moves to remote/admin-managed data.

import type { Exam, Subject, Topic, ExamCategory } from '../types/exam';
import { examRegistry } from '../data/registry/examRegistry';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import { getQuestionsByExam, getContentSummary } from './questionRepository';
import { getAvailableExams } from './examDiscoveryService';

/** Every exam that actually has content on disk (data-architecture migration §13/§14) — the registry alone is configuration, not proof an exam exists. */
export function getAllExams(): Exam[] {
  return getAvailableExams();
}

/** Same as getAllExams() — kept as a distinct name for callers that only care about "safe to show in the exam selector today", which content-driven discovery now guarantees for everything it returns. */
export function getActiveExams(): Exam[] {
  return getAvailableExams();
}

export function getExam(examId: string): Exam | undefined {
  return getAvailableExams().find((e) => e.id === examId) ?? examRegistry.getExam(examId);
}

export function getExamsByCategory(category: ExamCategory): Exam[] {
  return examRegistry.getExamsByCategory(category);
}

export function getSubjectsForExam(examId: string): Subject[] {
  return subjectRegistry.getSubjectsForExam(examId);
}

export function getTopicsForSubject(subjectId: string): Topic[] {
  return subjectRegistry.getTopicsForSubject(subjectId);
}

export function getAllSubjects(): Subject[] {
  return subjectRegistry.getAllSubjects();
}

/**
 * Merges exam CONFIGURATION (which subjects a syllabus is supposed to have,
 * from examRegistry) with actual AVAILABLE CONTENT (getContentSummary, from
 * the live question pool). A subject the exam config lists but that has zero
 * real questions still appears here — with `hasContent: false` — rather than
 * being silently hidden or silently pretended-available (master prompt §4).
 * Topic names/counts come straight from getContentSummary — no second
 * counting pass here (master prompt §8: don't duplicate these functions).
 */
export async function getSyllabusWithCounts(examId: string): Promise<
  { subject: Subject; questionCount: number; hasContent: boolean; topics: { topicId: string; topicName: string; questionCount: number }[] }[]
> {
  const configuredSubjects = getSubjectsForExam(examId);
  const summary = await getContentSummary(examId);
  const bySubjectId = new Map(summary.subjects.map((s) => [s.subjectId, s]));

  return configuredSubjects.map((subject) => {
    const content = bySubjectId.get(subject.id);
    return {
      subject,
      questionCount: content?.questionCount ?? 0,
      hasContent: Boolean(content && content.questionCount > 0),
      topics: content?.topics ?? [],
    };
  });
}

/** Whether an exam has any question data at all yet — use this, not `exam.active`, to decide what to render (registry `active` is a curation flag, this is ground truth). */
export async function examHasData(examId: string): Promise<boolean> {
  const questions = await getQuestionsByExam(examId);
  return questions.length > 0;
}
