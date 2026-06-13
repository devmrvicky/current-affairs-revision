import { create } from 'zustand';
import type { SmartRevisionItem, WrongQuestion, BookmarkedQuestion } from '../types';
import { formatDateKey } from '../utils';

interface SmartRevisionStore {
  queue: SmartRevisionItem[];
  isBuilding: boolean;

  /** Build the unified queue from all sources */
  buildQueue: (
    wrongQs: WrongQuestion[],
    bookmarks: BookmarkedQuestion[],
  ) => void;

  /** Convert queue to a DailyQuiz-compatible questions array */
  toQuizQuestions: () => {
    id: number;
    question: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  }[];

  getTotalCount: () => number;
  getBreakdown: () => { wrong: number; bookmarks: number };
}

function buildPriority(type: SmartRevisionItem['type'], wrongCount = 0, daysOld = 0): number {
  switch (type) {
    case 'wrong':     return 100 + wrongCount * 10 + daysOld;
    case 'bookmark':  return 50  + daysOld;
    default:          return 10  + daysOld;
  }
}

export const useSmartRevisionStore = create<SmartRevisionStore>((set, get) => ({
  queue: [],
  isBuilding: false,

  buildQueue: (wrongQs, bookmarks) => {
    set({ isBuilding: true });
    const today = formatDateKey(new Date());
    const items: SmartRevisionItem[] = [];
    const seenQuestions = new Set<string>();

    // 1. Wrong questions (highest priority) — only 'learning' status
    for (const wq of wrongQs) {
      if (wq.status !== 'learning') continue;
      const key = wq.question.slice(0, 60);
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);

      const daysOld = Math.floor((Date.now() - wq.addedAt) / (1000 * 60 * 60 * 24));
      items.push({
        id: wq.id,
        type: 'wrong',
        question: wq.question,
        options: wq.options,
        correctAnswer: wq.correctAnswer,
        explanation: wq.explanation,
        priority: buildPriority('wrong', wq.wrongCount, daysOld),
        sourceLabel: `Wrong ${wq.wrongCount}×`,
        wrongCount: wq.wrongCount,
      });
    }

    // 2. Bookmarks not already in wrong queue
    for (const bq of bookmarks) {
      const key = bq.question.slice(0, 60);
      if (seenQuestions.has(key)) continue;
      seenQuestions.add(key);

      const daysOld = Math.floor((Date.now() - bq.bookmarkedAt) / (1000 * 60 * 60 * 24));
      items.push({
        id: bq.id,
        type: 'bookmark',
        question: bq.question,
        options: bq.options,
        correctAnswer: bq.correctAnswer,
        explanation: bq.explanation,
        priority: buildPriority('bookmark', 0, daysOld),
        sourceLabel: 'Bookmarked',
        bookmarkedAt: bq.bookmarkedAt,
      });
    }

    // Sort by priority descending
    items.sort((a, b) => b.priority - a.priority);

    set({ queue: items, isBuilding: false });
  },

  toQuizQuestions: () =>
    get().queue.map((item, i) => ({
      id: i + 1,
      question: item.question,
      options: item.options,
      correctAnswer: item.correctAnswer,
      explanation: `[${item.sourceLabel}] ${item.explanation}`,
    })),

  getTotalCount: () => get().queue.length,

  getBreakdown: () => {
    const q = get().queue;
    return {
      wrong: q.filter((i) => i.type === 'wrong').length,
      bookmarks: q.filter((i) => i.type === 'bookmark').length,
    };
  },
}));
