// ─── Mock Definition Repository ────────────────────────────────────────────
// Derives every Full Mock AND every Sectional Mock definition from the Mock
// Source Files in mockSourceRegistry.ts — nothing here is hand-authored.
// A Sectional Mock is a VIRTUAL definition: its id is deterministic
// (`{mockSourceId}::section::{sectionId}`), computed at read time from the
// parent mock's `sections[]`. There is no sectional-config JSON file to
// create, edit, or keep in sync — add a section to the mock source file and
// its sectional mock exists automatically (product spec §10-12/§64/§72).

import type { MockDefinition, FullMockDefinition, SectionalMockDefinition, MockSectionConfig } from '../types/examMock';
import type { MockValidationError } from '../types/examMock';
import type { MockSourceFile, MockSourceSection } from '../types/mockSourceFile';
import { getAllMockSourceFiles, getMockSourceFile, namespacedQuestionId, getMockSourceValidationErrors } from './mockSourceRegistry';

const SECTION_MARKER = '::section::';

function toSectionConfig(s: MockSourceSection, fallbackNegativeMarks: number): MockSectionConfig {
  return {
    id: s.id,
    title: s.title,
    subjectId: s.subjectId,
    questionCount: s.questionCount,
    durationSeconds: s.durationSeconds,
    marksPerQuestion: s.marksPerQuestion,
    negativeMarks: s.negativeMarks ?? fallbackNegativeMarks,
  };
}

export function toFullMockDefinition(file: MockSourceFile): FullMockDefinition {
  return {
    id: file.id,
    examId: file.examId,
    tierId: file.tierId,
    title: file.title,
    mode: 'full-mock',
    mockFile: file.id,
    totalQuestions: file.settings.totalQuestions,
    totalMarks: file.settings.totalMarks,
    durationSeconds: file.settings.durationSeconds,
    randomizeQuestions: file.settings.randomizeQuestions ?? false,
    pyq: file.source?.type === 'pyq' ? { exam: file.title, year: file.source.year ?? 0, date: file.source.date, shift: file.source.shift } : undefined,
    sections: file.sections.map((s) => toSectionConfig(s, file.settings.negativeMarks)),
  };
}

/** One derived SectionalMockDefinition per section — deterministic id, no physical file (product spec §11). */
export function deriveSectionalMockDefinitions(file: MockSourceFile): SectionalMockDefinition[] {
  return file.sections.map((s) => ({
    id: `${file.id}${SECTION_MARKER}${s.id}`,
    examId: file.examId,
    tierId: file.tierId,
    title: `${file.title} — ${s.title} Sectional`,
    mode: 'sectional-mock',
    mockFile: file.id,
    randomizeQuestions: false, // sectional mocks preserve exam order by default (product spec §38)
    pyq: file.source?.type === 'pyq' ? { exam: file.title, year: file.source.year ?? 0, date: file.source.date, shift: file.source.shift } : undefined,
    section: toSectionConfig(s, file.settings.negativeMarks),
  }));
}

export async function getAllMockDefinitions(): Promise<MockDefinition[]> {
  const files = await getAllMockSourceFiles();
  const defs: MockDefinition[] = [];
  for (const file of files) {
    defs.push(toFullMockDefinition(file));
    defs.push(...deriveSectionalMockDefinitions(file));
  }
  return defs;
}

export async function getMockDefinitionsForExam(examId: string): Promise<MockDefinition[]> {
  const all = await getAllMockDefinitions();
  return all.filter((d) => d.examId === examId);
}

/** Groups a subject's derived sectional mocks by section, so a UI can show "3 Sectional Mocks" per subject across mock01/mock02/mock03 (product spec §71-72). */
export async function getSectionalMockDefinitionsGroupedBySubject(examId: string): Promise<Map<string, SectionalMockDefinition[]>> {
  const defs = await getMockDefinitionsForExam(examId);
  const bySubject = new Map<string, SectionalMockDefinition[]>();
  for (const d of defs) {
    if (d.mode !== 'sectional-mock') continue;
    const arr = bySubject.get(d.section.subjectId) ?? [];
    arr.push(d);
    bySubject.set(d.section.subjectId, arr);
  }
  return bySubject;
}

export async function getMockDefinition(mockId: string): Promise<MockDefinition | null> {
  const markerIdx = mockId.indexOf(SECTION_MARKER);
  if (markerIdx < 0) {
    const file = await getMockSourceFile(mockId);
    return file ? toFullMockDefinition(file) : null;
  }
  const mockSourceId = mockId.slice(0, markerIdx);
  const sectionId = mockId.slice(markerIdx + SECTION_MARKER.length);
  const file = await getMockSourceFile(mockSourceId);
  if (!file) return null;
  return deriveSectionalMockDefinitions(file).find((d) => d.section.id === sectionId) ?? null;
}

/** For the "this mock couldn't be found" case — surfaces the actual content-validation reason when one exists, instead of a bare 404 (product spec §158). */
export async function getValidationErrorsForMock(mockId: string): Promise<MockValidationError[]> {
  const mockSourceId = mockId.includes(SECTION_MARKER) ? mockId.slice(0, mockId.indexOf(SECTION_MARKER)) : mockId;
  const errors = await getMockSourceValidationErrors();
  return errors.filter((e) => e.mockSourceId === mockSourceId).map((e) => ({ mockId: e.mockSourceId, reason: e.reason }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface ResolvedFullMock {
  definition: FullMockDefinition;
  sectionQuestionIds: Record<string, string[]>; // sectionId -> ordered, namespaced questionIds
  errors: MockValidationError[];
}

export async function resolveFullMock(definition: FullMockDefinition): Promise<ResolvedFullMock> {
  const file = await getMockSourceFile(definition.mockFile);
  if (!file) {
    return { definition, sectionQuestionIds: {}, errors: [{ mockId: definition.id, reason: `source mock file "${definition.mockFile}" could not be loaded` }] };
  }

  const sectionQuestionIds: Record<string, string[]> = {};
  for (const section of file.sections) {
    const namespaced = section.questionIds.map((localId) => namespacedQuestionId(file.id, localId));
    sectionQuestionIds[section.id] = definition.randomizeQuestions ? shuffle(namespaced) : namespaced;
  }

  return { definition, sectionQuestionIds, errors: [] };
}

export interface ResolvedSectionalMock {
  definition: SectionalMockDefinition;
  questionIds: string[];
  errors: MockValidationError[];
}

export async function resolveSectionalMock(definition: SectionalMockDefinition): Promise<ResolvedSectionalMock> {
  const file = await getMockSourceFile(definition.mockFile);
  if (!file) {
    return { definition, questionIds: [], errors: [{ mockId: definition.id, reason: `source mock file "${definition.mockFile}" could not be loaded` }] };
  }
  const section = file.sections.find((s) => s.id === definition.section.id);
  if (!section) {
    return { definition, questionIds: [], errors: [{ mockId: definition.id, reason: `section "${definition.section.id}" no longer exists in "${definition.mockFile}"` }] };
  }
  const namespaced = section.questionIds.map((localId) => namespacedQuestionId(file.id, localId));
  return { definition, questionIds: definition.randomizeQuestions ? shuffle(namespaced) : namespaced, errors: [] };
}
