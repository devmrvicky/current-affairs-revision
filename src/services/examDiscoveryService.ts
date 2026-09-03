// ─── Exam Discovery Service ─────────────────────────────────────────────────
// Exam discovery and chapter discovery are deliberately separate concepts
// (data-architecture migration §31): this module answers "which exams
// actually have content on disk", scanning the SAME physical exam-specific
// data src/data/{Category}/{examId}/... already understood by
// questionRepository.ts's native/mock/mock-source loaders — never
// src/data/chapters/, which is common content, not exam-specific, and never
// produces an exam.
//
// examRegistry remains useful for METADATA (display name, supported
// subjects, mock config) once an exam is known to exist — but it is no
// longer the source of truth for WHETHER an exam exists. A registry entry
// with no matching content folder never appears in Exam Selection; a real
// content folder with no registry entry still appears, with sensible
// fallback metadata, rather than requiring a registry edit just to make an
// existing folder visible (data-architecture migration §14/§30).

import type { Exam } from '../types/exam';
import { examRegistry } from '../data/registry/examRegistry';
import { humanizeSlug } from '../utils/slug';

// Current Affairs is common chapter content living under
// src/data/chapters/General Awareness/Current Affairs/ — never an exam, no
// matter what its registry entry or internal examId tag says (kept for the
// existing CA question-tagging/session machinery; see universalChapterRepository.ts
// for the full rationale). Exam discovery and chapter discovery must never
// blur into each other (data-architecture migration §11/§13/§31).
const NEVER_AN_EXAM = new Set(['current-affairs']);

const RESERVED_CATEGORY_FOLDERS = new Set(['chapters', 'registry']);

// Enumeration-only globs (no eager loading) — three independent probes for
// "does at least one piece of exam-specific content exist under this examId
// folder", mirroring the exact parsing rules questionRepository.ts's own
// loaders use, so discovery never disagrees with what Practice/Test/Mock
// actually find.
const nativeProbeModules = import.meta.glob('../data/*/*/*/*.json', { eager: false }); // Category/examId/year/subject.json
const mockProbeModules = import.meta.glob('../data/**/mock/*.json', { eager: false });
const mocksProbeModules = import.meta.glob('../data/**/mocks/**/*.json', { eager: false });

function segmentsAfterData(globKey: string): string[] | null {
  const marker = '/data/';
  const idx = globKey.indexOf(marker);
  if (idx < 0) return null;
  return globKey.slice(idx + marker.length).split('/');
}

function collectDiscoveredExamIds(): Set<string> {
  const ids = new Set<string>();

  for (const key of Object.keys(nativeProbeModules)) {
    const parts = segmentsAfterData(key);
    if (!parts || parts.length !== 4) continue; // Category/examId/year/file.json
    const [category, examId] = parts;
    if (RESERVED_CATEGORY_FOLDERS.has(category)) continue;
    ids.add(examId);
  }

  for (const key of Object.keys(mockProbeModules)) {
    const parts = segmentsAfterData(key);
    if (!parts) continue;
    const mockIdx = parts.lastIndexOf('mock');
    if (mockIdx < 1 || mockIdx !== parts.length - 2) continue;
    const examId = parts[mockIdx - 1];
    if (RESERVED_CATEGORY_FOLDERS.has(examId)) continue;
    ids.add(examId);
  }

  for (const key of Object.keys(mocksProbeModules)) {
    const parts = segmentsAfterData(key);
    if (!parts) continue;
    const mocksIdx = parts.lastIndexOf('mocks');
    if (mocksIdx < 1) continue;
    const examId = parts[mocksIdx - 1];
    if (RESERVED_CATEGORY_FOLDERS.has(examId)) continue;
    ids.add(examId);
  }

  for (const excluded of NEVER_AN_EXAM) ids.delete(excluded);
  return ids;
}

let _discoveredIds: Set<string> | null = null;

function getDiscoveredExamIds(): Set<string> {
  if (!_discoveredIds) _discoveredIds = collectDiscoveredExamIds();
  return _discoveredIds;
}

/** Fallback metadata for a real content folder that has no registry entry yet — never crashes, never blocks the folder from appearing. */
function fallbackExam(examId: string): Exam {
  return {
    id: examId,
    name: humanizeSlug(examId),
    category: 'other',
    subjects: [],
    mockConfig: { questions: 25, durationMinutes: 20, marking: { marksPerCorrect: 1, negativeMarks: 0 } },
    active: true,
  };
}

/**
 * Every exam that actually has content on disk, enriched with registry
 * metadata where available. This — not examRegistry.getAllExams() — is the
 * source of truth for Exam Selection.
 */
export function getAvailableExams(): Exam[] {
  const discovered = getDiscoveredExamIds();
  return Array.from(discovered).map((id) => examRegistry.getExam(id) ?? fallbackExam(id));
}

/** Clears the in-memory discovery cache — dev hot-reload safety net. */
export function clearExamDiscoveryCache(): void {
  _discoveredIds = null;
}
