import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';
import HomePage from '../pages/HomePage';
import QuizPage from '../pages/QuizPage';
import AnalysisPage from '../pages/AnalysisPage';
import HistoryPage from '../pages/HistoryPage';
import HistoryDetailPage from '../pages/HistoryDetailPage';
import StatisticsPage from '../pages/StatisticsPage';
import RevisionPage from '../pages/RevisionPage';
import RevisionCalendarPage from '../pages/RevisionCalendarPage';
import WrongQuestionsPage from '../pages/WrongQuestionsPage';
import ChapterWisePage from '../pages/ChapterWisePage';
import MixedRevisionPage from '../pages/MixedRevisionPage';
import BookmarkedQuestionsPage from '../pages/BookmarkedQuestionsPage';
import SettingsPage from '../pages/SettingsPage';
import NoQuizTodayPage from '../pages/NoQuizTodayPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:id', element: <HistoryDetailPage /> },
      { path: 'statistics', element: <StatisticsPage /> },
      { path: 'revision', element: <RevisionPage /> },
      { path: 'revision-calendar', element: <RevisionCalendarPage /> },
      { path: 'wrong-questions', element: <WrongQuestionsPage /> },
      { path: 'chapter-wise-current-affairs', element: <ChapterWisePage /> },
      { path: 'mixed-revision', element: <MixedRevisionPage /> },
      { path: 'bookmarked-questions', element: <BookmarkedQuestionsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'no-quiz-today', element: <NoQuizTodayPage /> },
      { path: 'analysis', element: <AnalysisPage /> },
    ],
  },
  { path: '/quiz', element: <QuizPage /> },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
