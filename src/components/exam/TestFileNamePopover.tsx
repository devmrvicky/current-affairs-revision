import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

interface TestFileNamePopoverProps {
  /** The complete source filename or test name shown in the temporary header overlay. */
  fileName: string;
  /** Short label displayed in the header; defaults to the full filename. */
  displayName?: string;
}

/** A title-only trigger that briefly reveals the complete filename over the full header. */
export function TestFileNamePopover({ fileName, displayName }: TestFileNamePopoverProps) {
  const [open, setOpen] = useState(false);
  const label = displayName?.trim() || fileName;

  useEffect(() => {
    if (!open) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 2600);
    return () => window.clearTimeout(timeoutId);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={`Show full test filename: ${fileName}`}
        data-swipe-ignore="true"
        className="block max-w-full truncate text-left rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
        style={{ color: 'var(--text-primary)' }}
      >
        {label}
      </button>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              key="test-filename-overlay"
              initial={{ y: '-110%', opacity: 0.92 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-110%', opacity: 0.92 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              role="status"
              aria-live="polite"
              className="fixed inset-x-0 top-0 z-[1000] flex items-center shadow-xl"
              style={{
                minHeight: 'calc(64px + env(safe-area-inset-top, 0px))',
                paddingTop: 'env(safe-area-inset-top, 0px)',
                background: 'var(--card)',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
              }}
            >
              <div className="w-full flex items-center gap-3 px-4 py-3">
                <p
                  className="min-w-0 flex-1 text-sm sm:text-base font-semibold leading-snug"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {fileName}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close filename"
                  data-swipe-ignore="true"
                  className="flex-shrink-0 p-2 -mr-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
