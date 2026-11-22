import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Modal } from '../common/Modal';

export interface EditableQuestion {
  id?: string | number;
  question?: string;
  questionType?: string;
  options?: unknown[];
  correctAnswer?: string;
  explanation?: string;
  difficulty?: string;
  [key: string]: unknown;
}

interface Props {
  open: boolean;
  initial: EditableQuestion | null;
  onCancel: () => void;
  onSave: (question: EditableQuestion) => void;
  description?: string;
  saving?: boolean;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

interface OptionDraft { text: string; image: string }

function optionDraft(option: unknown): OptionDraft {
  if (typeof option === 'string') return { text: option, image: '' };
  if (option && typeof option === 'object') {
    const value = option as { text?: unknown; image?: unknown };
    return { text: String(value.text ?? ''), image: String(value.image ?? '') };
  }
  return { text: '', image: '' };
}

function optionText(option: unknown): string {
  return optionDraft(option).text;
}

function optionId(option: unknown, index: number): string {
  if (option && typeof option === 'object' && 'id' in option) return String((option as { id?: unknown }).id ?? LETTERS[index]);
  return LETTERS[index] ?? String(index + 1);
}

/** A structured editor for one question in the existing ExamVerse JSON question schema. */
export function AuthorQuestionEditorDialog({ open, initial, onCancel, onSave, description, saving = false }: Props) {
  const [question, setQuestion] = useState(String(initial?.question ?? ''));
  const originalOptions = Array.isArray(initial?.options) ? initial!.options! : [];
  const seeded = originalOptions.map(optionDraft);
  const [options, setOptions] = useState<OptionDraft[]>(seeded.length >= 2 ? seeded : ['', '', '', ''].map((text) => ({ text, image: '' })));
  const optionsOverLimit = options.length > LETTERS.length;
  const originalAnswer = String(initial?.correctAnswer ?? 'A');
  const answerKey = originalAnswer.trim().toLowerCase();
  const answerIndex = originalOptions.findIndex((option, index) => optionId(option, index).trim().toLowerCase() === answerKey || optionText(option).trim().toLowerCase() === answerKey);
  // Do not silently guess A when a legacy answer cannot be matched. Require the author to choose it.
  const [correct, setCorrect] = useState(answerIndex >= 0 ? (LETTERS[answerIndex] ?? '') : initial ? '' : 'A');
  const [explanation, setExplanation] = useState(String(initial?.explanation ?? ''));
  const [difficulty, setDifficulty] = useState(String(initial?.difficulty ?? 'medium'));
  const [error, setError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const cleanOptions = options.map((value) => ({ text: value.text.trim(), image: value.image.trim() }));
    if (!question.trim()) return setError('Question text is required.');
    if (optionsOverLimit) return setError('This file has more than six options. Edit the JSON source for this question to avoid losing any option.');
    if (cleanOptions.length < 2 || cleanOptions.some((value) => !value.text && !value.image)) return setError('Every option needs text or an image. At least two options are required.');
    const correctIndex = LETTERS.indexOf(correct);
    if (correctIndex < 0 || (!cleanOptions[correctIndex]?.text && !cleanOptions[correctIndex]?.image)) return setError('Choose a correct answer that has an option.');

    // Preserve option-level metadata from the original schema while normalizing IDs.
    const normalizedOptions = cleanOptions.map((value, index) => ({
      ...(originalOptions[index] && typeof originalOptions[index] === 'object' ? originalOptions[index] as Record<string, unknown> : {}),
      id: LETTERS[index],
      text: value.text,
      image: value.image || undefined,
    }));
    const keptAnswer = LETTERS[correctIndex];
    const next: EditableQuestion = {
      ...(initial ?? {}),
      id: initial?.id ?? `q-${uuidv4()}`,
      question,
      options: normalizedOptions,
      correctAnswer: keptAnswer,
      questionType: initial?.questionType ?? 'mcq',
      difficulty,
    };
    if (explanation.trim()) next.explanation = explanation.trim();
    else delete next.explanation;
    onSave(next);
  }

  return (
    <Modal open={open} onClose={onCancel} title={initial ? 'Edit question' : 'Add question'} description={description ?? "Changes are kept in the file editor until you press Save."} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span style={{ color: 'var(--text-secondary)' }}>Question</span>
          <textarea autoFocus value={question} onChange={(event) => { setQuestion(event.target.value); setError(''); }} rows={3} data-exam-keys="off"
            className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Options</span>
            <button type="button" disabled={options.length >= 6} onClick={() => setOptions((current) => [...current, { text: '', image: '' }])} className="btn-ghost px-2 py-1 text-xs inline-flex items-center gap-1"><Plus size={13}/> Add option</button>
          </div>
          {options.map((value, index) => {
            const optionLabel = LETTERS[index] ?? String(index + 1);
            return (
            <div key={index} className="flex gap-2 items-center">
              <label className="flex items-center gap-1.5 text-xs w-10" style={{ color: 'var(--text-secondary)' }}>
                <input type="radio" name="author-correct-option" checked={correct === optionLabel} onChange={() => setCorrect(optionLabel)} aria-label={`Option ${optionLabel} is correct`} />
                {optionLabel}
              </label>
              <div className="min-w-0 flex-1 grid gap-1">
                <input value={value.text} onChange={(event) => setOptions((current) => current.map((item, i) => i === index ? { ...item, text: event.target.value } : item))} placeholder={`Option ${optionLabel} text`} data-exam-keys="off"
                  className="w-full rounded-xl px-3 py-2 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
                <input value={value.image} onChange={(event) => setOptions((current) => current.map((item, i) => i === index ? { ...item, image: event.target.value } : item))} placeholder="Optional image URL" data-exam-keys="off"
                  className="w-full rounded-xl px-3 py-1.5 text-xs bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }} />
              </div>
              <button type="button" disabled={options.length <= 2} onClick={() => {
                setOptions((current) => current.filter((_, i) => i !== index));
                const currentCorrect = LETTERS.indexOf(correct);
                if (currentCorrect === index) setCorrect('');
                else if (currentCorrect > index) setCorrect(LETTERS[currentCorrect - 1]);
              }} className="p-2 rounded-lg disabled:opacity-30" aria-label={`Remove option ${optionLabel}`}><Trash2 size={14}/></button>
            </div>
          ); })}
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Select the radio button next to the correct option.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Difficulty</span>
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
            </select>
          </label>
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Explanation (optional)</span>
            <textarea value={explanation} onChange={(event) => setExplanation(event.target.value)} rows={2} data-exam-keys="off" className="mt-1 w-full rounded-xl px-3 py-2 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
          </label>
        </div>
        <p role="alert" className="text-xs min-h-4 text-red-600">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1 py-2.5 text-sm disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Apply changes' : 'Add question'}</button>
        </div>
      </form>
    </Modal>
  );
}
