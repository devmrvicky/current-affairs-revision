// App start: the cached bank is already usable (the pool reads it from IndexedDB on first use), so this only does the background check.
import { questionBankRepository } from './repository';

/** Checks the published manifest after the app has settled. Never throws, never blocks, never prompts; tells the caller only when something changed. */
export async function syncQuestionBankOnStart(notify: (message: string) => void): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  try {
    const r = await questionBankRepository.syncRemoteManifest();
    const n = r.added.length + r.updated.length;
    if (n > 0) notify(`Question bank updated — ${n} test${n === 1 ? '' : 's'} added or refreshed.`);
  } catch (err) {
    console.error('Question bank sync failed', err); // a failed sync is invisible to the learner: what they have keeps working
  }
}
