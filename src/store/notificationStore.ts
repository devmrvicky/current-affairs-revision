import { create } from 'zustand';
import type { NotificationSettings } from '../types';
import { notificationSettingsDB } from '../services/db';

// ─── FCM Setup ────────────────────────────────────────────────────────────────
// Firebase is loaded lazily — only when user grants permission.
// Replace VAPID_KEY with your actual FCM Web Push Certificate key from Firebase Console.
// This file works without Firebase configured — notifications simply won't send.

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '';
const FCM_ENABLED = !!import.meta.env.VITE_FIREBASE_API_KEY;

interface NotificationStore {
  settings: NotificationSettings;
  permissionState: NotificationPermission | 'loading' | 'unsupported';
  isLoading: boolean;

  load: () => Promise<void>;
  save: (patch: Partial<NotificationSettings>) => Promise<void>;
  requestPermission: () => Promise<boolean>;
  getPermissionState: () => NotificationPermission | 'unsupported';

  // Schedule local notifications (used when FCM not configured)
  scheduleLocalReminder: (message: string, delayMs: number) => void;
  showLocalNotification: (title: string, body: string) => void;
}

const defaultSettings: NotificationSettings = {
  enabled: false,
  dailyReminderEnabled: true,
  dailyReminderTime: '09:00',
  streakReminderEnabled: true,
  weeklyReportEnabled: true,
  soundEnabled: true,
};

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  settings: defaultSettings,
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
  },

  requestPermission: async () => {
    if (!('Notification' in window)) {
      set({ permissionState: 'unsupported' });
      return false;
    }

    if (Notification.permission === 'granted') {
      set({ permissionState: 'granted' });
      await get().save({ enabled: true });
      // Try to get FCM token if Firebase is configured
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
      if (FCM_ENABLED) await tryGetFCMToken(get().save);
      return true;
    }
    return false;
  },

  getPermissionState: () => {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  },

  scheduleLocalReminder: (message, delayMs) => {
    if (get().settings.enabled && Notification.permission === 'granted') {
      setTimeout(() => {
        get().showLocalNotification('CA Revision', message);
      }, delayMs);
    }
  },

  showLocalNotification: (title, body) => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            tag: 'ca-revision',
            data: { url: '/' },
          } as NotificationOptions);
        });
      } else {
        new Notification(title, { body, icon: '/icons/icon-192x192.png' });
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
    // Use string variables so TypeScript doesn't try to resolve these modules
    // Firebase is an optional peer dependency — only needed if VITE_FIREBASE_API_KEY is set
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
