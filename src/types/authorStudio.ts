// ─── Author Studio: private local question-bank workspace ────────────────────
// Everything here lives in its own IndexedDB stores (authorFolders, authorFiles,
// authorImports, authorMeta). Nothing in the public question pipeline
// (questionRepository, testLibraryBuilder, mock registry…) reads these stores,
// and nothing here writes to the public data — see services/author/isolation.test.ts.

export interface AuthorFolder {
  id: string;
  /** null = top level ("My Question Bank"). */
  parentId: string | null;
  /** parentId ?? '' — IndexedDB cannot index null, so the by-parentId index runs on this. Maintained by authorDb only. */
  parentKey: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  /** Set when soft-deleted. Absent = live. Indexed, so Trash is a cheap query. */
  deletedAt?: number;
  /** The folder/file whose deletion put this item in Trash (the "root" of the deleted subtree). */
  trashRootId?: string;
  /** Where it lived before deletion, so a restore can put it back. */
  trashOriginalParentId?: string | null;
}

export interface AuthorFile {
  id: string;
  folderId: string | null;
  /** folderId ?? '' — see AuthorFolder.parentKey. Maintained by authorDb only. */
  folderKey: string;
  /** Always ends in .json. */
  name: string;
  /** Size of the content in bytes (UTF-8). The content itself lives in authorContent, so listing files never loads it. */
  size: number;
  createdAt: number;
  updatedAt: number;
  favorite?: boolean;
  lastOpenedAt?: number;
  deletedAt?: number;
  trashRootId?: string;
  trashOriginalFolderId?: string | null;
  /** Cached validation summary (recomputed on every save). */
  validation?: {
    valid: boolean; errors: number; warnings: number; questions: number; checkedAt: number;
    /** Searchable metadata read from the file itself. */
    title?: string; subjects?: string[]; topics?: string[];
  };
}

/** Raw JSON text exactly as authored/imported — kept apart from AuthorFile so lists, the dashboard and trash stay cheap. Never rewritten implicitly. */
export interface AuthorFileContent {
  /** Same id as the AuthorFile. */
  id: string;
  content: string;
}

export interface AuthorImportRecord {
  id: string;
  at: number;
  source: 'upload' | 'folder-upload' | 'backup-restore' | 'create' | 'duplicate';
  label: string;
  added: number;
  skipped: number;
  renamed: number;
  replaced: number;
  failed: number;
  notes?: string[];
}

export interface AuthorLockRecord {
  key: 'lock';
  /** base64 */
  salt: string;
  /** base64 PBKDF2-SHA-256 output — never the password. */
  hash: string;
  iterations: number;
  createdAt: number;
  failedAttempts: number;
  /** Epoch ms until which unlock attempts are refused. */
  lockedUntil: number;
}

export interface AuthorSettingsRecord {
  key: 'settings';
  /** 0 = never auto-lock. */
  autoLockMinutes: number;
  view: 'list' | 'grid';
}

export type AuthorMetaRecord = AuthorLockRecord | AuthorSettingsRecord;

export type ConflictPolicy = 'skip' | 'rename' | 'replace';
