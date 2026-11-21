import { useCallback, useEffect, useState } from 'react';
import { questionBankRepository, type QuestionBankMetadata } from '../services/questionBank/repository';
import { onBankChanged } from '../services/questionBank/bankEvents';

/** The bank's headline numbers; refreshes itself whenever the bank changes (import, replace, delete, sync). */
export function useQuestionBankMetadata(): { metadata: QuestionBankMetadata | null; error: string | null; reload: () => void } {
  const [metadata, setMetadata] = useState<QuestionBankMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    questionBankRepository.getQuestionBankMetadata().then(
      (m) => { if (alive) { setMetadata(m); setError(null); } },
      (e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'Could not read the question bank.'); },
    );
    return () => { alive = false; };
  }, [nonce]);
  useEffect(() => onBankChanged(reload), [reload]);
  return { metadata, error, reload };
}
