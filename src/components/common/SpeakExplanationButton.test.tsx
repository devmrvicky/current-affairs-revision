// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpeakExplanationButton } from './SpeakExplanationButton';

const voice = (lang: string) => ({ lang, name: lang, default: false, localService: true, voiceURI: lang }) as SpeechSynthesisVoice;

interface Spoken { text: string; lang: string; voiceLang?: string }
function installSpeech(voices: SpeechSynthesisVoice[]) {
  const spoken: Spoken[] = [];
  const synth = {
    getVoices: () => voices,
    speak: vi.fn((u: { text: string; lang: string; voice?: SpeechSynthesisVoice; onend?: () => void }) => { spoken.push({ text: u.text, lang: u.lang, voiceLang: u.voice?.lang }); queueMicrotask(() => u.onend?.()); }),
    cancel: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  };
  class Utter { text: string; lang = ''; voice?: SpeechSynthesisVoice; onend?: () => void; onerror?: () => void; constructor(t: string) { this.text = t; } }
  vi.stubGlobal('speechSynthesis', synth);
  vi.stubGlobal('SpeechSynthesisUtterance', Utter);
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  return { spoken, synth };
}

beforeEach(() => vi.useRealTimers());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(window, 'speechSynthesis'); });

describe('Listen button', () => {
  it('never speaks until pressed, then reads English with an English voice', async () => {
    const { spoken, synth } = installSpeech([voice('en-US'), voice('hi-IN')]);
    render(<SpeakExplanationButton text={'**Delhi** is the capital of India.'} />);
    expect(synth.speak).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Read the explanation aloud/ }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0]).toMatchObject({ text: 'Delhi is the capital of India.', voiceLang: 'en-US' }); // markup stripped
  });

  it('detects Hindi and picks the Hindi voice', async () => {
    const { spoken } = installSpeech([voice('en-US'), voice('hi-IN')]);
    render(<SpeakExplanationButton text="भारत की राजधानी नई दिल्ली है।" />);
    await userEvent.click(screen.getByRole('button', { name: /Read the explanation aloud/ }));
    await waitFor(() => expect(spoken).toHaveLength(1));
    expect(spoken[0].voiceLang).toBe('hi-IN');
  });

  it('shows Stop while speaking and cancels on press', async () => {
    const { synth } = installSpeech([voice('en-US')]);
    synth.speak.mockImplementation(() => undefined); // never finishes
    render(<SpeakExplanationButton text="A long explanation that keeps going." />);
    await userEvent.click(screen.getByRole('button', { name: /Read the explanation aloud/ }));
    const stop = await screen.findByRole('button', { name: /Stop reading/ });
    expect(stop.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(stop);
    expect(synth.cancel).toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: /Read the explanation aloud/ })).toBeTruthy();
  });

  it('says so when the device has no Hindi voice, and does not read Hindi in another voice', async () => {
    const { spoken } = installSpeech([voice('en-US')]);
    render(<SpeakExplanationButton text="भारत की राजधानी नई दिल्ली है।" />);
    await userEvent.click(screen.getByRole('button', { name: /Read the explanation aloud/ }));
    expect(await screen.findByText(/No Hindi voice is installed/)).toBeTruthy();
    expect(spoken).toHaveLength(0);
  });

  it('is disabled with a clear label in a browser without speech synthesis', () => {
    render(<SpeakExplanationButton text="Anything" />);
    const btn = screen.getByRole('button', { name: /not supported/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/Not supported in this browser/)).toBeTruthy();
  });

  it('stops speaking when the explanation changes or the screen unmounts', async () => {
    const { synth } = installSpeech([voice('en-US')]);
    synth.speak.mockImplementation(() => undefined);
    const { rerender, unmount } = render(<SpeakExplanationButton text="First explanation." />);
    await userEvent.click(screen.getByRole('button', { name: /Read the explanation aloud/ }));
    await screen.findByRole('button', { name: /Stop reading/ });
    synth.cancel.mockClear();
    rerender(<SpeakExplanationButton text="Second explanation." />);
    expect(synth.cancel).toHaveBeenCalled();
    synth.cancel.mockClear();
    unmount();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
