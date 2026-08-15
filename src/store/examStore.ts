import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { examRegistry } from '../data/registry/examRegistry';

interface ExamStore {
  /** Exam the dashboard/practice/tests are currently scoped to. Defaults to Current Affairs — the one exam with real content today. */
  selectedExamId: string;
  setSelectedExam: (examId: string) => void;
  getSelectedExam: () => ReturnType<typeof examRegistry.getExam>;
}

const DEFAULT_EXAM_ID = 'current-affairs';

export const useExamStore = create<ExamStore>()(
  persist(
    (set, get) => ({
      selectedExamId: DEFAULT_EXAM_ID,

      setSelectedExam: (examId) => {
        // Defensive: never let the store land on an exam that isn't registered.
        const exists = examRegistry.getExam(examId);
        set({ selectedExamId: exists ? examId : DEFAULT_EXAM_ID });
      },

      getSelectedExam: () => examRegistry.getExam(get().selectedExamId),
    }),
    { name: 'examverse-selected-exam' }
  )
);
