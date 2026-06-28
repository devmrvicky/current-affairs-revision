import { create } from 'zustand';

export type SyncStatus = 'disabled' | 'signed-out' | 'offline' | 'syncing' | 'synced' | 'pending' | 'error';

interface SyncStatusStore {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
  setStatus: (status: SyncStatus) => void;
  setPendingCount: (n: number) => void;
  setLastSyncedAt: (t: number) => void;
  setError: (msg: string | null) => void;
}

export const useSyncStatusStore = create<SyncStatusStore>((set) => ({
  status: 'signed-out',
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  setStatus: (status) => set({ status }),
  setPendingCount: (n) => set({ pendingCount: n }),
  setLastSyncedAt: (t) => set({ lastSyncedAt: t }),
  setError: (msg) => set({ lastError: msg }),
}));
