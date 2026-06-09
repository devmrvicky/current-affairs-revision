import type { DailyQuiz } from '../types';

// ─── Repository Interface ─────────────────────────────────────────────────────
// This interface is the only contract the app depends on.
// Swap the implementation (LocalJson → Api → Supabase) without touching any page/store.

export interface QuizRepository {
  /** Load quiz for a given filename like "08june2026.json". Returns null if not found. */
  getQuizByFileName(fileName: string): Promise<DailyQuiz | null>;
  /** Return all known filenames that exist in the data source. */
  getAvailableFileNames(): Promise<string[]>;
}

// ─── Filename helpers (shared across all implementations) ────────────────────

export function buildFileName(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}${month}${year}.json`;
}

export function buildDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function parseDateFromFileName(fileName: string): Date | null {
  // Matches both full names (june, july) and 3-letter abbreviations (jun, jul)
  const match = fileName.match(
    /^(\d{2})(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)(\d{4})\.json$/i
  );
  if (!match) return null;
  const monthStr = match[2].toLowerCase();
  const monthMap: Record<string, number> = {
    january: 0, jan: 0,
    february: 1, feb: 1,
    march: 2, mar: 2,
    april: 3, apr: 3,
    may: 4,
    june: 5, jun: 5,
    july: 6, jul: 6,
    august: 7, aug: 7,
    september: 8, sep: 8,
    october: 9, oct: 9,
    november: 10, nov: 10,
    december: 11, dec: 11,
  };
  const month = monthMap[monthStr];
  if (month === undefined) return null;
  const day = parseInt(match[1], 10);
  const year = parseInt(match[3], 10);
  return new Date(year, month, day);
}

// ─── Implementation 1: Local JSON files via import.meta.glob ─────────────────
// Zero manual registration. Drop a new .json file → it's auto-discovered.
// Vite's glob import produces a lazy module map at build time.

const globModules = import.meta.glob<{ default: DailyQuiz }>(
  '../data/current-affairs/*.json',
  { eager: false }
);

// Map  "../data/current-affairs/08june2026.json"  →  "08june2026.json"
function pathToFileName(path: string): string {
  return path.split('/').pop() ?? path;
}

export class LocalJsonQuizRepository implements QuizRepository {
  private readonly moduleMap: Record<string, () => Promise<{ default: DailyQuiz }>>;

  constructor() {
    this.moduleMap = {};
    for (const [path, loader] of Object.entries(globModules)) {
      this.moduleMap[pathToFileName(path)] = loader;
    }
  }

  async getQuizByFileName(fileName: string): Promise<DailyQuiz | null> {
    const loader = this.moduleMap[fileName];
    if (!loader) return null;
    try {
      const mod = await loader();
      // Basic validation
      if (!mod.default?.questions?.length) return null;
      return mod.default;
    } catch (err) {
      console.error(`[QuizRepository] Failed to load ${fileName}:`, err);
      return null;
    }
  }

  async getAvailableFileNames(): Promise<string[]> {
    return Object.keys(this.moduleMap);
  }
}

// ─── Implementation 2: Public-folder fetch (no rebuild needed) ───────────────
// Set VITE_QUIZ_SOURCE=public in .env to use this.
// Place JSON files in /public/current-affairs/ — no rebuild required.
// A /public/current-affairs/manifest.json listing available files is needed.
//
// Example manifest.json:
//   { "files": ["08june2026.json", "07june2026.json"] }

export class PublicFolderQuizRepository implements QuizRepository {
  private readonly basePath: string;
  private cachedFiles: string[] | null = null;

  constructor(basePath = '/current-affairs') {
    this.basePath = basePath;
  }

  async getQuizByFileName(fileName: string): Promise<DailyQuiz | null> {
    try {
      const res = await fetch(`${this.basePath}/${fileName}`);
      if (!res.ok) return null;
      const data: DailyQuiz = await res.json();
      if (!data?.questions?.length) return null;
      return data;
    } catch (err) {
      console.error(`[PublicFolderQuizRepository] fetch failed for ${fileName}:`, err);
      return null;
    }
  }

  async getAvailableFileNames(): Promise<string[]> {
    if (this.cachedFiles) return this.cachedFiles;
    try {
      const res = await fetch(`${this.basePath}/manifest.json`);
      if (!res.ok) return [];
      const data: { files: string[] } = await res.json();
      this.cachedFiles = data.files ?? [];
      return this.cachedFiles;
    } catch {
      return [];
    }
  }
}

// ─── Implementation 3: API-backed (future) ────────────────────────────────────
// Uncomment and fill in once backend is ready. Interface is identical.
//
// export class ApiQuizRepository implements QuizRepository {
//   constructor(private readonly apiBase: string) {}
//
//   async getQuizByFileName(fileName: string) {
//     const res = await fetch(`${this.apiBase}/quizzes/${fileName}`);
//     if (!res.ok) return null;
//     return res.json() as Promise<DailyQuiz>;
//   }
//
//   async getAvailableFileNames() {
//     const res = await fetch(`${this.apiBase}/quizzes`);
//     if (!res.ok) return [];
//     const data = await res.json();
//     return data.files as string[];
//   }
// }

// ─── Singleton factory ────────────────────────────────────────────────────────
// Change this one line to switch implementations across the entire app.

let _repo: QuizRepository | null = null;

export function getQuizRepository(): QuizRepository {
  if (!_repo) {
    // To use public-folder serving: new PublicFolderQuizRepository()
    // To use API: new ApiQuizRepository(import.meta.env.VITE_API_BASE)
    _repo = new LocalJsonQuizRepository();
  }
  return _repo;
}
