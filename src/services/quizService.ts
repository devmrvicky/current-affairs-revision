import type { DailyQuiz } from "../types";

// ─── Filename Generation ──────────────────────────────────────────────────────

export function getFileName(date: Date = new Date()): string {
  const day = String(date.getDate()).padStart(2, "0");
  const months = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}${month}${year}.json`;
}

export function getDisplayDate(date: Date = new Date()): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ─── Known quiz files manifest ─────────────────────────────────────────────────
// Vite requires a static import map for dynamic imports with JSON.
// Add new date files here as they're created.

const quizModules: Record<string, () => Promise<{ default: DailyQuiz }>> = {
  "08jun2026.json": () => import("../data/current-affairs/08jun2026.json"),
  "07jun2026.json": () => import("../data/current-affairs/07jun2026.json"),
  "06jun2026.json": () => import("../data/current-affairs/06jun2026.json"),
  "05jun2026.json": () => import("../data/current-affairs/05jun2026.json"),
  "04jun2026.json": () => import("../data/current-affairs/04jun2026.json"),
};

// ─── Quiz Loading ─────────────────────────────────────────────────────────────

export async function loadQuizForDate(
  date: Date = new Date(),
): Promise<DailyQuiz | null> {
  const fileName = getFileName(date);
  return loadQuizByFileName(fileName);
}

export async function loadQuizByFileName(
  fileName: string,
): Promise<DailyQuiz | null> {
  const loader = quizModules[fileName];
  console.log(
    loader ? `Loading quiz for ${fileName}` : `No quiz found for ${fileName}`,
  );
  if (!loader) return null;
  try {
    const module = await loader();
    return module.default;
  } catch {
    return null;
  }
}

// ─── Available Files ──────────────────────────────────────────────────────────

export const AVAILABLE_QUIZ_FILES = Object.keys(quizModules);
