import type { QuestionBankMetadata } from '../../services/questionBank/repository';

/** The bank's headline numbers. "This device" vs "everyone" is spelled out, so nobody confuses imported and published. */
export function QuestionBankStats({ metadata }: { metadata: QuestionBankMetadata | null }) {
  const tiles: { id: string; label: string; value: string; hint?: string }[] = metadata
    ? [
        { id: 'bundled', label: 'Bundled tests', value: String(metadata.bundledTests), hint: 'ship with the app' },
        { id: 'local', label: 'Imported tests', value: String(metadata.localTests), hint: 'this device only' },
        { id: 'remote', label: 'Published tests', value: String(metadata.remoteAvailable), hint: `${metadata.remoteInstalled} downloaded here` },
        { id: 'questions', label: 'Local questions', value: String(metadata.localQuestions), hint: 'imported here' },
        { id: 'sync', label: 'Last successful sync', value: metadata.lastSyncAt ? new Date(metadata.lastSyncAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : 'Never' },
      ]
    : [];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="qb-stats" aria-busy={!metadata}>
      {metadata
        ? tiles.map((t) => (
            <div key={t.id} className="card p-3" data-testid={`qb-stat-${t.id}`}>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{t.label}</p>
              <p className="text-xl font-display font-bold mt-0.5 tabular-nums" style={{ color: 'var(--text-primary)' }}>{t.value}</p>
              {t.hint && <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.hint}</p>}
            </div>
          ))
        : Array.from({ length: 5 }, (_, i) => <div key={i} className="card h-[76px] shimmer" />)}
    </div>
  );
}
