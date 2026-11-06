// ─── Browser speech (Web Speech API) ─────────────────────────────────────────
// Uses only window.speechSynthesis: the explanation is spoken on-device by the
// browser's own voices. Nothing is sent to a server and no API key is involved.
// Speech never starts by itself — it only starts from speak(), which the button calls.

import { planUtterances, type SpeechLang, type Utterance } from './speakable';

export type SpeakerState = 'idle' | 'speaking' | 'unsupported' | 'no-voice' | 'error';

const LANG_TAGS: Record<SpeechLang, string[]> = {
  hi: ['hi-in', 'hi'],
  en: ['en-in', 'en-us', 'en-gb', 'en'],
};

/** The best installed voice for a language, or null. Prefers an exact regional match, then any voice with the language prefix. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | null {
  const norm = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-');
  for (const tag of LANG_TAGS[lang]) {
    const exact = voices.find((v) => norm(v) === tag);
    if (exact) return exact;
  }
  const prefix = lang;
  return voices.find((v) => norm(v).startsWith(prefix + '-') || norm(v) === prefix) ?? null;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Voices load asynchronously in Chromium: resolve once the list is non-empty, or after a short wait with whatever exists. */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) return resolve([]);
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length > 0) return resolve(now);
    const done = () => { synth.removeEventListener('voiceschanged', done); clearTimeout(timer); resolve(synth.getVoices()); };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener('voiceschanged', done);
  });
}

export interface SpeakPlan {
  /** What will actually be spoken, each piece with its voice. */
  steps: { utterance: Utterance; voice: SpeechSynthesisVoice | null }[];
  /** Languages that have text but no installed voice — those pieces are skipped, never read in the wrong voice. */
  missingLanguages: SpeechLang[];
}

export function buildSpeakPlan(markdown: string, voices: readonly SpeechSynthesisVoice[]): SpeakPlan {
  const missing = new Set<SpeechLang>();
  const steps: SpeakPlan['steps'] = [];
  for (const utterance of planUtterances(markdown)) {
    const voice = pickVoice(voices, utterance.lang);
    // English falls back to the browser default voice; Hindi must not — an English voice reading Devanagari is noise.
    if (!voice && utterance.lang === 'hi') { missing.add('hi'); continue; }
    steps.push({ utterance, voice });
  }
  return { steps, missingLanguages: Array.from(missing) };
}

export interface SpeakerController {
  speak: (markdown: string) => Promise<void>;
  stop: () => void;
}

/**
 * One controller per button. `onState` is told every transition. speak() while speaking restarts;
 * stop() is idempotent. Pieces are spoken one after another so a long explanation never hits the
 * engine's per-utterance cutoff.
 */
export function createSpeaker(onState: (state: SpeakerState, detail?: { missing?: SpeechLang[] }) => void): SpeakerController {
  let token = 0; // bumped on every speak/stop so a stale utterance callback cannot change state

  function stop() {
    token++;
    if (isSpeechSupported()) window.speechSynthesis.cancel();
    onState('idle');
  }

  async function speak(markdown: string) {
    if (!isSpeechSupported()) return onState('unsupported');
    const my = ++token;
    window.speechSynthesis.cancel();
    const voices = await loadVoices();
    if (my !== token) return;

    const plan = buildSpeakPlan(markdown, voices);
    if (plan.steps.length === 0) {
      return onState(plan.missingLanguages.length > 0 ? 'no-voice' : 'idle', { missing: plan.missingLanguages });
    }

    onState('speaking', { missing: plan.missingLanguages });
    const synth = window.speechSynthesis;
    let i = 0;
    const next = () => {
      if (my !== token) return;
      if (i >= plan.steps.length) return onState('idle', { missing: plan.missingLanguages });
      const { utterance, voice } = plan.steps[i++];
      const u = new SpeechSynthesisUtterance(utterance.text);
      u.lang = voice?.lang ?? (utterance.lang === 'hi' ? 'hi-IN' : 'en-IN');
      if (voice) u.voice = voice;
      u.onend = next;
      u.onerror = (e) => {
        if (my !== token) return;
        // 'canceled' / 'interrupted' is our own stop(); anything else is a real failure.
        if (e.error === 'canceled' || e.error === 'interrupted') return;
        onState('error');
      };
      synth.speak(u);
    };
    next();
  }

  return { speak, stop };
}
