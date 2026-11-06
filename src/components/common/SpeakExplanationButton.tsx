import { useCallback, useEffect, useRef, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { createSpeaker, isSpeechSupported, type SpeakerController, type SpeakerState } from '../../services/speech/speechService';
import type { SpeechLang } from '../../services/speech/speakable';

const LANG_NAME: Record<SpeechLang, string> = { hi: 'Hindi', en: 'English' };

interface SpeakExplanationButtonProps {
  /** The explanation as authored — Markdown/KaTeX or plain text. */
  text: string;
  className?: string;
}

/**
 * "Listen" for an explanation. Starts only when pressed; the browser speaks it on-device
 * (see services/speech/speechService.ts). Hindi / English is detected from the text itself.
 * Speech stops when the learner presses Stop, leaves the screen, or the explanation changes.
 */
export function SpeakExplanationButton({ text, className }: SpeakExplanationButtonProps) {
  const [state, setState] = useState<SpeakerState>('idle');
  const [missing, setMissing] = useState<SpeechLang[]>([]);
  const supported = isSpeechSupported();
  const speaker = useRef<SpeakerController | null>(null);

  const ensureSpeaker = useCallback((): SpeakerController => {
    if (!speaker.current) {
      speaker.current = createSpeaker((next, detail) => {
        setState(next);
        setMissing(detail?.missing ?? []);
      });
    }
    return speaker.current;
  }, []);

  // A different explanation (next question) or leaving the screen must silence the old one.
  useEffect(() => () => { speaker.current?.stop(); }, [text]);

  const speaking = state === 'speaking';
  const label = !supported ? 'Read aloud is not supported in this browser' : speaking ? 'Stop reading the explanation' : 'Read the explanation aloud';

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => (speaking ? ensureSpeaker().stop() : void ensureSpeaker().speak(text))}
        disabled={!supported}
        aria-label={label}
        aria-pressed={speaking}
        title={label}
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        style={{ border: '1px solid var(--border)', color: speaking ? 'var(--brand-500, #6366f1)' : 'var(--text-secondary)' }}
      >
        {speaking ? <Square size={13} aria-hidden /> : <Volume2 size={14} aria-hidden />}
        {speaking ? 'Stop' : 'Listen'}
      </button>
      <span role="status" aria-live="polite" className="text-[11px] leading-snug" style={{ color: 'var(--text-muted)' }}>
        {state === 'no-voice' && `No ${missing.map((l) => LANG_NAME[l]).join('/')} voice is installed on this device — add one in your device's text-to-speech settings.`}
        {state === 'speaking' && missing.length > 0 && `${missing.map((l) => LANG_NAME[l]).join('/')} parts are skipped: no matching voice installed.`}
        {state === 'error' && 'Could not play audio. Try again.'}
        {!supported && 'Not supported in this browser.'}
      </span>
    </span>
  );
}
