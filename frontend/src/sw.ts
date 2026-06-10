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

// Payload pushed by the backend (see backend/persistence/internal/push).
interface PushPayload {
  title?: string
  body?: string
  url?: string
}

// Web Push: the browser's push service wakes the service worker and delivers the
// VAPID-signed message here, even when the app isn't open. userVisibleOnly means
// we must show a notification for every push.
self.addEventListener('push', (event: PushEvent) => {
  let data: PushPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    // Non-JSON payload — fall back to plain text in the body.
    data = { body: event.data?.text() }
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Shorinji Kempo', {
      body: data.body,
      icon: '/android-chrome-192x192.png',
      badge: '/favicon-32x32.png',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetPath = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  const targetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const app = clients.find(c => c.url.startsWith(self.location.origin))
      if (app) {
        const win = app as WindowClient
        await win.focus()
        await win.navigate(targetUrl).catch(() => {})
      } else {
        await self.clients.openWindow(targetUrl)
      }
    })()
  )
})
