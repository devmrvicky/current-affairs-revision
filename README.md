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

## Tech Stack
React 19 + TypeScript + Vite + Tailwind CSS + Zustand + IndexedDB + Framer Motion + Recharts

## Performance Badges
- 90%+ = Excellent
- 75%+ = Good  
- 50%+ = Average
- Below 50% = Needs Revision
