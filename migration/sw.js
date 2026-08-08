// Self-destroying service worker for the retired origin.
//
// The old PWA registered a worker here that precaches the app shell and serves
// EVERY navigation from cache (NavigationRoute -> index.html in src/sw.ts).
// Returning visitors would therefore keep seeing the old app no matter what this
// server responds with, and the old worker would carry on handling push events
// and opening old-origin URLs when a notification is tapped.
//
// Browsers re-fetch the worker script when checking for updates, bypassing the
// HTTP cache (updateViaCache defaults to "imports"). Serving this file at the
// same URL is therefore what actually retires the PWA: it takes over, drops
// every cache, unregisters itself, and reloads open tabs — which then reach the
// network and land on the migration page.
//
// Unregistering also discards the push subscription tied to this origin. That is
// intended: those subscriptions open the old site, which no longer works.

self.addEventListener("install", function () {
  // Don't wait for existing tabs to close before taking over.
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      // Drop the precached app shell and every other cache this origin holds.
      const keys = await caches.keys();
      await Promise.all(keys.map(function (key) { return caches.delete(key); }));

      await self.registration.unregister();

      // Reload open tabs. They are currently showing the cached old app; without
      // this they would keep showing it until the user navigates.
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })()
  );
});
