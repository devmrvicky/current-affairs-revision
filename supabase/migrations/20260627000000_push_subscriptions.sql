-- Push subscriptions for the scheduled notification system.
--
-- Deliberately NOT tied to auth.uid() the way the other synced tables are —
-- this app works fully signed-out, and push notifications should too.
-- Each row is keyed by a random per-install `device_id` (generated once on
-- the client, see types.ts NotificationSettings.deviceId) rather than a
-- user id. `user_id` is recorded when available purely so a signed-in
-- user's devices *could* be linked later; nothing in this app currently
-- reads it for that purpose.
--
-- `preferences` is a snapshot of the device's notification settings
-- (categories/quiet hours/reminder time) synced on every change, so the
-- scheduled function can respect them without needing the rest of the
-- user's local-only data (stats, streaks, etc. are intentionally NOT synced
-- — see README for what this means for which categories can fire server-side).

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  preferences jsonb not null default '{}'::jsonb,
  timezone_offset_minutes integer not null default 0,
  last_active_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_push_subscriptions_user_id on public.push_subscriptions(user_id) where user_id is not null;

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- No SELECT policy for anon/authenticated: only the service role (used by
-- the scheduled Edge Function, which bypasses RLS entirely) ever reads this
-- table. The client never needs to read its own row back — it always has
-- the source of truth locally. This also means a subscription's endpoint
-- can't be harvested by another anonymous client.
--
-- INSERT/UPDATE are intentionally open (`true`) rather than gated on a
-- matching device_id claim, because anonymous clients have no JWT to check
-- a claim against. Security here instead comes from device_id being an
-- unguessable random UUID generated client-side (122 bits of entropy) —
-- the same trust model as e.g. a password-reset token.
create policy "anyone can register a push subscription"
  on public.push_subscriptions for insert
  with check (true);

create policy "anyone can update their own subscription by device_id"
  on public.push_subscriptions for update
  using (true);

create policy "anyone can remove their own subscription by device_id"
  on public.push_subscriptions for delete
  using (true);
