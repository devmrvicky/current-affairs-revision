// ─── Slug helper ─────────────────────────────────────────────────────────────
// One canonical way to turn a human-readable folder/file name into a stable
// id across the content-discovery layer (universalChapterRepository,
// questionRepository's topic resolution, etc.) — extracted so every caller
// derives the exact same id for the exact same folder name instead of each
// reimplementing its own normalize() and silently drifting apart.

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** "bharatanatyam" -> "Bharatanatyam", "gi-tags" -> "Gi Tags" — last-resort display name when no registry entry or original folder name is available. */
export function humanizeSlug(id: string): string {
  return id
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}
