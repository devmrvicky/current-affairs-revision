import { useNavigate } from 'react-router-dom';
import { ListChecks, Sparkles, Target, Database } from 'lucide-react';
import { DashboardCard } from '../common/StatCard';

/** Shortcuts to the four things learners do most. Question Bank opens the bank screen (stats, Sync now, and — for admins — import/publish). */
export function QuickActions() {
  const navigate = useNavigate();
  const actions = [
    { title: 'Practice by Topic', description: 'Choose subject, topic, difficulty & count', icon: Target, color: '#14b8a6', gradient: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, transparent 100%)', to: '/practice/configure' },
    { title: 'Mock Tests', description: 'Timed, negative marking, exam-standard', icon: ListChecks, color: '#a855f7', gradient: 'linear-gradient(135deg, rgba(168,85,247,0.08) 0%, transparent 100%)', to: '/mock-tests' },
    { title: 'Review Center', description: 'Wrong, doubtful, marked, weak topics & more', icon: Sparkles, color: '#6366f1', gradient: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, transparent 100%)', to: '/review-center' },
    { title: 'Question Bank', description: 'Available tests, sync and updates', icon: Database, color: '#0ea5e9', gradient: 'linear-gradient(135deg, rgba(14,165,233,0.08) 0%, transparent 100%)', to: '/question-bank' },
  ];
  return (
    <section aria-label="Quick actions" data-testid="home-quick-actions">
      <h2 className="text-base font-display font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Quick actions</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {actions.map(({ to, ...card }, i) => <DashboardCard key={card.title} {...card} delay={i * 0.04} onClick={() => navigate(to)} />)}
      </div>
    </section>
  );
}
