import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { subjectRegistry } from '../../data/registry/subjectRegistry';
import type { ImportPreview } from '../../services/questionBank/importPipeline';
import type { FileIssue, TestFileMeta } from '../../services/questionBank/testFile';

const where = (i: FileIssue) => (i.line !== undefined ? `Line ${i.line}${i.column !== undefined ? `, column ${i.column}` : ''}: ` : '');
const NEEDS_DETAILS = new Set(['missing-test-id', 'bad-test-id', 'missing-title', 'missing-subject', 'unknown-subject', 'missing-chapter']);

interface Props {
  preview: ImportPreview;
  overrides: Partial<TestFileMeta> | undefined;
  /** Only files the learner added themselves can be edited/removed (an export bundle's inner tests can't). */
  editable: boolean;
  onRemove: () => void;
  onOverrides: (o: Partial<TestFileMeta>) => void;
}

export function ImportPreviewCard({ preview, overrides, editable, onRemove, onOverrides }: Props) {
  const m = preview.parsed.meta;
  const d = preview.parsed.difficulty;
  const needsDetails = editable && preview.errors.some((e) => NEEDS_DETAILS.has(e.code));
  const subjects = subjectRegistry.getAllSubjects();

  return (
    <li className="card p-4" data-testid="import-preview" data-valid={preview.valid}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }} title={preview.fileName}>{preview.fileName}</p>
          <p className={`text-xs inline-flex items-center gap-1 mt-0.5 font-medium ${preview.valid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {preview.valid ? <CheckCircle2 size={13} aria-hidden /> : <AlertCircle size={13} aria-hidden />}
            {preview.valid ? 'Ready to import' : `Has ${preview.errors.length} error${preview.errors.length === 1 ? '' : 's'} — fix before importing`}
          </p>
        </div>
        {editable && <button type="button" onClick={onRemove} aria-label={`Remove ${preview.fileName}`} className="w-11 h-11 -m-2 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0"><X size={16} aria-hidden /></button>}
      </div>

      {m && (
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 mt-3 text-xs">
          {[
            ['Title', m.title], ['Test id', m.id], ['Subject', subjectRegistry.getSubject(m.subjectId)?.name ?? m.subjectId], ['Chapter', m.chapterTitle],
            ['Questions', String(preview.parsed.questionCount)],
            ['Difficulty', `${d.easy} easy · ${d.medium} medium · ${d.hard} hard${d.unspecified ? ` · ${d.unspecified} unset` : ''}`],
            ['Duplicates', `${preview.parsed.duplicateIdsInFile.length} in file · ${preview.duplicateQuestionIds.length} already in this test`],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt style={{ color: 'var(--text-muted)' }}>{k}</dt><dd className="font-medium truncate" style={{ color: 'var(--text-primary)' }} title={v}>{v}</dd></div>
          ))}
        </dl>
      )}

      {needsDetails && (
        <fieldset className="mt-3 grid gap-2 sm:grid-cols-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <legend className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>This file doesn't say which test it is — fill it in</legend>
          <label className="text-xs">Test id<input className="input mt-1 w-full" value={overrides?.id ?? m?.id ?? ''} onChange={(e) => onOverrides({ ...overrides, id: e.target.value })} /></label>
          <label className="text-xs">Title<input className="input mt-1 w-full" value={overrides?.title ?? m?.title ?? ''} onChange={(e) => onOverrides({ ...overrides, title: e.target.value })} /></label>
          <label className="text-xs">Subject
            <select className="input mt-1 w-full" value={overrides?.subjectId ?? m?.subjectId ?? ''} onChange={(e) => onOverrides({ ...overrides, subjectId: e.target.value })}>
              <option value="">Choose a subject…</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs">Chapter<input className="input mt-1 w-full" value={overrides?.chapterTitle ?? m?.chapterTitle ?? ''} onChange={(e) => onOverrides({ ...overrides, chapterTitle: e.target.value, chapterId: undefined })} /></label>
        </fieldset>
      )}

      {preview.errors.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-red-600 dark:text-red-400" role="alert" aria-label={`Errors in ${preview.fileName}`}>
          {preview.errors.map((e, i) => <li key={i} className="flex gap-1.5"><AlertCircle size={13} className="mt-0.5 flex-shrink-0" aria-hidden /><span><b>{where(e)}</b>{e.message}</span></li>)}
        </ul>
      )}
      {preview.warnings.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-600 dark:text-amber-400" aria-label={`Warnings for ${preview.fileName}`}>
          {preview.warnings.map((e, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={13} className="mt-0.5 flex-shrink-0" aria-hidden /><span><b>{where(e)}</b>{e.message}</span></li>)}
        </ul>
      )}
    </li>
  );
}
