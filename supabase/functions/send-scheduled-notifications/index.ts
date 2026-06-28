// supabase/functions/send-scheduled-notifications/index.ts
//
// Triggered on a schedule by pg_cron (see README for the exact cron SQL).
// Sends real Web Push notifications via VAPID — no Firebase project needed.
//
// HONEST SCOPE: this can only act on data that's actually synced to
// Supabase, which today is just `saved_tests`, and only for signed-in users
// with sync enabled. Concretely:
//   - Signed-in + synced devices get proper "haven't done today's quiz yet"
//     logic, checked against saved_tests.
//   - Anonymous devices (no user_id — most installs, since this app works
//     fully signed-out) have zero server-visible activity data, so they get
//     a plain reminder at their chosen time, unconditionally. Better than
//     nothing, but it can't know whether they already studied today.
// Every other category (streaks, chapter/test/achievement events, weekly
// and monthly recaps) fires client-side instead — see
// src/services/notificationTriggers.ts — because the data behind them
// (stats, streaks, chapter progress) is local-only by design in this app.
// Syncing those tables too would let this function cover them as well, but
// that's a bigger, separate change than "add push notifications".
//
// Setup:
//   1. npx web-push generate-vapid-keys
//   2. supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com
//   3. supabase functions deploy send-scheduled-notifications --no-verify-jwt
//   4. Schedule it with pg_cron (run in the SQL editor), e.g. every 15 minutes:
//      select cron.schedule(
//        'send-scheduled-notifications',
//        '*/15 * * * *',
//        $$ select net.http_post(
//          url := 'https://<project-ref>.supabase.co/functions/v1/send-scheduled-notifications',
//          headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
//        ) $$
//      );

// @deno-types="npm:@types/web-push@3.6.3"
import webpush from 'npm:web-push@3.6.7';

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

interface SubscriptionRow {
  device_id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  preferences: {
    categories?: Record<string, boolean>;
    reminderTime?: string;
    quietHoursEnabled?: boolean;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  } | null;
  timezone_offset_minutes: number | null;
}

function localNow(offsetMinutes: number): Date {
  return new Date(Date.now() + offsetMinutes * 60000);
}

function timeToMinutes(t: string | undefined, fallback: number): number {
  if (!t) return fallback;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isWithinWindow(now: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end; // wraps past midnight
}

async function restGet(path: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`REST GET ${path} failed: ${res.status}`);
  return res.json();
}

async function restDelete(path: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
}

Deno.serve(async (_req) => {
  if (!VAPID_PRIVATE_KEY || !VAPID_PUBLIC_KEY || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Not configured — see this file\'s setup comment' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  let subs: SubscriptionRow[];
  try {
    subs = await restGet('push_subscriptions?select=device_id,user_id,endpoint,p256dh,auth_key,preferences,timezone_offset_minutes');
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to load subscriptions' }), { status: 502 });
  }

  const toRemove: string[] = [];
  let sent = 0;
  let skipped = 0;

  for (const sub of subs) {
    const prefs = sub.preferences ?? {};
    const offset = sub.timezone_offset_minutes ?? 0;
    const local = localNow(offset);
    const nowMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();

    if (prefs.quietHoursEnabled) {
      const qStart = timeToMinutes(prefs.quietHoursStart, 22 * 60);
      const qEnd = timeToMinutes(prefs.quietHoursEnd, 7 * 60);
      if (isWithinWindow(nowMinutes, qStart, qEnd)) { skipped++; continue; }
    }

    const wantsDaily = !!(prefs.categories?.dailyQuizReminder || prefs.categories?.dailyRevisionReminder);
    if (!wantsDaily) { skipped++; continue; }

    const reminderMinutes = timeToMinutes(prefs.reminderTime, 9 * 60);
    // This function should run roughly every 15 min via pg_cron — fire once
    // per day within a 15-minute window of the device's chosen time.
    if (Math.abs(nowMinutes - reminderMinutes) >= 15) { skipped++; continue; }

    let body = "You haven't completed today's current affairs quiz yet.";
    if (sub.user_id) {
      const todayKey = local.toISOString().slice(0, 10);
      try {
        const todayRows = await restGet(
          `saved_tests?select=id&user_id=eq.${sub.user_id}&date=eq.${todayKey}&limit=1`,
        );
        if (Array.isArray(todayRows) && todayRows.length > 0) { skipped++; continue; } // already done today
      } catch {
        // If the check itself fails, fail open and still send the reminder rather than going silent.
      }
    } else {
      body += ' (Sign in and enable sync for smarter, activity-aware reminders.)';
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        JSON.stringify({ title: 'CA Revision', body, url: '/', tag: 'dailyReminder' }),
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) toRemove.push(sub.device_id);
      console.warn(`[push] send failed for device ${sub.device_id}:`, err instanceof Error ? err.message : err);
    }
  }

  if (toRemove.length > 0) {
    await restDelete(`push_subscriptions?device_id=in.(${toRemove.map(encodeURIComponent).join(',')})`);
  }

  return new Response(JSON.stringify({ checked: subs.length, sent, skipped, removed: toRemove.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
