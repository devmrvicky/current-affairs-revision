// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QuestionBankManagerPage from './QuestionBankManagerPage';
import QuestionBankPage from './QuestionBankPage';
import SettingsPage from './SettingsPage';
import { useAuthStore } from '../store/authStore';
import { getDB, universalAttemptsDB } from '../services/db';
import { commitTests, getBankTest, getBankTests, setMetadata, type PreparedTest } from '../services/questionBank/bankDb';
import { sessionAuth } from '../services/questionBank/github/authProvider';
import { emitBankChanged } from '../services/questionBank/bankEvents';
import { manifestEntryFor, serializeManifest } from '../services/questionBank/manifest';
import { serializeTestFile } from '../services/questionBank/testFile';
import { META_MANIFEST } from '../services/questionBank/remoteSync';
import { fakeGitHub } from '../test/fakeGitHub';
import type { BankQuestionData } from '../services/questionBank/types';

// ─── helpers ─────────────────────────────────────────────────────────────────
const qj = (id: string, extra: Record<string, unknown> = {}) => ({ id, question: `Question ${id}?`, options: ['a', 'b', 'c', 'd'], correctAnswer: 'B', difficulty: 'easy', ...extra });
const testJson = (id: string, questions: unknown[], meta: Record<string, unknown> = {}) => JSON.stringify({ id, title: `Test ${id}`, subject: 'mathematics', chapter: 'Average', questions, ...meta });
const jsonFile = (name: string, text: string) => new File([text], name, { type: 'application/json' });
const bq = (id: string): BankQuestionData => ({ id, questionType: 'mcq', question: `Q ${id}?`, options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }], correctAnswer: 'A', explanation: 'e', difficulty: 'easy' });
const prepared = (id: string, qs: BankQuestionData[]): PreparedTest => ({ id, title: `Test ${id}`, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], questions: qs, sourceFile: `${id}.json` });

function pick(label: string | RegExp, files: File[]) {
  fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), { target: { files } });
}
const mountManager = () => render(<MemoryRouter initialEntries={['/settings/question-bank']}><Routes><Route path="/settings/question-bank" element={<QuestionBankManagerPage />} /><Route path="*" element={<div>ELSEWHERE</div>} /></Routes></MemoryRouter>);

const downloads: { name: string; blob: Blob }[] = [];
let lastName = '';

beforeEach(async () => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: (q: string) => ({ matches: false, media: q, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) });
  downloads.length = 0;
  URL.createObjectURL = vi.fn((b: Blob) => { downloads.push({ name: lastName, blob: b }); return 'blob:test'; });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { lastName = this.download; const last = downloads[downloads.length - 1]; if (last) last.name = this.download; });
  const db = await getDB();
  for (const s of ['tests', 'questions', 'importHistory', 'metadata', 'universalAttempts', 'bookmarks', 'markedForReview', 'wrongQuestions', 'savedTests'] as const) await db.clear(s);
  useAuthStore.setState({ isAdmin: true });
  sessionAuth.clear();
  emitBankChanged();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionAuth.clear(); useAuthStore.setState({ isAdmin: false }); });

// ─── Admin gating ────────────────────────────────────────────────────────────
describe('admin gating', () => {
  it('an ordinary user gets a locked screen — no tabs, no import, no publish controls', async () => {
    useAuthStore.setState({ isAdmin: false });
    mountManager();
    expect(await screen.findByTestId('manager-locked')).toBeTruthy();
    expect(screen.getByText('Administrators only')).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.queryByTestId('drop-zone')).toBeNull();
    expect(screen.queryByTestId('token-input')).toBeNull();
    expect(screen.getByRole('link', { name: /Open the Question Bank/ })).toBeTruthy();
  });
  it('an admin sees the two tabs, each labelled with its scope', async () => {
    mountManager();
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['LOCAL IMPORTThis device only', 'GLOBAL PUBLISHPublishes for all users']);
    expect(screen.getByTestId('scope-local').textContent).toMatch(/This device only/);
    expect(screen.queryByTestId('scope-global')).toBeNull(); // global controls are not even mounted on the local tab
    await userEvent.click(tabs[1]);
    expect(screen.getByTestId('scope-global').textContent).toMatch(/Publishes for all users/);
    expect(screen.queryByTestId('drop-zone')).toBeNull(); // …and local controls are not on the global tab: the two are never mixed
    await userEvent.click(tabs[0]);
    expect(screen.getByTestId('scope-local')).toBeTruthy();
  });
  it('the arrow keys move between the tabs', async () => {
    mountManager();
    const [local] = await screen.findAllByRole('tab');
    local.focus();
    fireEvent.keyDown(local.parentElement!, { key: 'ArrowRight' });
    expect(screen.getAllByRole('tab')[1].getAttribute('aria-selected')).toBe('true');
  });
  it('Settings shows the Admin card (Question Bank Manager, Author Studio) only to admins', async () => {
    const mountSettings = () => render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    useAuthStore.setState({ isAdmin: false });
    mountSettings();
    await screen.findAllByText(/Daily Goal/i);
    expect(screen.queryByTestId('settings-admin')).toBeNull();
    cleanup();
    useAuthStore.setState({ isAdmin: true });
    mountSettings();
    const admin = await screen.findByTestId('settings-admin');
    expect(within(admin).getByRole('link', { name: /Question Bank Manager/ }).getAttribute('href')).toBe('/settings/question-bank');
    expect(within(admin).getByRole('link', { name: /Author Studio/ }).getAttribute('href')).toBe('/author-studio');
  });
});

// ─── LOCAL IMPORT tab ────────────────────────────────────────────────────────
describe('LOCAL IMPORT — picking, preview, validation', () => {
  it('previews each file (title, subject, chapter, questions, difficulty, duplicates, status) and imports all of them atomically after a confirmation', async () => {
    mountManager();
    await screen.findByTestId('local-import-tab');
    pick('Choose question JSON files', [jsonFile('avg.json', testJson('avg-1', [qj('a'), qj('b', { difficulty: 'hard' })])), jsonFile('ratio.json', testJson('ratio-1', [qj('a')], { chapter: 'Ratio' }))]);
    const cards = await screen.findAllByTestId('import-preview');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText('avg.json')).toBeTruthy();
    expect(within(cards[0]).getByText('Test avg-1')).toBeTruthy();
    expect(within(cards[0]).getByText(/1 easy · 0 medium · 1 hard/)).toBeTruthy();
    expect(within(cards[0]).getByText('Ready to import')).toBeTruthy();
    expect(within(cards[1]).getByText('Ratio')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Import 2 files — this device only/ }));
    expect(screen.getByText(/3 questions in 2 files will be added on/)).toBeTruthy(); // the confirmation says what and where
    expect(await getBankTests()).toEqual([]); // nothing yet
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    const summary = await screen.findByTestId('import-summary');
    expect(summary.textContent).toMatch(/avg-1.*2 added/);
    expect((await getBankTests('local')).map((t) => t.id).sort()).toEqual(['avg-1', 'ratio-1']);
    // the stats and the history reflect it
    await waitFor(() => expect(screen.getByTestId('qb-stat-local').textContent).toMatch(/2/));
    expect(screen.getByTestId('qb-stat-questions').textContent).toMatch(/3/);
    const history = await screen.findByTestId('table-import-history');
    expect(within(history).getAllByRole('row')).toHaveLength(3);
    expect(within(history).getAllByText('Success')).toHaveLength(2);
  });

  it('an invalid file shows its exact error position, blocks the whole batch, and can be removed', async () => {
    mountManager();
    await screen.findByTestId('local-import-tab');
    pick('Choose question JSON files', [jsonFile('ok.json', testJson('ok', [qj('a')])), jsonFile('bad.json', '{\n  "title": "T",\n  "questions": [ {"id": 1,, } ]\n}')]);
    const cards = await screen.findAllByTestId('import-preview');
    const bad = cards.find((c) => c.textContent!.includes('bad.json'))!;
    expect(within(bad).getByText(/Has 1 error/)).toBeTruthy();
    expect(within(bad).getByRole('alert').textContent).toMatch(/Line 3, column \d+/);
    expect((screen.getByRole('button', { name: /Import 2 files/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Nothing is imported until every file is valid/)).toBeTruthy();
    await userEvent.click(within(bad).getByRole('button', { name: 'Remove bad.json' }));
    await waitFor(() => expect((screen.getByRole('button', { name: /Import 1 file/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('a bare array asks which test it is; filling the form makes it importable', async () => {
    mountManager();
    await screen.findByTestId('local-import-tab');
    pick('Choose question JSON files', [jsonFile('My Quiz.json', JSON.stringify([qj('a'), qj('b')]))]);
    const card = await screen.findByTestId('import-preview');
    expect(within(card).getByText(/doesn't say which test it is/)).toBeTruthy();
    expect(card.getAttribute('data-valid')).toBe('false');
    await userEvent.selectOptions(within(card).getByLabelText('Subject'), 'mathematics');
    await userEvent.type(within(card).getByLabelText('Chapter'), 'Ratio');
    await waitFor(() => expect(screen.getByTestId('import-preview').getAttribute('data-valid')).toBe('true'));
    expect(within(screen.getByTestId('import-preview')).getByText('my-quiz')).toBeTruthy(); // id from the file name
  });

  it('drag and drop works too', async () => {
    mountManager();
    await screen.findByTestId('local-import-tab');
    fireEvent.drop(screen.getAllByTestId('drop-zone')[0], { dataTransfer: { files: [jsonFile('dropped.json', testJson('dropped', [qj('a')]))] } });
    expect(await screen.findByText('dropped.json')).toBeTruthy();
  });

  it('Add rejects an id that exists; Replace and Merge show what they would do', async () => {
    await commitTests([prepared('t1', [bq('a'), bq('b')])], { mode: 'add' });
    mountManager();
    await screen.findByTestId('local-import-tab');
    pick('Choose question JSON files', [jsonFile('t1.json', testJson('t1', [qj('b'), qj('c')]))]);
    expect((await screen.findByTestId('import-preview')).textContent).toMatch(/already on this device/);
    await userEvent.click(screen.getByLabelText(/^Replace/));
    await waitFor(() => expect(screen.getByTestId('import-preview').getAttribute('data-valid')).toBe('true'));
    await userEvent.click(screen.getByLabelText(/^Merge/));
    expect(await screen.findByText(/1 already in this test/)).toBeTruthy();
    await userEvent.click(screen.getByLabelText(/Update it with the file/));
    await userEvent.click(screen.getByRole('button', { name: /Import 1 file/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect((await screen.findByTestId('import-summary')).textContent).toMatch(/t1.*1 added · 1 updated · 0 skipped/);
  });
});

describe('LOCAL IMPORT — imported tests, export, delete', () => {
  it('lists imported tests, exports the selected ones as JSON, and deletes after a confirmation', async () => {
    await commitTests([prepared('t1', [bq('a')]), prepared('t2', [bq('b')])], { mode: 'add' });
    mountManager();
    const panel = await screen.findByTestId('local-tests-panel');
    await within(panel).findByText('Test t1');
    expect((within(panel).getByRole('button', { name: /Export selected \(0\)/ }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(panel).getByLabelText('Select Test t2'));
    await userEvent.click(within(panel).getByRole('button', { name: /Export selected \(1\)/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0].name).toBe('t2.json');
    const exported = JSON.parse(await downloads[0].blob.text());
    expect(exported).toMatchObject({ id: 't2', subject: 'mathematics', chapter: 'average' });
    expect(exported.questions).toHaveLength(1);

    await userEvent.click(within(panel).getByRole('button', { name: 'Delete Test t1' }));
    expect(await screen.findByText('Remove this test from this device?')).toBeTruthy();
    expect(await getBankTest('local:t1')).toBeTruthy(); // not yet
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(async () => expect(await getBankTest('local:t1')).toBeUndefined());
    expect(await getBankTest('local:t2')).toBeTruthy();
  });
  it('says so when nothing has been imported', async () => {
    mountManager();
    expect(await screen.findByText(/No imported tests yet. Add some above/)).toBeTruthy();
    expect(await screen.findByText('Nothing imported yet.')).toBeTruthy();
  });
});

describe('LOCAL IMPORT — backup and restore', () => {
  const att = { id: 'att1', universalQuestionId: 'qb:local:t1:a', examId: 'e', subjectId: 'mathematics', topicId: 'average', isCorrect: true, wasAnswered: true, timeTaken: 3, attemptedAt: 1, sessionId: 's', sourceFileName: 'x' };

  it('a backup leaves progress out unless you tick the box', async () => {
    await commitTests([prepared('t1', [bq('a')])], { mode: 'add' });
    await universalAttemptsDB.recordMany([att]);
    mountManager();
    const panel = await screen.findByTestId('backup-panel');
    const box = within(panel).getByLabelText(/Also include my attempts/) as HTMLInputElement;
    expect(box.checked).toBe(false); // off by default
    await userEvent.click(within(panel).getByRole('button', { name: /Create backup/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(await downloads[0].blob.text()).not.toContain('att1');
    await userEvent.click(box);
    await userEvent.click(within(panel).getByRole('button', { name: /Create backup/ }));
    await waitFor(() => expect(downloads).toHaveLength(2));
    expect(await downloads[1].blob.text()).toContain('att1');
  });

  it('restore: validates, previews, confirms, and only restores progress if you tick that box', async () => {
    await commitTests([prepared('t1', [bq('a'), bq('b')])], { mode: 'add' });
    await universalAttemptsDB.recordMany([att]);
    mountManager();
    const panel = await screen.findByTestId('backup-panel');
    await userEvent.click(within(panel).getByLabelText(/Also include my attempts/));
    await userEvent.click(within(panel).getByRole('button', { name: /Create backup/ }));
    await waitFor(() => expect(downloads).toHaveLength(1));
    const backupText = await downloads[0].blob.text();
    const db = await getDB();
    for (const s of ['tests', 'questions', 'universalAttempts'] as const) await db.clear(s);

    pick('Choose a backup file to restore', [jsonFile('backup.json', backupText)]);
    const preview = await screen.findByTestId('restore-preview');
    expect(preview.textContent).toMatch(/1 tests?, 2 questions/);
    expect(within(preview).getByLabelText(/Also restore my progress \(1 records/)).toBeTruthy();
    await userEvent.click(within(preview).getByRole('button', { name: /Restore…/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    await waitFor(async () => expect(await getBankTest('local:t1')).toBeTruthy());
    expect(await db.getAll('universalAttempts')).toEqual([]); // progress was in the file but not chosen
  });

  it('a file that is not a backup is rejected with a reason, and nothing is restored', async () => {
    mountManager();
    const panel = await screen.findByTestId('backup-panel');
    pick('Choose a backup file to restore', [jsonFile('nope.json', JSON.stringify({ hello: 1 }))]);
    const preview = await within(panel).findByTestId('restore-preview');
    expect(within(preview).getByRole('alert').textContent).toMatch(/not an ExamVerse question-bank backup/);
    expect(within(preview).queryByRole('button', { name: /Restore…/ })).toBeNull();
    expect(await getBankTests()).toEqual([]);
  });
});

// ─── GLOBAL PUBLISH tab ──────────────────────────────────────────────────────
describe('GLOBAL PUBLISH', () => {
  const TOKEN = 'github_pat_UI_SECRET_999';
  const openGlobal = async () => { mountManager(); await userEvent.click((await screen.findAllByRole('tab'))[1]); await screen.findByTestId('global-publish-tab'); };
  const configure = async () => {
    await userEvent.clear(screen.getByLabelText('Owner')); await userEvent.type(screen.getByLabelText('Owner'), 'acme');
    await userEvent.clear(screen.getByLabelText('Repository')); await userEvent.type(screen.getByLabelText('Repository'), 'exam-app');
  };
  const authenticate = async () => { await userEvent.type(screen.getByTestId('token-input'), TOKEN); await userEvent.click(screen.getByRole('button', { name: 'Use for this session' })); };

  it('the token is entered as a password, held in memory only, never shown or stored, and can be forgotten', async () => {
    await openGlobal();
    const input = screen.getByTestId('token-input') as HTMLInputElement;
    expect(input.type).toBe('password');
    await authenticate();
    expect(await screen.findByText('Token held in memory for this session')).toBeTruthy();
    expect(screen.queryByTestId('token-input')).toBeNull(); // the field is gone and never kept the value
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(JSON.stringify([...Object.keys(localStorage), ...Object.values({ ...localStorage })])).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
    const db = await getDB();
    for (const store of Array.from(db.objectStoreNames)) expect(JSON.stringify(await db.getAll(store as never))).not.toContain(TOKEN);
    await userEvent.click(screen.getByRole('button', { name: 'Forget token' }));
    expect(sessionAuth.isAuthenticated()).toBe(false);
    expect(screen.getByTestId('token-input')).toBeTruthy();
  });

  it('the repository settings are remembered — but the token is not part of them', async () => {
    await openGlobal();
    await configure();
    await waitFor(async () => expect(JSON.stringify(await (await getDB()).get('metadata', 'githubConfig'))).toContain('exam-app'));
    expect(JSON.stringify(await (await getDB()).getAll('metadata'))).not.toMatch(/token/i);
  });

  it('review is disabled until there is a token, a valid configuration and a selection', async () => {
    await commitTests([prepared('t1', [bq('a')])], { mode: 'add' });
    await openGlobal();
    const review = () => screen.getByRole('button', { name: /Validate and review changes/ }) as HTMLButtonElement;
    expect(review().disabled).toBe(true);
    await configure();
    await userEvent.click(await screen.findByLabelText('Publish Test t1'));
    expect(review().disabled).toBe(true); // still no token
    await authenticate();
    await waitFor(() => expect(review().disabled).toBe(false));
  });

  it('select → validate → review (new/existing, target path) → confirm → publish → shows the commit SHA and link', async () => {
    const gh = fakeGitHub({ 'public/data/question-bank/manifest.json': serializeManifest({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', tests: [manifestEntryFor({ id: 'old', title: 'Old', subjectId: 'mathematics', chapterId: 'c', version: 1 }, 'x', 1, '2026-01-01T00:00:00.000Z')] }) });
    vi.stubGlobal('fetch', gh.fetchImpl);
    await commitTests([prepared('t1', [bq('a'), bq('b')])], { mode: 'add' });
    await openGlobal();
    await configure();
    await authenticate();
    await userEvent.click(await screen.findByLabelText('Publish Test t1'));
    await userEvent.click(screen.getByRole('button', { name: /Validate and review changes/ }));

    const review = await screen.findByTestId('publish-review');
    const row = within(within(review).getByTestId('table-publish-review')).getAllByRole('row')[1];
    expect(row.textContent).toMatch(/Test t1/);
    expect(row.textContent).toMatch(/New file/);
    expect(row.textContent).toContain('public/data/question-bank/tests/t1.json');
    expect(row.textContent).toMatch(/new \(v1\)/);
    expect(review.textContent).toMatch(/manifest.*updated in the same commit.*acme\/exam-app@main/);
    expect(gh.calls.some((c) => c.method === 'PATCH')).toBe(false); // reviewing publishes nothing

    await userEvent.click(within(review).getByRole('button', { name: /Publish for all users…/ }));
    expect(screen.getByText(/Everyone who syncs will receive it/)).toBeTruthy();
    expect(gh.calls.some((c) => c.method === 'PATCH')).toBe(false); // …nor does opening the confirmation
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));

    const ok = await screen.findByTestId('publish-success');
    expect(ok.textContent).toMatch(/GitHub confirmed the commit/);
    const link = within(ok).getByRole('link') as HTMLAnchorElement;
    expect(link.href).toBe(`https://github.com/acme/exam-app/commit/${gh.head()}`);
    expect(link.textContent).toContain(gh.head().slice(0, 7));
    expect(link.rel).toContain('noopener');
    expect(gh.fileAtHead('public/data/question-bank/tests/t1.json')).toContain('"id": "t1"');
    expect(JSON.parse(gh.fileAtHead('public/data/question-bank/manifest.json')!).tests.map((t: { id: string }) => t.id)).toEqual(['old', 't1']); // the other entry survived
  });

  it('removing a published test: connect, tick it, review shows "Deleted", publish removes file and manifest entry', async () => {
    const meta = { id: 'old', title: 'Old test', subjectId: 'mathematics', chapterId: 'c', version: 3 };
    const gh = fakeGitHub({
      'public/data/question-bank/manifest.json': serializeManifest({ version: 1, updatedAt: '2026-01-01T00:00:00.000Z', tests: [manifestEntryFor(meta, 'x', 1, '2026-01-01T00:00:00.000Z')] }),
      'public/data/question-bank/tests/old.json': serializeTestFile({ ...meta, chapterTitle: 'c', examIds: [] }, [bq('a')]),
    });
    vi.stubGlobal('fetch', gh.fetchImpl);
    await openGlobal();
    await configure();
    await authenticate();
    await userEvent.click(screen.getByRole('button', { name: /Connect and load published tests/ }));
    await userEvent.click(await screen.findByLabelText('Remove Old test from the published bank'));
    await userEvent.click(screen.getByRole('button', { name: /Validate and review changes/ }));
    const review = await screen.findByTestId('publish-review');
    expect(review.textContent).toMatch(/Deleted/);
    await userEvent.click(within(review).getByRole('button', { name: /Publish for all users…/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await screen.findByTestId('publish-success');
    expect(gh.fileAtHead('public/data/question-bank/tests/old.json')).toBeUndefined();
    expect(JSON.parse(gh.fileAtHead('public/data/question-bank/manifest.json')!).tests).toEqual([]);
  });

  it('failures are shown plainly and nothing is reported as published (rate limit, then conflict)', async () => {
    const gh = fakeGitHub();
    vi.stubGlobal('fetch', gh.fetchImpl);
    await commitTests([prepared('t1', [bq('a')])], { mode: 'add' });
    await openGlobal();
    await configure();
    await authenticate();
    await userEvent.click(await screen.findByLabelText('Publish Test t1'));
    gh.hooks.fail = (_m, p) => (p === '/git/ref/heads/main' ? new Response(JSON.stringify({ message: 'rate limit' }), { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 60) } }) : undefined);
    await userEvent.click(screen.getByRole('button', { name: /Validate and review changes/ }));
    const err = await screen.findByTestId('publish-error');
    expect(err.textContent).toMatch(/rate limit was reached/i);
    expect(err.textContent).toMatch(/Nothing is shown as published unless GitHub confirmed it/);
    expect(screen.queryByTestId('publish-success')).toBeNull();
    expect(screen.queryByTestId('publish-review')).toBeNull();

    gh.hooks.fail = undefined;
    await userEvent.click(screen.getByRole('button', { name: /Validate and review changes/ }));
    await userEvent.click(within(await screen.findByTestId('publish-review')).getByRole('button', { name: /Publish for all users…/ }));
    gh.pushAsSomeoneElse({ 'public/data/question-bank/tests/t1.json': 'someone else wrote this\n' }); // changes the very file we reviewed
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect((await screen.findByTestId('publish-error')).textContent).toMatch(/changed by someone else/);
    expect(gh.fileAtHead('public/data/question-bank/tests/t1.json')).toBe('someone else wrote this\n'); // not overwritten
    expect(screen.queryByTestId('publish-success')).toBeNull();
  });

  it('a local test that no longer validates blocks publishing and says why', async () => {
    const gh = fakeGitHub();
    vi.stubGlobal('fetch', gh.fetchImpl);
    await commitTests([{ ...prepared('t1', [bq('a')]), subjectId: 'not-a-subject' }], { mode: 'add' });
    await openGlobal();
    await configure();
    await authenticate();
    await userEvent.click(await screen.findByLabelText('Publish Test t1'));
    await userEvent.click(screen.getByRole('button', { name: /Validate and review changes/ }));
    const review = await screen.findByTestId('publish-review');
    expect(within(review).getByRole('alert').textContent).toMatch(/not valid.*not a subject the app knows/);
    expect((within(review).getByRole('button', { name: /Publish for all users…/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// ─── The user-facing Question Bank page ──────────────────────────────────────
describe('Question Bank page (everyone)', () => {
  const mountPage = () => render(<MemoryRouter initialEntries={['/question-bank']}><Routes><Route path="/question-bank" element={<QuestionBankPage />} /><Route path="*" element={<div>ELSEWHERE</div>} /></Routes></MemoryRouter>);

  function publishedSite(ids: string[]) {
    const files = new Map<string, string>();
    const entries = ids.map((id) => {
      const meta = { id, title: `Published ${id}`, subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], version: 1 };
      const text = serializeTestFile(meta, [bq('a'), bq('b')]);
      files.set(`/data/question-bank/tests/${id}.json`, text);
      return manifestEntryFor(meta, text, 2, '2026-11-01T00:00:00.000Z');
    });
    const manifest = serializeManifest({ version: 1, updatedAt: '2026-11-01T00:00:00.000Z', tests: entries });
    return (async (url: string | URL | Request) => { const u = new URL(String(url), 'http://localhost'); return u.pathname.endsWith('manifest.json') ? new Response(manifest) : files.has(u.pathname) ? new Response(files.get(u.pathname)!) : new Response('no', { status: 404 }); }) as unknown as typeof fetch;
  }

  it('shows stats, and Sync now downloads the published tests and lists them as on this device', async () => {
    vi.stubGlobal('fetch', publishedSite(['p1', 'p2']));
    mountPage();
    expect(await screen.findByTestId('qb-stat-sync')).toBeTruthy();
    expect(screen.getByTestId('qb-stat-sync').textContent).toMatch(/Never/);
    expect(await screen.findByText(/Nothing has been published yet, or this device hasn't synced/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Sync now/ }));
    const result = await screen.findByTestId('sync-result');
    await waitFor(() => expect(result.textContent).toMatch(/Updated — 2 added, 0 refreshed, 0 removed/));
    const table = await screen.findByTestId('table-published');
    expect(within(table).getAllByText('On this device')).toHaveLength(2);
    await waitFor(() => expect(screen.getByTestId('qb-stat-remote').textContent).toMatch(/2/));
    await waitFor(() => expect(screen.getByTestId('qb-stat-sync').textContent).not.toMatch(/Never/));
    expect((await getBankTests('remote')).map((t) => t.id).sort()).toEqual(['p1', 'p2']);
  });

  it('a published test that is not on this device can be downloaded from the list', async () => {
    vi.stubGlobal('fetch', publishedSite(['p1']));
    const meta = { id: 'p1', title: 'Published p1', subjectId: 'mathematics', chapterId: 'average', chapterTitle: 'Average', examIds: ['ssc-chsl'], version: 1 }; // identical to what the site serves
    await setMetadata(META_MANIFEST, { version: 1, updatedAt: 'x', tests: [manifestEntryFor(meta, serializeTestFile(meta, [bq('a'), bq('b')]), 2, '2026-11-01T00:00:00.000Z')] });
    mountPage();
    const table = await screen.findByTestId('table-published');
    expect(within(table).getByText('Not downloaded')).toBeTruthy();
    await userEvent.click(within(table).getByRole('button', { name: 'Download Published p1' }));
    await waitFor(async () => expect(await getBankTest('remote:p1')).toBeTruthy());
    await waitFor(() => expect(within(screen.getByTestId('table-published')).getByText('On this device')).toBeTruthy());
  });

  it('offline: says so, keeps what is cached, and never throws', async () => {
    await commitTests([prepared('r1', [bq('a')])], { mode: 'add', origin: 'remote' });
    vi.stubGlobal('fetch', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch);
    mountPage();
    await userEvent.click(await screen.findByRole('button', { name: /Sync now/ }));
    expect((await screen.findByTestId('sync-result')).textContent).toMatch(/Could not reach the server — using the tests already on this device/);
    expect(await getBankTest('remote:r1')).toBeTruthy();
  });

  it('only admins are offered the manager', async () => {
    useAuthStore.setState({ isAdmin: false });
    mountPage();
    await screen.findByTestId('qb-stats');
    expect(screen.queryByRole('link', { name: /Open the manager/ })).toBeNull();
    cleanup();
    useAuthStore.setState({ isAdmin: true });
    mountPage();
    expect(await screen.findByRole('link', { name: /Open the manager/ })).toBeTruthy();
  });
});
