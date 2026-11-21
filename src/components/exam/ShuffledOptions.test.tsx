// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ShuffledOptions } from './ShuffledOptions';

const opts = (...texts: string[]) => texts.map((text, i) => ({ id: String.fromCharCode(65 + i), text }));
const ABCD = opts('alpha', 'beta', 'gamma', 'delta');

function List({ options, k = 'q1', extra = '' }: { options: { id: string; text: string }[]; k?: string; extra?: string }) {
  return (
    <div data-extra={extra}>
      <ShuffledOptions key={k} options={options} getKey={(o) => o.id} getText={(o) => o.text}>
        {(ordered) => <ol>{ordered.map((o) => <li key={o.id}>{o.text}</li>)}</ol>}
      </ShuffledOptions>
    </div>
  );
}
const shown = () => screen.getAllByRole('listitem').map((li) => li.textContent);

let random: { mockRestore: () => void } | undefined;
const fixRandom = (value: number) => { random = vi.spyOn(Math, 'random').mockReturnValue(value); };
afterEach(() => { cleanup(); random?.mockRestore(); random = undefined; });

describe('ShuffledOptions', () => {
  it('shows the options in a random order, not the stored one', () => {
    fixRandom(0);
    render(<List options={ABCD} />);
    expect(shown()).toEqual(['beta', 'gamma', 'delta', 'alpha']);
  });

  it('keeps the order while it stays on screen — re-renders (answer selected, timer tick) never move the options', () => {
    fixRandom(0);
    const { rerender } = render(<List options={ABCD} />);
    const first = shown();
    fixRandom(0.999); // would give a different order if anything reshuffled
    rerender(<List options={ABCD} extra="1" />);
    rerender(<List options={[...ABCD]} extra="2" />); // same options, new array identity (e.g. questions reloaded)
    expect(shown()).toEqual(first);
  });

  it('reshuffles each time the question comes on screen again (a new mount)', () => {
    fixRandom(0);
    const { rerender } = render(<List options={ABCD} k="visit-1" />);
    expect(shown()).toEqual(['beta', 'gamma', 'delta', 'alpha']);
    fixRandom(0.999);
    rerender(<List options={ABCD} k="visit-2" />);
    expect(shown()).toEqual(['alpha', 'beta', 'gamma', 'delta']);
  });

  it('never shows a different question\'s options in a stale order: if the option set changes without a new mount, it falls back to the original order and keeps every option', () => {
    fixRandom(0);
    const { rerender } = render(<List options={ABCD} />);
    const other = opts('red', 'green', 'blue');
    rerender(<List options={other} />);
    expect(shown()).toEqual(['red', 'green', 'blue']);
  });

  it('leaves a question whose options point at each other in its original order', () => {
    fixRandom(0);
    render(<List options={opts('first', 'second', 'Both of the above', 'fourth')} />);
    expect(shown()).toEqual(['first', 'second', 'Both of the above', 'fourth']);
  });

  it('keeps "All of the above" / "None of these" at the end', () => {
    fixRandom(0);
    render(<List options={opts('one', 'two', 'three', 'All of the above')} />);
    const items = shown();
    expect(items[items.length - 1]).toBe('All of the above');
    expect(shown()).toHaveLength(4);
  });
});
