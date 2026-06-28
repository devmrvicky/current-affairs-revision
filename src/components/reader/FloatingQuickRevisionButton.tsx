import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { BookOpen, X } from 'lucide-react';
import { QuickRevisionPanel } from './QuickRevisionPanel';
import { lsGet, lsSet } from '../../utils';
import type { Highlight, ReaderNote } from '../../types';

const POSITION_KEY = 'quick-revision-fab-position';
const BUTTON_SIZE = 56;
// Mobile bottom nav is h-16 (64px) + breathing room; clears it on every
// screen this button shows on (it's hidden at lg: anyway, where there's no
// bottom nav at all).
const BOTTOM_SAFE_MARGIN = 96;
const EDGE_MARGIN = 12;
const TOP_SAFE_MARGIN = 72; // clears the sticky header

interface FloatingQuickRevisionButtonProps {
  content: string;
  highlights: Highlight[];
  notes: ReaderNote[];
  onJumpToHeading?: (id: string) => void;
  onJumpToHighlight?: (id: string) => void;
  onExamMode: () => void;
}

function getBounds() {
  return {
    left: EDGE_MARGIN,
    top: TOP_SAFE_MARGIN,
    right: Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN),
    bottom: Math.max(TOP_SAFE_MARGIN, window.innerHeight - BUTTON_SIZE - BOTTOM_SAFE_MARGIN),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Mobile/tablet-only floating, draggable replacement for the desktop Quick
 * Revision sidebar. Self-hides at the `lg` breakpoint via className, so the
 * parent page can render it unconditionally alongside the desktop sidebar.
 */
export function FloatingQuickRevisionButton({
  content, highlights, notes, onJumpToHeading, onJumpToHighlight, onExamMode,
}: FloatingQuickRevisionButtonProps) {
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const initializedRef = useRef(false);

  // Set the initial position once we know the viewport size (client-only app).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const bounds = getBounds();
    const saved = lsGet<{ x: number; y: number } | null>(POSITION_KEY, null);
    const defaultPos = { x: bounds.right, y: bounds.bottom };
    const pos = saved
      ? { x: clamp(saved.x, bounds.left, bounds.right), y: clamp(saved.y, bounds.top, bounds.bottom) }
      : defaultPos;
    x.set(pos.x);
    y.set(pos.y);
  }, [x, y]);

  // Keep the button within the viewport if the window is resized/rotated.
  useEffect(() => {
    function handleResize() {
      const bounds = getBounds();
      x.set(clamp(x.get(), bounds.left, bounds.right));
      y.set(clamp(y.get(), bounds.top, bounds.bottom));
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [x, y]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  function persistPosition() {
    lsSet(POSITION_KEY, { x: x.get(), y: y.get() });
  }

  function handleJumpToHeading(id: string) {
    onJumpToHeading?.(id);
    setOpen(false);
  }

  function handleJumpToHighlight(id: string) {
    onJumpToHighlight?.(id);
    setOpen(false);
  }

  return (
    <div className="lg:hidden">
      <motion.button
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={getBounds()}
        onDragEnd={persistPosition}
        onTap={() => setOpen(true)}
        style={{ x, y, width: BUTTON_SIZE, height: BUTTON_SIZE }}
        className="fixed top-0 left-0 z-[45] rounded-full shadow-lg bg-gradient-to-br from-brand-500 to-brand-600 text-white flex flex-col items-center justify-center gap-0.5 touch-none"
        aria-label="Open Quick Revision"
      >
        <BookOpen size={18} />
        <span className="text-[9px] font-semibold leading-none">Revise</span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => { if (info.offset.y > 100) setOpen(false); }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl shadow-2xl overflow-hidden"
              style={{ background: 'var(--card)' }}
            >
              <div className="pt-3 pb-1 flex justify-center">
                <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2">
                <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Quick Revision
                </h3>
                <button
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Close"
                >
                  <X size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>
              <div className="px-3 pb-6 overflow-y-auto max-h-[70vh]">
                <QuickRevisionPanel
                  content={content}
                  highlights={highlights}
                  notes={notes}
                  onJumpToHeading={handleJumpToHeading}
                  onJumpToHighlight={handleJumpToHighlight}
                  onExamMode={() => { setOpen(false); onExamMode(); }}
                  variant="sheet"
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
