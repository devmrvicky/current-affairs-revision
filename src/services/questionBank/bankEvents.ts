// A tiny change signal so the question pool (which caches what it loaded) re-reads the bank after any write to it,
// without the bank having to import the pool (that would be a cycle).

type Listener = () => void;
const listeners = new Set<Listener>();

export function onBankChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitBankChanged(): void {
  for (const l of listeners) l();
}
