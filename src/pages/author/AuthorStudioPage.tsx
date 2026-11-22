import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthorLockGate } from '../../components/author/AuthorLockGate';
import { AuthorFileManager } from '../../components/author/AuthorFileManager';
import { AuthorFileViewer } from '../../components/author/AuthorFileViewer';
import { AllFilesPanel, DashboardPanel, FavoritesPanel, ImportHistoryPanel, RecentPanel, SettingsPanel, StoragePanel, TrashPanel } from '../../components/author/AuthorPanels';
import { getAuthorSettings, DEFAULT_AUTHOR_SETTINGS, ensureSubjectFolders, ensureSubjectFolderPath } from '../../services/author/authorDb';
import { isIdleExpired, useAuthorLockStore } from '../../store/authorLockStore';
import type { AuthorPracticeTarget, AuthorSettingsRecord, AuthorSubjectId } from '../../types/authorStudio';

type Section = 'dashboard' | 'all' | 'bank' | 'recent' | 'favorites' | 'trash' | 'imports' | 'storage' | 'settings';

const NAV: { id: Section; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' }, { id: 'all', label: 'All Files' }, { id: 'bank', label: 'My Question Bank' }, { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' }, { id: 'trash', label: 'Trash' }, { id: 'imports', label: 'Import History' }, { id: 'storage', label: 'Storage' }, { id: 'settings', label: 'Settings' },
];

/** Private Author Studio. Source files remain on this device; valid files can be explicitly added to the existing local Practice/Mock Test bank. */
export default function AuthorStudioPage() {
  const unlocked = useAuthorLockStore((s) => s.unlocked);
  return unlocked ? <Workspace /> : <AuthorLockGate />;
}

/** Locks after the configured idle time. Activity is a timestamp, so a throttled background timer can't delay the lock. */
function useAutoLock(minutes: number) {
  const touch = useAuthorLockStore((s) => s.touch);
  const lock = useAuthorLockStore((s) => s.lock);
  useEffect(() => {
    let last = 0;
    const onActivity = () => { const now = Date.now(); if (now - last > 2_000) { last = now; touch(); } };
    const check = () => { if (isIdleExpired(useAuthorLockStore.getState().lastActivityAt, minutes)) lock(); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(check, 5_000);
    check();
    return () => { events.forEach((e) => window.removeEventListener(e, onActivity)); document.removeEventListener('visibilitychange', onVisible); clearInterval(id); };
  }, [minutes, touch, lock]);
}

function Workspace() {
  const location = useLocation();
  const navigate = useNavigate();
  const lock = useAuthorLockStore((s) => s.lock);
  const [settings, setSettings] = useState<AuthorSettingsRecord>(DEFAULT_AUTHOR_SETTINGS);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('dashboard');
  const [openFileId, setOpenFileId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [bank, setBank] = useState<{ key: number; folderId: string | null }>({ key: 0, folderId: null });
  const [autoAddTarget, setAutoAddTarget] = useState<AuthorPracticeTarget | null>(null);
  const [autoAddQuestion, setAutoAddQuestion] = useState(false);
  const requestKeyRef = useRef<string | null>(null);
  const requestPromiseRef = useRef<ReturnType<typeof ensureSubjectFolderPath> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await ensureSubjectFolders();
        const s = await getAuthorSettings();
        if (alive) setSettings(s);
      } catch { /* The workspace still opens; the folder manager reports any storage failure. */ }
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, []);
  useAutoLock(settings.autoLockMinutes);

  // A canonical chapter can send the learner into the protected Author Studio. After
  // unlock, create/reuse a Personal mirror of that path and open Add Question there.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(location.search);
    if (params.get('addQuestion') !== '1') {
      requestKeyRef.current = null;
      requestPromiseRef.current = null;
      return;
    }

    const requestKey = location.search;
    const subjectId = params.get('subject') as AuthorSubjectId | null;
    if (!subjectId || !['mathematics', 'english', 'reasoning', 'general-awareness'].includes(subjectId)) {
      navigate('/author', { replace: true });
      return;
    }

    // React StrictMode re-runs effects during development. Share one folder-creation
    // promise between those runs so the protected deep-link still opens reliably and
    // we never race two attempts to create the same mirrored folder path.
    if (requestKeyRef.current !== requestKey) {
      requestKeyRef.current = requestKey;
      const path = (params.get('path') ?? '').split('/').map((part) => part.trim()).filter(Boolean);
      requestPromiseRef.current = ensureSubjectFolderPath(subjectId, path);
    }
    const request = requestPromiseRef.current;
    if (!request) return;

    let active = true;
    void request.then((mirrored) => {
      if (!active) return;
      const path = (params.get('path') ?? '').split('/').map((part) => part.trim()).filter(Boolean);
      const chapterId = params.get('chapterId') ?? '';
      const chapterTitle = params.get('chapterTitle') ?? path[path.length - 1] ?? 'My Questions';
      setAutoAddTarget(chapterId ? { subjectId, chapterId, chapterTitle, title: chapterTitle } : null);
      setAutoAddQuestion(true);
      setBank((current) => ({ key: current.key + 1, folderId: mirrored.folderId }));
      setSection('bank');
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : 'Could not open this chapter in My Question Bank.');
    }).finally(() => {
      if (active) navigate('/author', { replace: true });
    });
    return () => { active = false; };
  }, [ready, location.search, navigate]);

  const changed = useCallback(() => setRefreshKey((k) => k + 1), []);
  const closeViewer = useCallback(() => setOpenFileId(null), []);
  const openFolder = useCallback((id: string | null) => { setBank((b) => ({ key: b.key + 1, folderId: id })); setSection('bank'); }, []);
  const go = useCallback((s: string) => { if (s === 'bank') openFolder(null); else setSection(s as Section); }, [openFolder]);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Author Studio</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>My Questions · private and editable on this device · ExamVerse Original content stays protected</p>
        </div>
        <button type="button" onClick={lock} className="btn-secondary text-xs px-4 py-2 inline-flex items-center gap-1.5"><Lock size={13} /> Lock</button>
      </header>

      <nav aria-label="Author Studio sections" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => go(n.id)} aria-current={section === n.id ? 'page' : undefined}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${section === n.id ? 'bg-brand-500 text-white' : ''}`} style={section === n.id ? undefined : { color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
            {n.label}
          </button>
        ))}
      </nav>

      {!ready ? <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} /> : (
        <main>
          {section === 'dashboard' && <DashboardPanel refreshKey={refreshKey} onOpenFile={setOpenFileId} onNavigate={go} />}
          {section === 'all' && <AllFilesPanel refreshKey={refreshKey} onOpenFile={setOpenFileId} />}
          {section === 'bank' && <AuthorFileManager key={bank.key} initialView={settings.view} startFolderId={bank.folderId} onOpenFile={setOpenFileId} refreshKey={refreshKey} onChanged={changed} autoAddQuestionOnOpen={autoAddQuestion} practiceTarget={autoAddTarget ?? undefined} onAutoAddHandled={() => setAutoAddQuestion(false)} onAutoAddCompleted={() => setAutoAddTarget(null)} />}
          {section === 'recent' && <RecentPanel refreshKey={refreshKey} onOpenFile={setOpenFileId} />}
          {section === 'favorites' && <FavoritesPanel refreshKey={refreshKey} onOpenFile={setOpenFileId} onOpenFolder={openFolder} />}
          {section === 'trash' && <TrashPanel refreshKey={refreshKey} onChanged={changed} />}
          {section === 'imports' && <ImportHistoryPanel refreshKey={refreshKey} />}
          {section === 'storage' && <StoragePanel refreshKey={refreshKey} onChanged={changed} />}
          {section === 'settings' && <SettingsPanel />}
        </main>
      )}

      <AuthorFileViewer fileId={openFileId} onClose={closeViewer} onSaved={changed} />
    </div>
  );
}
