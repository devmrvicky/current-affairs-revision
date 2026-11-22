import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FolderPlus, FilePlus2, FileJson, Layers3 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { AuthorQuestionEditorDialog, type EditableQuestion } from './AuthorQuestionEditorDialog';
import {
  createFile,
  createFolder,
  getFile,
  getFileContent,
  listChildren,
  trashFolder,
  updateFileContent,
} from '../../services/author/authorDb';
import type { AuthorFile, AuthorFolder, AuthorPracticeTarget } from '../../types/authorStudio';
import { publishAuthorFileToPractice } from '../../services/author/authorPractice';
import { v4 as uuidv4 } from 'uuid';

type DestinationMode = 'folder' | 'existing-file' | 'new-file' | 'new-folder';
type Destination =
  | { mode: 'folder'; folderId: string }
  | { mode: 'existing-file'; folderId: string | null; fileId: string }
  | { mode: 'new-file'; folderId: string; fileName: string }
  | { mode: 'new-folder'; folderId: string; folderName: string; fileName: string };

interface Props {
  open: boolean;
  folders: AuthorFolder[];
  currentFolderId: string | null;
  showExamVerseFolders?: boolean;
  initialFileId?: string | null;
  practiceTarget?: AuthorPracticeTarget;
  onCancel: () => void;
  onComplete: (fileId: string, folderId: string | null) => void;
}

function folderPath(folder: AuthorFolder, byId: Map<string, AuthorFolder>): string {
  const parts = [folder.name];
  const seen = new Set([folder.id]);
  let parentId = folder.parentId;
  while (parentId) {
    if (seen.has(parentId)) break;
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    parts.unshift(parent.name);
    parentId = parent.parentId;
  }
  return parts.join('  ›  ');
}

function appendQuestionToJson(source: string, question: EditableQuestion): string {
  let root: unknown;
  try { root = JSON.parse(source); }
  catch { throw new Error('The selected JSON file contains invalid JSON. Open it and fix the source before adding questions.'); }
  if (Array.isArray(root)) {
    return JSON.stringify([...root, question], null, 2) + '\n';
  }
  if (root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>).questions)) {
    const wrapper = root as Record<string, unknown>;
    return JSON.stringify({ ...wrapper, questions: [...(wrapper.questions as unknown[]), question] }, null, 2) + '\n';
  }
  throw new Error('The selected file must contain a question array or an object with a questions array.');
}


/** Adds one question directly to any existing folder/file, or creates the requested destination. */
export function AuthorAddQuestionDialog({ open, folders, currentFolderId, showExamVerseFolders = true, initialFileId = null, practiceTarget, onCancel, onComplete }: Props) {
  const [folderId, setFolderId] = useState('');
  const [mode, setMode] = useState<DestinationMode>('folder');
  const [files, setFiles] = useState<AuthorFile[]>([]);
  const [fileId, setFileId] = useState('');
  const [newFileName, setNewFileName] = useState('Questions');
  const [newFolderName, setNewFolderName] = useState('New folder');
  const [destination, setDestination] = useState<Destination | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [addToPractice, setAddToPractice] = useState(true);

  const byId = useMemo(() => new Map(folders.map((folder) => [folder.id, folder] as const)), [folders]);
  const folderOptions = useMemo(() => {
    const isInsideOriginalTree = (folder: AuthorFolder) => {
      let cursor: AuthorFolder | undefined = folder;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        if (cursor.isExamVerseFolder && cursor.sourcePresent !== false) return true;
        cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
      }
      return false;
    };
    return folders
      .filter((folder) => !folder.deletedAt)
      // Keep the current deep-link destination selectable even when the learner
      // has hidden Original folders; all other Original branches follow the toggle.
      .filter((folder) => showExamVerseFolders || !isInsideOriginalTree(folder) || folder.id === currentFolderId)
      .map((folder) => ({ id: folder.id, label: `${folderPath(folder, byId)}${folder.systemSubjectId ? ' · Subject' : folder.isExamVerseFolder && folder.sourcePresent !== false ? ' · ExamVerse' : ' · My folder'}` }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' }));
  }, [folders, byId, showExamVerseFolders, currentFolderId]);

  useEffect(() => {
    if (!open) return;
    setFolderId(currentFolderId && byId.has(currentFolderId) ? currentFolderId : '');
    setMode(initialFileId ? 'existing-file' : 'folder');
    setFileId(initialFileId ?? '');
    setNewFileName('Questions');
    setNewFolderName('New folder');
    setAddToPractice(true);
    setDestination(null);
    setLoadError('');
    setEditorKey((key) => key + 1);
  }, [open, currentFolderId, initialFileId, byId]);

  useEffect(() => {
    if (!open || (!folderId && !initialFileId)) { setFiles([]); setFileId(''); return; }
    let active = true;
    void listChildren(folderId || null).then((result) => {
      if (!active) return;
      setFiles(result.files.filter((file) => !file.deletedAt));
      setFileId((current) => result.files.some((file) => file.id === current && !file.deletedAt) ? current : result.files.find((file) => !file.deletedAt)?.id ?? '');
      setLoadError('');
    }).catch((error: unknown) => {
      if (active) setLoadError(error instanceof Error ? error.message : 'Could not load files in this folder.');
    });
    return () => { active = false; };
  }, [open, folderId, initialFileId]);

  function continueToEditor() {
    if (mode === 'existing-file') {
      if (!fileId || !files.some((file) => file.id === fileId)) return toast.error('Choose an existing JSON file.');
      setDestination({ mode, folderId: folderId || null, fileId });
      return;
    }
    if (!folderId || !byId.has(folderId)) return toast.error('Choose a subject or destination folder first.');
    if (mode === 'new-file') {
      if (!newFileName.trim()) return toast.error('Enter a name for the new JSON file.');
      setDestination({ mode, folderId, fileName: newFileName.trim() });
    } else if (mode === 'new-folder') {
      if (!newFolderName.trim() || !newFileName.trim()) return toast.error('Enter both the new folder and JSON file names.');
      setDestination({ mode, folderId, folderName: newFolderName.trim(), fileName: newFileName.trim() });
    } else {
      setDestination({ mode: 'folder', folderId });
    }
  }

  async function saveQuestion(question: EditableQuestion) {
    if (!destination) return;
    setBusy(true);
    try {
      let targetFile: AuthorFile;
      let source: string;

      if (destination.mode === 'existing-file') {
        const currentFile = await getFile(destination.fileId);
        const currentSource = await getFileContent(destination.fileId);
        if (!currentFile || currentFile.deletedAt || currentSource === undefined) throw new Error('The selected file no longer exists. Refresh the Question Bank and try again.');
        const nextQuestion = makeQuestionIdUnique(question, currentSource);
        source = appendQuestionToJson(currentSource, nextQuestion);
        targetFile = await updateFileContent(currentFile.id, source);
      } else if (destination.mode === 'folder') {
        const folderChildren = await listChildren(destination.folderId);
        const defaultFile = folderChildren.files.find((file) => !file.deletedAt && file.name.toLowerCase() === 'questions.json');
        if (defaultFile) {
          const currentSource = await getFileContent(defaultFile.id);
          if (currentSource === undefined) throw new Error('Questions.json could not be read.');
          source = appendQuestionToJson(currentSource, makeQuestionIdUnique(question, currentSource));
          targetFile = await updateFileContent(defaultFile.id, source);
        } else {
          source = JSON.stringify([question], null, 2) + '\n';
          targetFile = await createFile(destination.folderId, 'Questions.json', source);
        }
      } else if (destination.mode === 'new-file') {
        source = JSON.stringify([question], null, 2) + '\n';
        targetFile = await createFile(destination.folderId, destination.fileName, source);
      } else {
        const folder = await createFolder(destination.folderId, destination.folderName);
        source = JSON.stringify([question], null, 2) + '\n';
        try {
          targetFile = await createFile(folder.id, destination.fileName, source);
        } catch (error) {
          // Do not leave an empty folder behind if creating its first file fails.
          try { await trashFolder(folder.id); } catch { /* keep the original creation error */ }
          throw error;
        }
      }

      let savedFile = targetFile;
      let syncWarning = '';
      if (targetFile.practiceLink || addToPractice) {
        try {
          // A deep link may preselect the canonical chapter. Retain that target
          // only when the learner keeps the exact folder they opened from; if
          // they choose another folder or create a nested one, publish against
          // that selected destination's own path instead of the stale chapter.
          const selectedTarget = practiceTarget && targetFile.folderId === currentFolderId ? practiceTarget : undefined;
          const published = await publishAuthorFileToPractice(targetFile, source, selectedTarget);
          savedFile = published.file;
        } catch (error) {
          syncWarning = error instanceof Error ? error.message : 'Practice publishing failed.';
        }
      }
      if (syncWarning) toast.error(`Question saved in ${savedFile.name}, but Practice was not updated: ${syncWarning}`, { duration: 6500 });
      else toast.success(savedFile.practiceLink ? `Question saved and available in Practice · ${savedFile.name}.` : `Question added to ${savedFile.name}.`);
      setDestination(null);
      onComplete(savedFile.id, savedFile.folderId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add the question.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open && destination === null} onClose={onCancel} title="Add a question" description="Choose any subject or nested folder, then add to an existing file or create a destination.">
        <div className="space-y-3">
          <label className="block text-sm">
            <span style={{ color: 'var(--text-secondary)' }}>Subject / destination folder</span>
            <select value={folderId} onChange={(event) => setFolderId(event.target.value)} data-autofocus className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              <option value="">Choose a subject or folder…</option>
              {folderOptions.map((folder) => <option key={folder.id} value={folder.id}>{folder.label}</option>)}
            </select>
          </label>
          <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Question destination">
            {([
              ['folder', 'Add directly to folder', 'Use or create Questions.json', Layers3],
              ['existing-file', 'Existing JSON file', 'Append to a selected file', FileJson],
              ['new-file', 'Create new file', 'Create a JSON file here', FilePlus2],
              ['new-folder', 'Create new folder', 'Create a folder and JSON file', FolderPlus],
            ] as const).map(([value, label, detail, Icon]) => (
              <button key={value} type="button" onClick={() => setMode(value)} aria-pressed={mode === value} className={`rounded-xl border p-3 text-left ${mode === value ? 'border-brand-500 bg-brand-500/10' : ''}`} style={mode === value ? undefined : { borderColor: 'var(--border)' }}>
                <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}><Icon size={15}/>{label}</span>
                <span className="block mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>{detail}</span>
              </button>
            ))}
          </div>

          {mode === 'existing-file' && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>Existing file in selected folder</span>
              <select value={fileId} onChange={(event) => setFileId(event.target.value)} className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                <option value="">Choose JSON file…</option>
                {files.map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}
              </select>
              {folderId && files.length === 0 && <span className="block mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>No JSON files in this folder yet. Choose another destination or create a file.</span>}
            </label>
          )}
          {(mode === 'new-file' || mode === 'new-folder') && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>New JSON file name</span>
              <input value={newFileName} onChange={(event) => setNewFileName(event.target.value)} maxLength={120} placeholder="Questions" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </label>
          )}
          {mode === 'new-folder' && (
            <label className="block text-sm">
              <span style={{ color: 'var(--text-secondary)' }}>New subfolder name</span>
              <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} maxLength={120} placeholder="e.g. Number System" className="mt-1 w-full rounded-xl px-3 py-2.5 text-sm bg-transparent" style={{ border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
            </label>
          )}
          {loadError && <p role="alert" className="text-xs text-red-600">{loadError}</p>}
          <label className="flex items-start gap-2.5 rounded-xl p-3 text-sm" style={{ background: 'var(--border)' }}>
            <input type="checkbox" checked={addToPractice} onChange={(event) => setAddToPractice(event.target.checked)} className="mt-0.5" />
            <span><strong className="block" style={{ color: 'var(--text-primary)' }}>Add to Practice & Mock automatically</strong><span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>No need to open Add to Practice afterwards. Existing linked files will sync automatically.</span></span>
          </label>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>The exact selected folder is the save destination. Existing files keep their IDs, and your personal questions stay separate from the read-only ExamVerse source.</p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onCancel} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            <button type="button" disabled={busy || (mode !== 'existing-file' && !folderId) || (mode === 'existing-file' && !fileId)} onClick={continueToEditor} className="btn-primary flex-1 py-2.5 text-sm">Continue</button>
          </div>
        </div>
      </Modal>
      <AuthorQuestionEditorDialog
        key={editorKey}
        open={open && destination !== null}
        initial={null}
        description="This question will be saved directly to the selected folder or JSON file."
        saving={busy}
        onCancel={() => { if (!busy) setDestination(null); }}
        onSave={(question) => { void saveQuestion(question); }}
      />
    </>
  );
}

function makeQuestionIdUnique(question: EditableQuestion, source: string): EditableQuestion {
  try {
    const root: unknown = JSON.parse(source);
    const list = Array.isArray(root) ? root : root && typeof root === 'object' && Array.isArray((root as Record<string, unknown>).questions) ? (root as { questions: unknown[] }).questions : [];
    const ids = new Set(list.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object').map((item) => String(item.id ?? '')));
    if (question.id === undefined || ids.has(String(question.id))) return { ...question, id: `q-${uuidv4()}` };
  } catch { /* appendQuestionToJson below will show the clear JSON error */ }
  return question;
}
