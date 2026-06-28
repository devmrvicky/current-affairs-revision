# CurrentAffairsPro

A production-ready current affairs revision web app for competitive exam aspirants.

## Features
- Daily Quiz — loads today's JSON file automatically
- Instant Feedback — correct/wrong + explanation per answer
- Test History — IndexedDB-backed, searchable, sortable
- Revision Mode — re-attempt any saved test
- Statistics — accuracy trends, streaks, weekly charts
- Pause/Resume — accurate timer tracking
- Question Palette — visual jump-to-question
- Bookmarks — flag questions for review
- Keyboard Navigation — A/B/C/D or 1/2/3/4 keys
- Dark/Light/System Theme
- Offline-first — no network needed

## Getting Started

```bash
npm install
npm run dev
```

## Adding New Quiz Files

1. Create `src/data/current-affairs/09june2026.json`
2. Follow the JSON schema (date + questions array with id/question/options/correctAnswer/explanation)
3. Register in `src/services/quizService.ts` quizModules map

## Web Search Assistant ("Search on Web")

Tapping **Search on Web** during a test opens an in-app panel with:
- A Wikipedia summary — works out of the box, no setup (public, keyless API).
- General web results + government-source detection — needs a one-time Edge Function deploy:

```bash
# 1. Get a key from your search provider of choice (defaults wired to Brave Search: https://brave.com/search/api/)
supabase secrets set BRAVE_SEARCH_API_KEY=your-key-here
# 2. Deploy (no JWT check — usable while signed out, like the rest of quiz-taking)
supabase functions deploy web-search --no-verify-jwt
```

See `supabase/functions/web-search/index.ts` to swap in a different provider — the frontend contract (`POST { query } -> { query, references }`) stays the same regardless of which one you use.

## Notifications

There are two tiers, and it's worth understanding the difference:

**While the app is open** (works today, no setup): all 16 categories — daily reminders, streaks, chapter/test/achievement events, weekly/monthly recaps, "missed revision", etc. — fire from `src/services/notificationTriggers.ts`, using whatever's already in IndexedDB. Configure categories, quiet hours, sound, and vibration under Settings → Notifications.

**While the app is closed**, only a real *push* message (sent from a server, woken by the OS) can show anything — a `setTimeout` in a closed tab never runs. This app uses standard Web Push (VAPID), not Firebase — no Firebase project required:

```bash
# 1. Generate a key pair once
npx web-push generate-vapid-keys
# 2. Public key goes in your .env:
#    VITE_VAPID_PUBLIC_KEY=<public key>
# 3. Private key is a function secret, never shipped to the browser:
supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> VAPID_SUBJECT=mailto:you@example.com
# 4. Deploy the migration (adds the push_subscriptions table) and the function:
supabase db push
supabase functions deploy send-scheduled-notifications --no-verify-jwt
# 5. Schedule it in the SQL editor (every 15 minutes):
select cron.schedule(
  'send-scheduled-notifications', '*/15 * * * *',
  $$ select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/send-scheduled-notifications',
    headers := jsonb_build_object('Authorization', 'Bearer <service-role-key>')
  ) $$
);
```

**Honest scope of the closed-app path**: it can only act on data actually synced to Supabase, which today is just `saved_tests` — and only for signed-in users with sync turned on. That's enough for a real, activity-aware "daily quiz reminder". Anonymous installs (most of them, since this app works fully signed-out) still get the reminder at their chosen time, just without knowing whether they already studied today. The richer categories (streaks, chapter completion, achievements, weekly/monthly recaps) stay open-app-only, because the stats/streak/chapter-progress data behind them is local-only by design in this app. Syncing those tables too would extend server-side coverage to them, but that's a bigger change than "add push notifications" — worth doing deliberately, not as a side effect of this feature.

Firebase Cloud Messaging is still supported if you already had it configured (`VITE_FIREBASE_*` vars) — it's just no longer required.

## Tech Stack
React 19 + TypeScript + Vite + Tailwind CSS + Zustand + IndexedDB + Framer Motion + Recharts

## Performance Badges
- 90%+ = Excellent
- 75%+ = Good  
- 50%+ = Average
- Below 50% = Needs Revision
