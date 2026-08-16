import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Zap, Calendar, Layers, Shuffle, Newspaper } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { loadQuizForDate, getFileName, getDisplayDate } from '../services/quizService';
import { useAvailableDates } from '../hooks/useAvailableDates';
import { formatDateKey } from '../utils';

// Current Affairs' own unique features (Daily quiz, Revision Calendar,
// Chapters, Mixed Revision) live here — contained as one subject's module,
// not spread across the app's Home page / navigation as if they defined
// the whole product (product-refactor §24-25, §69, §79, §104).

export default function CurrentAffairsHubPage() {
  const navigate = useNavigate();
  const { startSession, session, clearSession } = useQuizStore();
  const { availableSet } = useAvailableDates();
  const [isCreating, setIsCreating] = useState(false);

  const today = new Date();
  const todayFileName = getFileName(today);
  const todayDisplay = getDisplayDate(today);
  const todayKey = formatDateKey(today);
  const hasActiveSession = session && !session.isCompleted;

  async function handleDailyQuiz() {
    setIsCreating(true);
    try {
      const quiz = await loadQuizForDate(today);
      if (!quiz) {
        toast.error(`No quiz available for today (${todayDisplay})`, { duration: 4000 });
        navigate('/no-quiz-today');
        return;
      }
      if (hasActiveSession && session?.fileName === todayFileName) {
        if (window.confirm('You have an in-progress test for today. Resume it?')) {
          navigate('/quiz');
          return;
        }
        clearSession();
      }
      startSession(quiz, todayFileName);
      navigate('/quiz');
    } catch {
      toast.error("Failed to load today's quiz");
    } finally {
      setIsCreating(false);
    }
  }

  const items = [
    {
      title: 'Daily Quiz',
      description: `${todayDisplay} · ${availableSet.has(todayKey) ? 'Available' : 'No file today'}`,
      icon: Zap,
      color: '#6366f1',
      onClick: handleDailyQuiz,
      loading: isCreating,
    },
    {
      title: 'Revision Calendar',
      description: 'Daily & Monthly Magazine, browse by date',
      icon: Calendar,
      color: '#0ea5e9',
      onClick: () => navigate('/revision-calendar'),
    },
    {
      title: 'Chapters',
      description: 'Government Schemes · Sports · Awards · Science & more',
      icon: Layers,
      color: '#a855f7',
      onClick: () => navigate('/chapter-wise-current-affairs'),
    },
    {
      title: 'Mixed Revision',
      description: "Shuffled questions across everything you've studied",
      icon: Shuffle,
      color: '#22c55e',
      onClick: () => navigate('/mixed-revision'),
    },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Back">
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
          <Newspaper size={20} className="text-indigo-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>Current Affairs</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>One subject in your prep, with its own tools</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item, i) => (
          <motion.button
            key={item.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={item.onClick}
            disabled={item.loading}
            className="card p-4 text-left hover:shadow-md transition-shadow disabled:opacity-60"
          >
            <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `${item.color}18` }}>
              <item.icon size={16} style={{ color: item.color }} />
            </div>
            <p className="font-display font-semibold text-sm mb-0.5" style={{ color: 'var(--text-primary)' }}>
              {item.loading ? 'Loading…' : item.title}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.description}</p>
          </motion.button>
        ))}
      </div>

      <div className="card p-4">
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Also part of your Current Affairs prep, in the global Review area:</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate('/my-highlights')} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>My Highlights</button>
          <button onClick={() => navigate('/bookmarked-questions')} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Bookmarks</button>
          <button onClick={() => navigate('/wrong-questions')} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Wrong Questions</button>
          <button onClick={() => navigate('/danger-zone')} className="px-3 py-1.5 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>Danger Zone</button>
        </div>
      </div>
    </div>
  );
}
