import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

// Override the default WorkerGlobalScope `self` type with the SW-specific scope.
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    allowlist: [/^(?!\/_).*/],
  })
)

// Let the React app trigger activation of the waiting SW via the "Update" button.
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  if (event.data?.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})

self.addEventListener('install', (event: ExtendableEvent) => {
  // self.registration.active is null on the very first install — skip the notification.
  if (!self.registration.active) return

  event.waitUntil(
    (async () => {
      if (Notification.permission !== 'granted') return

      // Respect the app-level opt-out stored by the Settings page.
      const prefsCache = await caches.open('sk-app-prefs')
      const prefEntry = await prefsCache.match('/notifications-enabled')
      if (prefEntry && await prefEntry.text() === 'false') return

      // If the user already has the app open and visible, the in-app toast handles it.
      const clients = await self.clients.matchAll({ type: 'window' })
      if (clients.some(c => (c as WindowClient).visibilityState === 'visible')) return

      const lang = navigator.language.slice(0, 2)
      const title = lang === 'sv' ? 'Ny version tillgänglig'
        : lang === 'ja' ? '新バージョンが利用可能'
        : lang === 'tr' ? 'Yeni sürüm mevcut'
        : 'New version available'
      const body = lang === 'sv' ? 'Klicka för att öppna och uppdatera appen.'
        : lang === 'ja' ? 'タップしてアプリを開き、更新してください。'
        : lang === 'tr' ? 'Uygulamayı açmak ve güncellemek için dokunun.'
        : 'Tap to open the app and update.'

      await self.registration.showNotification(title, {
        body,
        icon: '/android-chrome-192x192.png',
        badge: '/favicon-32x32.png',
        tag: 'app-update',
      })
    })()
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = clients.find(c => c.url.startsWith(self.location.origin))
      if (app) {
        await (app as WindowClient).focus()
      } else {
        await self.clients.openWindow(self.location.origin)
      }
    })()
  )
})
