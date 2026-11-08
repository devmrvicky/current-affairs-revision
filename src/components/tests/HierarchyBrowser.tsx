import { memo } from 'react';
import { ChevronRight } from 'lucide-react';
import { TestRow } from './TestRow';
import type { HierarchyNode } from '../../services/hierarchyTree';
import type { PracticeTestDefinition } from '../../services/testLibraryBuilder';
import type { TestAttemptStats } from '../../services/testAttemptStats';
import type { SessionMode } from '../../types/practiceSession';

const KIND_LABEL: Record<HierarchyNode['kind'], string> = { category: 'Category', chapter: 'Chapter', topic: 'Topic', group: 'Group' };
/** Indentation stops growing after this many levels so a very deep tree can't push content off a phone screen. */
const MAX_INDENT_LEVELS = 6;

export interface HierarchyBrowserProps {
  nodes: HierarchyNode[];
  stats: Map<string, TestAttemptStats>;
  mode: SessionMode;
  startingId: string | null;
  onStart: (test: PracticeTestDefinition, mode: SessionMode) => void;
  isOpen: (node: HierarchyNode) => boolean;
  onToggle: (node: HierarchyNode, open: boolean) => void;
}

function attemptedIn(node: HierarchyNode, stats: Map<string, TestAttemptStats>): number {
  return node.tests.filter((t) => stats.has(t.id)).length + node.children.reduce((n, c) => n + attemptedIn(c, stats), 0);
}

/**
 * Subject → Category → Chapter → Topic → Subtopic → … → Tests, to any depth. Each level opens and closes on its own and
 * shows how many tests and questions sit beneath it. Tests appear only at the level they belong to, never as one flat list.
 */
export function HierarchyBrowser(props: HierarchyBrowserProps) {
  return <div className="space-y-2" role="tree" aria-label="Tests by chapter and topic">{props.nodes.map((n) => <NodeView key={n.key} node={n} {...props} />)}</div>;
}

const NodeView = memo(function NodeView({ node, stats, mode, startingId, onStart, isOpen, onToggle }: HierarchyBrowserProps & { node: HierarchyNode }) {
  const open = isOpen(node);
  const top = node.depth === 0;
  const attempted = attemptedIn(node, stats);
  const panelId = `tree-panel-${node.key.replace(/[^a-z0-9]+/gi, '-')}`;
  const hasKids = node.children.length > 0 || node.tests.length > 0;

  return (
    <div role="treeitem" aria-expanded={hasKids ? open : undefined} aria-level={node.depth + 1} className={top ? 'card overflow-hidden' : ''} data-testid="tree-node" data-kind={node.kind} data-depth={node.depth}>
      <button
        type="button"
        onClick={() => onToggle(node, !open)}
        aria-expanded={open}
        aria-controls={panelId}
        className={`w-full flex items-center gap-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${top ? 'px-3 py-2.5' : 'px-3 py-2'}`}
        style={top ? undefined : { borderTop: '1px solid var(--border)' }}
      >
        <ChevronRight size={top ? 16 : 14} className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} aria-hidden />
        {!top && <span className="text-[10px] font-semibold uppercase tracking-wider flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{KIND_LABEL[node.kind]}</span>}
        <span className={`min-w-0 flex-1 truncate ${top ? 'font-display font-semibold text-sm' : 'text-sm font-medium'}`} style={{ color: 'var(--text-primary)' }}>{node.title}</span>
        <span className="text-xs flex-shrink-0 text-right" style={{ color: 'var(--text-muted)' }}>
          {node.testCount} test{node.testCount === 1 ? '' : 's'} · {node.questionCount} Qs
          {attempted > 0 && <span className="block text-brand-500">{attempted}/{node.testCount} attempted</span>}
        </span>
      </button>

      {open && (
        <div id={panelId} role="group" style={top ? { borderTop: '1px solid var(--border)' } : { paddingLeft: `${Math.min(node.depth, MAX_INDENT_LEVELS) * 4 + 8}px` }}>
          {node.tests.length > 0 && (
            <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
              {node.tests.map((t) => <TestRow key={t.id} test={t} stats={stats.get(t.id)} mode={mode} busy={startingId === t.id} onStart={onStart} />)}
            </div>
          )}
          {node.children.map((c) => <NodeView key={c.key} node={c} nodes={[]} stats={stats} mode={mode} startingId={startingId} onStart={onStart} isOpen={isOpen} onToggle={onToggle} />)}
        </div>
      )}
    </div>
  );
});
