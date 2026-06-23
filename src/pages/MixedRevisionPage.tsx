import { useState, useMemo, useEffect, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Layers, CheckSquare, Square, ArrowLeft, Shuffle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuizStore } from '../store/quizStore';
import { getChapterList, getChapterTotalQuestions, loadMixedChapters } from '../services/chapterRepository';

const CHAPTER_EMOJIS: Record<string, string> = {
  'Government Schemes': '🏛️',
  'International Organizations': '🌐',
  'Sports': '🏆',
  'Awards': '🥇',
  'Science and Technology': '🔬',
  'Books and Authors': '📚',
  'Budget': '💰',
  'Economy': '📈',
};

interface ChapterSelectCardProps {
  chapterName: string;
  testCount: number;
  questionCount: number;
  selected: boolean;
  onToggle: (chapterName: string) => void;
}

const ChapterSelectCard = memo(function ChapterSelectCard({
  chapterName, testCount, questionCount, selected, onToggle
}: ChapterSelectCardProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => onToggle(chapterName)}
      className={`w-full p-4 rounded-2xl border-2 text-left transition-all duration-150 flex items-center gap-3 ${
        selected
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-[var(--border)] hover:border-brand-300 dark:hover:border-brand-700'
      }`}
      style={{ background: selected ? undefined : 'var(--card)' }}
    >
      <div className="text-2xl">{CHAPTER_EMOJIS[chapterName] ?? '📖'}</div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm ${selected ? 'text-brand-700 dark:text-brand-300' : ''}`}
          style={!selected ? { color: 'var(--text-primary)' } : undefined}>
          {chapterName}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {testCount} test{testCount !== 1 ? 's' : ''} · {questionCount > 0 ? `${questionCount} questions` : 'Loading…'}
        </p>
      </div>
      <div className={`flex-shrink-0 ${selected ? 'text-brand-500' : ''}`}
        style={!selected ? { color: 'var(--text-muted)' } : undefined}>
        {selected ? <CheckSquare size={20} /> : <Square size={20} />}
      </div>
    </motion.button>
  );
});

export default function MixedRevisionPage() {
  const navigate = useNavigate();
  const { startSession } = useQuizStore();
  const allChapters = useMemo(() => getChapterList(), []);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    allChapters.forEach(async (chapter) => {
      const count = await getChapterTotalQuestions(chapter.chapterName);
      setQuestionCounts((prev) => ({ ...prev, [chapter.chapterName]: count }));
    });
  }, [allChapters]);

  function toggleChapter(chapterName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chapterName)) next.delete(chapterName);
      else next.add(chapterName);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(allChapters.map((c) => c.chapterName)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  const totalSelected = selected.size;
  const totalQuestions = [...selected].reduce((sum, name) => sum + (questionCounts[name] ?? 0), 0);

  async function handleStart() {
    if (selected.size === 0) {
      toast.error('Please select at least one chapter');
      return;
    }
    setIsStarting(true);
    try {
      const quiz = await loadMixedChapters([...selected]);
      if (!quiz || quiz.questions.length === 0) {
        toast.error('Failed to load selected chapters');
        return;
      }
      // Shuffle questions
      const shuffled = [...quiz.questions].sort(() => Math.random() - 0.5)
        .map((q, i) => ({ ...q, id: i + 1 }));
      startSession({ ...quiz, questions: shuffled }, `mixed_${Date.now()}.json`);
      navigate('/quiz');
    } catch {
      toast.error('Failed to create mixed quiz');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/chapter-wise-current-affairs')}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={18} style={{ color: 'var(--text-secondary)' }} />
        </button>
        <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
          <Layers size={20} className="text-purple-500" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold" style={{ color: 'var(--text-primary)' }}>
            Mixed Revision
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Select chapters to combine into one quiz
          </p>
        </div>
      </div>

      {/* Selection controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          {totalSelected} of {allChapters.length} chapters selected
          {totalQuestions > 0 && ` • ${totalQuestions} questions`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20"
          >
            All
          </button>
          <button
            onClick={clearAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            style={{ color: 'var(--text-secondary)' }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Chapter selection cards */}
      <div className="space-y-2">
        {allChapters.map((chapter) => (
          <ChapterSelectCard
            key={chapter.chapterName}
            chapterName={chapter.chapterName}
            testCount={chapter.tests.length}
            questionCount={questionCounts[chapter.chapterName] ?? 0}
            selected={selected.has(chapter.chapterName)}
            onToggle={toggleChapter}
          />
        ))}
      </div>

      {/* Start button — sticky */}
      <div className="sticky bottom-20 md:bottom-4">
        <motion.button
          whileHover={totalSelected > 0 ? { scale: 1.01 } : {}}
          whileTap={totalSelected > 0 ? { scale: 0.98 } : {}}
          onClick={handleStart}
          disabled={totalSelected === 0 || isStarting}
          className="w-full btn-primary flex items-center justify-center gap-3 py-4 text-base"
        >
          {isStarting ? (
            <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Shuffle size={18} />
              {totalSelected === 0
                ? 'Select chapters to start'
                : `Start Mixed Quiz (${totalQuestions} questions)`
              }
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
