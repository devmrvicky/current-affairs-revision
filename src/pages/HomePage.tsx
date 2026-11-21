import { useEffect } from 'react';
import { useExamStore } from '../store/examStore';
import { getExam } from '../services/examService';
import { useStatisticsStore } from '../store/statsStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { PWAInstallBanner } from '../components/common/PWAComponents';
import { DailyGoalCard } from '../components/common/DailyGoalCard';
import { ResumeTestsSection } from '../components/home/ResumeTestsSection';
import { HomeHeader } from '../components/home/HomeHeader';
import { SubjectsGrid } from '../components/home/SubjectsGrid';
import { FavoriteChaptersCard } from '../components/home/FavoriteChaptersCard';
import { ContinueLearningCard } from '../components/home/ContinueLearningCard';
import { QuickActions } from '../components/home/QuickActions';
import { WeakTopicsCard } from '../components/home/WeakTopicsCard';
import { ReviewCountsCard } from '../components/home/ReviewCountsCard';
import { RecentAttemptsCard } from '../components/home/RecentAttemptsCard';
import { checkAndFireDueReminders, notifyStudyStreak } from '../services/notificationTriggers';

/**
 * Home: a balanced overview of the whole app — no subject dominates, and Current Affairs is simply one subject among the rest.
 *
 * Phone: one column, in this order — header · Resume Tests · Daily goal · Favorite chapters · Continue learning · Subjects · Quick actions ·
 * Weak topics · Review Center · Recent attempts.
 * Tablet/desktop: a main column (Resume Tests, Subjects, Quick actions) beside a side column (Daily goal, Favorites, Continue learning and
 * the snapshots). The two columns are `display: contents` on a phone, so `order-*` interleaves their cards into the single-column order above.
 * Each section loads, fails and empties on its own (see useAsyncSection / HomeCard), so one slow or broken section never blanks the page.
 */
export default function HomePage() {
  const { selectedExamId } = useExamStore();
  const selectedExam = getExam(selectedExamId);

  useEffect(() => {
    (async () => {
      await Promise.all([useStatisticsStore.getState().load(), useDailyGoalStore.getState().load()]);
      checkAndFireDueReminders();
      const freshStreak = useStatisticsStore.getState().stats?.currentStreak ?? 0;
      if (freshStreak > 0) notifyStudyStreak(freshStreak);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <HomeHeader examName={selectedExam?.name} />
      <PWAInstallBanner />

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3 lg:items-start" data-testid="home-layout">
        <div className="contents lg:block lg:col-span-2 lg:space-y-6 min-w-0" data-testid="home-main">
          <div className="order-1 lg:order-none min-w-0"><ResumeTestsSection /></div>
          <div className="order-4 lg:order-none min-w-0"><SubjectsGrid /></div>
          <div className="order-5 lg:order-none min-w-0"><QuickActions /></div>
        </div>
        <div className="contents lg:block lg:space-y-6 min-w-0" data-testid="home-side">
          <div className="order-2 lg:order-none min-w-0"><DailyGoalCard /></div>
          <div className="order-3 lg:order-none min-w-0"><FavoriteChaptersCard /></div>
          <div className="order-3 lg:order-none min-w-0"><ContinueLearningCard /></div>
          <div className="order-6 lg:order-none min-w-0"><WeakTopicsCard /></div>
          <div className="order-7 lg:order-none min-w-0"><ReviewCountsCard /></div>
          <div className="order-8 lg:order-none min-w-0"><RecentAttemptsCard /></div>
        </div>
      </div>
    </div>
  );
}
