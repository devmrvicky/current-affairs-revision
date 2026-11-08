import { useState } from 'react';
import { Timer } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useTimingPrefStore } from '../../store/timingPrefStore';
import { describeTimingSpec, MAX_MINUTES, MAX_SECTIONS, splitQuestions, validateTimingSpec, type TimingSpec } from '../../services/sessionTiming';

interface TimerSettingsProps {
  value: TimingSpec;
  onChange: (spec: TimingSpec) => void;
  /** Known for a specific test; lets the form explain how sections would split and reject impossible setups. */
  questionCount?: number;
  /** What "Default" means here, e.g. "about 90 seconds per question" or "no countdown". */
  defaultLabel: string;
}

const toInt = (v: string) => (v.trim() === '' ? NaN : Number(v));

/** Overall or sectional timing, entered by hand. Pure form: it only reports the choice; nothing starts until the learner starts a test. */
export function TimerSettings({ value, onChange, questionCount, defaultLabel }: TimerSettingsProps) {
  const sectionMinutes = value.kind === 'sectional' ? value.sectionMinutes : [10, 10];
  const overallMinutes = value.kind === 'overall' ? value.minutes : 30;
  const problem = questionCount ? validateTimingSpec(value, questionCount) : validateTimingSpec(value, MAX_SECTIONS);

  const kinds: { kind: TimingSpec['kind']; label: string; hint: string }[] = [
    { kind: 'default', label: 'Default', hint: defaultLabel },
    { kind: 'none', label: 'No timer', hint: 'Take as long as you like' },
    { kind: 'overall', label: 'Overall timer', hint: 'One countdown for the whole test' },
    { kind: 'sectional', label: 'Sectional timers', hint: 'A countdown per section; a finished section can’t be reopened' },
  ];
  const choose = (kind: TimingSpec['kind']) => {
    if (kind === 'overall') onChange({ kind, minutes: overallMinutes });
    else if (kind === 'sectional') onChange({ kind, sectionMinutes });
    else onChange({ kind });
  };

  return (
    <fieldset className="space-y-2" aria-describedby={problem ? 'timer-problem' : undefined}>
      <legend className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Timer (Test mode)</legend>
      {kinds.map((k) => (
        <label key={k.kind} className="flex items-start gap-2.5 cursor-pointer text-sm">
          <input type="radio" name="timer-kind" className="mt-1" checked={value.kind === k.kind} onChange={() => choose(k.kind)} />
          <span><strong style={{ color: 'var(--text-primary)' }}>{k.label}</strong><br /><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{k.hint}</span></span>
        </label>
      ))}

      {value.kind === 'overall' && (
        <label className="flex items-center gap-2 text-sm pl-6">
          <span style={{ color: 'var(--text-secondary)' }}>Minutes</span>
          <input type="number" inputMode="numeric" min={1} max={MAX_MINUTES} aria-label="Overall minutes" value={Number.isNaN(value.minutes) ? '' : value.minutes}
            onChange={(e) => onChange({ kind: 'overall', minutes: toInt(e.target.value) })} className="w-24 rounded-xl px-3 py-2 bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </label>
      )}

      {value.kind === 'sectional' && (
        <div className="pl-6 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Sections</span>
            <button type="button" aria-label="Fewer sections" disabled={sectionMinutes.length <= 2} onClick={() => onChange({ kind: 'sectional', sectionMinutes: sectionMinutes.slice(0, -1) })} className="btn-ghost px-2.5 py-1">−</button>
            <strong aria-live="polite" style={{ color: 'var(--text-primary)' }}>{sectionMinutes.length}</strong>
            <button type="button" aria-label="More sections" disabled={sectionMinutes.length >= MAX_SECTIONS} onClick={() => onChange({ kind: 'sectional', sectionMinutes: [...sectionMinutes, sectionMinutes[sectionMinutes.length - 1] || 10] })} className="btn-ghost px-2.5 py-1">+</button>
          </div>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {sectionMinutes.map((m, i) => {
              const size = questionCount && questionCount >= sectionMinutes.length ? splitQuestions(questionCount, sectionMinutes.length)[i] : null;
              return (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0" style={{ color: 'var(--text-secondary)' }}>Section {i + 1}{size !== null ? ` · ${size} Qs` : ''}</span>
                  <input type="number" inputMode="numeric" min={1} max={MAX_MINUTES} aria-label={`Section ${i + 1} minutes`} value={Number.isNaN(m) ? '' : m}
                    onChange={(e) => onChange({ kind: 'sectional', sectionMinutes: sectionMinutes.map((x, j) => (j === i ? toInt(e.target.value) : x)) })}
                    className="w-20 rounded-xl px-2.5 py-1.5 bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>min</span>
                </li>
              );
            })}
          </ul>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total {sectionMinutes.reduce((n, m) => n + (Number.isFinite(m) ? m : 0), 0)} min. Time left in a section is lost when it ends.</p>
        </div>
      )}
      <p id="timer-problem" role="alert" className="text-xs min-h-4 pl-6" style={{ color: '#dc2626' }}>{problem}</p>
    </fieldset>
  );
}

/** "⏱ 3 sections · 45 min" — opens the timer form; the choice is remembered for every test started afterwards. */
export function TimerChip({ questionCount, defaultLabel }: { questionCount?: number; defaultLabel: string }) {
  const spec = useTimingPrefStore((s) => s.spec);
  const setSpec = useTimingPrefStore((s) => s.setSpec);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TimingSpec>(spec);
  const invalid = validateTimingSpec(draft, questionCount ?? MAX_SECTIONS) !== null;

  return (
    <>
      <button type="button" onClick={() => { setDraft(spec); setOpen(true); }} aria-label={`Test timer: ${describeTimingSpec(spec)}. Change`}
        className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <Timer size={13} aria-hidden /> {describeTimingSpec(spec)}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Test timer" description="Applies to tests you start in Test mode, until you change it.">
        <TimerSettings value={draft} onChange={setDraft} questionCount={questionCount} defaultLabel={defaultLabel} />
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary flex-1 text-sm py-2.5">Cancel</button>
          <button type="button" disabled={invalid} onClick={() => { setSpec(draft); setOpen(false); }} className="btn-primary flex-1 text-sm py-2.5">Save</button>
        </div>
      </Modal>
    </>
  );
}
