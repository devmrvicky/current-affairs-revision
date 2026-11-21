// ─── QuestionBankRepository ──────────────────────────────────────────────────
// The single abstraction the Test Engine and the Question Bank screens use for "where do tests come from":
//   Bundled (JSON shipped in src/data, unchanged) · Local (imported on this device) · Remote (published via GitHub, cached here).
// Local and remote tests are fed into the existing question pool by poolProvider (additively), so they appear in Practice by Topic and run
// in the existing engines. Bundled behaviour is unchanged when there is no local/remote data.

import { EXAMS } from '../../data/registry/examRegistry';
import { getPracticeTests } from '../practiceTestRepository';
import { resolveQuestionsByIds } from '../questionRepository';
import { commitTests, deleteBankTest, getBankQuestions, getBankTest, getBankTests, countBankQuestions, getMetadata } from './bankDb';
import { emitBankChanged } from './bankEvents';
import { toPrepared } from './importPipeline';
import { toUniversalQuestion } from './poolProvider';
import { META_MANIFEST, META_LAST_SYNC, downloadRemoteTest, syncRemote, type SyncDeps, type SyncResult } from './remoteSync';
import { isBankTestInUse } from './bankUsage';
import { examIdsForSubject, type ParsedTestFile } from './testFile';
import { testKeyOf, type BankOrigin, type BankQuestionData, type BankSource, type BankTestRecord, type Manifest } from './types';
import type { UniversalQuestion } from '../../types/universalQuestion';

export interface BankTestSummary {
  source: BankSource;
  /** `bundled:<id>`, `local:<id>` or `remote:<id>` — unique across sources. */
  key: string;
  id: string;
  title: string;
  subjectId: string;
  chapterId?: string;
  questionCount: number;
  version?: number;
  updatedAt?: number;
}

export interface QuestionBankMetadata {
  bundledTests: number;
  localTests: number;
  /** Published tests installed on this device. */
  remoteInstalled: number;
  /** Published tests the cached manifest lists (what is available to everyone). */
  remoteAvailable: number;
  localQuestions: number;
  remoteQuestions: number;
  /** Last fully successful sync, or null if it never has been. */
  lastSyncAt: number | null;
}

const fromRecord = (t: BankTestRecord): BankTestSummary => ({ source: t.origin, key: t.key, id: t.id, title: t.title, subjectId: t.subjectId, chapterId: t.chapterId, questionCount: t.questionCount, version: t.version, updatedAt: t.updatedAt });

async function bundledDefinitions() {
  const seen = new Map<string, Awaited<ReturnType<typeof getPracticeTests>>[number]>();
  for (const exam of EXAMS) {
    for (const subject of exam.subjects) {
      for (const def of await getPracticeTests(exam.id, subject.subjectId)) {
        if (def.questionIds[0]?.startsWith('qb:')) continue; // a bank test, not a bundled one
        if (!seen.has(def.rawSource)) seen.set(def.rawSource, def);
      }
    }
  }
  return Array.from(seen.values());
}

const splitKey = (idOrKey: string): { origin?: BankSource; id: string } => {
  const m = /^(bundled|local|remote):(.+)$/.exec(idOrKey);
  return m ? { origin: m[1] as BankSource, id: m[2] } : { id: idOrKey };
};

export const questionBankRepository = {
  /** Every test the app can run, from all three sources. */
  async getAllTests(): Promise<BankTestSummary[]> {
    const bundled = (await bundledDefinitions()).map((d): BankTestSummary => ({ source: 'bundled', key: `bundled:${d.rawSource}`, id: d.rawSource, title: d.title, subjectId: d.chapterSubjectId ?? d.subjectId, chapterId: d.chapterId, questionCount: d.questionCount }));
    return [...bundled, ...(await getBankTests()).map(fromRecord)];
  },

  /** By key (`local:x`) or by bare id — local first, then remote, then bundled. */
  async getTestById(idOrKey: string): Promise<BankTestSummary | undefined> {
    const { origin, id } = splitKey(idOrKey);
    for (const o of origin && origin !== 'bundled' ? [origin] : (['local', 'remote'] as const)) {
      const t = await getBankTest(testKeyOf(o, id));
      if (t) return fromRecord(t);
    }
    if (origin && origin !== 'bundled') return undefined;
    return (await this.getAllTests()).find((t) => t.source === 'bundled' && (t.id === id || t.key === idOrKey));
  },

  /** The test's questions as the engines see them (pool ids). */
  async getQuestions(idOrKey: string): Promise<UniversalQuestion[]> {
    const { origin, id } = splitKey(idOrKey);
    for (const o of origin && origin !== 'bundled' ? [origin] : (['local', 'remote'] as const)) {
      const t = await getBankTest(testKeyOf(o, id));
      if (t) return (await getBankQuestions(t.key)).map((r) => toUniversalQuestion(r, t));
    }
    const def = (await bundledDefinitions()).find((d) => d.rawSource === id);
    return def ? resolveQuestionsByIds(def.questionIds) : [];
  },

  /** Adds a NEW local test (rejects a duplicate id). `parsed` must be valid. */
  async importLocalTest(parsed: ParsedTestFile) {
    const [s] = await commitTests([toPrepared(parsed)], { mode: 'add', origin: 'local' });
    emitBankChanged();
    return s;
  },

  /** Replaces the questions of one existing local test; every other test and all user progress are untouched. */
  async replaceLocalTest(testId: string, parsed: ParsedTestFile) {
    const prepared = toPrepared(parsed);
    if (prepared.id !== testId) throw new Error(`This file is for test "${prepared.id}", not "${testId}".`);
    const [s] = await commitTests([prepared], { mode: 'replace', origin: 'local' });
    emitBankChanged();
    return s;
  },

  /** Adds the questions that are new to an existing local test; for ids it already has, `conflict` decides skip vs update. */
  async mergeLocalQuestions(testId: string, questions: BankQuestionData[], conflict: 'skip' | 'update' = 'skip') {
    const t = await getBankTest(testKeyOf('local', testId));
    if (!t) throw new Error(`There is no local test "${testId}" to merge into.`);
    const [s] = await commitTests([{ id: t.id, title: t.title, subjectId: t.subjectId, chapterId: t.chapterId, chapterTitle: t.chapterTitle, examIds: t.examIds.length > 0 ? t.examIds : examIdsForSubject(t.subjectId), questions, sourceFile: 'merge' }], { mode: 'merge', origin: 'local', mergeConflict: conflict });
    emitBankChanged();
    return s;
  },

  async deleteLocalTest(testId: string): Promise<boolean> {
    const ok = await deleteBankTest(testKeyOf('local', testId));
    if (ok) emitBankChanged();
    return ok;
  },

  getLocalTests(): Promise<BankTestRecord[]> { return getBankTests('local'); },

  /** The manifest cached on this device (what the last successful sync saw). */
  async getRemoteManifest(): Promise<Manifest | null> { return (await getMetadata<Manifest>(META_MANIFEST)) ?? null; },

  syncRemoteManifest(deps: SyncDeps = {}): Promise<SyncResult> { return syncRemote({ isTestInUse: isBankTestInUse, ...deps }); },

  downloadRemoteTest(testId: string, deps: SyncDeps = {}) { return downloadRemoteTest(testId, { isTestInUse: isBankTestInUse, ...deps }); },

  async getQuestionBankMetadata(): Promise<QuestionBankMetadata> {
    const [bundled, local, remote, manifest, localQ, remoteQ, last] = await Promise.all([
      bundledDefinitions(), getBankTests('local'), getBankTests('remote'), this.getRemoteManifest(),
      countBankQuestions('local'), countBankQuestions('remote'), getMetadata<number>(META_LAST_SYNC),
    ]);
    return { bundledTests: bundled.length, localTests: local.length, remoteInstalled: remote.length, remoteAvailable: manifest?.tests.length ?? 0, localQuestions: localQ, remoteQuestions: remoteQ, lastSyncAt: last ?? null };
  },
};

export type { BankOrigin };
