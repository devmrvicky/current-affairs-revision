import type { Subject, Topic, SubjectRegistry } from '../../types/exam';
import { EXAMS } from './examRegistry';
import { slugify } from '../../utils/slug';

// ─── Subjects ───────────────────────────────────────────────────────────────
// Reusable across exams. An exam references these by id in its `subjects[]`
// (see examRegistry.ts) instead of redefining them.

export const SUBJECTS: Subject[] = [
  { id: 'current-affairs', name: 'Current Affairs', nameHi: 'सामयिकी', isCurrentAffairs: true },
  { id: 'general-awareness', name: 'General Awareness', nameHi: 'सामान्य जागरूकता' },
  { id: 'general-science', name: 'General Science', nameHi: 'सामान्य विज्ञान' },
  { id: 'general-intelligence', name: 'General Intelligence', nameHi: 'सामान्य बुद्धि परीक्षण' },
  { id: 'reasoning', name: 'Reasoning', nameHi: 'तर्कशक्ति' },
  { id: 'mathematics', name: 'Mathematics', nameHi: 'गणित' },
  { id: 'english', name: 'English', nameHi: 'अंग्रेज़ी' },
  { id: 'computer', name: 'Computer Awareness', nameHi: 'कंप्यूटर जागरूकता' },
  { id: 'banking-awareness', name: 'Banking Awareness', nameHi: 'बैंकिंग जागरूकता' },
  { id: 'static-gk', name: 'Static GK', nameHi: 'सामान्य ज्ञान' },
];

// ─── Topics ─────────────────────────────────────────────────────────────────
// Current Affairs topics are derived from the existing `src/data/chapters/*`
// folder names (your "chapter-wise" content) rather than invented — this is
// real content that already exists in the repo. New topics for other subjects
// can be appended here as content is added; nothing else needs to change.

export const TOPICS: Topic[] = [
  // Current Affairs topic-wise chapters (mirrors src/data/chapters/*)
  { id: 'books-and-authors', subjectId: 'current-affairs', name: 'Books and Authors', nameHi: 'पुस्तकें और लेखक' },
  { id: 'modi-mantrimandal', subjectId: 'current-affairs', name: 'Modi Mantrimandal', nameHi: 'मोदी मंत्रिमंडल' },
  { id: 'budget', subjectId: 'current-affairs', name: 'Budget', nameHi: 'बजट' },
  { id: 'military-exercise', subjectId: 'current-affairs', name: 'Military Exercise', nameHi: 'सैन्य अभ्यास' },
  { id: 'gi-tags', subjectId: 'current-affairs', name: 'GI Tags', nameHi: 'जीआई टैग' },
  { id: 'government-schemes', subjectId: 'current-affairs', name: 'Government Schemes', nameHi: 'सरकारी योजनाएं' },
  { id: 'index', subjectId: 'current-affairs', name: 'Index & Reports', nameHi: 'सूचकांक और रिपोर्ट' },
  { id: 'ipl-2026', subjectId: 'current-affairs', name: 'IPL 2026', nameHi: 'आईपीएल 2026' },
  { id: 'important-facts', subjectId: 'current-affairs', name: 'Important Facts', nameHi: 'महत्वपूर्ण तथ्य' },
  { id: 'rajya-sarkar-yojna', subjectId: 'current-affairs', name: 'State Government Schemes', nameHi: 'राज्य सरकार योजना' },
  { id: 'app-and-portal', subjectId: 'current-affairs', name: 'App & Portal', nameHi: 'ऐप और पोर्टल' },
  { id: 'census-2027', subjectId: 'current-affairs', name: 'Cencus 2027', nameHi: 'जनगणना 2027' },
  { id: 'indias-first', subjectId: 'current-affairs', name: "India's First", nameHi: 'भारत में प्रथम' },
  { id: 'operations', subjectId: 'current-affairs', name: 'Operations', nameHi: 'ऑपरेशन' },
  { id: 'summit-conference', subjectId: 'current-affairs', name: 'Summit & Conference', nameHi: 'शिखर सम्मेलन' },
  { id: 'obituaries', subjectId: 'current-affairs', name: 'Obituaries', nameHi: 'निधन' },
  { id: 'art-and-culture', subjectId: 'current-affairs', name: 'Art & Culture', nameHi: 'कला और संस्कृति' },
  { id: 'cm-and-governor', subjectId: 'current-affairs', name: 'CM & Governor', nameHi: 'मुख्यमंत्री और राज्यपाल' },
  { id: 'science-and-tech', subjectId: 'current-affairs', name: 'Science & tech', nameHi: 'विज्ञान और तकनीक' },
  { id: 'booster-series', subjectId: 'current-affairs', name: 'Booster serie', nameHi: 'बूस्टर सीरीज़' },
  { id: 'aayushman-series', subjectId: 'current-affairs', name: 'Aayushman series practice sets', nameHi: 'आयुष्मान सीरीज़' },
  { id: 'cpl', subjectId: 'current-affairs', name: 'CPL 3.0', nameHi: 'सीपीएल 3.0' },

  // Mathematics — development/sample topic, backing src/data/ssc/ssc-chsl/2026/mathematics.json.
  { id: 'percentage', subjectId: 'mathematics', name: 'Percentage', nameHi: 'प्रतिशत' },
];

// ─── Topic display names ────────────────────────────────────────────────────
// Two tiers, per the Phase 7.5 content-discovery model: canonical presentation
// metadata (name, Hindi name) lives here when someone has bothered to add it;
// otherwise a readable name is generated straight from the topicId so content
// works immediately without a matching registry edit (e.g. a new subject's
// "error-detection" topic reads as "Error Detection" with zero config).

function humanizeId(id: string): string {
  return id
    .split('-')
    .map((word) => (word.length > 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export function getTopicDisplayName(subjectId: string, topicId: string): string {
  const registered = TOPICS.find((t) => t.subjectId === subjectId && t.id === topicId);
  return registered?.name ?? humanizeId(topicId);
}

// ─── Folder name → subject id resolution ───────────────────────────────────
// Canonical chapter folders are human-readable ("General Awareness",
// "Mathematics") so content stays readable on disk; the rest of the app
// (question tagging, exam syllabi, practice filtering) needs the stable slug
// ("general-awareness"). Resolve by normalized match against the registry
// first — same two-tier model as topic display names above — and fall back
// to the folder's own slug when there's no registry entry yet, so a brand
// new subject folder is usable immediately with zero registry edits
// (data-architecture migration §19/§30: no hardcoded content registries).

export function resolveSubjectId(subjectFolderName: string): string {
  const target = slugify(subjectFolderName);
  const hit = SUBJECTS.find((s) => slugify(s.name) === target || s.id === target);
  return hit?.id ?? target;
}

// ─── Registry implementation ──────────────────────────────────────────────────

class InMemorySubjectRegistry implements SubjectRegistry {
  getAllSubjects(): Subject[] {
    return SUBJECTS;
  }

  getSubject(subjectId: string): Subject | undefined {
    return SUBJECTS.find((s) => s.id === subjectId);
  }

  getSubjectsForExam(examId: string): Subject[] {
    const exam = EXAMS.find((e) => e.id === examId);
    if (!exam) return [];
    return exam.subjects
      .map((ref) => this.getSubject(ref.subjectId))
      .filter((s): s is Subject => Boolean(s));
  }

  getTopicsForSubject(subjectId: string): Topic[] {
    return TOPICS.filter((t) => t.subjectId === subjectId);
  }
}

export const subjectRegistry: SubjectRegistry = new InMemorySubjectRegistry();
