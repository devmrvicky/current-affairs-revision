// @vitest-environment jsdom
// Drives the real Author Studio screens against a real (fake-indexeddb) database.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthorStudioPage from '../../pages/author/AuthorStudioPage';
import { useAuthorLockStore } from '../../store/authorLockStore';
import { getDB } from '../../services/db';
import { readZip } from '../../services/author/authorZip';
import { saveAuthorSettings } from '../../services/author/authorDb';
import { hashPassword } from '../../services/author/authorCrypto';

const PASSWORD = 'correct-horse-battery';
const dec = new TextDecoder();

async function wipe() {
  const db = await getDB();
  for (const s of ['authorFolders', 'authorFiles', 'authorContent', 'authorImports', 'authorMeta'] as const) await db.clear(s);
  useAuthorLockStore.setState({ unlocked: false, lastActivityAt: Date.now() });
}

/** Writes a lock record directly (cheap hash) so most tests skip the 600k-iteration setup. */
async function presetPassword() {
  const h = await hashPassword(PASSWORD, 1_000);
  await (await getDB()).put('authorMeta', { key: 'lock', ...h, createdAt: 1, failedAttempts: 0, lockedUntil: 0 });
}
async function unlockUi(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Password'), PASSWORD);
  await user.click(screen.getByRole('button', { name: 'Unlock' }));
  await screen.findByRole('navigation', { name: 'Author Studio sections' });
}
const nav = (name: string) => screen.getByRole('button', { name });

beforeEach(async () => {
  await wipe();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Author Lock screen', () => {
  it('first visit: set a password (real PBKDF2), reach the workspace; the plaintext is never stored', async () => {
    const user = userEvent.setup();
    render(<AuthorStudioPage />);
    await user.type(await screen.findByLabelText('New password'), PASSWORD);
    await user.type(screen.getByLabelText('Confirm password'), 'something-else-entirely');
    await user.click(screen.getByRole('button', { name: /Set password/ }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/do not match/);

    await user.clear(screen.getByLabelText('Confirm password'));
    await user.type(screen.getByLabelText('Confirm password'), PASSWORD);
    await user.click(screen.getByRole('button', { name: /Set password/ }));
    await screen.findByRole('navigation', { name: 'Author Studio sections' });

    const rec = await (await getDB()).get('authorMeta', 'lock');
    expect(JSON.stringify(rec)).not.toContain(PASSWORD);
    expect(rec).toMatchObject({ iterations: 600_000 });
  }, 20_000);

  it('wrong password is refused, three misses add a delay, and the studio stays locked', async () => {
    await presetPassword();
    const user = userEvent.setup();
    render(<AuthorStudioPage />);
    for (let i = 0; i < 3; i++) {
      await user.type(await screen.findByLabelText('Password'), 'not-it-' + i);
      await user.click(screen.getByRole('button', { name: 'Unlock' }));
      await waitFor(() => expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(''));
    }
    expect(await screen.findByText(/Try again in \d+s/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Unlock' }) as HTMLButtonElement).disabled).toBe(true);
    expect(useAuthorLockStore.getState().unlocked).toBe(false);
    expect(screen.queryByRole('navigation', { name: 'Author Studio sections' })).toBeNull();
  });

  it('manual lock returns to the gate; a fresh mount (restart) is locked again', async () => {
    await presetPassword();
    const user = userEvent.setup();
    const first = render(<AuthorStudioPage />);
    await unlockUi(user);
    await user.click(screen.getByRole('button', { name: /^Lock$/ }));
    await screen.findByLabelText('Password');
    first.unmount();
    useAuthorLockStore.setState({ unlocked: false }); // what a page reload does: memory-only state starts locked
    render(<AuthorStudioPage />);
    await screen.findByLabelText('Password');
  });

  it('locks itself after the configured inactivity', async () => {
    await presetPassword();
    await saveAuthorSettings({ autoLockMinutes: 1 });
    const user = userEvent.setup();
    render(<AuthorStudioPage />);
    await unlockUi(user);
    useAuthorLockStore.setState({ lastActivityAt: Date.now() - 5 * 60_000 }); // five idle minutes
    fireEvent(document, new Event('visibilitychange'));
    await screen.findByLabelText('Password');
    expect(useAuthorLockStore.getState().unlocked).toBe(false);
  });
});

describe('workspace walkthrough', () => {
  it('create folder → create file → edit to invalid → see errors → fix → trash → restore → back up', async () => {
    await presetPassword();
    const user = userEvent.setup();
    render(<AuthorStudioPage />);
    await unlockUi(user);

    // Dashboard starts empty and real
    expect(await screen.findByText('No files yet')).toBeTruthy();

    // My Question Bank → new folder
    await user.click(nav('My Question Bank'));
    await user.click(await screen.findByRole('button', { name: /^Folder$/ }));
    await user.type(await screen.findByLabelText('Folder name'), 'गणित');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    const folderRow = await screen.findByTestId('author-folder');
    expect(within(folderRow).getByText('गणित')).toBeTruthy();

    // duplicate folder name is refused with a message
    await user.click(screen.getByRole('button', { name: /^Folder$/ }));
    await user.type(await screen.findByLabelText('Folder name'), 'गणित');
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already exists/);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // open the folder (breadcrumb appears), create a file
    await user.click(within(folderRow).getByRole('button', { name: 'गणित' }));
    expect(await screen.findByRole('button', { name: 'गणित', current: 'page' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^File$/ }));
    await user.type(await screen.findByLabelText(/File name/), 'average');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    // the viewer opens on the starter template, which validates
    const dialog = await screen.findByRole('dialog', { name: 'average.json' }); // the viewer, not the closing name dialog
    expect(await within(dialog).findByText('Valid')).toBeTruthy();

    // Source tab: break it
    await user.click(within(dialog).getByRole('tab', { name: /source/i }));
    const source = within(dialog).getByLabelText('JSON source') as HTMLTextAreaElement;
    fireEvent.change(source, { target: { value: '[{"id":"a","question":"Q?","options":["x","y"],"correctAnswer":"Z"}]' } });
    await user.click(within(dialog).getByRole('tab', { name: /validation/i }));
    expect((await within(dialog).findByTestId('author-validation')).textContent).toMatch(/matches no option/);
    expect(within(dialog).getByRole('status').textContent).toMatch(/1 error/);

    // Save keeps the invalid draft and says so
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => {
      const files = await (await getDB()).getAll('authorFiles');
      expect(files[0].validation).toMatchObject({ valid: false, errors: 1 });
    });

    // Fix it, save, close
    await user.click(within(dialog).getByRole('tab', { name: /source/i }));
    fireEvent.change(within(dialog).getByLabelText('JSON source'), { target: { value: '[{"id":"a","question":"Q?","options":["x","y"],"correctAnswer":"x","explanation":"e","difficulty":"easy"}]' } });
    expect(await within(dialog).findByText('Valid')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(async () => expect((await (await getDB()).getAll('authorFiles'))[0].validation?.valid).toBe(true));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Trash it from the row menu, confirm, see it in Trash, restore it
    await user.click(await screen.findByRole('button', { name: /Actions for average.json/ }));
    await user.click(await screen.findByRole('menuitem', { name: /Move to Trash/ }));
    await user.click(await screen.findByRole('button', { name: 'Move to Trash' }));
    await waitFor(() => expect(screen.queryByTestId('author-file')).toBeNull());

    await user.click(nav('Trash'));
    expect(await screen.findByText('average.json')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Restore/ }));
    await waitFor(() => expect(screen.getByText('Trash is empty')).toBeTruthy());

    await user.click(nav('My Question Bank'));
    await user.click(within(await screen.findByTestId('author-folder')).getByRole('button', { name: 'गणित' }));
    expect(await screen.findByText('average.json')).toBeTruthy(); // restored into its original folder

    // Storage → backup contains the hierarchy and not the credentials
    let captured: Blob | null = null;
    (URL.createObjectURL as ReturnType<typeof vi.fn>).mockImplementation((b: Blob) => { captured = b; return 'blob:x'; });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await user.click(nav('Storage'));
    await user.click(await screen.findByRole('button', { name: /Download backup/ }));
    await waitFor(() => expect(captured).toBeTruthy());
    const entries = await readZip(new Uint8Array(await (captured as unknown as Blob).arrayBuffer()));
    expect(entries.map((e) => e.path)).toContain('bank/गणित/average.json');
    const lock = await (await getDB()).get('authorMeta', 'lock');
    const text = entries.map((e) => dec.decode(e.data)).join('\n');
    expect(text).not.toContain((lock as { hash: string }).hash);
    expect(text).not.toContain(PASSWORD);
  }, 40_000);

  it('uploading a file that clashes asks what to do, and Replace asks again', async () => {
    await presetPassword();
    const user = userEvent.setup();
    render(<AuthorStudioPage />);
    await unlockUi(user);
    await user.click(nav('My Question Bank'));
    const good = (id: string) => JSON.stringify([{ id, question: 'Q?', options: ['a', 'b'], correctAnswer: 'a', explanation: 'e', difficulty: 'easy' }]);
    const upload = async (name: string, body: string) => {
      const input = document.querySelector('input[type=file][accept=".json,application/json"]') as HTMLInputElement;
      await user.upload(input, new File([body], name, { type: 'application/json' }));
    };
    await upload('dup.json', good('1'));
    await screen.findByText('dup.json');

    await upload('dup.json', good('2'));
    expect(await screen.findByText(/same name already exist/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Replace existing files/ }));
    expect(await screen.findByText(/will be overwritten/)).toBeTruthy(); // second, explicit confirmation
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const stored = await (await getDB()).getAll('authorContent');
    expect(stored).toHaveLength(1);
    expect(stored[0].content).toBe(good('1')); // nothing was replaced

    await upload('dup.json', good('3'));
    await user.click(await screen.findByRole('button', { name: /Keep both/ }));
    await waitFor(async () => expect((await (await getDB()).getAll('authorFiles')).map((f) => f.name).sort()).toEqual(['dup (2).json', 'dup.json']));
  }, 30_000);
});
