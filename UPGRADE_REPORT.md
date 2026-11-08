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
