import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import RouteErrorBoundary from '../components/common/RouteErrorBoundary';

// ─── Skeleton fallback ────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="space-y-4 pt-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="card h-24 shimmer" style={{ background: 'var(--border)' }} />
      ))}
    </div>
  );
}

// ─── Lazy pages ───────────────────────────────────────────────────────────────
const HomePage              = lazy(() => import('../pages/HomePage'));
const QuizPage              = lazy(() => import('../pages/QuizPage'));
const AnalysisPage          = lazy(() => import('../pages/AnalysisPage'));
const HistoryPage           = lazy(() => import('../pages/HistoryPage'));
const HistoryDetailPage     = lazy(() => import('../pages/HistoryDetailPage'));
const StatisticsPage        = lazy(() => import('../pages/StatisticsPage'));
const RevisionPage          = lazy(() => import('../pages/RevisionPage'));
const RevisionCalendarPage  = lazy(() => import('../pages/RevisionCalendarPage'));
const WrongQuestionsPage    = lazy(() => import('../pages/WrongQuestionsPage'));
const ChapterWisePage       = lazy(() => import('../pages/ChapterWisePage'));
const ChapterDetailPage     = lazy(() => import('../pages/ChapterDetailPage'));
const MonthlyMagazineDetailPage = lazy(() => import('../pages/MonthlyMagazineDetailPage'));
const MyHighlightsPage      = lazy(() => import('../pages/MyHighlightsPage'));
const MixedRevisionPage     = lazy(() => import('../pages/MixedRevisionPage'));
const BookmarkedQuestionsPage = lazy(() => import('../pages/BookmarkedQuestionsPage'));
const ReviewCenterPage      = lazy(() => import('../pages/ReviewCenterPage'));
const DangerZonePage        = lazy(() => import('../pages/DangerZonePage'));
const WeeklyReportPage      = lazy(() => import('../pages/WeeklyReportPage'));
const SettingsPage          = lazy(() => import('../pages/SettingsPage'));
const NoQuizTodayPage       = lazy(() => import('../pages/NoQuizTodayPage'));
const NotFoundPage          = lazy(() => import('../pages/NotFoundPage'));
const AdminDashboardPage    = lazy(() => import('../pages/AdminDashboardPage'));
const AuthCallbackPage      = lazy(() => import('../pages/AuthCallbackPage'));
const ExamSelectionPage     = lazy(() => import('../pages/ExamSelectionPage'));
const PracticeConfigurePage = lazy(() => import('../pages/PracticeConfigurePage'));
const TestConfigurePage     = lazy(() => import('../pages/TestConfigurePage'));
const TestResultPage        = lazy(() => import('../pages/TestResultPage'));
const TestReviewPage        = lazy(() => import('../pages/TestReviewPage'));
const UniversalSessionPage  = lazy(() => import('../pages/UniversalSessionPage'));
const UniversalResultPage   = lazy(() => import('../pages/UniversalResultPage'));
const UniversalReviewPage   = lazy(() => import('../pages/UniversalReviewPage'));

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true,                          element: <S><HomePage /></S> },
      { path: 'history',                      element: <S><HistoryPage /></S> },
      { path: 'history/:id',                  element: <S><HistoryDetailPage /></S> },
      { path: 'statistics',                   element: <S><StatisticsPage /></S> },
      { path: 'revision',                     element: <S><RevisionPage /></S> },
      { path: 'revision-calendar',            element: <S><RevisionCalendarPage /></S> },
      { path: 'wrong-questions',              element: <S><WrongQuestionsPage /></S> },
      { path: 'chapter-wise-current-affairs', element: <S><ChapterWisePage /></S> },
      { path: 'chapter/:chapterName',         element: <S><ChapterDetailPage /></S> },
      { path: 'monthly-magazine/:issueKey',   element: <S><MonthlyMagazineDetailPage /></S> },
      { path: 'my-highlights',                element: <S><MyHighlightsPage /></S> },
      { path: 'mixed-revision',               element: <S><MixedRevisionPage /></S> },
      { path: 'bookmarked-questions',         element: <S><BookmarkedQuestionsPage /></S> },
      { path: 'review-center',                element: <S><ReviewCenterPage /></S> },
      { path: 'danger-zone',                  element: <S><DangerZonePage /></S> },
      { path: 'weekly-report',               element: <S><WeeklyReportPage /></S> },
      { path: 'settings',                     element: <S><SettingsPage /></S> },
      { path: 'no-quiz-today',                element: <S><NoQuizTodayPage /></S> },
      { path: 'analysis',                     element: <S><AnalysisPage /></S> },
      { path: 'admin',                        element: <S><AdminDashboardPage /></S> },
      { path: 'exams',                        element: <S><ExamSelectionPage /></S> },
      { path: 'practice/configure',           element: <S><PracticeConfigurePage /></S> },
      { path: 'tests/configure',              element: <S><TestConfigurePage /></S> },
      { path: 'tests/result',                 element: <S><TestResultPage /></S> },
      { path: 'tests/result/review',          element: <S><TestReviewPage /></S> },
      { path: 'session',                      element: <S><UniversalSessionPage /></S> },
      { path: 'session/result',               element: <S><UniversalResultPage /></S> },
      { path: 'session/result/review',        element: <S><UniversalReviewPage /></S> },
      { path: 'auth/callback',                element: <S><AuthCallbackPage /></S> },
      // Catch-all for any unmatched route under '/' — keeps header/nav chrome.
      { path: '*',                            element: <S><NotFoundPage /></S> },
    ],
  },
  {
    path: '/quiz',
    element: <S><QuizPage /></S>,
    errorElement: <RouteErrorBoundary />,
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
