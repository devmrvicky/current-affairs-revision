import type { ReactNode } from 'react';

interface ExamShellProps {
  header: ReactNode;
  /** Question palette shown beside the question on large screens (mobile uses a drawer the page owns). */
  palette?: ReactNode;
  /** Pinned under the palette column (e.g. the Submit Test button) — never scrolls away with a long question list. */
  paletteFooter?: ReactNode;
  /** Overlay anchored to the question area (not the palette) — e.g. the floating previous/next controls. Must set its own pointer-events. */
  floating?: ReactNode;
  /** Pinned navigation bar under the question area. */
  footer?: ReactNode;
  /** Overlays (pause screen, drawers, dialogs) rendered inside the shell's stacking context. */
  overlays?: ReactNode;
  children: ReactNode;
}

/**
 * Edge-to-edge frame for an active test, modelled on a real computer-based exam:
 * a header bar, the question area filling the rest of the viewport, an optional
 * palette column and a pinned action bar. The question area is the only thing that
 * scrolls, so a long question, a tall figure or a Hindi passage never pushes the
 * header, timer or navigation buttons off screen. Safe-area insets keep it clear
 * of notches and home indicators. All sizing lives in `.exam-shell*` (index.css).
 */
export function ExamShell({ header, palette, paletteFooter, floating, footer, overlays, children }: ExamShellProps) {
  return (
    <div className="exam-shell" data-testid="exam-shell">
      <div className="exam-shell__header">{header}</div>
      <div className="exam-shell__body">
        <div className="exam-shell__main-wrap">
          <main className="exam-shell__main" tabIndex={-1} data-testid="exam-question-area"><div className="exam-shell__content">{children}</div></main>
          {floating && <div className="exam-shell__floating">{floating}</div>}
        </div>
        {palette && (
          <aside className="exam-shell__palette" aria-label="Question palette">
            <div className="exam-shell__palette-scroll">{palette}</div>
            {paletteFooter && <div className="exam-shell__palette-footer">{paletteFooter}</div>}
          </aside>
        )}
      </div>
      {footer && <div className="exam-shell__footer">{footer}</div>}
      {overlays}
    </div>
  );
}
