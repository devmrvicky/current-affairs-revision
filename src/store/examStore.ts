import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getExam } from '../services/examService';

interface ExamStore {
  /** Exam the dashboard/practice/tests are currently scoped to. Defaults to SSC CHSL — Current Affairs is common chapter content now, not an exam, and is never a valid selection here (data-architecture migration §11/§13). */
  selectedExamId: string;
  setSelectedExam: (examId: string) => void;
  getSelectedExam: () => ReturnType<typeof getExam>;
}

const DEFAULT_EXAM_ID = 'ssc-chsl';

export const useExamStore = create<ExamStore>()(
  persist(
    (set, get) => ({
      selectedExamId: DEFAULT_EXAM_ID,

      setSelectedExam: (examId) => {
        // Defensive: never let the store land on an exam that doesn't actually
        // have content (content-driven, not registry-driven — see examDiscoveryService.ts).
        const exists = getExam(examId);
        set({ selectedExamId: exists ? examId : DEFAULT_EXAM_ID });
      },

      getSelectedExam: () => getExam(get().selectedExamId),
    }),
    {
      name: 'examverse-selected-exam',
      // Re-validate on load too — not just on the next setSelectedExam() call
      // — so a value persisted before this migration (e.g. the old default,
      // 'current-affairs', back when it was still modeled as an exam) can't
      // silently leave the store scoped to something that no longer exists
      // as a real, selectable exam.
      onRehydrateStorage: () => (state) => {
        if (state && !getExam(state.selectedExamId)) {
          state.selectedExamId = DEFAULT_EXAM_ID;
        }
      },
    }
  )
);
