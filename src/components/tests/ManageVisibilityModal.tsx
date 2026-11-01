import { useMemo, useState } from 'react';
import { ChevronRight, Eye, EyeOff, RotateCcw, Search } from 'lucide-react';
import { Modal } from '../common/Modal';
import { ChapterTestGroup } from './ChapterTestGroup';
import { isGroupVisible, useLibraryVisibilityStore, type NewGroupPolicy } from '../../store/libraryVisibilityStore';
import { naturalCompare, type PracticeTestDefinition, type TestLibrary } from '../../services/testLibraryBuilder';
import type { TestAttemptStats } from '../../services/testAttemptStats';
import type { SessionMode } from '../../types/practiceSession';

interface ManageVisibilityModalProps {
  open: boolean;
  onClose: () => void;
  /** The FULL library — hidden groups included. */
  library: TestLibrary;
  scope: string;
  stats: Map<string, TestAttemptStats>;
  mode: SessionMode;
  startingId: string | null;
  onStart: (test: PracticeTestDefinition, mode: SessionMode) => void;
  /** Pre-fills the search (e.g. arriving from the topic picker). */
  initialQuery?: string;
}

/**
 * Every group in the library, shown or hidden, in one place: switch a group on or off for the main list,
 * and open any group to start its tests — hidden groups are tucked away, never removed. Search here covers
 * hidden groups too.
 */
export function ManageVisibilityModal({ open, onClose, library, scope, stats, mode, startingId, onStart, initialQuery = '' }: ManageVisibilityModalProps) {
  const visibilityState = useLibraryVisibilityStore();
  const [query, setQuery] = useState(initialQuery);
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...library.chapters]
      .filter((c) => !q || `${c.categoryTitle ?? ''} ${c.title}`.toLowerCase().includes(q) || [...c.chapterTests, ...c.topics.flatMap((g) => g.tests)].some((t) => t.title.toLowerCase().includes(q)))
      .sort((a, b) => naturalCompare(a.categoryTitle ?? a.title, b.categoryTitle ?? b.title) || naturalCompare(a.title, b.title));
  }, [library, query]);

  const hiddenCount = library.chapters.filter((c) => !isGroupVisible(visibilityState, scope, c.key)).length;
  const policy: NewGroupPolicy = visibilityState.newGroupPolicy[scope] ?? 'show';

  return (
    <Modal open={open} onClose={onClose} variant="sheet" size="lg" title="Manage visibility" description="Choose which topic groups appear on the main Practice by Topic list.">
      <p className="text-xs rounded-lg p-2.5 mb-3" style={{ background: 'var(--border)', color: 'var(--text-secondary)' }}>
        Hiding a group only tucks it away from the main list — <strong>nothing is deleted</strong>, and its tests stay available here.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => visibilityState.setMany(scope, library.chapters.map((c) => c.key), true)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"><Eye size={12} /> Show all</button>
        <button type="button" onClick={() => visibilityState.setMany(scope, library.chapters.map((c) => c.key), false)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5"><EyeOff size={12} /> Hide all</button>
        <button type="button" onClick={() => visibilityState.restoreAll(scope)} className="btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"><RotateCcw size={12} /> Restore defaults</button>
        <label className="ml-auto flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          New groups
          <select
            value={policy}
            onChange={(e) => visibilityState.setPolicy(scope, e.target.value as NewGroupPolicy)}
            className="py-1 px-2 rounded-lg text-xs border outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="show">appear automatically</option>
            <option value="hide">stay hidden until I show them</option>
          </select>
        </label>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all groups and tests…"
          aria-label="Search all groups, including hidden ones"
          className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none border focus:border-brand-400"
          style={{ background: 'var(--card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
      </div>

      <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }} aria-live="polite">
        {library.chapters.length - hiddenCount} shown · {hiddenCount} hidden · {library.chapters.length} groups in total
      </p>

      {groups.length === 0 ? (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No group matches “{query}”.</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((c) => {
            const visible = isGroupVisible(visibilityState, scope, c.key);
            const open = expanded === c.key;
            const panelId = `manage-panel-${c.key.replace(/[^a-z0-9]+/gi, '-')}`;
            return (
              <li key={c.key} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }} data-testid="manage-group" data-group-key={c.key}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : c.key)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 rounded-lg"
                  >
                    <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate" style={{ color: visible ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {c.categoryTitle && <span className="font-normal" style={{ color: 'var(--text-muted)' }}>{c.categoryTitle} › </span>}{c.title}
                      </span>
                      <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>
                        {c.testCount} test{c.testCount === 1 ? '' : 's'} · {c.questionCount} Qs
                        {!visible && <span className="ml-2 px-1.5 py-px rounded-full text-[10px] font-medium" style={{ background: 'var(--border)' }}>Hidden</span>}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={visible}
                    aria-label={`${visible ? 'Hide' : 'Show'} ${c.title} on the main list`}
                    onClick={() => visibilityState.setVisible(scope, c.key, !visible)}
                    className={`relative flex-shrink-0 w-10 h-6 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 ${visible ? 'bg-brand-500' : ''}`}
                    style={visible ? undefined : { background: 'var(--border)' }}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${visible ? 'translate-x-4' : ''}`} />
                  </button>
                </div>
                {open && (
                  <div id={panelId} style={{ borderTop: '1px solid var(--border)' }}>
                    <ChapterTestGroup chapter={c} stats={stats} mode={mode} startingId={startingId} onStart={onStart} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
