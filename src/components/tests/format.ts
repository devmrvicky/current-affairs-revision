/** "12 Oct, 4:30 pm" (year added when it isn't the current one). */
export function formatAttemptDate(ts: number): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** 754 -> "12:34" */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.max(0, Math.floor(seconds % 60));
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Colour for a percentage — same thresholds the Current Affairs test list already uses. */
export function percentColor(percent: number): string {
  return percent >= 75 ? '#22c55e' : percent >= 50 ? '#f59e0b' : '#ef4444';
}
