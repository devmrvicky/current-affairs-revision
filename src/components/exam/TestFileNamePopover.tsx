import { useEffect, useId, useRef, useState } from 'react';

interface TestFileNamePopoverProps {
  /** The complete source filename or test name shown in the small popover. */
  fileName: string;
  /** Short label displayed in the header; defaults to the full filename. */
  displayName?: string;
}

/** A compact, tap-only filename disclosure anchored to the exact title text. */
export function TestFileNamePopover({ fileName, displayName }: TestFileNamePopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const label = displayName?.trim() || fileName;

  return (
    <span ref={rootRef} className="relative inline-block max-w-full align-middle">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={popoverId}
        aria-describedby={open ? popoverId : undefined}
        aria-label={`Show full test filename: ${fileName}`}
        className="block max-w-full truncate text-left rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </button>
      {open && (
        <span
          id={popoverId}
          role="tooltip"
          className="absolute left-0 top-full z-[90] mt-2 block w-max max-w-[min(82vw,26rem)] rounded-xl px-3 py-2 text-xs font-medium leading-relaxed shadow-xl break-words"
          style={{ background: 'var(--card)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          {fileName}
        </span>
      )}
    </span>
  );
}
