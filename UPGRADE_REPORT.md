# ExamVerse upgrade — delivery report

This is an honest account. Several parts of the master prompt are **not done** in this pass; they are listed in §3, not hidden.

## 1. Fully implemented and verified

| Area | What now works | How it was verified |
|---|---|---|
| **✕ on a Resume card archives, never deletes** (§3) | ✕ now copies the whole session into a new `archivedSessions` store, *then* removes it from Resume. If the archive write fails, nothing is removed. Previously ✕ hard-deleted. | 6 service tests + 4 rendered-UI tests (card disappears, record and answers survive, other sessions untouched, Cancel changes nothing, completed sessions never listed) |
| **Resume Tests grouped** (§2/§3) | Cards grouped under a subject / "Mixed subjects" / "Current Affairs" / "Mock tests" heading, newest first. Shows title, progress, position, time left, marks, last activity. | grouping unit test + UI test |
| **Resilience** (§3/§16) | One malformed saved session no longer hides all the others (found by a test). | migration test |
| **Explanation speaker** (§12.2) | **Listen/Stop** button in 8 explanation areas. Hindi/English detected from the text (by script), mixed text is split into per-language runs, markup and simple KaTeX are turned into speakable words, long text is chunked. Starts only on press; uses only the browser's `speechSynthesis` (no network, no API). Missing Hindi voice → says so and does **not** read Hindi in an English voice. Unsupported browser → disabled with a label. Stops on unmount / next question. | 12 + 5 unit tests, 6 rendered tests with a mocked `speechSynthesis` |
| **Author Studio at `/author-studio`** (§13) | Everything below. | 76 service tests + 6 UI tests + 6 isolation/migration tests |
| – Author Lock | PBKDF2-SHA-256 (600 000 iterations) with a random salt via Web Crypto; plaintext never stored; retry delay after 3 misses (5 s doubling to 15 min) that **survives reload**; inactivity auto-lock (timestamp-based) and manual lock; always locked after a restart; change password. | real PBKDF2 run in UI tests; tests assert no plaintext in storage |
| – Folders & files | Unlimited nesting; create / rename / move / copy / duplicate / favourite / export; cycle prevention; case-insensitive duplicate-name handling; drag-and-drop and folder upload; list + grid view; breadcrumb, tree (mobile: drawer), search, sort, filter, multi-select + bulk move/copy/export/delete, context menu, details panel. | service + UI tests |
| – Import conflicts | Skip / Keep both / Replace. **Replace asks a second time** and nothing is replaced silently. | UI test proves Cancel on the second prompt changes nothing |
| – Validation | Against the schema the app really loads (bare array or `{questions}`; string or `{id,text}` options; answer as id/letter/text; numeric or string ids). Errors vs warnings, duplicate ids, unsupported type, invalid references (subject/topic/exam), engine-independent JSON error line/column, BOM tolerance. Preview / Source / Validation tabs, live revalidation, edit, save, download, replace-from-file. A real shipped file is in the test suite. | 12 tests |
| – Trash | Soft delete; whole folder hierarchies restore as one; restores to top level if the original folder is gone; renames instead of overwriting; permanent delete only from Trash. | 25 data-layer tests |
| – Backup / restore (ZIP) | Selection / bank / full backups; built from an allow-list so **the lock, hash and Trash can never be included** (tested). Restore: read → validate → preview (new / identical / conflicting) → merge or replace-all (current bank goes to **Trash**, recoverable) → confirm → one atomic transaction → report. Hardened ZIP reader (path traversal, entry-count and size limits, deflate-bomb guard, checksum, encrypted/ZIP64 refused). | 10 ZIP + 12 backup tests incl. forced mid-restore failure leaves the studio unchanged |
| – Storage architecture | Added to the **existing** IndexedDB (v11→v12, additive, idempotent). File content is a separate store from metadata so lists/dashboard never load question text. All multi-record changes run in one transaction that **aborts** on error (verified by injecting a failure). Quota errors become plain-language messages. | migration test with v11 records |
| – Private/public isolation | Static test: nothing outside Author Studio (except the DB schema and router) mentions it; Author Studio imports no public question source, sync layer or network client and never calls `fetch`. Runtime test: using it changes no public store and makes no request. | 6 tests |
| **Revision priority, repeated mistakes, improvement** (§8.5–8.7) | New **Insights** tab in Review Center. Priority is a documented 0–100 score where every point is listed ("Wrong 3 times +30 …") and the formula is shown in-app; mastered questions fade; unmarked never-wrong questions get **no** score; marked-but-unattempted get a low-confidence score. Improvement compares older vs newer attempts and refuses to call a trend below 5 answered attempts per period, saying why. | 22 unit + 5 UI tests |
| **Unified Weak Topics** (§9) | Review Center's Weak tab now uses one analysis over every ledger source with de-duplication, accuracy, attempts, repeated mistakes, average time, sessions, and a per-source split. **A topic is not rated until 10 answered attempts** ("Insufficient data" otherwise). | unit tests + a rendered Review Center test |

## 2. Already present in the code you supplied — I did not change or re-test these
Floating Previous/Next buttons, Submit Test dialog, ←/→ keyboard navigation, mark-purpose sheet, topic picker modal and manage-visibility modal, chapter **T** button, desktop side drawer for explanations, rich Markdown/KaTeX rendering (with legacy handling), daily-goal card, Resume/Back saving, multi-session registry. The Home page already had no "Today Revision" or "Current Affairs Progress". I did not run the spec §17 flows for these (e.g. changing an answer in Test mode, Back-then-Resume timer restore, refresh mid-session).

## 3. NOT done
- **Overall + sectional timers configurable for practice/test sessions** (§4). The code has section timers for mocks only; I did not add manual configuration for the others.
- **Unlimited-depth Subject→Chapter→Topic→Subtopic hierarchy** with optional parent/child metadata (§5); search/sort inside the hierarchy.
- **Review Center redesign** (§8.1–8.4, §10): the five unified categories across all subjects, the full filter set, month-wise Current Affairs revision, and **generating revision tests from Review Center**. Only the Insights tab and Weak Topics change were done.
- **Practice analysis parity with Mock analysis** (§11).
- Concept-level grouping: attempts do not store a concept id, so analytics stop at subject/topic.
- A screen to browse **archived** sessions (they are safely stored but there is no UI for them yet).
- Author Studio is not linked from the public navigation (open `/author-studio` directly).

## 4. Data-model changes
`DB_VERSION` 11 → 12, additive and idempotent (each store is created only if missing): `archivedSessions`, `authorFolders`, `authorFiles`, `authorContent`, `authorImports`, `authorMeta`. No existing store, record, id or `topicId` was touched. `ResumableSessionSummary` gained a derived `group` field (not stored).

## 5. Checks run
- `tsc -b`: clean. `vite build`: succeeds (Author Studio is a separate lazy chunk, ≈31 kB gzipped).
- `vitest run`: **154 tests in 16 files, all passing**, three consecutive runs identical.
- ESLint: **89 errors / 29 warnings both before and after** — all pre-existing; no file got worse. I did not fix the 89 existing ones.
- Bugs the tests caught in my own code and that were fixed: a transaction auto-commit race in password setup; parent-folder favourites lost on restore; stale validation shown after quick tab switch; a misleading "unavailable" message while loading; a "Low · 0" priority shown for never-wrong questions; and one malformed record hiding every Resume card.

## 6. Limitations and things to check yourself
- **No real browser was available.** UI tests run real components in jsdom against a real IndexedDB implementation, but I have not seen it on a phone. Please check mobile layout of Author Studio and the Resume cards.
- Speech needs installed voices; Hindi voices are often missing on desktop browsers.
- The Author Lock is a privacy gate, **not encryption**: files are stored unencrypted in the browser; a forgotten password cannot be recovered. PBKDF2 at 600 000 iterations can take around a second on slow phones.
- Trash is not included in backups. Replace-all restore moves the current bank to Trash first.
- Revision-priority weights are my design choices (documented and visible in the app), not tuned on real learning data.
- New dev dependencies: `vitest`, `jsdom`, `fake-indexeddb`, `@testing-library/*`. Run with `npm test`.
