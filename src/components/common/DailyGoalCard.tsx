import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ListChecks, Settings2, X } from 'lucide-react';
import { useDailyGoalStore } from '../../store/dailyGoalStore';
import type { DailyGoalType } from '../../types';

const PRESETS: Record<DailyGoalType, number[]> = {
  questions: [10, 25, 50, 100],
  tests: [1, 2, 3, 5],
};

const TYPE_META: Record<DailyGoalType, { label: string; unit: string; icon: typeof Target }> = {
  questions: { label: 'Questions', unit: 'questions', icon: Target },
  tests: { label: 'Tests', unit: 'tests', icon: ListChecks },
};

export function DailyGoalCard() {
  const { goal, setGoal, getProgress, isGoalMet, getCurrentValue } = useDailyGoalStore();
  const [showSettings, setShowSettings] = useState(false);
  const [draftType, setDraftType] = useState<DailyGoalType>('questions');
  const [draftTarget, setDraftTarget] = useState(25);

  if (!goal) return null;

  const meta = TYPE_META[goal.type];
  const progress = getProgress();
  const met = isGoalMet();
  const current = getCurrentValue();

  function openSettings() {
    setDraftType(goal!.type);
    setDraftTarget(goal!.target);
    setShowSettings(true);
  }

  async function handleSave() {
    if (draftTarget < 1) return;
    await setGoal(draftType, draftTarget);
    setShowSettings(false);
  }

  return (
    <>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <meta.icon size={16} className="text-brand-500" />
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              Today's Goal
            </h2>
          </div>
          <button
            onClick={openSettings}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Change goal"
          >
            <Settings2 size={14} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            {current} / {goal.target} {meta.unit}
          </span>
          <span className={`text-sm font-bold ${met ? 'text-green-500' : 'text-brand-500'}`}>{progress}%</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className={`h-full rounded-full ${met ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-brand-500 to-purple-600'}`}
          />
        </div>
        {met && (
          <p className="text-xs mt-2 text-green-600 dark:text-green-400 font-medium">🎉 Goal achieved for today!</p>
        )}
        {goal.streakDays > 0 && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>🔥 {goal.streakDays} day streak · Best {goal.bestStreakDays}</p>
        )}
      </motion.div>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60"
            onClick={() => setShowSettings(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="card p-6 w-full sm:max-w-sm rounded-b-none sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-display font-bold" style={{ color: 'var(--text-primary)' }}>Daily Goal</h2>
                <button onClick={() => setShowSettings(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10" aria-label="Close">
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>What do you want to track?</p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {(Object.keys(TYPE_META) as DailyGoalType[]).map((type) => {
                  const m = TYPE_META[type];
                  const active = draftType === type;
                  return (
                    <button
                      key={type}
                      onClick={() => { setDraftType(type); setDraftTarget(PRESETS[type][1]); }}
                      className={`p-3 rounded-xl text-left transition-colors ${active ? 'ring-2 ring-brand-500' : ''}`}
                      style={{ border: '1px solid var(--border)' }}
                    >
                      <m.icon size={16} className="text-brand-500 mb-1" />
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.label}</p>
                    </button>
                  );
                })}
              </div>

              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Target</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {PRESETS[draftType].map((n) => (
                  <button
                    key={n}
                    onClick={() => setDraftTarget(n)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${draftTarget === n ? 'bg-brand-500 text-white' : ''}`}
                    style={draftTarget !== n ? { border: '1px solid var(--border)', color: 'var(--text-secondary)' } : undefined}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={1}
                value={draftTarget}
                onChange={(e) => setDraftTarget(Math.max(1, Number(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl text-sm mb-5"
                style={{ border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-primary)' }}
                aria-label={`Custom target in ${TYPE_META[draftType].unit}`}
              />

              <button onClick={handleSave} className="btn-primary w-full py-2.5">Save Goal</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
