// In-memory only — deliberately NOT persisted. Closing/reloading the app locks the studio again.
import { create } from 'zustand';

interface AuthorLockState {
  unlocked: boolean;
  lastActivityAt: number;
  unlock: () => void;
  lock: () => void;
  touch: () => void;
}

export const useAuthorLockStore = create<AuthorLockState>()((set) => ({
  unlocked: false,
  lastActivityAt: Date.now(),
  unlock: () => set({ unlocked: true, lastActivityAt: Date.now() }),
  lock: () => set({ unlocked: false }),
  touch: () => set({ lastActivityAt: Date.now() }),
}));

/** True when the idle time has reached the limit. Timestamp-based, so throttled background timers can't delay it. 0 minutes = never. */
export function isIdleExpired(lastActivityAt: number, autoLockMinutes: number, now: number = Date.now()): boolean {
  return autoLockMinutes > 0 && now - lastActivityAt >= autoLockMinutes * 60_000;
}
