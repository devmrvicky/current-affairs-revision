// An in-memory GitHub: just the REST endpoints the publisher uses, with real Git semantics (commits, trees, blobs, fast-forward-only ref updates),
// a log of every request, and hooks to inject other people's pushes, failures and odd responses.
import { sha256Hex } from '../services/questionBank/sha256';

// ─── An in-memory GitHub (just the endpoints the publisher uses) ─────────────
export function fakeGitHub(initial: Record<string, string> = {}) {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Map<string, string>>();
  const commits = new Map<string, { tree: string; parents: string[]; message: string }>();
  let n = 0;
  const newSha = (s: string) => sha256Hex(`${s}:${n++}`).slice(0, 40);
  const blobSha = (content: string) => sha256Hex(`blob:${content}`).slice(0, 40);
  const putBlob = (content: string) => { const sha = blobSha(content); blobs.set(sha, content); return sha; };
  const files0 = new Map(Object.entries(initial).map(([p, c]) => [p, putBlob(c)]));
  const t0 = newSha('tree'); trees.set(t0, files0);
  let head = newSha('commit'); commits.set(head, { tree: t0, parents: [], message: 'init' });

  const calls: { method: string; path: string; headers: Record<string, string>; body?: { content?: string; base_tree?: string; tree?: { path: string; sha: string | null }[]; tree_sha?: string; sha?: string; parents?: string[]; force?: boolean; message?: string } }[] = [];
  const hooks: { beforeRefUpdate?: () => void; fail?: (method: string, path: string) => Response | Error | undefined; refResponseSha?: string } = {};

  /** Another person commits straight to the branch. */
  const pushAsSomeoneElse = (changes: Record<string, string | null>) => {
    const parent = commits.get(head)!;
    const tree = new Map(trees.get(parent.tree)!);
    for (const [p, c] of Object.entries(changes)) { if (c === null) tree.delete(p); else tree.set(p, putBlob(c)); }
    const ts = newSha('tree'); trees.set(ts, tree);
    const cs = newSha('commit'); commits.set(cs, { tree: ts, parents: [head], message: 'someone else' });
    head = cs;
  };
  const fileAtHead = (path: string) => { const sha = trees.get(commits.get(head)!.tree)!.get(path); return sha ? blobs.get(sha) : undefined; };

  const json = (data: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers });
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const path = u.pathname.replace('/repos/acme/exam-app', '');
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ method, path, headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const injected = hooks.fail?.(method, path);
    if (injected instanceof Error) throw injected;
    if (injected) return injected;
    if (method === 'GET' && path === '/git/ref/heads/main') return json({ object: { sha: head } });
    if (method === 'GET' && path.startsWith('/git/ref/heads/')) return json({ message: 'Not Found' }, 404);
    const cm = /^\/git\/commits\/(.+)$/.exec(path);
    if (method === 'GET' && cm) return commits.has(cm[1]) ? json({ tree: { sha: commits.get(cm[1])!.tree } }) : json({ message: 'Not Found' }, 404);
    const ct = /^\/contents\/(.+)$/.exec(path);
    if (method === 'GET' && ct) {
      const ref = u.searchParams.get('ref')!;
      const sha = trees.get(commits.get(ref)!.tree)!.get(decodeURIComponent(ct[1]));
      if (!sha) return json({ message: 'Not Found' }, 404);
      return json({ sha, encoding: 'base64', content: btoa(String.fromCharCode(...new TextEncoder().encode(blobs.get(sha)!))) });
    }
    if (method === 'POST' && path === '/git/blobs') return json({ sha: putBlob(JSON.parse(String(init.body)).content) }, 201);
    if (method === 'POST' && path === '/git/trees') {
      const b = JSON.parse(String(init.body));
      const tree = new Map(trees.get(b.base_tree)!);
      for (const e of b.tree) { if (e.sha === null) tree.delete(e.path); else tree.set(e.path, e.sha); }
      const sha = newSha('tree'); trees.set(sha, tree); return json({ sha }, 201);
    }
    if (method === 'POST' && path === '/git/commits') {
      const b = JSON.parse(String(init.body));
      const sha = newSha('commit'); commits.set(sha, { tree: b.tree, parents: b.parents, message: b.message }); return json({ sha }, 201);
    }
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      hooks.beforeRefUpdate?.(); hooks.beforeRefUpdate = undefined;
      const b = JSON.parse(String(init.body));
      if (!commits.get(b.sha)!.parents.includes(head) || b.force) return json({ message: 'Update is not a fast forward' }, 422);
      head = b.sha;
      return json({ object: { sha: hooks.refResponseSha ?? head } });
    }
    return json({ message: 'unexpected ' + method + ' ' + path }, 500);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls, hooks, pushAsSomeoneElse, fileAtHead, head: () => head, commits, trees, blobs, treeAtHead: () => trees.get(commits.get(head)!.tree)! };
}

