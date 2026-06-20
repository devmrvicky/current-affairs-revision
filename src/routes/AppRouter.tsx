import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

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
const MyHighlightsPage      = lazy(() => import('../pages/MyHighlightsPage'));
const MixedRevisionPage     = lazy(() => import('../pages/MixedRevisionPage'));
const BookmarkedQuestionsPage = lazy(() => import('../pages/BookmarkedQuestionsPage'));
const DangerZonePage        = lazy(() => import('../pages/DangerZonePage'));
const WeeklyReportPage      = lazy(() => import('../pages/WeeklyReportPage'));
const SettingsPage          = lazy(() => import('../pages/SettingsPage'));
const NoQuizTodayPage       = lazy(() => import('../pages/NoQuizTodayPage'));

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
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
      { path: 'my-highlights',                element: <S><MyHighlightsPage /></S> },
      { path: 'mixed-revision',               element: <S><MixedRevisionPage /></S> },
      { path: 'bookmarked-questions',         element: <S><BookmarkedQuestionsPage /></S> },
      { path: 'danger-zone',                  element: <S><DangerZonePage /></S> },
      { path: 'weekly-report',               element: <S><WeeklyReportPage /></S> },
      { path: 'settings',                     element: <S><SettingsPage /></S> },
      { path: 'no-quiz-today',                element: <S><NoQuizTodayPage /></S> },
      { path: 'analysis',                     element: <S><AnalysisPage /></S> },
  {
    path: '/quiz',
    element: <S><QuizPage /></S>,
  },
{ path: '*',                     element: <S><HomePage /></S> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
