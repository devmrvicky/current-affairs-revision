// @vitest-environment jsdom
// The ★ favorite toggle is on every chapter of every subject, and is the same record Home's "Favorite chapters" reads.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SubjectChaptersPage from './SubjectChaptersPage';
import { getDB, readingProgressDB } from '../services/db';
import { useReaderStore } from '../store/readerStore';

vi.mock('../services/universalChapterRepository', async (orig) => ({
  ...(await orig<typeof import('../services/universalChapterRepository')>()),
  getChaptersForSubject: vi.fn((subjectId: string) => subjectId === 'reasoning'
    ? [{ id: 'series', subjectId, title: 'Number Series', hasNotes: false, testFileCount: 0, source: 'canonical' }, { id: 'coding', subjectId, title: 'Coding-Decoding', hasNotes: false, testFileCount: 0, source: 'canonical' }]
    : []),
}));
vi.mock('../services/questionRepository', async (orig) => ({ ...(await orig<typeof import('../services/questionRepository')>()), getQuestionCountByTopic: vi.fn(async () => 5) }));

beforeEach(async () => { await (await getDB()).clear('readingProgress'); useReaderStore.setState({ progress: {} }); });
afterEach(cleanup);

describe('chapter list favorites', () => {
  it('every chapter has a labelled ★ toggle; toggling saves one record under the chapter key and can be undone', async () => {
    render(
      <MemoryRouter initialEntries={['/chapters/reasoning']}>
        <Routes><Route path="/chapters/:subjectId" element={<SubjectChaptersPage />} /></Routes>
      </MemoryRouter>,
    );
    const add = await screen.findByRole('button', { name: 'Add Number Series to favorites' });
    expect(screen.getAllByTestId('chapter-favorite')).toHaveLength(2); // one per chapter
    expect(add.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(add);
    await waitFor(async () => expect((await readingProgressDB.getAll()).filter((p) => p.isFavorite).map((p) => p.chapterId)).toEqual(['chapter::reasoning::series']));
    const remove = await screen.findByRole('button', { name: 'Remove Number Series from favorites' });
    expect(remove.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Add Coding-Decoding to favorites' }).getAttribute('aria-pressed')).toBe('false'); // others untouched
    await userEvent.click(remove);
    await waitFor(async () => expect((await readingProgressDB.getAll()).filter((p) => p.isFavorite)).toHaveLength(0));
  });
});
