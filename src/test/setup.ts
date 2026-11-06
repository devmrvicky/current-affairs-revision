// Real IndexedDB semantics (indexes, transactions, versioned upgrades) in Node/jsdom.
import 'fake-indexeddb/auto';

// jsdom has no Web Crypto subtle API; Node does. Borrow it so PBKDF2 runs for real in component tests.
// (Dynamic import via a variable keeps the app's tsconfig from needing Node typings.)
if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  const specifier = 'node:crypto';
  const { webcrypto } = (await import(/* @vite-ignore */ specifier)) as { webcrypto: Crypto };
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
