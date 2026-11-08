// ─── Question marks (shared by the practice, mock and quiz engines) ──────────
// A mark records WHY a question was flagged. One model for every engine so a
// purpose chosen in a mock shows up the same way as one chosen in a practice
// test, and so "Mark for Review" keeps its existing meaning (revisit before
// submitting) while the other purposes feed the Review Center.

export type MarkPurpose = 'doubtful' | 'practice' | 'revision' | 'review';

export interface MarkPurposeInfo {
  id: MarkPurpose;
  label: string;
  description: string;
  /** Short badge text for tight spaces (palette cells). */
  badge: string;
  /** Hex used for the palette badge and the review filter chip. */
  color: string;
  /** True when choosing it saves the question to the Review Center beyond this test. */
  savesToReviewCenter: boolean;
}

export const MARK_PURPOSES: MarkPurposeInfo[] = [
  { id: 'doubtful', label: 'Doubtful / Possibly Incorrect', description: 'Unsure about this one, or the answer key may be wrong.', badge: '?', color: '#ef4444', savesToReviewCenter: true },
  { id: 'practice', label: 'Further Practice', description: 'Save this question for additional practice.', badge: 'P', color: '#0ea5e9', savesToReviewCenter: true },
  { id: 'revision', label: 'Revision', description: 'Save this question for future revision.', badge: 'R', color: '#a855f7', savesToReviewCenter: true },
  { id: 'review', label: 'Mark for Review', description: 'Revisit this question before submitting this test.', badge: '⚑', color: '#f59e0b', savesToReviewCenter: false },
];

export function getMarkPurposeInfo(purpose: MarkPurpose | undefined): MarkPurposeInfo | undefined {
  return MARK_PURPOSES.find((p) => p.id === purpose);
}

/**
 * The purpose a question currently carries. Sessions written before purposes
 * existed only have the boolean, which always meant "mark for review".
 */
export function effectivePurpose(state: { isMarkedForReview?: boolean; markPurpose?: MarkPurpose }): MarkPurpose | undefined {
  return state.markPurpose ?? (state.isMarkedForReview ? 'review' : undefined);
}

// ─── A question can carry several purposes at once ───────────────────────────
// The saved record for a question (one per question, never duplicated) holds the SET of purposes that outlive the test
// (Doubtful, Further Practice, Revision). "Mark for Review" is the in-test flag and travels with the session.

const CANONICAL_ORDER: MarkPurpose[] = MARK_PURPOSES.map((p) => p.id);

/** Unique, in the app's fixed order, so the same set always looks and compares the same. */
export function normalizePurposes(list: readonly (MarkPurpose | undefined | null)[]): MarkPurpose[] {
  const present = new Set(list.filter((p): p is MarkPurpose => !!p));
  return CANONICAL_ORDER.filter((p) => present.has(p));
}

/** The purposes a saved Review Center record carries. Older records only had the single `purpose`. */
export function savedPurposes(record: { purpose?: MarkPurpose; purposes?: MarkPurpose[] }): MarkPurpose[] {
  return normalizePurposes((record.purposes ?? (record.purpose ? [record.purpose] : [])).filter((p) => getMarkPurposeInfo(p)?.savesToReviewCenter));
}

export function toggleMarkPurpose(set: readonly MarkPurpose[], purpose: MarkPurpose): MarkPurpose[] {
  return normalizePurposes(set.includes(purpose) ? set.filter((p) => p !== purpose) : [...set, purpose]);
}

/**
 * The single purpose an engine's own `markPurpose` field holds (palette badge, Mark button): the first purpose that is saved
 * beyond the test, else "review". The review flag itself is carried separately by isMarkedForReview, so both stay true.
 */
export function sessionPurpose(set: readonly MarkPurpose[]): MarkPurpose | undefined {
  return CANONICAL_ORDER.find((p) => p !== 'review' && set.includes(p)) ?? (set.includes('review') ? 'review' : undefined);
}
