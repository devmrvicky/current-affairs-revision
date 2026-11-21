# ExamVerse Author Studio – Updated Local Question Workflow

## Entry and password

- Open the **person icon** at the top of the existing fixed sidebar (first navigation item), labelled **Author Studio**.
- It opens the existing protected Author Studio. The existing password creation/unlock, failed-attempt delay, manual lock and idle auto-lock behaviour are reused.
- The previous `/author-studio` URL redirects to `/author`; old bookmarks continue to work.

## Organise the local Question Bank

The Author Studio seeds four permanent subject folders in IndexedDB:

1. Mathematics
2. English
3. Reasoning
4. General Awareness

Open a subject to create folders, nested subfolders, starter JSON files, or upload one/multiple JSON files. Folder depth is not fixed. The permanent subject roots cannot be renamed, moved, duplicated or deleted; folders inside them can be managed normally. Older custom top-level folders are retained rather than moved automatically, so existing content is not silently reclassified.

## Add and edit questions

1. Open **My Question Bank** and navigate to a subject/folder.
2. Upload a `.json` file, create a new JSON file, or open an existing file.
3. In Preview, use **Add Question**, the pencil action, or the delete action.
4. In the structured editor, edit the question, options, correct option, difficulty and explanation. The underlying file schema and any wrapper metadata are retained. For unusual/unsupported question shapes, use the **Source** tab instead.
5. Press **Save** in the file viewer. Edits made in the structured editor are drafts until this Save action.

## Make a file available to Practice

An Author Studio file remains private until you explicitly link it to the local Question Bank:

1. Open a valid, saved JSON file.
2. Press **Add to Practice**.
3. Confirm Subject, Chapter/Folder name and Test title. The Subject and chapter title are prefilled from the selected folder path and file name, but can be changed.
4. Press **Add to Practice**.

The validated questions are projected into the app's existing local Question Bank repository. The existing Practice question pool then uses them; no second practice/test engine is introduced. Once linked, pressing **Save** after later edits updates the same local Practice test. **Remove from Practice** removes that projection but keeps the Author Studio source JSON.

Importing a JSON into Author Studio does not silently publish it: the explicit **Add to Practice** step is required. This avoids invalid/draft JSON being included in practice by accident.

## Existing controls retained

Author Studio continues to provide folder/file rename, move, copy, duplicate, favourites, search, list/grid view, import conflict handling, file validation, recent files, import history, Trash/Restore, ZIP backup and restore, and storage information. Copies of linked source files deliberately start unlinked so they cannot overwrite the original local Practice test. Moving a linked file does not silently change its Practice subject/chapter mapping. Also, moving a linked source file to Trash does not automatically delete its Practice projection; use **Remove from Practice** first when you want it removed from Practice/Mock Test as well.

## Storage and scope

- Source files, folder metadata, lock settings and backup history remain in the app's existing Author IndexedDB stores on this device/browser origin.
- The Practice copy is stored through the app's existing local Question Bank IndexedDB repository. Both stores are local; neither requires a cloud connection for this workflow. If you restore an Author Studio backup on a device where the matching local Practice test is missing, open the linked file and use **Practice settings → Update Practice settings** to rebuild that projection.
- Keep a ZIP backup before clearing browser/site data or moving to another device. Browser storage can be cleared by the user or browser; this is not a substitute for a backup.
- Cloud sync and PDF-to-Test extraction are **not implemented** in this update. The current practice integration reuses the existing question-bank repository, but a full cloud sync adapter is future work.

## Local verification

From the project folder:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run dev
```

Then check the person icon, password gate, four subject roots, nested folder creation, JSON upload, Add/Edit/Delete + Save, Add to Practice, subsequent edit-and-save sync, Trash/Restore, and backup/restore. Do this locally before pushing or deploying.
