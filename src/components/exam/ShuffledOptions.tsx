import { useState, type ReactNode } from 'react';
import { displayOrder } from '../../utils/optionOrder';

interface ShuffledOptionsProps<T> {
  options: readonly T[];
  /** Identity of an option (its id, or its text on the legacy quiz). Used only to detect that the option set changed. */
  getKey: (option: T) => string;
  getText: (option: T) => string;
  children: (ordered: T[]) => ReactNode;
}

const signatureOf = <T,>(options: readonly T[], getKey: (o: T) => string) => options.map(getKey).join('\u0001');

/**
 * Renders a question's options in a random order, picked when this component
 * MOUNTS and kept for as long as it stays mounted — so selecting an answer, a
 * timer tick or any other re-render never makes the options jump while the
 * learner is reading them.
 *
 * Give it a `key` that changes with the question (and mount it inside the
 * per-question container): every time the question comes back on screen it is
 * a new mount and therefore a new shuffle.
 *
 * Fail-safe: if the option set ever differs from the one that was shuffled
 * (it should not, given the key), the original order is shown. An option is
 * never dropped, duplicated or reordered into a wrong place.
 */
export function ShuffledOptions<T>({ options, getKey, getText, children }: ShuffledOptionsProps<T>) {
  const [fixed] = useState(() => ({ signature: signatureOf(options, getKey), order: displayOrder(options.map(getText)) }));
  const usable = fixed.signature === signatureOf(options, getKey) && fixed.order.length === options.length;
  return <>{children(usable ? fixed.order.map((i) => options[i]) : [...options])}</>;
}
