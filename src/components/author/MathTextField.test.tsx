// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MathTextField } from './MathTextField';


describe('MathTextField', () => {
  it('inserts a stacked fraction template at the current cursor position', () => {
    let currentValue = 'Simplify: ';
    const onChange = (value: string) => { currentValue = value; };
    render(<MathTextField value={currentValue} onChange={onChange} ariaLabel="Question" />);

    const textarea = screen.getByRole('textbox', { name: 'Question' }) as HTMLTextAreaElement;
    textarea.setSelectionRange(currentValue.length, currentValue.length);
    fireEvent.click(screen.getByRole('button', { name: 'गणितीय टूल्स' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stacked fraction (बट्टा)' }));

    expect(currentValue).toBe(String.raw`Simplify: $\frac{a}{b}$`);
  });

  it('offers a vertical working template and a toggleable preview', () => {
    render(<MathTextField value="" onChange={() => undefined} ariaLabel="Explanation" />);
    fireEvent.click(screen.getByRole('button', { name: 'गणितीय टूल्स' }));
    expect(screen.getByRole('button', { name: 'Vertical multiplication / subtraction layout' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Preview देखें' }));
    expect(screen.getByLabelText('Live preview')).toBeTruthy();
  });
});
