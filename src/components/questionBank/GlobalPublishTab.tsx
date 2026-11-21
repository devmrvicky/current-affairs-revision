import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import { AlertCircle, CheckCircle2, ExternalLink, Globe2, KeyRound, ShieldAlert } from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { DataTable, type Column } from '../results/DataTable';
import { sessionAuth } from '../../services/questionBank/github/authProvider';
import {
  DEFAULT_GITHUB_CONFIG, GitHubClient, GitHubError, planPublish, publishToGitHub, readRemoteManifest, validateGitHubConfig,
  type GitHubConfig, type PublishPlan, type PublishResult, type PublishTest,
} from '../../services/questionBank/github/githubPublisher';
import { getBankQuestions, getBankTests, getMetadata, setMetadata } from '../../services/questionBank/bankDb';
import { onBankChanged } from '../../services/questionBank/bankEvents';
import { parseTestFile, serializeTestFile } from '../../services/questionBank/testFile';
import { subjectRegistry } from '../../data/registry/subjectRegistry';
import type { BankTestRecord, Manifest } from '../../services/questionBank/types';

const CONFIG_KEY = 'githubConfig'; // owner/repo/branch/paths only — the token is never stored

interface ReviewRow { id: string; action: 'New' | 'Update' | 'Remove'; title: string; path: string; questions: number | null; version: string }
interface Review { plan: PublishPlan; tests: PublishTest[]; deleteIds: string[]; rows: ReviewRow[]; problems: string[] }

function describeError(err: unknown): { title: string; detail: string } {
  if (err instanceof GitHubError) {
    const title = { auth: 'GitHub didn’t accept the token', 'no-token': 'Enter your GitHub token', 'not-found': 'Repository or branch not found', 'rate-limit': 'GitHub’s rate limit was reached', conflict: 'The repository changed', network: 'Couldn’t reach GitHub', validation: 'Something needs fixing first', http: 'GitHub returned an error' }[err.kind];
    return { title, detail: err.message };
  }
  return { title: 'Publishing failed', detail: err instanceof Error ? err.message : 'Unknown error. Nothing is known to be published.' };
}

const rowColumns: Column<ReviewRow>[] = [
  { key: 'id', header: 'Test', render: (r) => <span className="font-medium whitespace-nowrap">{r.title}<span className="block text-[11px] font-normal" style={{ color: 'var(--text-muted)' }}>{r.id}</span></span> },
  { key: 'action', header: 'What happens', render: (r) => <span className="font-medium">{r.action === 'New' ? 'New file' : r.action === 'Update' ? 'Replaces existing file' : 'Deleted'}</span> },
  { key: 'path', header: 'Target path', render: (r) => <code className="text-[11px] whitespace-nowrap">{r.path}</code> },
  { key: 'questions', header: 'Questions', align: 'right', render: (r) => (r.questions === null ? '—' : r.questions) },
  { key: 'version', header: 'Version', align: 'right', render: (r) => r.version },
];

/** GLOBAL PUBLISH — changes the shared bank for ALL users, through one atomic GitHub commit. Admin only. */
export function GlobalPublishTab() {
  const authed = useSyncExternalStore((cb) => sessionAuth.subscribe(cb), () => sessionAuth.isAuthenticated());
  const [config, setConfig] = useState<GitHubConfig>(DEFAULT_GITHUB_CONFIG);
  const [tokenInput, setTokenInput] = useState('');
  const [tests, setTests] = useState<BankTestRecord[]>([]);
  const [live, setLive] = useState<Manifest | null>(null);
  const [publishIds, setPublishIds] = useState<Set<string>>(new Set());
  const [removeIds, setRemoveIds] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<Review | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'review' | 'publish'>(null);
  const [error, setError] = useState<{ title: string; detail: string } | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  useEffect(() => { void getMetadata<GitHubConfig>(CONFIG_KEY).then((c) => { if (c) setConfig({ ...DEFAULT_GITHUB_CONFIG, ...c }); }); }, []);
  useEffect(() => {
    let alive = true;
    const load = () => getBankTests('local').then((t) => { if (alive) setTests(t); });
    void load();
    const off = onBankChanged(() => { void load(); });
    return () => { alive = false; off(); };
  }, []);

  const configProblems = useMemo(() => validateGitHubConfig(config), [config]);
  const client = useMemo(() => new GitHubClient(sessionAuth), []);
  const patch = (p: Partial<GitHubConfig>) => { setConfig((c) => { const n = { ...c, ...p }; void setMetadata(CONFIG_KEY, n); return n; }); setReview(null); };
  const toggle = (set: Set<string>, id: string, write: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); write(n); setReview(null); setResult(null); };

  function applyToken() {
    try { sessionAuth.setToken(tokenInput); setError(null); } catch (e) { setError({ title: 'That doesn’t look like a token', detail: e instanceof Error ? e.message : '' }); }
    setTokenInput(''); // the field never keeps it
  }

  async function connect() {
    setBusy('connect'); setError(null);
    try { setLive((await readRemoteManifest(client, config)).manifest); toast.success('Connected — loaded the published tests'); }
    catch (e) { setError(describeError(e)); } finally { setBusy(null); }
  }

  async function buildReview() {
    setBusy('review'); setError(null); setResult(null);
    try {
      const { manifest } = await readRemoteManifest(client, config);
      setLive(manifest);
      const problems: string[] = [];
      const publishTests: PublishTest[] = [];
      for (const t of tests.filter((x) => publishIds.has(x.id))) {
        const published = manifest.tests.find((m) => m.id === t.id);
        const version = (published?.version ?? 0) + 1; // published versions are independent of local ones
        const qs = (await getBankQuestions(t.key)).map((r) => r.data);
        const text = serializeTestFile({ id: t.id, title: t.title, subjectId: t.subjectId, chapterId: t.chapterId, chapterTitle: t.chapterTitle, examIds: t.examIds, version }, qs);
        const check = parseTestFile(text, `${t.id}.json`); // validate exactly what would be published
        if (!check.ok) { problems.push(`“${t.title}” is not valid: ${check.errors[0]?.message}`); continue; }
        publishTests.push({ id: t.id, title: t.title, subjectId: t.subjectId, chapterId: t.chapterId, version, questionCount: qs.length, text });
      }
      const deleteIds = Array.from(removeIds);
      const plan = await planPublish(client, config, publishTests, deleteIds);
      const rows: ReviewRow[] = [
        ...plan.files.map((f): ReviewRow => { const t = publishTests.find((x) => x.id === f.id)!; const old = manifest.tests.find((m) => m.id === f.id); return { id: f.id, action: f.status === 'new' ? 'New' : 'Update', title: t.title, path: f.path, questions: t.questionCount, version: old ? `${old.version} → ${t.version}` : `new (v${t.version})` }; }),
        ...plan.deletes.map((d): ReviewRow => ({ id: d.id, action: 'Remove', title: manifest.tests.find((m) => m.id === d.id)?.title ?? d.id, path: d.path, questions: null, version: d.existed ? 'removed' : 'not in repo' })),
      ];
      setMessage(`Publish ${publishTests.length} test${publishTests.length === 1 ? '' : 's'}${deleteIds.length ? `, remove ${deleteIds.length}` : ''} — question bank`);
      setReview({ plan, tests: publishTests, deleteIds, rows, problems });
    } catch (e) { setError(describeError(e)); setReview(null); } finally { setBusy(null); }
  }

  async function doPublish() {
    if (!review) return;
    setBusy('publish'); setError(null);
    try {
      const r = await publishToGitHub(client, config, { tests: review.tests, deleteIds: review.deleteIds, message: message.trim() || 'Update question bank', plan: review.plan });
      setResult(r); setReview(null); setPublishIds(new Set()); setRemoveIds(new Set()); setLive(r.manifest); setConfirmOpen(false);
      toast.success('Published — GitHub confirmed the commit');
    } catch (e) { setError(describeError(e)); setConfirmOpen(false); } finally { setBusy(null); }
  }

  const selectedCount = publishIds.size + removeIds.size;
  const canReview = authed && configProblems.length === 0 && selectedCount > 0 && busy === null;

  return (
    <div className="space-y-6" data-testid="global-publish-tab">
      <p className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300" data-testid="scope-global">
        <Globe2 size={14} aria-hidden /> Publishes for all users — everything here changes the shared question bank
      </p>

      <section className="card p-4 space-y-3" aria-label="GitHub repository">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>1 · Repository</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs">Owner<input className="input mt-1 w-full" value={config.owner} onChange={(e) => patch({ owner: e.target.value.trim() })} autoComplete="off" /></label>
          <label className="text-xs">Repository<input className="input mt-1 w-full" value={config.repo} onChange={(e) => patch({ repo: e.target.value.trim() })} autoComplete="off" /></label>
          <label className="text-xs">Branch<input className="input mt-1 w-full" value={config.branch} onChange={(e) => patch({ branch: e.target.value.trim() })} autoComplete="off" /></label>
          <label className="text-xs sm:col-span-1">Question-bank folder<input className="input mt-1 w-full" value={config.rootPath} onChange={(e) => patch({ rootPath: e.target.value.trim() })} autoComplete="off" /></label>
          <label className="text-xs sm:col-span-2">Manifest file<input className="input mt-1 w-full" value={config.manifestPath} onChange={(e) => patch({ manifestPath: e.target.value.trim() })} autoComplete="off" /></label>
        </div>
        {configProblems.length > 0 && config.owner !== '' && <ul className="text-xs text-red-600 dark:text-red-400" role="alert">{configProblems.map((p) => <li key={p}>{p}</li>)}</ul>}

        <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs flex items-start gap-2" style={{ color: 'var(--text-muted)' }}><ShieldAlert size={14} className="mt-0.5 flex-shrink-0" aria-hidden />
            Use a fine-grained token limited to this one repository with “Contents: Read and write” only, with an expiry. It is kept in memory for this session — never saved, never logged — and forgotten after 15 idle minutes. A browser-side token is visible to this session, so use a trusted device; this is not a shared production credential.</p>
          {authed ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400"><KeyRound size={14} aria-hidden />Token held in memory for this session</span>
              <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => { sessionAuth.clear(); setReview(null); setLive(null); }}>Forget token</button>
            </div>
          ) : (
            <form className="flex flex-col sm:flex-row gap-2" onSubmit={(e) => { e.preventDefault(); applyToken(); }}>
              <label className="flex-1 text-xs">GitHub token<input type="password" className="input mt-1 w-full" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} autoComplete="off" spellCheck={false} data-testid="token-input" /></label>
              <button type="submit" className="btn-primary px-4 py-2.5 text-sm sm:self-end" disabled={!tokenInput.trim()}>Use for this session</button>
            </form>
          )}
          <button type="button" className="btn-secondary px-4 py-2.5 text-sm disabled:opacity-50" disabled={!authed || configProblems.length > 0 || busy !== null} onClick={() => { void connect(); }}>{busy === 'connect' ? 'Connecting…' : 'Connect and load published tests'}</button>
        </div>
      </section>

      <section className="card p-4 space-y-3" aria-label="Choose what to publish">
        <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>2 · Choose</h3>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Publish tests imported on this device</p>
          {tests.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">No imported tests yet — import some in the Local Import tab first.</p> : (
            <ul>{tests.map((t) => (
              <li key={t.key}><label className="min-h-11 flex items-center gap-3 text-sm cursor-pointer"><input type="checkbox" checked={publishIds.has(t.id)} onChange={() => toggle(publishIds, t.id, setPublishIds)} aria-label={`Publish ${t.title}`} />
                <span className="min-w-0"><span className="block font-medium truncate" style={{ color: 'var(--text-primary)' }}>{t.title}</span><span className="block text-xs truncate" style={{ color: 'var(--text-muted)' }}>{subjectRegistry.getSubject(t.subjectId)?.name ?? t.subjectId} › {t.chapterTitle} · {t.questionCount} questions · id {t.id}</span></span></label></li>
            ))}</ul>
          )}
        </div>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Remove from the published bank</p>
          {!live ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Connect first to see what is published.</p>
            : live.tests.length === 0 ? <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">Nothing is published yet.</p>
            : <ul>{live.tests.map((m) => (
              <li key={m.id}><label className="min-h-11 flex items-center gap-3 text-sm cursor-pointer"><input type="checkbox" checked={removeIds.has(m.id)} onChange={() => toggle(removeIds, m.id, setRemoveIds)} aria-label={`Remove ${m.title} from the published bank`} />
                <span className="min-w-0"><span className="block font-medium truncate" style={{ color: 'var(--text-primary)' }}>{m.title}</span><span className="block text-xs" style={{ color: 'var(--text-muted)' }}>id {m.id} · v{m.version} · {m.questionCount} questions</span></span></label></li>
            ))}</ul>}
        </div>
        <button type="button" className="btn-primary px-5 py-3 disabled:opacity-50" disabled={!canReview} onClick={() => { void buildReview(); }}>{busy === 'review' ? 'Checking…' : 'Validate and review changes'}</button>
      </section>

      {error && (
        <div role="alert" className="card p-4 border border-red-300 dark:border-red-800" data-testid="publish-error">
          <p className="flex items-center gap-2 font-medium text-sm text-red-600 dark:text-red-400"><AlertCircle size={16} aria-hidden />{error.title}</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{error.detail}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Nothing is shown as published unless GitHub confirmed it.</p>
        </div>
      )}

      {review && (
        <section className="card p-4 space-y-3" aria-label="Review" data-testid="publish-review">
          <h3 className="font-display font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>3 · Review</h3>
          {review.problems.length > 0 && <ul role="alert" className="text-xs text-red-600 dark:text-red-400 space-y-1">{review.problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <DataTable caption="Files this publish will change" columns={rowColumns} rows={review.rows} rowKey={(r) => `${r.action}:${r.id}`} testId="table-publish-review" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>The manifest <code>{review.plan.manifestPath}</code> is updated in the same commit, on <b>{config.owner}/{config.repo}@{config.branch}</b>.</p>
          <label className="block text-xs">Commit message<input className="input mt-1 w-full" value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <button type="button" className="btn-primary px-5 py-3 disabled:opacity-50" disabled={review.problems.length > 0 || review.rows.length === 0 || busy !== null} onClick={() => setConfirmOpen(true)}>Publish for all users…</button>
        </section>
      )}

      {result && (
        <section className="card p-4" aria-label="Published" data-testid="publish-success">
          <p className="flex items-center gap-2 font-medium text-sm text-green-600 dark:text-green-400"><CheckCircle2 size={16} aria-hidden />GitHub confirmed the commit</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{result.published.length} published{result.deleted.length ? `, ${result.deleted.length} removed` : ''}; the manifest is updated.</p>
          <p className="text-sm mt-2">Commit <a className="font-mono text-brand-600 dark:text-brand-400 underline inline-flex items-center gap-1" href={result.commitUrl} target="_blank" rel="noopener noreferrer">{result.commitSha.slice(0, 7)}<ExternalLink size={12} aria-hidden /></a></p>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Learners receive it on their next sync, once the site serves the new files (after your host redeploys — or at once if the app is set to read from GitHub directly).</p>
        </section>
      )}

      <ConfirmDialog open={confirmOpen} title="Publish for all users?" confirmLabel="Publish" destructive busy={busy === 'publish'} onConfirm={() => { void doPublish(); }} onCancel={() => busy !== 'publish' && setConfirmOpen(false)}>
        <p>This commits {review?.tests.length ?? 0} test file{review?.tests.length === 1 ? '' : 's'}{review && review.deleteIds.length ? ` and removes ${review.deleteIds.length}` : ''}, plus the manifest, to <b>{config.owner}/{config.repo}@{config.branch}</b> in one commit. Everyone who syncs will receive it.</p>
      </ConfirmDialog>
    </div>
  );
}
