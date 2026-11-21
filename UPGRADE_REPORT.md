# ExamVerse upgrade — delivery report (second pass)

This replaces the first report. The first pass left several parts of the master prompt undone and wrongly treated some
as already present; this pass implemented or checked each one against the code. Section 3 lists what is still not done
or not proven. 64 files created, 43 modified, none removed.

## 1. Implemented and verified (each has automated tests)

**Home & sessions (§2–3)**
- ✕ on a Resume card **archives** the session (new `archivedSessions` store) instead of deleting it; nothing is removed if the archive write fails.
- Resume Tests are grouped by subject / Mixed / Current Affairs / Mock; one malformed saved session can't hide the rest.
- Home checked by reading it: no Today Revision or Current Affairs Progress; daily goals are user-set (type, presets, custom number); Favorite Chapters is cross-subject; Current Affairs is a normal row in "Your Subjects".

**Timers (§4) — new**
- You set timing yourself, in Test mode: Default / No timer / **Overall** minutes / **Sectional** (2–8 sections, minutes each). Chip beside the mode switch in Practice by Topic; also inside Quick Practice settings.
- Time is *derived* from the session's own clock (start − paused/away time), not an interval counter. For sectional tests the only stored state is when each section began, so refresh, Back-then-Resume and a long absence restore the right section and the right time left (if a section expired while you were away you return in the next one). Last section ending auto-submits.
- Sectional rules: only the open section's questions can be visited (palette greys others, arrows/Next stop at the edge), "Finish Section" asks first, a finished section can't be reopened. Old tests and "Default" behave exactly as before.

**Practice by Topic hierarchy (§5) — new**
- Subject → Category → Chapter → Topic → Subtopic → deeper groups → tests, **any depth**, via a recursive browser; levels open/close independently with test/question counts and attempted counts. Search, filters, sort, hidden groups and Manage-visibility still apply (they run first).
- Additive metadata only: optional `Topic.parentId` (registry), optional `groupPath` on a test, and the loaders now accept folders nested under a chapter. `topicId`, chapter ids and test identities are unchanged — a regression test checks every real data file parses exactly as before.
- Verified present: chapter **T** control, topic picker modal, manage-visibility, per-test attempts/best/latest/last-attempted/history/Retake.

**Test screen (§6) — fixed**
- Floating Previous/Next were small, bottom-corner, Practice-only. Now large edge tabs (40×80 px phone, 48×96 px from tablet up) at the **vertical centre** of both sides, shown **always in Test mode** (they reveal nothing) and in Practice once feedback is on screen. Side padding added so they don't cover text.
- Desktop: the shell is centred with a maximum width (90 rem) and the question in a 56 rem column (it used to stretch full width).
- Rendered tests confirm: ←/→ keys (and not while typing), changing an answer in Test mode with no correctness shown, Practice answers final, sidebar **Submit Test** with confirmation and real answered/unanswered counts.

**Marking (§7) — fixed**
- A question can now carry several purposes at once (Doubtful + Further Practice + Revision, plus in-test Mark for Review) as **one** saved record (`purposes`); the sheet is multi-select with Remove all; each can be removed later, in the test or in the Review Center. Palette shows the purpose. Applied in the practice/test, mock and legacy quiz pages.

**Review Center (§8, §10)**
- New default **Review** tab: all subjects and sources in one list, one item per question, five categories with live counts, dashboard (total, unresolved, repeated mistakes, accuracy, subject-wise distribution), filters that combine (subject, topic, difficulty, latest result, date range, repeated, recently saved, text), expandable question with answer/explanation/Listen, edit or remove saved purposes.
- Monthly Current Affairs: per-month counts, wrong-from-month, month filter, saved-but-not-revisited, **Month test**, **Mixed revision — all months** — reusing the existing saved-question and wrong-question stores.
- **Generate test** from any view: count / all, difficulty, shuffle (off = highest revision priority first), Practice or Test with an optional timer. Runs in the existing quiz engine (resume, history and analysis work normally); a test proves the saved records are byte-identical afterwards.
- Insights tab (priority score with every point listed, repeated mistakes, improvement with a minimum-sample rule) and unified **Weak Topics** (all sources, per-source split, nothing rated under 10 answered attempts) from the first pass.

**Analysis (§9, §11)**
- Practice analysis already shared the Mock engine and view. Added to it: **section-wise performance** for sectional tests and **repeated mistakes** (wrong now and before, from the attempt ledger). Question-level time, explanations, topic/subject performance, weak/strong areas and historical comparison were already there.

**Speaker, rendering, Author Studio (§12–13)** — as in the first pass (Listen button in 8 places; Author Studio with lock, folders, import conflicts, validation, trash, ZIP backup/restore, strict isolation).

## 2. Present in your code and re-checked
Keyboard navigation, Submit dialog, desktop right-hand explanation drawer for Current Affairs (the earlier grep missed it; it uses a JS media query), Markdown/KaTeX renderer with legacy handling, multi-session registry, Back-saves-progress hook.

## 3. Not done / not proven
- **No real browser.** Everything was rendered in jsdom against a real IndexedDB implementation. Layout changes (floating tabs, centred shell, nested indentation) have not been seen on a phone or monitor — please check, especially the **Mock test page**, which shares the shell.
- Multi-purpose marking was rendered-tested on the practice/test screen. The mock and legacy-quiz pages compile and lint with the same change but were not rendered in tests.
- **Sectional timers exist only in the practice/test engine.** Revision tests generated from Review Center run in the legacy quiz engine: overall timer only. Mocks keep their own section engine.
- Review Center filters: no Chapter or Concept filter in the UI (attempts and saved questions don't store them); Subject, Topic, Difficulty, Result, Date, Repeated, Recent and Month are there. The old Bookmarks/Wrong/Marked/Recent tabs still exist beside the new Review tab, so some questions appear in both places.
- Your current question bank has no folders nested below a chapter and no topic `parentId`, so today the tree reads Category → Chapter → Topic; deeper levels appear when you add nested folders or `parentId`. The code and tests cover depth 12.
- "Quick revision" for a month = pick the month and open questions to read answers/explanations; there is no separate flashcard mode.
- No screen to browse archived (✕-closed) sessions yet. Concept-level analytics are not possible (no concept data).
- Author Lock is a privacy gate, not encryption; forgotten passwords can't be recovered. Author Studio isn't linked from the main nav (open `/author-studio`).

## 4. Data-model changes
`DB_VERSION` 11 → 12, additive and idempotent: `archivedSessions`, `authorFolders`, `authorFiles`, `authorContent`, `authorImports`, `authorMeta`. Optional fields only: `MarkedReviewQuestion.purposes`, `Topic.parentId`, `PracticeTestDefinition.groupPath`, `PracticeConfiguration.timing`, `PracticeSession.sectionStarts`. No existing record, id or `topicId` is touched.

## 5. Checks run
- `tsc -b` clean. `vite build` succeeds.
- `vitest run`: **249 tests, 26 files, all passing**, repeated runs identical.
- ESLint: **89 errors / 29 warnings before and after** — all pre-existing, no file got worse; I did not fix the 89.
- Real bugs the tests caught in my own work: a hooks-order crash in the session page, a stale validation tab, a transaction race in password setup, lost folder favourites on restore, a priority score shown for never-wrong questions, wrong "saved" wording for wrong-only questions, one broken record hiding every Resume card.

New dev dependencies: `vitest`, `jsdom`, `fake-indexeddb`, `@testing-library/*` (`npm test`).

---

# Add-on: options always appear in a random order

## What it does
Every time a question comes on screen, its answer options are shown in a fresh random order (Fisher–Yates via the existing `shuffleArray`), so the correct answer lands on a different position each time.
- The order is fixed when the question comes on screen and stays fixed while it is there — answering, changing an answer, or a timer tick never moves the options.
- Coming back to a question later (Previous/Next, palette, reopening a card) shows a new order; the answer already given stays selected, because it is stored by option id (option text on the legacy quiz and the Wrong/Danger cards), never by position. Scoring, storage and the ledger are unchanged.

## Where it applies
Practice and Test (`UniversalSessionPage`), Mock (`MockTestShellPage`), legacy Quiz (`QuizPage`), the chapter page's inline practice (`GenericChapterDetailPage`), and the Wrong Questions / Danger Zone cards (also re-shuffled on "Try again").
Not applied (on purpose): result, review, solutions and analysis screens — they show the stored order.

## Files
- New: `src/utils/optionOrder.ts` (classification + shuffle), `src/components/exam/ShuffledOptions.tsx` (fixes the order for as long as the question stays mounted; falls back to the original order if the option set ever differs — an option is never dropped or duplicated).
- Modified: the six pages above. Mock and chapter pages now show the on-screen position (A–D) in the option badge instead of the stored option id.
- Tests added (71): `optionOrder.test.ts`, `ShuffledOptions.test.tsx`, five new cases in `UniversalSessionPage.test.tsx`, and rendered tests `QuizPage.test.tsx`, `MockTestShellPage.optionOrder.test.tsx`, `GenericChapterDetailPage.optionOrder.test.tsx`, `RevisionCards.optionOrder.test.tsx`.
- No database, store, schema or dependency changes.

## Safety rules for options that depend on position
- Pinned last (shuffle the rest): "All of the above", "None of the above/these", "Cannot be determined", "Data inadequate", and the Hindi equivalents (उपरोक्त सभी, इनमें से कोई नहीं, …).
- Question left in its original order: any option that points at other options by position — "Option B", "Both options", "Both of the above", "उपरोक्त दोनों", "विकल्प (a)…".
- Scanned the 747 bundled questions: none have such options today, and no explanation refers to an option letter. This protects imported/future questions.
- **Known limit:** an option written as a bare "Both A and B" or "(a) and (c)" cannot be told apart from one that refers to items in the question text, so it is shuffled like any other option.

## Known limitations
- Review/result screens show the stored order, so a letter seen there can differ from the letter the learner saw during the test; the option text identifies it.
- No on/off setting (requested: always).
- **Not verified in a real browser** — only rendered in jsdom. No layout was changed.

## Checks run
- `tsc -b` clean; `vite build` succeeds (PWA generated).
- ESLint: 89 errors / 29 warnings before and after; no file's count changed.
- `vitest run`: 320 tests (249 before + 71 new), 317 pass. 3 fail, identical before and after this add-on: `chapterPath.test.ts` (2) and `authorValidation.test.ts` (1). They expect the full shipped question bank (250+ files) and the uploaded zip contains 24, so they depend on the data included in the zip, not on this change.
- Mutation check: with shuffling switched off, the new tests fail (7 of 8 in the quiz and revision-card files, 5 of 6 in the mock and chapter files; the one in each that still passes only guards scoring).


---

# Master prompt pass — §2 to §6 (test screens, Home, result tables, Question Bank, leftovers)

This section was written after the work, from what the code and the test runs actually showed. Where something is partial, untested in a real
environment, or a decision I made for you, it says so.

## 1. Status at a glance

| Item | Status |
|---|---|
| §2.1 ← Back and ✕ Close, separate, on every session screen | **Done** and rendered-tested on Test, Practice, Mock and legacy Quiz |
| §2.2 Floating Previous/Next (hidden until an option is chosen; low opacity at rest; overlay) | **Done**, rendered-tested (class/behaviour assertions) |
| §2.3 Question/option spacing restored | **Done** (Test `px-3 sm:px-5 lg:px-8`; Practice `px-3 sm:px-5 md:px-16 pb-16 md:pb-6`) — see note 1 |
| §3 Home redesign | **Done** and rendered-tested; two-column layout **not seen in a browser** |
| §4 Result tables on every result screen | **Done**; exact numbers asserted on seeded practice, sectional test, mock, legacy quiz |
| §5 Question Bank (repository, DB v13, import, backup/restore, GitHub publish, manifest, sync, SW, UI) | **Done** and tested; GitHub publishing tested against an in-memory fake GitHub, **never against real GitHub** — see §6 |
| §6.1 Marking tests on Mock and legacy Quiz | **Done** |
| §6.2 Review Center: Chapter/Concept filters, de-duplicated tabs, archived sessions | **Done** (archived = **view only**, no restore — a decision, see §7) |
| §6.3 Sectional timers for revision tests | **Not built — limit documented** (and shown in the dialog) |
| §6.4 Author Studio linked from Settings (admin only) | **Done** (link hidden from non-admins; the route itself is unchanged) |
| §6.5 Mock and legacy Quiz verified after shell changes | **Done by tests**; not by eye |
| Visual verification (360×800, 1440×900) | **Not done** — no browser could be installed here |

## 2. What changed, by section

### §2 Test screens
- `components/exam/TestExitControls.tsx`: ← **Back** (saves, stops the clock, returns where the test was opened from, session stays in Resume Tests; the browser Back button behaves identically — the session store persists continuously and the screen's unmount suspends the clock) and ✕ **Close** (asks first; archives through `archiveSession`, removes from Resume, returns; if archiving fails it shows an error and keeps the session). One in-flight guard covers both, so double taps cannot navigate twice or race a save against an archive. 44 px targets, distinct icons, accessible names as specified. Used by `UniversalSessionPage`, `MockTestShellPage`, `QuizPage`.
- `FloatingQuestionNav`: `absolute` overlay at the vertical centre of each edge; `opacity-20` at rest, full on hover/press/focus-visible (the old inline `opacity: 0.92`, which would have beaten any class, is gone). `UniversalSessionPage` shows them only once an option is chosen on the current question (both modes).
- Note 1: I had no git history, so "original" padding is the values you gave in the prompt (they also match `MockTestShellPage`'s own padding). The desktop centred shell was not changed.

### §3 Home
New layout in `pages/HomePage.tsx` with sections in `components/home/`: header (greeting, exam, real study streak), Resume Tests (now with a real error state + retry), Daily goal, Favorite chapters (cross-subject), Continue learning, Subjects grid (every subject, same card; Current Affairs is just one), Quick actions (Practice by Topic, Mock Tests, Review Center, Question Bank), Weak topics (top 3, 10-answer rule), Review Center counts (wrong, doubtful, further practice, revision, marked), Recent attempts (practice/test, mock and daily quiz, newest first).
- Each data section loads, fails and empties independently (`useAsyncSection`, `HomeCard`).
- Phone = one column in the specified order; from `lg` a main column + side column. The two columns are `display: contents` on a phone and `order-*` interleaves the cards. **This is verified by class assertions only.**
- "Today Revision" (the unused `DailyDashboard.tsx`) and the old Continue-reading widget were deleted; "Current Affairs Progress" no longer exists. Saved data is untouched.
- Daily goal is now fully the learner's: `target: 0` means "no goal". **Behaviour change:** a brand-new learner starts with no goal (the old code pre-filled 25). An existing saved goal is kept. A cleared goal is never "met" and never builds a streak. The custom-number field could not be emptied and retyped (typing "37" gave "137"); fixed.
- Every subject's chapter list now has a ★ favorite toggle (`SubjectChaptersPage`), the same record Home's Favorite chapters reads.

### §4 Result tables
- `services/resultTables.ts` (pure) builds, from the existing `MockAnalysis` plus a small `ResultContext`: scorecard, section-wise, subject-wise, topic-wise, difficulty-wise, time analysis, question-wise (sortable, filterable, paginated at 25, row opens the solution with Listen), comparison with earlier attempts of the same test. `services/resultContext.ts` produces the context for Practice/Test, Mock and the legacy quiz (`analyzeLegacySession`).
- Components in `components/results/` (`DataTable`, `ResultTables`, `QuestionWiseTable`, `LegacyResultTables`): tables scroll inside their own container, first column sticky, numbers right-aligned, real column headers, status always written out (never colour alone).
- Used by `UniversalResultPage` and `MockResultPage` (via `AnalysisView`), `TestResultPage`, and `TestReviewPage` (question-wise table). The card lists the tables replaced (subject list, topic-wise, historical comparison) were removed from `AnalysisView`; its charts, Strong-vs-Weak, Revision plan and the full Solutions review remain. Repeated mistakes are now a table.
- **No rank, percentile, topper comparison or cut-off** appears anywhere; the page says why. Missing data gets an honest state: no per-question time, no difficulty (the older quiz has none — it is not defaulted), first attempt, nothing attempted.
- Sectional tests: practice questions now carry their real section id, so the question table shows sections.
- **Behaviour change:** `MIN_SAMPLE_SIZE_FOR_STRENGTH` went from 3 to 10 so one screen never calls a topic Weak in one card and "Insufficient data" in another. Short tests will therefore show fewer strong/weak areas and recommendations.

### §5 Question Bank
**Repository** — `services/questionBank/repository.ts` (`QuestionBankRepository`): `getAllTests`, `getTestById`, `getQuestions`, `importLocalTest`, `replaceLocalTest`, `mergeLocalQuestions`, `deleteLocalTest`, `getLocalTests`, `getRemoteManifest`, `syncRemoteManifest`, `downloadRemoteTest`, `getQuestionBankMetadata`.
**Integration** — one additive provider (`poolProvider.ts`) read by `questionRepository.loadAllQuestions`. Bank questions get ids `qb:<origin>:<testId>:<questionId>` and the source `chapter:<subject>/<chapter>/<title> (Local|Published)`, so the existing library builder files them under Practice by Topic with no special cases. With an empty bank the pool is identical (tested: add a bank test, delete it, the pool is the same ids in the same order). A bank that cannot be read never blocks bundled content.
**Questions removed by a replace/delete/update are kept as `retired` snapshots**, resolved by id for review (`resolveQuestionsByIds` falls back to them) but never listed or practised. This is how old attempts stay bound to their original question; ids are never re-pointed.
**Schema reuse** — the per-test JSON is the existing ExamVerse schema (`authorValidation.validateQuestionFileText` + `canonicalQuestionNormalizer`); a wrapper may add `id/title/subject/chapter/chapterTitle/examIds/version`. A bare array asks for those in the form.

### §6 Leftovers
- Review Center: **Chapter** and **Concept** filters (narrowing as you choose). Chapter/concept are recorded on new attempts and new marks; older records get them from the question pool when the question is still there, otherwise they simply have none (and never match a chapter filter). Wrong/Marked/Recently-attempted tabs removed; what they offered is on the one list: *Remove from wrong questions*, *Remove mark*, the Date and Latest-result filters; Bookmarks kept. New **Closed tests** tab (view only).
- Marking-with-purposes rendered tests for Mock and legacy Quiz.
- Revision tests keep their single overall timer; the dialog now says so.

## 3. Database (IndexedDB `CurrentAffairsDB`, version 13)
Version 13 is additive and idempotent (every store is created behind `objectStoreNames.contains`); nothing existing is renamed, rewritten or re-keyed. Tested by opening a representative v12 database and checking that every legacy record survives unchanged.

| Store (v13) | keyPath | Indexes |
|---|---|---|
| `tests` | `key` (`origin:id`) | `by-testId`, `by-subject`, `by-chapter`, `by-source`, `by-updatedAt` |
| `questions` | `key` (`testKey::questionId`) | `by-testId`, `by-testKey`, `by-questionId`, `by-subject`, `by-chapter`, `by-source`, `by-updatedAt` |
| `importHistory` | `id` | `by-at` |
| `metadata` | `key` | — |

`metadata` holds the cached remote manifest (`remoteManifest`), `lastSyncAt`, and the admin's GitHub **repository settings** (`githubConfig` — never the token). Optional fields added to existing records (old rows stay valid): `UniversalAttemptRecord.chapterId/subtopicId`, `MarkedReviewQuestion.subjectId/topicId/chapterId/subtopicId`.
All stores from earlier versions are unchanged (see the version-12 block in `services/db.ts`).

## 4. How to import a local JSON file (Settings → Admin → Question Bank Manager → LOCAL IMPORT)
1. Choose or drop one or more `.json` files (max 5 MB each). A file may be a bare array, `{ "questions": [...] }`, or one of this app's own export bundles.
2. Each file is validated: syntax errors show line and column; question errors show the question's index, id, field and the line it starts on; duplicate ids, missing answers, unsupported types, unknown subject, missing chapter are all reported. **A file with any error imports nothing** — invalid questions are never dropped or "fixed".
3. A bare array has no test details: fill in test id, title, subject and chapter on the preview card.
4. Pick **Add new** (rejects an existing id), **Replace** (swaps the questions of that one test; other tests and all your progress untouched) or **Merge** (adds new questions; you choose skip or update for ids that already exist).
5. Review the preview (title, subject, chapter, questions, difficulty mix, duplicates, status), press Import, confirm. The whole batch is one transaction. Import history lists every attempt, including failed ones with the reason. There is no "rollback" promise: a **backup** (Create backup) is what you can restore.
Export: selected tests as one valid JSON file each, or all as one bundle that re-imports as a batch. Backup: tests + bank records; attempts/bookmarks/progress **only if you tick the box**. Restore: validated, previewed (shows what it would replace), confirmed, one transaction; progress is restored only if you tick that box too.

## 5. GitHub configuration and publishing (GLOBAL PUBLISH)
1. Create a **fine-grained personal access token** limited to this one repository, permission **Contents: Read and write** only, with an expiry.
2. Question Bank Manager → GLOBAL PUBLISH → enter owner, repository, branch, question-bank folder (default `public/data/question-bank`) and manifest path (default `…/manifest.json`). These are saved on the device; the token is not.
3. Paste the token → *Use for this session* (the field empties; the token lives in memory only). *Connect and load published tests* proves the token/repo/branch and lists what is published.
4. Tick tests to publish (imported ones) and/or published tests to remove → *Validate and review changes* (shows New file / Replaces existing / Deleted, target paths and versions; publishes nothing) → *Publish for all users…* → confirm.
5. Publishing is **one atomic commit** (Git Trees: read head → blobs → one tree → one commit → fast-forward ref update). Success is shown only when GitHub's ref update confirms the new commit; its SHA and link are shown. If the branch moved meanwhile it re-reads and rebuilds on top (keeping others' manifest entries) up to 3 times; if a file you reviewed was changed by someone else it **aborts** rather than overwrite it. Rate limits (with reset time), network errors, 401/403/404 and conflicts each have a plain message; nothing is ever reported as published unless confirmed.
The manifest (`public/data/question-bank/manifest.json`, an empty valid one ships) is `{ version, updatedAt, tests: [{ id, title, subject, chapter, file, questionCount, version, updatedAt, hash }] }` with a SHA-256 of each file's exact text, unique ids, independent per-test versions; publish and delete both update it and never drop unrelated entries.

## 6. How users receive updates
On app start (after 3 s, only when online) the app checks the manifest in the background; what is cached in IndexedDB already works immediately and offline. It compares version and hash, downloads only changed files, **validates each before storing** (hash must match, schema must validate, id and question count must match the manifest), then updates the cached manifest only for what succeeded. *Sync now* and the last-synced time are on the Question Bank page. A test that an unfinished attempt is using is **deferred** (not updated or removed) until that attempt is finished; local imports are never overwritten or removed by sync; a failed sync never blocks the test UI and never deletes anything.
Where files come from: the app's own origin (`/data/question-bank/…`, i.e. the repo's `public/` folder **once your host redeploys**). Set `VITE_QUESTION_BANK_BASE_URL` (e.g. a `raw.githubusercontent.com/<owner>/<repo>/<branch>/public/data/question-bank/` URL) to read straight from GitHub for immediate propagation — I did not test that URL or its CORS behaviour.
Caching: the Workbox config has explicit **NetworkFirst** rules for the manifest and test files (`question-bank-manifest`, `question-bank-tests`), JSON is not precached, sync fetches with `cache: 'no-cache'`, and `public/_headers` sets `Cache-Control: no-cache` for Netlify/Cloudflare Pages (set the same header on other hosts). I confirmed the rules are present in the built `dist/sw.js`; I did not run the service worker in a browser.

## 7. Decisions I made that you may want to change
- **Closed (archived) tests are view-only**, not restorable: the ✕ confirmation already tells the learner a closed test "cannot be resumed", and restoring would re-open sessions with frozen clocks. Say so if you want Restore.
- **Admin visibility** reuses the existing `isAdmin` (server-side role read through Supabase). A personal/self-hosted build with no accounts can set `VITE_QUESTION_BANK_MANAGER=true` to show the manager to everyone using that build.
- New learners start with **no daily goal** (see §3); `MIN_SAMPLE_SIZE_FOR_STRENGTH` is now 10.
- Bank tests show a `(Local)` / `(Published)` tag in Practice by Topic; it also keeps a bank test from ever sharing a name with a bundled one.

## 8. Security considerations
- The token is memory-only: never in localStorage/sessionStorage/IndexedDB, never logged, never in a request body or an error message (all asserted in tests). It is dropped on *Forget token*, after 15 idle minutes, and by closing the tab. **A browser-side token is readable by anything running in that session; it is for a trusted admin on a trusted device, not a shared production credential.**
- `PublishAuthProvider` is the abstraction the UI depends on, so a serverless GitHub-App broker (short-lived installation tokens) can replace the typed token without touching the UI. A GitHub App private key must never be put in the frontend; there is none here.
- **`isAdmin` only decides whether screens are shown.** The real authorization to publish is GitHub's: no valid token with write access → nothing can be published. Local import only changes the importer's own device. Ordinary users get published tests, sync, remote download and the offline cache — never publishing credentials.

## 9. Known limitations / not done / not verified
1. **No visual verification.** Playwright/browsers could not be installed here. The Home two-column layout (`display: contents` + `order-*`), the floating-button opacity and position, sticky table columns, 360 px behaviour and dark mode were verified only through rendered jsdom tests that assert classes and behaviour — **please look at them on a phone and a desktop.**
2. **GitHub publishing was tested only against a faithful in-memory fake** that implements the documented endpoints (including fast-forward-only ref updates). It has not been run against real GitHub. Do a first publish to a throwaway repo.
3. The service worker rules were checked in the generated `sw.js`, not exercised in a browser.
4. Three tests fail **before and after** my changes (`chapterPath.test.ts` ×2, `authorValidation.test.ts` ×1): they expect the full shipped question bank (250+ files) and the uploaded zip contains 24.
5. Revision tests (Review Center) still have one overall timer; routing them through the practice engine was not done.
6. Chapter/concept for records saved before this pass exist only while the question is still in the pool.
7. The shuffle limitation from the earlier add-on stands (a bare "Both A and B" option is treated as a normal option).
8. The Author Studio **route** (`/author-studio`) is unchanged and still reachable by URL, as before; only its Settings link is admin-only.
9. The daily-quiz `/analysis` page (Current Affairs) was not touched.
10. Bundled-test counts for the Question Bank stats are computed by building the practice library for every exam/subject (cached per pool version); fine at this size, worth revisiting if the library grows a lot.

## 10. Test, lint and build results
- `npx tsc -b`: clean.
- `npx vitest run`: **618 tests in 54 files; 615 pass, 3 fail** (the three in note 4; identical before and after). Started from 26 files / 249 tests.
- `npx eslint .`: **79 errors / 28 warnings**, down from the 89 / 29 baseline; no file got worse (files I rewrote lost their old errors). I added no lint rule changes or disables.
- `npx vite build`: succeeds; PWA generated (192 precache entries); `dist/sw.js` contains the `question-bank-manifest` / `question-bank-tests` NetworkFirst rules; the empty manifest ships in `dist/data/question-bank/`.
- One flaky test was found and fixed (it pressed ArrowRight before React had attached its keyboard listener under load); the three suites that navigate by keyboard now flush effects first and passed 3 runs in a row.

## 11. Files
**Removed (2):**
- `src/components/common/ContinueReadingWidget.tsx`
- `src/components/common/DailyDashboard.tsx`

**Created (84):**
- `public/_headers`
- `public/data/question-bank/manifest.json`
- `public/data/question-bank/tests/.gitkeep`
- `src/components/exam/ShuffledOptions.test.tsx`
- `src/components/exam/ShuffledOptions.tsx`
- `src/components/exam/TestExitControls.tsx`
- `src/components/home/ContinueLearningCard.tsx`
- `src/components/home/FavoriteChaptersCard.tsx`
- `src/components/home/HomeCard.tsx`
- `src/components/home/HomeHeader.tsx`
- `src/components/home/QuickActions.tsx`
- `src/components/home/RecentAttemptsCard.tsx`
- `src/components/home/ReviewCountsCard.tsx`
- `src/components/home/SubjectsGrid.tsx`
- `src/components/home/WeakTopicsCard.tsx`
- `src/components/questionBank/BackupPanel.tsx`
- `src/components/questionBank/FileDropZone.tsx`
- `src/components/questionBank/GlobalPublishTab.tsx`
- `src/components/questionBank/ImportPreviewCard.tsx`
- `src/components/questionBank/LocalImportTab.tsx`
- `src/components/questionBank/LocalTestsPanel.tsx`
- `src/components/questionBank/QuestionBankStats.tsx`
- `src/components/results/DataTable.tsx`
- `src/components/results/LegacyResultTables.tsx`
- `src/components/results/QuestionWiseTable.tsx`
- `src/components/results/ResultTables.test.tsx`
- `src/components/results/ResultTables.tsx`
- `src/components/review/ArchivedSessionsPanel.tsx`
- `src/hooks/useAsyncSection.ts`
- `src/hooks/useQuestionBankAccess.ts`
- `src/hooks/useQuestionBankMetadata.ts`
- `src/pages/GenericChapterDetailPage.optionOrder.test.tsx`
- `src/pages/HomePage.test.tsx`
- `src/pages/MockTestShellPage.optionOrder.test.tsx`
- `src/pages/QuestionBankManager.test.tsx`
- `src/pages/QuestionBankManagerPage.tsx`
- `src/pages/QuestionBankPage.tsx`
- `src/pages/QuizPage.test.tsx`
- `src/pages/ResultScreens.test.tsx`
- `src/pages/ReviewCenter.restructure.test.tsx`
- `src/pages/RevisionCards.optionOrder.test.tsx`
- `src/pages/SubjectChaptersPage.favorite.test.tsx`
- `src/pages/TestExit.test.tsx`
- `src/services/archivedView.ts`
- `src/services/chapterLinks.ts`
- `src/services/chapterMeta.ts`
- `src/services/homeSnapshots.test.ts`
- `src/services/homeSnapshots.ts`
- `src/services/questionBank/backup.test.ts`
- `src/services/questionBank/backup.ts`
- `src/services/questionBank/bankDb.test.ts`
- `src/services/questionBank/bankDb.ts`
- `src/services/questionBank/bankEvents.ts`
- `src/services/questionBank/bankMigration.test.ts`
- `src/services/questionBank/bankUsage.ts`
- `src/services/questionBank/github/authProvider.ts`
- `src/services/questionBank/github/githubPublisher.test.ts`
- `src/services/questionBank/github/githubPublisher.ts`
- `src/services/questionBank/importPipeline.test.ts`
- `src/services/questionBank/importPipeline.ts`
- `src/services/questionBank/manifest.test.ts`
- `src/services/questionBank/manifest.ts`
- `src/services/questionBank/poolIntegration.test.ts`
- `src/services/questionBank/poolProvider.ts`
- `src/services/questionBank/pwaConfig.test.ts`
- `src/services/questionBank/remoteSync.test.ts`
- `src/services/questionBank/remoteSync.ts`
- `src/services/questionBank/repository.test.ts`
- `src/services/questionBank/repository.ts`
- `src/services/questionBank/sha256.test.ts`
- `src/services/questionBank/sha256.ts`
- `src/services/questionBank/startup.ts`
- `src/services/questionBank/testFile.test.ts`
- `src/services/questionBank/testFile.ts`
- `src/services/questionBank/types.ts`
- `src/services/resultContext.ts`
- `src/services/resultTables.test.ts`
- `src/services/resultTables.ts`
- `src/services/reviewChapterConcept.test.ts`
- `src/test/fakeGitHub.ts`
- `src/test/resultFixtures.ts`
- `src/utils/download.ts`
- `src/utils/optionOrder.test.ts`
- `src/utils/optionOrder.ts`

**Modified (39):**
- `src/App.tsx`
- `src/components/common/DailyGoalCard.tsx`
- `src/components/exam/FloatingQuestionNav.tsx`
- `src/components/home/ResumeTestsSection.tsx`
- `src/components/mock-analysis/AnalysisView.tsx`
- `src/components/mock-analysis/PracticeAnalysisExtras.test.tsx`
- `src/components/mock-analysis/PracticeAnalysisExtras.tsx`
- `src/components/review/ReviewHub.test.tsx`
- `src/components/review/ReviewHub.tsx`
- `src/index.css`
- `src/pages/DangerZonePage.tsx`
- `src/pages/GenericChapterDetailPage.tsx`
- `src/pages/HomePage.tsx`
- `src/pages/MockResultPage.tsx`
- `src/pages/MockTestShellPage.tsx`
- `src/pages/QuizPage.tsx`
- `src/pages/ReviewCenterPage.tsx`
- `src/pages/SettingsPage.tsx`
- `src/pages/SubjectChaptersPage.tsx`
- `src/pages/TestResultPage.tsx`
- `src/pages/TestReviewPage.tsx`
- `src/pages/UniversalResultPage.tsx`
- `src/pages/UniversalSessionPage.test.tsx`
- `src/pages/UniversalSessionPage.tsx`
- `src/pages/WrongQuestionsPage.tsx`
- `src/routes/AppRouter.tsx`
- `src/services/attemptLedgerService.ts`
- `src/services/db.migration.test.ts`
- `src/services/db.ts`
- `src/services/practiceAnalysisService.ts`
- `src/services/questionMarkService.ts`
- `src/services/questionRepository.ts`
- `src/services/reviewAnalytics.ts`
- `src/services/reviewCenterService.ts`
- `src/services/reviewItems.ts`
- `src/store/dailyGoalStore.ts`
- `src/types/index.ts`
- `src/types/mockAnalysis.ts`
- `vite.config.ts`
