// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildSpeakPlan, pickVoice } from './speechService';

const v = (lang: string, name = lang) => ({ lang, name, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

describe('voice selection', () => {
  it('prefers an exact regional voice, then any voice with the language prefix', () => {
    expect(pickVoice([v('en-GB'), v('en-IN')], 'en')?.lang).toBe('en-IN');
    expect(pickVoice([v('en-AU')], 'en')?.lang).toBe('en-AU');
    expect(pickVoice([v('hi_IN')], 'hi')?.lang).toBe('hi_IN');
  });
  it('returns null when none installed', () => {
    expect(pickVoice([v('en-US')], 'hi')).toBeNull();
    expect(pickVoice([], 'en')).toBeNull();
  });
});

describe('speak plan with missing voices', () => {
  it('never reads Hindi in a non-Hindi voice; reports what was skipped', () => {
    const plan = buildSpeakPlan('Hello there. नमस्ते दोस्तों, कैसे हैं आप।', [v('en-US')]);
    expect(plan.steps.map((s) => s.utterance.lang)).toEqual(['en']);
    expect(plan.missingLanguages).toEqual(['hi']);
  });
  it('speaks both when both voices exist', () => {
    const plan = buildSpeakPlan('Hello there. नमस्ते दोस्तों, कैसे हैं आप।', [v('en-US'), v('hi-IN')]);
    expect(plan.steps.map((s) => s.utterance.lang)).toEqual(['en', 'hi']);
    expect(plan.missingLanguages).toEqual([]);
  });
  it('English falls back to the default voice when no English voice is listed', () => {
    const plan = buildSpeakPlan('Just English here.', []);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].voice).toBeNull();
  });
});
