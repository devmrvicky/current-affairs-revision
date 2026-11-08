// The learner's chosen test timing, remembered between tests. Defaults to "default" = exactly the behaviour
// the app had before timing could be configured.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimingSpec } from '../services/sessionTiming';

interface TimingPrefStore {
  spec: TimingSpec;
  setSpec: (spec: TimingSpec) => void;
}

export const useTimingPrefStore = create<TimingPrefStore>()(
  persist((set) => ({ spec: { kind: 'default' }, setSpec: (spec) => set({ spec }) }), { name: 'examverse-timing-pref' }),
);
