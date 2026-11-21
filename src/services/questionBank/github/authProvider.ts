// ─── Publishing credentials ──────────────────────────────────────────────────
// The publish UI depends ONLY on `PublishAuthProvider`. Today's implementation is a session-only fine-grained personal access
// token typed by the admin; a serverless GitHub-App broker (which mints short-lived installation tokens for a signed-in admin) can
// replace it by implementing this same interface — nothing in the UI or the publisher changes. A GitHub App's private key must
// never be put in the frontend; it belongs in that broker.
//
// SECURITY NOTES (also in UPGRADE_REPORT.md):
//  • The token is held in memory only — never in localStorage / sessionStorage / IndexedDB, never logged, never sent to analytics or
//    error reporting. It is dropped on lock/sign-out, after 15 idle minutes, and by closing the tab.
//  • A browser-side token is exposed to the authorised session (anything running in this page can read it). It is a convenience for
//    a trusted admin on a trusted device, NOT a shared production credential. Use a fine-grained token limited to this one
//    repository with "Contents: Read and write" only, and an expiry.
//  • `isAdmin` in the UI only decides whether the screens are shown. The real authorization to publish is GitHub's: without a
//    valid token that has write access to the repository, nothing can be published by anyone.

export interface PublishAuthProvider {
  readonly kind: 'session-token' | 'github-app-broker';
  /** The token to send to GitHub right now, or null when the admin hasn't authenticated (or the session expired). */
  getToken(): Promise<string | null>;
  isAuthenticated(): boolean;
  /** Forget the credential immediately. */
  clear(): void;
}

export const TOKEN_IDLE_MS = 15 * 60_000;

export class SessionTokenAuthProvider implements PublishAuthProvider {
  readonly kind = 'session-token' as const;
  #token: string | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  readonly #idleMs: number;
  readonly #listeners = new Set<() => void>();

  constructor(idleMs: number = TOKEN_IDLE_MS) { this.#idleMs = idleMs; }

  /** Throws if the value cannot be a token (empty, or contains whitespace). Never echoes the value. */
  setToken(value: string): void {
    const token = value.trim();
    if (!token || /\s/.test(token)) throw new Error('That does not look like a GitHub token.');
    this.#token = token;
    this.#arm();
    this.#notify();
  }

  async getToken(): Promise<string | null> {
    if (this.#token) this.#arm(); // activity keeps the session alive
    return this.#token;
  }

  isAuthenticated(): boolean { return this.#token !== null; }

  clear(): void {
    const had = this.#token !== null;
    this.#token = null;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (had) this.#notify();
  }

  /** For the UI to re-render when the token is set or dropped (it is told THAT, never what). */
  subscribe(listener: () => void): () => void { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; }

  #arm() {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.clear(), this.#idleMs);
  }
  #notify() { for (const l of this.#listeners) l(); }
}

/** The one in-memory credential for this tab. */
export const sessionAuth = new SessionTokenAuthProvider();
