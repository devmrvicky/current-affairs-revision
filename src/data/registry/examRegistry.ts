import type { Exam, ExamCategory, ExamRegistry } from '../../types/exam';

// ─── Exam configuration ────────────────────────────────────────────────────────
// Adding a new exam = adding an entry here (+ its question data under
// src/data/[category]/[exam]/[year]/[subject].json). No UI/component code
// should ever need to change to support a new exam.
//
// `active` reflects whether real question data exists for that exam TODAY.
// Flip to true only once data is actually present — the UI must never assume
// data exists for an exam just because it's registered (§67, §89).

const DEFAULT_SECTIONAL = {
  questionCounts: [10, 20, 25, 50],
  durationsMinutes: [5, 10, 15, 20, 30],
};

export const EXAMS: Exam[] = [
  // ── Current Affairs — not a "real" competitive exam, but modeled as one so
  // it plugs into the exact same question engine instead of a bespoke system
  // (master prompt §27: "Current Affairs is NOT the foundation of the architecture").
  {
    id: 'current-affairs',
    name: 'Current Affairs',
    fullName: 'Daily / Monthly / Yearly Current Affairs',
    category: 'other',
    subjects: [{ subjectId: 'current-affairs', sectionalTest: DEFAULT_SECTIONAL }],
    mockConfig: { questions: 25, durationMinutes: 20, marking: { marksPerCorrect: 1, negativeMarks: 0 } },
    active: true,
  },

  // ── SSC ──────────────────────────────────────────────────────────────────
  {
    id: 'ssc-chsl',
    name: 'SSC CHSL',
    fullName: 'SSC Combined Higher Secondary Level',
    category: 'ssc',
    subjects: [
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 60, marking: { marksPerCorrect: 2, negativeMarks: 0.5 } },
    // Has a real (development/sample) Mathematics → Percentage dataset —
    // see src/data/ssc/chsl/2026/mathematics.json. Other subjects for this
    // exam still have zero questions; the dashboard/syllabus panel reports
    // that honestly per-subject rather than this flag papering over it.
    active: true,
  },
  {
    id: 'ssc-cgl',
    name: 'SSC CGL',
    fullName: 'SSC Combined Graduate Level',
    category: 'ssc',
    subjects: [
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'computer', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 60, marking: { marksPerCorrect: 2, negativeMarks: 0.5 } },
    active: false,
  },
  {
    id: 'ssc-mts',
    name: 'SSC MTS',
    fullName: 'SSC Multi Tasking Staff',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 90, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },
  {
    id: 'ssc-gd',
    name: 'SSC GD',
    fullName: 'SSC General Duty Constable',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-science', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 80, durationMinutes: 60, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },
  {
    id: 'ssc-cpo',
    name: 'SSC CPO',
    fullName: 'SSC Central Police Organisation',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 200, durationMinutes: 120, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },
  {
    id: 'ssc-steno',
    name: 'SSC Stenographer',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 200, durationMinutes: 120, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },
  {
    id: 'ssc-selection-post',
    name: 'SSC Selection Post',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 60, marking: { marksPerCorrect: 1, negativeMarks: 0.5 } },
    active: false,
  },
  {
    id: 'delhi-police',
    name: 'Delhi Police',
    category: 'ssc',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-science', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },

  // ── Railway ──────────────────────────────────────────────────────────────
  {
    id: 'rrb-ntpc',
    name: 'RRB NTPC',
    fullName: 'RRB Non-Technical Popular Categories',
    category: 'railway',
    subjects: [
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-intelligence', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 1 / 3 } },
    active: false,
  },
  {
    id: 'rrb-group-d',
    name: 'RRB Group D',
    category: 'railway',
    subjects: [
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-intelligence', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-science', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 1 / 3 } },
    // Has a real (development/sample) General Science dataset — see
    // src/data/railway/rrb-group-d/2026/general-science.json.
    active: true,
  },
  {
    id: 'rrb-alp',
    name: 'RRB ALP',
    fullName: 'RRB Assistant Loco Pilot',
    category: 'railway',
    subjects: [
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-intelligence', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-science', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 75, durationMinutes: 60, marking: { marksPerCorrect: 1, negativeMarks: 1 / 3 } },
    active: false,
  },
  {
    id: 'rrb-technician',
    name: 'RRB Technician',
    category: 'railway',
    subjects: [
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-intelligence', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-science', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 1 / 3 } },
    active: false,
  },
  {
    id: 'rpf',
    name: 'RPF',
    fullName: 'Railway Protection Force',
    category: 'railway',
    subjects: [
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-intelligence', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'general-awareness', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 120, durationMinutes: 90, marking: { marksPerCorrect: 1, negativeMarks: 1 / 3 } },
    active: false,
  },

  // ── Banking ──────────────────────────────────────────────────────────────
  {
    id: 'ibps-po',
    name: 'IBPS PO',
    fullName: 'IBPS Probationary Officer',
    category: 'banking',
    subjects: [
      { subjectId: 'reasoning', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'mathematics', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'english', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'banking-awareness', sectionalTest: DEFAULT_SECTIONAL },
      { subjectId: 'computer', sectionalTest: DEFAULT_SECTIONAL },
    ],
    mockConfig: { questions: 100, durationMinutes: 60, marking: { marksPerCorrect: 1, negativeMarks: 0.25 } },
    active: false,
  },
];

// ─── Registry implementation ──────────────────────────────────────────────────

class InMemoryExamRegistry implements ExamRegistry {
  getAllExams(): Exam[] {
    return EXAMS;
  }

  getActiveExams(): Exam[] {
    return EXAMS.filter((e) => e.active);
  }

  getExam(examId: string): Exam | undefined {
    return EXAMS.find((e) => e.id === examId);
  }

  getExamsByCategory(category: ExamCategory): Exam[] {
    return EXAMS.filter((e) => e.category === category);
  }
}

export const examRegistry: ExamRegistry = new InMemoryExamRegistry();
