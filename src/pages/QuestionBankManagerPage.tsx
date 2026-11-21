import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Database, Lock } from 'lucide-react';
import { QuestionBankStats } from '../components/questionBank/QuestionBankStats';
import { LocalImportTab } from '../components/questionBank/LocalImportTab';
import { GlobalPublishTab } from '../components/questionBank/GlobalPublishTab';
import { useQuestionBankMetadata } from '../hooks/useQuestionBankMetadata';
import { useQuestionBankAccess } from '../hooks/useQuestionBankAccess';

type Tab = 'local' | 'global';
const TABS: { id: Tab; label: string; scope: string }[] = [
  { id: 'local', label: 'LOCAL IMPORT', scope: 'This device only' },
  { id: 'global', label: 'GLOBAL PUBLISH', scope: 'Publishes for all users' },
];

/**
 * Settings → Question Bank Manager. Two separate tabs so a local operation can never be mistaken for a global one.
 * The access check below only decides whether to SHOW this screen (client-side). Real protection is elsewhere — see useQuestionBankAccess.
 */
export default function QuestionBankManagerPage() {
  const { canManage } = useQuestionBankAccess();
  const { metadata, error } = useQuestionBankMetadata();
  const [tab, setTab] = useState<Tab>('local');

  if (!canManage) {
    return (
      <div className="card p-6 max-w-lg mx-auto text-center space-y-3" role="alert" data-testid="manager-locked">
        <Lock size={28} className="mx-auto text-brand-500" aria-hidden />
        <h1 className="font-display font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Administrators only</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>The Question Bank Manager is for people who maintain the question bank. You can still browse, sync and download tests from the Question Bank page.</p>
        <Link to="/question-bank" className="btn-primary inline-block px-5 py-2.5 text-sm">Open the Question Bank</Link>
      </div>
    );
  }

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    setTab((t) => (t === 'local' ? 'global' : 'local'));
  };

  return (
    <div className="space-y-6 pb-4">
      <header className="pt-2">
        <Link to="/settings" className="inline-flex items-center gap-1.5 min-h-11 text-sm text-brand-600 dark:text-brand-400"><ArrowLeft size={14} aria-hidden />Settings</Link>
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Database size={24} className="text-brand-500" aria-hidden />Question Bank Manager</h1>
      </header>

      {error ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">Couldn't read the question bank: {error}</p> : <QuestionBankStats metadata={metadata} />}

      <div role="tablist" aria-label="Question bank operations" className="grid grid-cols-2 gap-2" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} type="button" onClick={() => setTab(t.id)}
            className={`rounded-xl px-3 py-2.5 text-left min-h-11 border-2 transition-colors ${tab === t.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : ''}`} style={tab === t.id ? undefined : { borderColor: 'var(--border)' }}>
            <span className="block text-sm font-bold tracking-wide" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
            <span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.scope}</span>
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'local' ? <LocalImportTab /> : <GlobalPublishTab />}
      </div>
    </div>
  );
}
