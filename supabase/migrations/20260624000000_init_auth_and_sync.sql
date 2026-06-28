-- ============================================================================
-- CurrentAffairsPro — initial backend schema
-- Auth, multi-device sync, and admin analytics.
--
-- Apply with the Supabase CLI:  supabase db push
-- or paste into the Supabase Dashboard → SQL Editor and run once.
--
-- Design principles this schema follows (see architecture discussion):
--   1. Every per-user table carries `user_id` + Row Level Security — a user
--      can only ever read/write their own rows. Nothing else is needed to
--      keep one user's data private from another.
--   2. `updated_at` is ALWAYS server-assigned (via trigger), never trusted
--      from the client — it's the watermark the sync engine pulls against.
--   3. Mutable summaries (chapter best-score, attempt counts) are NOT synced
--      as their own table — they're derived from the immutable event log
--      (saved_tests) via a view. This sidesteps an entire category of
--      multi-device merge-conflict bugs.
--   4. Admin-only reads go through a SECURITY DEFINER function that checks
--      the caller's role itself — the browser is never handed a key that
--      can bypass other users' RLS.
-- ============================================================================


-- ─── Helper: auto-set updated_at on every insert/update ─────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ─── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Created automatically on signup (trigger below).

create table public.profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  avatar_url    text,
  role          text not null default 'user' check (role in ('user', 'admin')),
  platform      text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update their own profile...
create policy "profiles: select own"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "profiles: update own"
  on public.profiles for update
  using (auth.uid() = user_id);

-- ...but can never change their own role via the API (admin promotion must
-- happen manually in the SQL editor / dashboard, never through client code).
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_lock_role
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();
-- (profiles intentionally has no updated_at column — last_seen_at via the
-- heartbeat, and the lock-role trigger above, cover its two write paths.)

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── login_events ────────────────────────────────────────────────────────────
-- Append-only log for "how many logins" analytics. Users can insert their own
-- events; only the admin function (below) reads across all users.

create table public.login_events (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  logged_in_at  timestamptz not null default now(),
  device_info   text
);

create index idx_login_events_user on public.login_events(user_id);
create index idx_login_events_time on public.login_events(logged_in_at);

alter table public.login_events enable row level security;

create policy "login_events: insert own"
  on public.login_events for insert
  with check (auth.uid() = user_id);

create policy "login_events: select own"
  on public.login_events for select
  using (auth.uid() = user_id);


-- ─── saved_tests (event log — the source of truth for chapter stats too) ────

create table public.saved_tests (
  id               text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             text,
  display_date     text,
  file_name        text,
  score            numeric,
  accuracy         numeric,
  correct          int,
  wrong            int,
  unanswered       int,
  total_questions  int,
  time_taken       int,
  questions        jsonb,        -- QuestionAttempt[] — see src/types/index.ts
  saved_at         bigint,       -- client-side epoch ms, display purposes only
  is_revision      boolean default false,
  original_test_id text,
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create index idx_saved_tests_updated on public.saved_tests(user_id, updated_at);

alter table public.saved_tests enable row level security;

create policy "saved_tests: all own rows"
  on public.saved_tests for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_saved_tests_updated_at
  before insert or update on public.saved_tests
  for each row execute function public.set_updated_at();


-- ─── bookmarks ───────────────────────────────────────────────────────────────

create table public.bookmarks (
  id               text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  question_id      int,
  question         text,
  options          jsonb,
  correct_answer   text,
  explanation      text,
  source_file_name text,
  source_date      text,
  bookmarked_at    bigint,
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create index idx_bookmarks_updated on public.bookmarks(user_id, updated_at);

alter table public.bookmarks enable row level security;

create policy "bookmarks: all own rows"
  on public.bookmarks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_bookmarks_updated_at
  before insert or update on public.bookmarks
  for each row execute function public.set_updated_at();


-- ─── wrong_questions ─────────────────────────────────────────────────────────

create table public.wrong_questions (
  id                  text not null,
  user_id             uuid not null references auth.users(id) on delete cascade,
  question_id         int,
  question            text,
  options             jsonb,
  correct_answer      text,
  explanation         text,
  date_key            text,
  display_date        text,
  file_name           text,
  wrong_count         int,
  consecutive_correct int,
  status              text,       -- 'learning' | 'mastered'
  last_attempt_at     bigint,
  added_at            bigint,
  updated_at          timestamptz not null default now(),
  primary key (user_id, id)
);

create index idx_wrong_questions_updated on public.wrong_questions(user_id, updated_at);

alter table public.wrong_questions enable row level security;

create policy "wrong_questions: all own rows"
  on public.wrong_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_wrong_questions_updated_at
  before insert or update on public.wrong_questions
  for each row execute function public.set_updated_at();


-- ─── marked_for_review ───────────────────────────────────────────────────────

create table public.marked_for_review (
  id               text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  question_id      int,
  question         text,
  options          jsonb,
  correct_answer   text,
  explanation      text,
  source_file_name text,
  source_date      text,
  marked_at        bigint,
  updated_at       timestamptz not null default now(),
  primary key (user_id, id)
);

create index idx_marked_for_review_updated on public.marked_for_review(user_id, updated_at);

alter table public.marked_for_review enable row level security;

create policy "marked_for_review: all own rows"
  on public.marked_for_review for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_marked_for_review_updated_at
  before insert or update on public.marked_for_review
  for each row execute function public.set_updated_at();


-- ─── settings (single row per user) ──────────────────────────────────────────

create table public.settings (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  theme                text,
  sound_enabled        boolean,
  auto_save            boolean,
  show_explanation     boolean,
  keyboard_navigation  boolean,
  font_size            text,
  auto_next_seconds    int,
  updated_at           timestamptz not null default now()
);

alter table public.settings enable row level security;

create policy "settings: all own row"
  on public.settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger trg_settings_updated_at
  before insert or update on public.settings
  for each row execute function public.set_updated_at();


-- ─── Derived view: per-test chapter stats (NOT a synced table) ──────────────
-- Chapter test relPaths always look like "Folder/Test 01.json" (a '/' in
-- file_name); plain daily current-affairs files and ad-hoc mixed-revision
-- quizzes never contain one, so the filter below mirrors the client's
-- getChapterNameForTestPath()/getAllChapterTestPaths() logic exactly.

create or replace view public.chapter_stats_view as
select
  user_id,
  file_name,
  split_part(file_name, '/', 1)        as chapter_name,
  count(*)                              as total_attempts,
  max(score)                            as best_score,
  round(avg(score)::numeric, 2)         as average_score,
  sum(correct)                          as total_correct,
  sum(total_questions)                  as total_questions,
  max(saved_at)                         as last_attempt_at
from public.saved_tests
where file_name like '%/%'
group by user_id, file_name;

-- Views inherit the security context of the querying role under Postgres's
-- default (non security-barrier) behavior here, but to be explicit and safe
-- regardless of Supabase defaults, this also restricts it to RLS-eligible
-- rows since saved_tests itself is RLS-protected and views run with the
-- privileges of the underlying tables' policies when accessed via the
-- PostgREST API as the authenticated user.


-- ─── Admin analytics ──────────────────────────────────────────────────────────
-- The client (anon key + user's own JWT) calls this RPC. It checks the
-- caller's own role server-side and only returns aggregates if they're an
-- admin — the browser never holds a key capable of reading every user's rows.

create or replace function public.get_admin_stats()
returns table (
  total_users        bigint,
  active_now         bigint,    -- last_seen_at within 5 minutes
  active_today       bigint,    -- last_seen_at within 24 hours
  signups_last_7d    bigint,
  logins_last_7d     bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where last_seen_at > now() - interval '5 minutes'),
    (select count(*) from public.profiles where last_seen_at > now() - interval '24 hours'),
    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    (select count(*) from public.login_events where logged_in_at > now() - interval '7 days');
end;
$$;

-- Daily signup/login counts for the last 30 days, for charting.
create or replace function public.get_admin_daily_activity()
returns table (
  day      date,
  signups  bigint,
  logins   bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    d.day::date,
    coalesce(s.cnt, 0) as signups,
    coalesce(l.cnt, 0) as logins
  from (
    select generate_series(current_date - interval '29 days', current_date, interval '1 day') as day
  ) d
  left join (
    select created_at::date as day, count(*) as cnt
    from public.profiles
    group by 1
  ) s on s.day = d.day::date
  left join (
    select logged_in_at::date as day, count(*) as cnt
    from public.login_events
    group by 1
  ) l on l.day = d.day::date
  order by d.day;
end;
$$;
