// ─── Mock Definition Repository ────────────────────────────────────────────
// Auto-discovers every src/data/{...}/{examId}/mock-config/*.json file. Each
// file is ONE MockDefinition (full-mock or sectional-mock) authored by hand —
// content authors add mock02.json, mock03.json etc. with zero code changes
// (product spec §139). This repository never stores question content itself;
// it resolves each section's question order by filtering the exam's existing
// question pool (questionRepository) by `source` (which mock file) and
// `subjectId` (which section), preserving the authored order unless
// randomizeQuestions is explicitly set (product spec §59/§60).

import type { MockDefinition, FullMockDefinition, SectionalMockDefinition } from '../types/examMock';
import { validateFullMockDefinition, validateSectionalMockDefinition, type MockValidationError } from '../types/examMock';
import type { UniversalQuestion } from '../types/universalQuestion';
import { getQuestionsByExam } from './questionRepository';

const mockConfigModules = import.meta.glob<{ default: MockDefinition }>(
  '../data/**/mock-config/*.json',
  { eager: false }
);

let _cache: MockDefinition[] | null = null;

async function loadAllMockDefinitions(): Promise<MockDefinition[]> {
  if (_cache) return _cache;
  const all: MockDefinition[] = [];
  for (const loader of Object.values(mockConfigModules)) {
    const mod = await loader();
    if (mod?.default) all.push(mod.default);
  }
  _cache = all;
  return all;
}

export async function getAllMockDefinitions(): Promise<MockDefinition[]> {
  return loadAllMockDefinitions();
}

export async function getMockDefinitionsForExam(examId: string): Promise<MockDefinition[]> {
  const all = await loadAllMockDefinitions();
  return all.filter((d) => d.examId === examId);
}

export async function getMockDefinition(mockId: string): Promise<MockDefinition | null> {
  const all = await loadAllMockDefinitions();
  return all.find((d) => d.id === mockId) ?? null;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every question tagged `mock:{mockFile}` for this exam, grouped by subjectId, in authored file order. */
async function getMockPoolBySubject(examId: string, mockFile: string): Promise<Record<string, UniversalQuestion[]>> {
  const pool = await getQuestionsByExam(examId);
  const bySubject: Record<string, UniversalQuestion[]> = {};
  for (const q of pool) {
    if (q.source !== `mock:${mockFile}`) continue;
    (bySubject[q.subjectId] ??= []).push(q);
  }
  return bySubject;
}

export interface ResolvedFullMock {
  definition: FullMockDefinition;
  sectionQuestionIds: Record<string, string[]>; // sectionId -> ordered questionIds
  errors: MockValidationError[];
}

export async function resolveFullMock(definition: FullMockDefinition): Promise<ResolvedFullMock> {
  const bySubject = await getMockPoolBySubject(definition.examId, definition.mockFile);
  const availableCountBySection: Record<string, number> = {};
  const sectionQuestionIds: Record<string, string[]> = {};

  for (const section of definition.sections) {
    const available = bySubject[section.subjectId] ?? [];
    availableCountBySection[section.id] = available.length;
    const ordered = definition.randomizeQuestions ? shuffle(available) : available;
    sectionQuestionIds[section.id] = ordered.slice(0, section.questionCount).map((q) => q.id);
  }

  const errors = validateFullMockDefinition(definition, availableCountBySection);
  return { definition, sectionQuestionIds, errors };
}

export interface ResolvedSectionalMock {
  definition: SectionalMockDefinition;
  questionIds: string[];
  errors: MockValidationError[];
}

export async function resolveSectionalMock(definition: SectionalMockDefinition): Promise<ResolvedSectionalMock> {
  const bySubject = await getMockPoolBySubject(definition.examId, definition.mockFile);
  const available = bySubject[definition.section.subjectId] ?? [];
  const ordered = definition.randomizeQuestions ? shuffle(available) : available;
  const questionIds = ordered.slice(0, definition.section.questionCount).map((q) => q.id);

  const errors = validateSectionalMockDefinition(definition, available.length);
  return { definition, questionIds, errors };
}
