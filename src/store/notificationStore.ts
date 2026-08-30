import { create } from 'zustand';
import type { NotificationSettings, NotificationCategorySettings } from '../types';
import { notificationSettingsDB } from '../services/db';
import { subscribeToPush, syncPushPreferencesIfSubscribed } from '../services/pushService';

// ─── FCM Setup (legacy/optional) ───────────────────────────────────────────────
// Kept for backward compatibility with any existing Firebase setup. The
// primary, no-Firebase-required path is now standard Web Push — see
// services/pushService.ts. Firebase is loaded lazily and is entirely
// optional; nothing breaks if it isn't configured.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
const FCM_ENABLED = !!import.meta.env.VITE_FIREBASE_API_KEY;

interface NotificationStore {
  settings: NotificationSettings;
  permissionState: NotificationPermission | 'loading' | 'unsupported';
  isLoading: boolean;

  load: () => Promise<void>;
  save: (patch: Partial<NotificationSettings>) => Promise<void>;
  setCategory: (key: keyof NotificationCategorySettings, value: boolean) => Promise<void>;
  requestPermission: () => Promise<boolean>;
  getPermissionState: () => NotificationPermission | 'unsupported';

  /** True if the current local time falls within the configured quiet hours window. */
  isQuietHoursNow: () => boolean;
  /** True if this category may notify right now: master switch on, category on, not in quiet hours. */
  canNotify: (key: keyof NotificationCategorySettings) => boolean;

  scheduleLocalReminder: (message: string, delayMs: number) => void;
  showLocalNotification: (title: string, body: string, url?: string, tag?: string) => void;
}

/** Handles the 22:00–07:00 style overnight wraparound correctly. */
function isTimeWithinWindow(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes; // wraps past midnight
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  settings: {
    enabled: false,
    categories: {
      dailyRevisionReminder: true, dailyQuizReminder: true, studyStreak: true, weeklyProgress: true,
      revisionTargetCompleted: true, chapterCompleted: true, testCompleted: false, wrongQuestionReview: true,
      newChapterAdded: true, continueReadingReminder: true, incompleteTestReminder: true, resumePreviousTest: true,
      achievementUnlocked: true, monthlySummary: true, missedRevision: true, longTimeNoStudy: true,
    },
    reminderTime: '09:00',
    quietHoursEnabled: true,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
    soundEnabled: true,
    vibrationEnabled: true,
    deviceId: '',
  },
  permissionState: 'loading',
  isLoading: false,

  load: async () => {
    set({ isLoading: true });
    try {
      const settings = await notificationSettingsDB.get();
      const permission = 'Notification' in window
        ? Notification.permission
        : 'unsupported' as const;
      set({ settings, permissionState: permission });
    } finally {
      set({ isLoading: false });
    }
  },

  save: async (patch) => {
    const updated = { ...get().settings, ...patch };
    set({ settings: updated });
    await notificationSettingsDB.save(updated);
    void syncPushPreferencesIfSubscribed(updated);
  },

  setCategory: async (key, value) => {
    const updated = { ...get().settings, categories: { ...get().settings.categories, [key]: value } };
    set({ settings: updated });
    await notificationSettingsDB.save(updated);
    void syncPushPreferencesIfSubscribed(updated);
  },

  requestPermission: async () => {
    if (!('Notification' in window)) {
      set({ permissionState: 'unsupported' });
      return false;
    }

    if (Notification.permission === 'granted') {
      set({ permissionState: 'granted' });
      await get().save({ enabled: true });
      await subscribeToPush(get().settings, get().save);
      if (FCM_ENABLED) await tryGetFCMToken(get().save);
      return true;
    }

    if (Notification.permission === 'denied') {
      set({ permissionState: 'denied' });
      return false;
    }

    const result = await Notification.requestPermission();
    set({ permissionState: result });

    if (result === 'granted') {
      await get().save({ enabled: true });
      await subscribeToPush(get().settings, get().save);
      if (FCM_ENABLED) await tryGetFCMToken(get().save);
      return true;
    }
    return false;
  },

  getPermissionState: () => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  isQuietHoursNow: () => {
    const { quietHoursEnabled, quietHoursStart, quietHoursEnd } = get().settings;
    if (!quietHoursEnabled) return false;
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return isTimeWithinWindow(nowMinutes, timeStringToMinutes(quietHoursStart), timeStringToMinutes(quietHoursEnd));
  },

  canNotify: (key) => {
    const { settings, isQuietHoursNow } = get();
    return settings.enabled && !!settings.categories[key] && !isQuietHoursNow();
  },

  scheduleLocalReminder: (message, delayMs) => {
    if (get().settings.enabled && Notification.permission === 'granted') {
      setTimeout(() => {
        get().showLocalNotification('ExamVerse', message);
      }, delayMs);
    }
  },

  showLocalNotification: (title, body, url = '/', tag = 'ca-revision') => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const { soundEnabled, vibrationEnabled } = get().settings;
    try {
      const options: NotificationOptions = {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag,
        data: { url },
        silent: !soundEnabled,
        ...(vibrationEnabled ? { vibrate: [120, 60, 120] } : {}),
      } as NotificationOptions;

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
      if (vibrationEnabled && 'vibrate' in navigator) {
        navigator.vibrate([120, 60, 120]);
      }
    } catch (e) {
      console.warn('[Notifications] Failed to show:', e);
    }
  },
}));

// ─── FCM token helper (only runs if Firebase is configured) ──────────────────

async function tryGetFCMToken(
  save: (patch: Partial<NotificationSettings>) => Promise<void>
): Promise<void> {
  if (!VAPID_KEY) return;
  try {
    const fbApp = 'firebase/app';
    const fbMsg = 'firebase/messaging';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { initializeApp, getApps } = await import(/* @vite-ignore */ fbApp) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { getMessaging, getToken } = await import(/* @vite-ignore */ fbMsg) as any;

    const firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) await save({ fcmToken: token });
  } catch (e) {
    console.warn('[FCM] Token fetch failed (Firebase not configured?):', e);
  }
}
