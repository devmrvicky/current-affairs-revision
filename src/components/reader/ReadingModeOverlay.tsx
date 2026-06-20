import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Minus, Plus, Type, AlignJustify, Maximize2, Minimize2,
  Search, Sparkles, BookOpen
} from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { HighlightMenu } from './HighlightMenu';
import { useReaderStore } from '../../store/readerStore';
import type { HighlightColor } from '../../types';
import toast from 'react-hot-toast';

interface ReadingModeOverlayProps {
  chapterId: string;
  content: string;
  onClose: () => void;
}

const FONT_FAMILIES: { value: 'serif' | 'sans' | 'mono'; label: string }[] = [
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
  { value: 'mono', label: 'Mono' },
];

export function ReadingModeOverlay({ chapterId, content, onClose }: ReadingModeOverlayProps) {
  const {
    prefs, updatePrefs, highlights, getHighlightsForChapter,
    addHighlight, addNote, updateProgress, incrementReadingTime,
  } = useReaderStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notePrompt, setNotePrompt] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const chapterHighlights = getHighlightsForChapter(chapterId);
  const startTimeRef = useRef(Date.now());

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // Track scroll progress — throttled to avoid flooding IndexedDB writes
  // and Zustand re-renders on every scroll tick (which fires dozens of times
  // per second during a fling). We persist at most ~once per second, plus
  // always on unmount so the final position is never lost.
  const pendingScrollRef = useRef<{ percent: number; scrollY: number } | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const lastPersistRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight - el.clientHeight;
    const percent = scrollable > 0 ? Math.min(100, Math.round((el.scrollTop / scrollable) * 100)) : 0;
    pendingScrollRef.current = { percent, scrollY: el.scrollTop };

    if (scrollRafRef.current !== null) return; // already scheduled
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const pending = pendingScrollRef.current;
      if (!pending) return;

      const now = Date.now();
      if (now - lastPersistRef.current < 1000) return; // throttle DB writes to 1/sec
      lastPersistRef.current = now;

      updateProgress(chapterId, {
        scrollPercent: pending.percent,
        scrollY: pending.scrollY,
        completionStatus: pending.percent >= 95 ? 'completed' : 'reading',
      });
    });
  }, [chapterId, updateProgress]);

  // Flush any pending scroll position on unmount so the last position is saved
  // even if it happened within the 1s throttle window.
  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current);
      const pending = pendingScrollRef.current;
      if (pending) {
        updateProgress(chapterId, {
          scrollPercent: pending.percent,
          scrollY: pending.scrollY,
          completionStatus: pending.percent >= 95 ? 'completed' : 'reading',
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId]);

  // Save reading time on unmount
  useEffect(() => {
    return () => {
      const seconds = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (seconds > 2) incrementReadingTime(chapterId, seconds);
    };
  }, [chapterId, incrementReadingTime]);

  // Restore scroll position
  useEffect(() => {
    useReaderStore.getState().loadProgress(chapterId).then((p) => {
      if (scrollRef.current && p.scrollY > 0) {
        scrollRef.current.scrollTop = p.scrollY;
      }
    });
  }, [chapterId]);

  function handleHighlight(text: string, color: HighlightColor) {
    addHighlight(chapterId, text, color, 0, text.length);
    toast.success('Highlighted!', { duration: 1200 });
  }

  function handleAddNotePrompt(text: string) {
    setNotePrompt(text);
  }

  function handleSaveNote() {
    if (!notePrompt || !noteText.trim()) return;
    addNote(chapterId, noteText.trim(), notePrompt);
    toast.success('Note saved!');
    setNotePrompt(null);
    setNoteText('');
  }

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }

  function adjustFontSize(delta: number) {
    updatePrefs({ fontSize: Math.max(13, Math.min(28, prefs.fontSize + delta)) });
  }

  function adjustLineHeight(delta: number) {
    updatePrefs({ lineHeight: Math.max(1.3, Math.min(2.4, +(prefs.lineHeight + delta).toFixed(1))) });
  }

  function adjustWidth(delta: number) {
    updatePrefs({ maxWidth: Math.max(480, Math.min(960, prefs.maxWidth + delta)) });
  }

  return createPortal(
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="reading-mode-overlay"
    >
      {/* Top Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.header
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="sticky top-0 z-20 glass border-b border-[var(--border)]"
          >
            <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors flex-shrink-0">
                <X size={18} style={{ color: 'var(--text-secondary)' }} />
              </button>

              <div className="flex items-center gap-1 flex-1 justify-center overflow-x-auto">
                {/* Font size */}
                <button onClick={() => adjustFontSize(-1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0">
                  <Minus size={14} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <span className="text-xs font-mono w-8 text-center flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {prefs.fontSize}
                </span>
                <button onClick={() => adjustFontSize(1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0">
                  <Plus size={14} style={{ color: 'var(--text-secondary)' }} />
                </button>

                <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

                {/* Font family */}
                <select
                  value={prefs.fontFamily}
                  onChange={(e) => updatePrefs({ fontFamily: e.target.value as 'serif' | 'sans' | 'mono' })}
                  className="text-xs rounded-lg px-2 py-1.5 border outline-none flex-shrink-0"
                  style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                >
                  {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>

                <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

                {/* Line height */}
                <button onClick={() => adjustLineHeight(-0.1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0" title="Decrease line spacing">
                  <AlignJustify size={13} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button onClick={() => adjustLineHeight(0.1)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0" title="Increase line spacing">
                  <AlignJustify size={17} style={{ color: 'var(--text-secondary)' }} />
                </button>

                <div className="w-px h-5 mx-1 flex-shrink-0" style={{ background: 'var(--border)' }} />

                {/* Width */}
                <button onClick={() => adjustWidth(-40)} className="text-xs px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  Narrow
                </button>
                <button onClick={() => adjustWidth(40)} className="text-xs px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                  Wide
                </button>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => setShowSearch((v) => !v)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10">
                  <Search size={16} style={{ color: 'var(--text-secondary)' }} />
                </button>
                <button onClick={toggleFullscreen} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10">
                  {isFullscreen ? <Minimize2 size={16} style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 size={16} style={{ color: 'var(--text-secondary)' }} />}
                </button>
              </div>
            </div>

            {/* Search bar */}
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-[var(--border)]"
                >
                  <div className="max-w-4xl mx-auto px-4 py-2">
                    <input
                      autoFocus
                      type="text"
                      placeholder="Search in chapter..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:border-brand-400"
                      style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Toggle controls button (when hidden) */}
      {!showControls && (
        <button
          onClick={() => setShowControls(true)}
          className="fixed top-3 right-3 z-30 p-2 rounded-full shadow-lg"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <BookOpen size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
      )}

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto px-6 py-10"
        style={{ height: showControls ? 'calc(100vh - 56px)' : '100vh' }}
        onClick={() => setShowControls((v) => !v)}
      >
        <div onClick={(e) => e.stopPropagation()}>
          <MarkdownRenderer
            content={content}
            highlights={chapterHighlights}
            fontSize={prefs.fontSize}
            fontFamily={prefs.fontFamily}
            lineHeight={prefs.lineHeight}
            maxWidth={prefs.maxWidth}
            searchQuery={searchQuery}
          />
          <div ref={containerRef as never} />
        </div>
      </div>

      {/* Highlight selection menu */}
      <HighlightMenu
        containerRef={scrollRef as React.RefObject<HTMLElement>}
        onHighlight={handleHighlight}
        onAddNote={handleAddNotePrompt}
      />

      {/* Note prompt modal */}
      <AnimatePresence>
        {notePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4 bg-black/60"
            onClick={() => setNotePrompt(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="card p-5 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-blue-500" />
                <h3 className="font-display font-bold" style={{ color: 'var(--text-primary)' }}>Add Note</h3>
              </div>
              <p className="text-xs mb-3 p-2 rounded-lg italic" style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
                "{notePrompt.slice(0, 100)}{notePrompt.length > 100 ? '…' : ''}"
              </p>
              <textarea
                autoFocus
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note..."
                rows={3}
                className="w-full px-3 py-2 rounded-xl text-sm border outline-none focus:border-brand-400 resize-none"
                style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <div className="flex gap-2 mt-3">
                <button onClick={() => setNotePrompt(null)} className="flex-1 btn-secondary text-sm py-2">Cancel</button>
                <button onClick={handleSaveNote} className="flex-1 btn-primary text-sm py-2">Save Note</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  );
}
