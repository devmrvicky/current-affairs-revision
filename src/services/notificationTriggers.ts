// Centralizes every notification category from the spec into one place.
//
// Scope, honestly: everything in this file fires from data that's already
// on-device (IndexedDB) — it only works while the app is open/foregrounded.
// That covers most of these categories perfectly well, since the triggering
// event (finishing a test, completing a chapter, hitting a streak) only
// ever happens while the app is open anyway.
//
// The exceptions are the few that genuinely need to reach a *closed* app —
// daily reminders, "missed revision", "long time no study" — which also
// have a server-side equivalent in supabase/functions/send-scheduled-
// notifications, built only from data that's actually synced to Supabase
// (saved_tests). The rest of these categories rely on stats/streaks that
// are local-only by design in this app, so a truly closed-app version of
// them would need those to be synced too — not done here, see README.
import { useNotificationStore } from '../store/notificationStore';
import { useHistoryStore } from '../store/historyStore';
import { useStatisticsStore } from '../store/statsStore';
import { useWrongQuestionsStore } from '../store/wrongQuestionsStore';
import { useDailyGoalStore } from '../store/dailyGoalStore';
import { useReaderStore } from '../store/readerStore';
import { useQuizStore } from '../store/quizStore';
import { getChapterList } from './chapterRepository';
import { lsGet, lsSet, formatDateKey } from '../utils';
import type { NotificationCategorySettings } from '../types';

function notify(category: keyof NotificationCategorySettings, title: string, body: string, url = '/', tag?: string) {
  const store = useNotificationStore.getState();
  if (!store.canNotify(category)) return;
  store.showLocalNotification(title, body, url, tag ?? category);
}

/** Has it been at least `days` since the timestamp stored under `key`? Updates the stamp if so. */
function dueSince(key: string, days: number): boolean {
  const last = lsGet<number>(key, 0);
  const due = Date.now() - last >= days * 24 * 60 * 60 * 1000;
  if (due) lsSet(key, Date.now());
  return due;
}

function alreadyFiredToday(key: string): boolean {
  const todayKey = formatDateKey(new Date());
  if (lsGet<string>(key, '') === todayKey) return true;
  lsSet(key, todayKey);
  return false;
}

// ─── Immediate, event-driven triggers (call these right where the event happens) ──

export function notifyTestCompleted(scorePercent: number, correct: number, total: number) {
  notify('testCompleted', 'Test completed', `You scored ${scorePercent}% (${correct}/${total}). Tap to review.`, '/analysis');
}

export function notifyChapterCompleted(chapterName: string) {
  const key = `notif:chapterCompleted:${chapterName}`;
  if (lsGet(key, false)) return;
  lsSet(key, true);
  notify('chapterCompleted', 'Chapter completed! 🎉', `You've finished every test in "${chapterName}".`, `/chapter/${encodeURIComponent(chapterName)}`);
}

const STREAK_MILESTONES = [3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 365];
export function notifyStudyStreak(streakDays: number) {
  if (!STREAK_MILESTONES.includes(streakDays)) return;
  const key = 'notif:streakMilestone';
  if (lsGet<number>(key, 0) >= streakDays) return;
  lsSet(key, streakDays);
  notify('studyStreak', `${streakDays}-day streak! 🔥`, `You've revised for ${streakDays} days in a row. Keep it going!`);
}

export function notifyAchievementUnlocked(label: string, description: string) {
  const key = `notif:achievement:${label}`;
  if (lsGet(key, false)) return;
  lsSet(key, true);
  notify('achievementUnlocked', `Achievement unlocked: ${label} 🏆`, description, '/statistics');
}

const TEST_COUNT_MILESTONES = [10, 25, 50, 100, 250, 500];

/** Checks a small set of concrete, derivable-today milestones. Call after a test is saved. */
export function checkAchievements(totalTests: number, averageAccuracy: number, latestTestAccuracy: number) {
  if (totalTests === 1) notifyAchievementUnlocked('First Steps', "You've completed your first test.");
  if (latestTestAccuracy === 100) notifyAchievementUnlocked('Perfect Score', 'You answered every question correctly in a test.');
  if (TEST_COUNT_MILESTONES.includes(totalTests)) {
    notifyAchievementUnlocked(`${totalTests} Tests`, `You've completed ${totalTests} tests. Consistency pays off!`);
  }
  if (totalTests >= 10 && averageAccuracy >= 90) notifyAchievementUnlocked('90% Club', 'Your average accuracy is above 90% across all tests.');
}

export function notifyWrongQuestionReviewDue(activeCount: number, threshold = 10) {
  if (activeCount < threshold) return;
  if (alreadyFiredToday('notif:lastShown:wrongQuestionReview')) return;
  notify('wrongQuestionReview', 'Time to review wrong answers', `You have ${activeCount} questions waiting for review.`, '/wrong-questions');
}

export function notifyRevisionTargetCompleted(target: number) {
  if (alreadyFiredToday('notif:lastShown:revisionTarget')) return;
  notify('revisionTargetCompleted', 'Daily goal completed! ✅', `You've hit your target of ${target} questions today.`);
}

/** Compares the current chapter list against what's been seen before; fires once per newly-added chapter. */
export function checkNewChapters() {
  const known = lsGet<string[]>('notif:knownChapters', []);
  const knownSet = new Set(known);
  const current = getChapterList().map((c) => c.chapterName);
  const newOnes = current.filter((name) => !knownSet.has(name));
  lsSet('notif:knownChapters', current);
  if (known.length === 0 || newOnes.length === 0) return; // first-ever load: just seed the list, don't spam
  const store = useNotificationStore.getState();
  if (!store.canNotify('newChapterAdded')) return;
  if (newOnes.length === 1) {
    store.showLocalNotification('New chapter added 📚', `"${newOnes[0]}" is now available to revise.`, `/chapter/${encodeURIComponent(newOnes[0])}`, 'newChapterAdded');
  } else {
    store.showLocalNotification('New chapters added 📚', `${newOnes.length} new chapters are now available to revise.`, '/chapter-wise-current-affairs', 'newChapterAdded');
  }
}

// ─── Consolidated "on app open" check for the remaining, time/inactivity-based categories ──

export function checkAndFireDueReminders() {
  const { categories } = useNotificationStore.getState().settings;
  const reminderTime = useNotificationStore.getState().settings.reminderTime;
  const now = new Date();
  const [rh, rm] = reminderTime.split(':').map(Number);
  const pastReminderTime = now.getHours() * 60 + now.getMinutes() >= (rh || 0) * 60 + (rm || 0);

  const { tests } = useHistoryStore.getState();
  const todayKey = formatDateKey(now);
  const doneToday = tests.some((t) => t.date === todayKey && !t.isRevision);

  // Daily Quiz / Revision Reminder — only after the configured time, only once a day, only if not already done.
  if (pastReminderTime && !doneToday && !alreadyFiredToday('notif:lastShown:dailyReminder')) {
    if (categories.dailyQuizReminder) {
      notify('dailyQuizReminder', "Today's quiz is waiting", "You haven't completed today's current affairs quiz yet.", '/');
    } else if (categories.dailyRevisionReminder) {
      notify('dailyRevisionReminder', 'Revision reminder', "Don't forget today's revision.", '/');
    }
  }

  // Missed Revision — yesterday had content but nothing was attempted.
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDateKey(yesterday);
  const missedYesterday = !tests.some((t) => t.date === yesterdayKey);
  if (missedYesterday && dueSince('notif:lastShown:missedRevision', 1)) {
    notify('missedRevision', "You missed yesterday's revision", 'Catch up whenever you have a few minutes today.', '/');
  }

  // Long Time No Study — most recent activity is more than 3 days ago.
  const mostRecent = tests.reduce((max, t) => (t.date > max ? t.date : max), '');
  if (mostRecent) {
    const daysSince = Math.floor((now.getTime() - new Date(mostRecent + 'T00:00:00').getTime()) / 86400000);
    if (daysSince >= 3 && dueSince('notif:lastShown:longTimeNoStudy', 7)) {
      notify('longTimeNoStudy', "It's been a while", `It's been ${daysSince} days since your last revision. Jump back in?`, '/');
    }
  }

  // Continue Reading Reminder — there's unfinished reading progress.
  const continueReading = useReaderStore.getState().getContinueReading();
  if (continueReading.length > 0 && dueSince('notif:lastShown:continueReading', 1)) {
    const top = continueReading[0];
    notify('continueReadingReminder', 'Pick up where you left off', `Continue reading "${top.chapterId}" — you're ${top.scrollPercent}% through.`, `/chapter/${encodeURIComponent(top.chapterId)}`);
  }

  // Incomplete Test / Resume Previous Test — an in-progress session exists.
  const session = useQuizStore.getState().session;
  if (session && !session.isCompleted && dueSince('notif:lastShown:resumeTest', 1)) {
    const answered = session.attempts.filter((a) => a.status !== 'unanswered').length;
    notify('resumePreviousTest', 'Resume your test', `You're partway through a test (${answered}/${session.totalQuestions} answered).`, '/quiz', 'resumePreviousTest');
  }

  // Revision Target Completed — daily goal hit today, not yet announced.
  const goal = useDailyGoalStore.getState().goal;
  if (goal && goal.questionsToday >= goal.target && goal.target > 0) {
    notifyRevisionTargetCompleted(goal.target);
  }

  // Weekly Progress — once every 7 days, a quick highlight.
  if (categories.weeklyProgress && dueSince('notif:lastShown:weeklyProgress', 7)) {
    const stats = useStatisticsStore.getState().stats;
    if (stats && stats.totalTests > 0) {
      notify('weeklyProgress', 'Your weekly progress', `${stats.totalTests} tests so far, ${stats.averageAccuracy}% average accuracy. Keep it up!`, '/weekly-report');
    }
  }

  // Monthly Summary — once every 30 days, a lightweight recap from recent history
  // (not the same precise window as the Weekly Report page — this is a quick nudge, not a report).
  if (categories.monthlySummary && dueSince('notif:lastShown:monthlySummary', 30)) {
    const monthAgo = now.getTime() - 30 * 86400000;
    const recent = tests.filter((t) => new Date(t.date + 'T00:00:00').getTime() >= monthAgo);
    if (recent.length > 0) {
      notify('monthlySummary', 'Your monthly summary', `You completed ${recent.length} tests in the last 30 days. Tap to see the full breakdown.`, '/statistics');
    }
  }

  // Wrong Question Review Reminder
  const activeWrong = useWrongQuestionsStore.getState().getActive().length;
  notifyWrongQuestionReviewDue(activeWrong);

  checkNewChapters();
}
