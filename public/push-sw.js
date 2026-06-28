// Imported into the auto-generated service worker via Workbox's
// `importScripts` option (see vite.config.ts workbox.importScripts).
// This is the documented way to add a small amount of custom service-worker
// code (push handling) on top of the `generateSW` strategy, without
// switching to `injectManifest` and having to hand-rewrite all of the
// existing precaching / runtime-caching setup that already works.
//
// Plain JS, not processed by Vite/TypeScript — runs directly in the SW.

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    payload = { title: 'CA Revision', body: event.data ? event.data.text() : 'You have a new notification' };
  }
  var title = payload.title || 'CA Revision';
  var options = {
    body: payload.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: payload.tag || 'ca-revision',
    data: { url: payload.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientsArr) {
      for (var i = 0; i < clientsArr.length; i++) {
        var client = clientsArr[i];
        if ('focus' in client) {
          if ('navigate' in client) {
            try { client.navigate(targetUrl); } catch (e) { /* best effort */ }
          }
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// Best-effort silent resubscribe if the push service rotates the subscription.
// The app also re-syncs on next open via pushService.ts either way, so this
// is a bonus, not a requirement.
self.addEventListener('pushsubscriptionchange', function (event) {
  if (!event.oldSubscription) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({
        userVisibleOnly: true,
        applicationServerKey: event.oldSubscription.options.applicationServerKey,
      })
      .catch(function () { /* next app open will resubscribe */ })
  );
});
