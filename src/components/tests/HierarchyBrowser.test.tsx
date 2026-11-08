// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HierarchyBrowser } from './HierarchyBrowser';
import { buildSubjectTree, type HierarchyNode } from '../../services/hierarchyTree';
import type { LibraryChapter, PracticeTestDefinition } from '../../services/testLibraryBuilder';
import type { TestAttemptStats } from '../../services/testAttemptStats';

let n = 0;
const t = (title: string, groupPath?: string[], questionCount = 10): PracticeTestDefinition => {
  n++;
  return { id: `t${n}`, examId: 'e', subjectId: 'mathematics', topicIds: [], title, questionIds: [], source: 'chapter', questionCount, difficulty: 'mixed', isFixedMock: false, rawSource: `chapter:m/c/${title}`, scope: 'chapter', topicCount: 0, skippedQuestionCount: 0, groupPath };
};
const chapter = (key: string, title: string, tests: PracticeTestDefinition[], categoryTitle?: string): LibraryChapter =>
  ({ key, kind: 'chapter', chapterId: key, title, categoryTitle, chapterTests: tests, topics: [], testCount: tests.length, questionCount: tests.reduce((a, x) => a + x.questionCount, 0) });

function Harness({ nodes, onStart }: { nodes: HierarchyNode[]; onStart: (x: PracticeTestDefinition) => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const stats = new Map<string, TestAttemptStats>([[nodes[0].children[0]?.children[0]?.tests[0]?.id ?? 'none', { attempts: 1 } as unknown as TestAttemptStats]]);
  return (
    <MemoryRouter>
      <HierarchyBrowser nodes={nodes} stats={stats} mode="test" startingId={null} onStart={(test) => onStart(test)} isOpen={(x) => !!open[x.key]} onToggle={(x, o) => setOpen((p) => ({ ...p, [x.key]: o }))} />
    </MemoryRouter>
  );
}

afterEach(cleanup);

describe('Practice by Topic hierarchy browser', () => {
  const deep = chapter('m/tri', 'Triangles', [
    t('Intro'),
    t('SSS 1', ['Congruence', 'SSS and SAS']),
    t('Deep', ['Similarity', 'Basic', 'Level 2', 'Level 3', 'Level 4']),
  ], 'Geometry');
  const nodes = buildSubjectTree({ chapters: [deep, chapter('m/avg', 'Average', [t('Avg 1')])] });

  it('shows top levels collapsed with counts, not a flat list of every test', () => {
    render(<Harness nodes={nodes} onStart={() => undefined} />);
    const tops = screen.getAllByTestId('tree-node').filter((x) => x.getAttribute('data-depth') === '0');
    expect(tops.map((x) => within(x).getAllByRole('button')[0].textContent)).toEqual([expect.stringContaining('Average'), expect.stringContaining('Geometry')]);
    expect(screen.queryByText('Intro')).toBeNull(); // no test is listed until its level is opened
    expect(screen.queryByText('Deep')).toBeNull();
    expect(screen.getByText(/3 tests · 30 Qs/)).toBeTruthy(); // Geometry rolls up everything beneath it
  });

  it('drills through every level of a six-level path and starts the test at the bottom', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<Harness nodes={nodes} onStart={onStart} />);
    for (const title of ['Geometry', 'Triangles', 'Similarity', 'Basic', 'Level 2', 'Level 3', 'Level 4']) {
      await user.click(screen.getByRole('button', { name: new RegExp(`^(Category|Chapter|Group|Topic)?\\s*${title}`) }));
    }
    expect(await screen.findByText('Deep')).toBeTruthy();
    const depths = screen.getAllByTestId('tree-node').map((x) => Number(x.getAttribute('data-depth')));
    expect(Math.max(...depths)).toBe(6);
    expect(screen.getAllByRole('treeitem').some((x) => x.getAttribute('aria-level') === '7')).toBe(true);
    await user.click(screen.getByRole('button', { name: /^Start .*: Deep$/ }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deep' }));
  });

  it('tests appear only at their own level: opening Congruence shows SSS 1 but not Deep or Intro', async () => {
    const user = userEvent.setup();
    render(<Harness nodes={nodes} onStart={() => undefined} />);
    await user.click(screen.getByRole('button', { name: /Geometry/ }));
    await user.click(screen.getByRole('button', { name: /Triangles/ }));
    expect(screen.getByText('Intro')).toBeTruthy();
    expect(screen.queryByText('SSS 1')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Congruence/ }));
    await user.click(screen.getByRole('button', { name: /SSS and SAS/ }));
    expect(screen.getByText('SSS 1')).toBeTruthy();
    expect(screen.queryByText('Deep')).toBeNull();
  });

  it('a level can be collapsed again', async () => {
    const user = userEvent.setup();
    render(<Harness nodes={nodes} onStart={() => undefined} />);
    const avg = screen.getByRole('button', { name: /Average/ });
    await user.click(avg);
    expect(screen.getByText('Avg 1')).toBeTruthy();
    await user.click(avg);
    expect(screen.queryByText('Avg 1')).toBeNull();
  });
});
