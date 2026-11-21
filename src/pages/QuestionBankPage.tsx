import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CloudDownload, Database, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { QuestionBankStats } from '../components/questionBank/QuestionBankStats';
import { DataTable, type Column } from '../components/results/DataTable';
import { useQuestionBankMetadata } from '../hooks/useQuestionBankMetadata';
import { useQuestionBankAccess } from '../hooks/useQuestionBankAccess';
import { questionBankRepository } from '../services/questionBank/repository';
import { getBankTests } from '../services/questionBank/bankDb';
import { onBankChanged } from '../services/questionBank/bankEvents';
import { subjectRegistry } from '../data/registry/subjectRegistry';
import type { SyncResult } from '../services/questionBank/remoteSync';
import type { Manifest, ManifestEntry } from '../services/questionBank/types';

type Availability = 'downloaded' | 'update' | 'available';
interface Row extends ManifestEntry { availability: Availability }

const STATUS_TEXT: Record<Availability, string> = { downloaded: 'On this device', update: 'Update available', available: 'Not downloaded' };

/** For everyone: what the question bank holds, whether it is up to date, Sync now, and the published tests you can download. */
export default function QuestionBankPage() {
  const navigate = useNavigate();
  const { canManage } = useQuestionBankAccess();
  const { metadata, error: metaError } = useQuestionBankMetadata();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [installed, setInstalled] = useState<Map<string, { version: number; hash: string }>>(new Map());
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => Promise.all([questionBankRepository.getRemoteManifest(), getBankTests('remote')]).then(([m, remote]) => {
      if (!alive) return;
      setManifest(m);
      setInstalled(new Map(remote.map((t) => [t.id, { version: t.version, hash: t.hash }])));
    });
    void load();
    const off = onBankChanged(() => { void load(); });
    return () => { alive = false; off(); };
  }, []);

  async function syncNow() {
    setSyncing(true);
    try { setResult(await questionBankRepository.syncRemoteManifest()); } finally { setSyncing(false); }
  }
  async function download(id: string) {
    setDownloading(id);
    const r = await questionBankRepository.downloadRemoteTest(id);
    (r.ok ? toast.success : toast.error)(r.message);
    setDownloading(null);
  }

  const rows: Row[] = (manifest?.tests ?? []).map((t) => {
    const mine = installed.get(t.id);
    return { ...t, availability: !mine ? 'available' : mine.hash !== t.hash || mine.version !== t.version ? 'update' : 'downloaded' };
  });
  const columns: Column<Row>[] = [
    { key: 'title', header: 'Test', render: (r) => <span className="font-medium whitespace-nowrap">{r.title}</span> },
    { key: 'where', header: 'Subject › Chapter', render: (r) => <span className="whitespace-nowrap">{subjectRegistry.getSubject(r.subject)?.name ?? r.subject} › {r.chapter}</span> },
    { key: 'q', header: 'Questions', align: 'right', render: (r) => r.questionCount },
    { key: 'v', header: 'Version', align: 'right', render: (r) => r.version },
    { key: 'status', header: 'Status', render: (r) => STATUS_TEXT[r.availability] },
    { key: 'action', header: 'Action', render: (r) => (r.availability === 'downloaded' ? '—' : (
      <button type="button" disabled={downloading === r.id} aria-label={`${r.availability === 'update' ? 'Update' : 'Download'} ${r.title}`} onClick={() => { void download(r.id); }} className="inline-flex items-center gap-1.5 min-h-11 -my-2 text-brand-600 dark:text-brand-400 font-medium disabled:opacity-50">
        <CloudDownload size={14} aria-hidden />{r.availability === 'update' ? 'Update' : 'Download'}
      </button>
    )) },
  ];

  return (
    <div className="space-y-6 pb-4">
      <header className="pt-2">
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Database size={24} className="text-brand-500" aria-hidden />Question Bank</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Tests that come with the app, tests published for everyone, and tests added on this device. They all appear in <Link to="/practice/configure" className="text-brand-600 dark:text-brand-400 underline">Practice by Topic</Link>.</p>
      </header>

      {metaError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn't read the question bank: {metaError}</p> : <QuestionBankStats metadata={metadata} />}

      <section className="card p-4 space-y-3" aria-label="Sync">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Published tests</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{metadata?.lastSyncAt ? `Last synced ${new Date(metadata.lastSyncAt).toLocaleString()}` : 'Not synced yet'} · tests you already have keep working offline</p>
          </div>
          <button type="button" className="btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2 disabled:opacity-60" disabled={syncing} onClick={() => { void syncNow(); }}>
            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} aria-hidden />{syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {result && (
          <div role="status" className="text-sm" data-testid="sync-result" style={{ color: result.status === 'error' ? undefined : 'var(--text-secondary)' }}>
            <p className={result.status === 'error' ? 'text-red-600 dark:text-red-400' : result.status === 'offline' ? 'text-amber-600 dark:text-amber-400' : ''}>
              {result.status === 'ok' ? `Updated — ${result.added.length} added, ${result.updated.length} refreshed, ${result.removed.length} removed.`
                : result.status === 'unchanged' ? 'Everything is up to date.'
                : result.message}
            </p>
            {result.deferred.length > 0 && <p className="text-xs mt-1">Will update after you finish the unfinished test(s) using: {result.deferred.join(', ')}.</p>}
            {result.failed.length > 0 && <ul className="text-xs mt-1 text-red-600 dark:text-red-400">{result.failed.map((f) => <li key={f.id}><b>{f.id}</b>: {f.reason}</li>)}</ul>}
          </div>
        )}
        {manifest === null ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Nothing has been published yet, or this device hasn't synced. Tap Sync now when you're online.</p>
          : rows.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">No tests are published yet. When some are, they show up here after a sync.</p>
          : <DataTable caption="Published tests" columns={columns} rows={rows} rowKey={(r) => r.id} testId="table-published" />}
      </section>

      <section className="card p-4 flex flex-wrap items-center justify-between gap-3" aria-label="This device">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{metadata ? `${metadata.localTests} test${metadata.localTests === 1 ? '' : 's'} imported on this device (${metadata.localQuestions} questions).` : 'Loading…'}</p>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary px-4 py-2.5 text-sm" onClick={() => navigate('/practice/configure')}>Practice by Topic</button>
          {canManage && <Link to="/settings/question-bank" className="btn-secondary px-4 py-2.5 text-sm">Open the manager</Link>}
        </div>
      </section>
    </div>
  );
}
