import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { getMockSourceDiagnostics, type MockSourceDiagnosticEntry } from '../services/mockSourceRegistry';

/**
 * "Mock Content Diagnostics" — one entry per discovered src/data/*\/mocks/*.json
 * file, ok or error, every warning surfaced. Exists so adding a new mock file
 * is a fast, self-service loop (save file → check this page → fix →
 * reload) instead of guessing why a mock silently doesn't show up.
 * Content is genuinely dev-only: production builds show a short notice
 * instead of internal file paths and validation internals.
 */
export default function MockDiagnosticsPage() {
  const [entries, setEntries] = useState<MockSourceDiagnosticEntry[] | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    getMockSourceDiagnostics().then(setEntries);
  }, []);

  if (!import.meta.env.DEV) {
    return (
      <div className="max-w-lg mx-auto pt-16 text-center px-4">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Mock content diagnostics are only available in development.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pt-4 pb-10 space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Mock Content Diagnostics</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Every file discovered under <code>src/data/**/mocks/*.json</code>, and why it did or didn't load.</p>
      </div>

      {!entries ? (
        <div className="card h-32 shimmer" style={{ background: 'var(--border)' }} />
      ) : entries.length === 0 ? (
        <div className="card p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No mock files found yet.</div>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => (
            <div key={e.filePath} className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                {e.status === 'ok' ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                <span className="font-mono text-xs sm:text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{e.fileName}.json</span>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>({e.examId})</span>
              </div>

              {e.status === 'ok' ? (
                <div className="text-xs space-y-0.5 pl-6" style={{ color: 'var(--text-secondary)' }}>
                  <p>✓ {e.questionCount} questions</p>
                  <p>✓ {e.sectionSummaries?.length} sections</p>
                  {e.sectionSummaries?.map((s) => <p key={s.title}>✓ {s.questionCount} {s.title}</p>)}
                </div>
              ) : (
                <div className="text-xs pl-6" style={{ color: '#ef4444' }}>
                  {e.errors.map((err, i) => <p key={i}>✗ {err}</p>)}
                </div>
              )}

              {e.warnings.length > 0 && (
                <div className="text-xs pl-6 mt-1.5 space-y-0.5" style={{ color: '#b45309' }}>
                  {e.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1"><AlertTriangle size={11} className="flex-shrink-0 mt-0.5" /> {w}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
