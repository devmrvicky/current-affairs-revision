// Standard Web Push (VAPID) subscription handling — deliberately not
// Firebase. No Firebase project is required: generate a VAPID key pair once
// (`npx web-push generate-vapid-keys`), put the public half in
// VITE_VAPID_PUBLIC_KEY, and the private half as a Supabase secret for the
// send-scheduled-notifications Edge Function. See README for full setup.
//
// Works without sign-in: subscriptions are keyed by a random per-install
// `deviceId` (generated once, stored alongside notification settings) so
// the server can target a device without requiring an account.
import { supabase, SUPABASE_ENABLED } from './supabaseClient';
import type { NotificationSettings } from '../types';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function buildPreferencesSnapshot(settings: NotificationSettings) {
  return {
    categories: settings.categories,
    reminderTime: settings.reminderTime,
    quietHoursEnabled: settings.quietHoursEnabled,
    quietHoursStart: settings.quietHoursStart,
    quietHoursEnd: settings.quietHoursEnd,
  };
}

async function upsertSubscription(subscription: PushSubscription, settings: NotificationSettings) {
  if (!SUPABASE_ENABLED || !settings.deviceId) return;
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) return;

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch {
    // Not signed in / sync disabled — push still works anonymously via deviceId.
  }

  try {
    await supabase.from('push_subscriptions').upsert(
      {
        device_id: settings.deviceId,
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: json.keys.p256dh,
        auth_key: json.keys.auth,
        preferences: await buildPreferencesSnapshot(settings),
        timezone_offset_minutes: -new Date().getTimezoneOffset(),
        last_active_at: new Date().toISOString(),
      },
      { onConflict: 'device_id' },
    );
  } catch (e) {
    console.warn('[Push] Failed to sync subscription:', e);
  }
}

/** Creates (or reuses) a push subscription and syncs it server-side. No-op if unsupported/unconfigured. */
export async function subscribeToPush(
  settings: NotificationSettings,
  save: (patch: Partial<NotificationSettings>) => Promise<void>,
): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  if (!VAPID_PUBLIC_KEY) return; // Server-push isn't configured — local/foreground notifications still work fine.

  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    await save({ pushEndpoint: subscription.endpoint });
    await upsertSubscription(subscription, { ...settings, pushEndpoint: subscription.endpoint });
  } catch (e) {
    console.warn('[Push] Subscription failed:', e);
  }
}

/** Re-syncs just the preference snapshot (categories/quiet hours/reminder time) without re-subscribing. */
export async function syncPushPreferencesIfSubscribed(settings: NotificationSettings): Promise<void> {
  if (!SUPABASE_ENABLED || !settings.deviceId || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await upsertSubscription(subscription, settings);
  } catch {
    // Best-effort — the next full subscribe (e.g. on next permission grant) will resync anyway.
  }
}

/** Removes the push subscription, both locally and server-side. */
export async function unsubscribeFromPush(settings: NotificationSettings): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
    if (SUPABASE_ENABLED && settings.deviceId) {
      await supabase.from('push_subscriptions').delete().eq('device_id', settings.deviceId);
    }
  } catch (e) {
    console.warn('[Push] Unsubscribe failed:', e);
  }
}
