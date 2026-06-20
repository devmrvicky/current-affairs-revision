import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Highlighter, StickyNote, X } from 'lucide-react';
import type { HighlightColor } from '../../types';

interface SelectionMenuState {
  text: string;
  x: number;
  y: number;
}

interface HighlightMenuProps {
  containerRef: React.RefObject<HTMLElement>;
  onHighlight: (text: string, color: HighlightColor) => void;
  onAddNote: (text: string) => void;
}

const COLORS: { value: HighlightColor; hex: string; label: string }[] = [
  { value: 'yellow', hex: '#facc15', label: 'Yellow' },
  { value: 'green',  hex: '#4ade80', label: 'Green' },
  { value: 'blue',   hex: '#60a5fa', label: 'Blue' },
  { value: 'pink',   hex: '#f472b6', label: 'Pink' },
  { value: 'orange', hex: '#fb923c', label: 'Orange' },
];

export function HighlightMenu({ containerRef, onHighlight, onAddNote }: HighlightMenuProps) {
  const [selection, setSelection] = useState<SelectionMenuState | null>(null);
  const [showColors, setShowColors] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      return;
    }
    const text = sel.toString().trim();
    if (text.length < 3) return;

    // Only react to selections inside our container
    const container = containerRef.current;
    if (!container) return;
    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rect = range.getBoundingClientRect();
    setSelection({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top + window.scrollY,
    });
    setShowColors(false);
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', () => {
      // debounce slightly via rAF
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) {
          // small delay so click on menu still works
          setTimeout(() => {
            const s2 = window.getSelection();
            if (!s2 || s2.isCollapsed) setSelection(null);
          }, 150);
        }
      });
    });
    document.addEventListener('mouseup', handleSelectionChange);
    document.addEventListener('touchend', handleSelectionChange);
    return () => {
      document.removeEventListener('mouseup', handleSelectionChange);
      document.removeEventListener('touchend', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        // Allow the selectionchange handler to manage closing instead
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handlePickColor(color: HighlightColor) {
    if (!selection) return;
    onHighlight(selection.text, color);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
    setShowColors(false);
  }

  function handleNoteClick() {
    if (!selection) return;
    onAddNote(selection.text);
    window.getSelection()?.removeAllRanges();
    setSelection(null);
  }

  return (
    <AnimatePresence>
      {selection && (
        <motion.div
          ref={menuRef}
          initial={{ opacity: 0, scale: 0.9, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          className="fixed z-[120] -translate-x-1/2 -translate-y-full"
          style={{ left: selection.x, top: selection.y - 8 }}
        >
          <div
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl shadow-2xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--border)' }}
          >
            {!showColors ? (
              <>
                <button
                  onClick={() => setShowColors(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <Highlighter size={14} className="text-amber-500" />
                  Highlight
                </button>
                <div className="w-px h-5" style={{ background: 'var(--border)' }} />
                <button
                  onClick={handleNoteClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <StickyNote size={14} className="text-blue-500" />
                  Note
                </button>
              </>
            ) : (
              <>
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => handlePickColor(c.value)}
                    className="w-7 h-7 rounded-full border-2 border-white dark:border-gray-800 shadow-sm hover:scale-110 transition-transform"
                    style={{ background: c.hex }}
                    title={c.label}
                  />
                ))}
                <button
                  onClick={() => setShowColors(false)}
                  className="ml-1 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10"
                >
                  <X size={13} style={{ color: 'var(--text-muted)' }} />
                </button>
              </>
            )}
          </div>
          {/* Little pointer arrow */}
          <div
            className="w-2.5 h-2.5 rotate-45 mx-auto -mt-1.5"
            style={{ background: 'var(--card)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
