// ─── Mock Session Store ─────────────────────────────────────────────────────
// Owns the single active Mock/Sectional Mock session. Persisted to
// localStorage (zustand persist) so refresh/close-and-reopen never loses
// progress or resets a section timer (product spec §6/§7/§97-98) — every
// timer is reconstructed from the absolute `startedAt`/`endAt` timestamps
// stored here, never from an in-memory countdown.
//
// Section-locking rules enforced here, not in any UI component (product
// spec §130): once a section is locked it is never reopened, unused time
// never carries over to the next section (product spec §4/§170), and
// completeSession() is guarded so double-submit / timer-expiry-plus-click
// can never create two results (product spec §24/§172).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MockDefinition } from '../types/examMock';
import type { MockSession, MockSectionRuntime, MockQuestionState } from '../types/mockSession';

function newSessionId(): string {
  return `mock-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSectionRuntime(
  sectionId: string,
  title: string,
  subjectId: string,
  questionIds: string[],
  marksPerQuestion: number,
  negativeMarks: number,
  durationSeconds: number,
  active: boolean
): MockSectionRuntime {
  const now = Date.now();
  return {
    sectionId,
    title,
    subjectId,
    questionIds,
    marksPerQuestion,
    negativeMarks,
    durationSeconds,
    status: active ? 'active' : 'not-started',
    startedAt: active ? now : undefined,
    endAt: active ? now + durationSeconds * 1000 : undefined,
    locked: false,
  };
}

function buildStates(sectionId: string, questionIds: string[]): Record<string, MockQuestionState> {
  const states: Record<string, MockQuestionState> = {};
  for (const questionId of questionIds) {
    states[questionId] = {
      questionId,
      sectionId,
      selectedAnswer: null,
      isMarkedForReview: false,
      visited: false,
      timeSpentSeconds: 0,
    };
  }
  return states;
}

interface MockSessionStore {
  session: MockSession | null;

  startFullMock: (definition: Extract<MockDefinition, { mode: 'full-mock' }>, sectionQuestionIds: Record<string, string[]>) => void;
  startSectionalMock: (definition: Extract<MockDefinition, { mode: 'sectional-mock' }>, questionIds: string[]) => void;

  visitQuestion: (questionId: string) => void;
  selectAnswer: (questionId: string, optionId: string) => void;
  toggleMarkForReview: (questionId: string) => void;
  recordTimeSpent: (questionId: string, deltaSeconds: number) => void;

  goToQuestion: (index: number) => void;
  nextQuestion: () => void;
  prevQuestion: () => void;

  /** Locks the current section and, if a next section exists, activates it. Returns whether this was the LAST section (caller should show the submit dialog / auto-submit rather than transition). */
  advanceSection: () => boolean;
  completeSession: () => void;
  abandonSession: () => void;
  clearSession: () => void;
}

export const useMockSessionStore = create<MockSessionStore>()(
  persist(
    (set, get) => ({
      session: null,

      startFullMock: (definition, sectionQuestionIds) => {
        const sections = definition.sections.map((s, idx) =>
          buildSectionRuntime(s.id, s.title, s.subjectId, sectionQuestionIds[s.id] ?? [], s.marksPerQuestion, s.negativeMarks, s.durationSeconds, idx === 0)
        );
        const states: Record<string, MockQuestionState> = {};
        for (const s of sections) Object.assign(states, buildStates(s.sectionId, s.questionIds));

        set({
          session: {
            id: newSessionId(),
            mockDefinitionId: definition.id,
            examId: definition.examId,
            type: 'full-mock',
            title: definition.title,
            status: 'active',
            sections,
            currentSectionIndex: 0,
            currentQuestionIndex: 0,
            states,
            startedAt: Date.now(),
          },
        });
      },

      startSectionalMock: (definition, questionIds) => {
        const section = buildSectionRuntime(
          definition.section.id,
          definition.section.title,
          definition.section.subjectId,
          questionIds,
          definition.section.marksPerQuestion,
          definition.section.negativeMarks,
          definition.section.durationSeconds,
          true
        );
        set({
          session: {
            id: newSessionId(),
            mockDefinitionId: definition.id,
            examId: definition.examId,
            type: 'sectional-mock',
            title: definition.title,
            status: 'active',
            sections: [section],
            currentSectionIndex: 0,
            currentQuestionIndex: 0,
            states: buildStates(section.sectionId, section.questionIds),
            startedAt: Date.now(),
          },
        });
      },

      visitQuestion: (questionId) => {
        const session = get().session;
        if (!session) return;
        const state = session.states[questionId];
        if (!state || state.visited) return;
        set({ session: { ...session, states: { ...session.states, [questionId]: { ...state, visited: true } } } });
      },

      selectAnswer: (questionId, optionId) => {
        const session = get().session;
        if (!session) return;
        const state = session.states[questionId];
        if (!state) return;
        set({
          session: {
            ...session,
            states: {
              ...session.states,
              [questionId]: { ...state, selectedAnswer: optionId, visited: true, answeredAt: Date.now() },
            },
          },
        });
      },

      toggleMarkForReview: (questionId) => {
        const session = get().session;
        if (!session) return;
        const state = session.states[questionId];
        if (!state) return;
        set({
          session: {
            ...session,
            states: { ...session.states, [questionId]: { ...state, isMarkedForReview: !state.isMarkedForReview, visited: true } },
          },
        });
      },

      recordTimeSpent: (questionId, deltaSeconds) => {
        if (deltaSeconds <= 0) return;
        const session = get().session;
        if (!session) return;
        const state = session.states[questionId];
        if (!state) return;
        set({
          session: {
            ...session,
            states: { ...session.states, [questionId]: { ...state, timeSpentSeconds: state.timeSpentSeconds + deltaSeconds } },
          },
        });
      },

      goToQuestion: (index) => {
        const session = get().session;
        if (!session) return;
        const section = session.sections[session.currentSectionIndex];
        if (!section || section.locked) return;
        const clamped = Math.max(0, Math.min(index, section.questionIds.length - 1));
        set({ session: { ...session, currentQuestionIndex: clamped } });
      },

      nextQuestion: () => {
        const session = get().session;
        if (!session) return;
        const section = session.sections[session.currentSectionIndex];
        if (!section || section.locked) return;
        const next = Math.min(session.currentQuestionIndex + 1, section.questionIds.length - 1);
        set({ session: { ...session, currentQuestionIndex: next } });
      },

      prevQuestion: () => {
        const session = get().session;
        if (!session) return;
        const section = session.sections[session.currentSectionIndex];
        if (!section || section.locked) return;
        const prev = Math.max(session.currentQuestionIndex - 1, 0);
        set({ session: { ...session, currentQuestionIndex: prev } });
      },

      advanceSection: () => {
        const session = get().session;
        if (!session) return true;
        const idx = session.currentSectionIndex;
        const current = session.sections[idx];
        if (!current || current.locked) return idx >= session.sections.length - 1;

        const now = Date.now();
        const lockedCurrent: MockSectionRuntime = { ...current, status: 'completed', locked: true, completedAt: now };
        const isLast = idx >= session.sections.length - 1;

        const sections = [...session.sections];
        sections[idx] = lockedCurrent;

        if (isLast) {
          set({ session: { ...session, sections } });
          return true;
        }

        const next = sections[idx + 1];
        sections[idx + 1] = { ...next, status: 'active', startedAt: now, endAt: now + next.durationSeconds * 1000 };

        set({
          session: {
            ...session,
            sections,
            currentSectionIndex: idx + 1,
            currentQuestionIndex: 0,
          },
        });
        return false;
      },

      completeSession: () => {
        const session = get().session;
        if (!session || session.status === 'completed') return; // idempotent — never double-complete
        const now = Date.now();
        const sections = session.sections.map((s) => (s.locked ? s : { ...s, status: 'completed' as const, locked: true, completedAt: now }));
        set({ session: { ...session, sections, status: 'completed', completedAt: now } });
      },

      abandonSession: () => {
        const session = get().session;
        if (!session || session.status !== 'active') return;
        set({ session: { ...session, status: 'abandoned' } });
      },

      clearSession: () => set({ session: null }),
    }),
    { name: 'examverse-mock-session' }
  )
);
