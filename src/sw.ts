import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

interface SWWindowClient {
  url: string;
  focused: boolean;
  focus(): Promise<SWWindowClient>;
  postMessage(message: unknown): void;
}

interface SWNotification extends Notification {
  data: {
    url?: string;
    scheduledId?: number | null;
    sessionId?: number | null;
  };
}

interface SWRegistration extends ServiceWorkerRegistration {
  getNotifications(filter?: { tag?: string; includeTriggered?: boolean }): Promise<SWNotification[]>;
}

interface SWExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SWMessageEvent extends SWExtendableEvent {
  data: {
    type?: string;
    payload?: LocalNotificationPayload;
    tag?: string;
    tagPrefix?: string;
  } | null;
}

interface SWNotificationEvent extends SWExtendableEvent {
  action: string;
  notification: SWNotification;
}

interface SWGlobalScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  registration: SWRegistration;
  location: Location;
  clients: {
    matchAll(options?: { type?: string; includeUncontrolled?: boolean }): Promise<SWWindowClient[]>;
    openWindow(url: string): Promise<SWWindowClient | null>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'message', listener: (event: SWMessageEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: SWNotificationEvent) => void): void;
  addEventListener(type: 'install' | 'activate', listener: (event: SWExtendableEvent) => void): void;
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
}

export interface LocalNotificationPayload {
  title: string;
  body: string;
  tag: string;
  url?: string;
  scheduledId?: number | null;
  sessionId?: number | null;
  triggerAt?: number | null;
  renotify?: boolean;
}

const API_RUNTIME_CACHE = 'api-runtime-cache';
const sw = self as unknown as SWGlobalScope;

const status200OnlyPlugin = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    return response && response.status === 200 ? response : null;
  },
};

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

sw.skipWaiting();
clientsClaim();

// Fast fallback for document navigations when network drops or stalls (>3s)
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-nav-cache',
    networkTimeoutSeconds: 3,
    plugins: [
      status200OnlyPlugin,
      new ExpirationPlugin({
        maxEntries: 15,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  })
);

// Runtime NetworkFirst (3s timeout) for read-only public & workspace overview endpoints
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.origin === sw.location.origin &&
    (url.pathname.startsWith('/api/public/') ||
      url.pathname === '/api/athlete/workspace' ||
      url.pathname === '/api/coach/overview' ||
      url.pathname === '/api/admin/overview' ||
      url.pathname === '/api/minister/overview'),
  new NetworkFirst({
    cacheName: API_RUNTIME_CACHE,
    networkTimeoutSeconds: 3,
    plugins: [
      status200OnlyPlugin,
      new ExpirationPlugin({
        maxEntries: 40,
        maxAgeSeconds: 60 * 60 * 24 * 7,
      }),
    ],
  })
);

// CacheFirst on-demand for sports photos, exercise diagrams, and brand assets
registerRoute(
  ({ url, request }) =>
    url.origin === sw.location.origin &&
    (request.destination === 'image' || /\.(?:png|jpg|jpeg|webp|svg|ico)$/i.test(url.pathname)),
  new CacheFirst({
    cacheName: 'terrain-media-cache',
    plugins: [
      status200OnlyPlugin,
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.googleapis\.com\/.*/i,
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  })
);

registerRoute(
  /^https:\/\/fonts\.gstatic\.com\/.*/i,
  new CacheFirst({
    cacheName: 'gstatic-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  })
);

async function showLocalReminder(payload: LocalNotificationPayload): Promise<void> {
  const options: Record<string, unknown> = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/brand/terrain-mark.png',
    tag: payload.tag,
    renotify: Boolean(payload.renotify),
    vibrate: [180, 90, 180],
    data: {
      url: payload.url || '/',
      scheduledId: payload.scheduledId ?? null,
      sessionId: payload.sessionId ?? null,
    },
    actions: [
      { action: 'open-session', title: 'Ouvrir la séance' },
      { action: 'dismiss', title: 'Plus tard' },
    ],
  };

  if (typeof payload.triggerAt === 'number' && payload.triggerAt > Date.now() + 2000) {
    const TriggerCtor = (globalThis as unknown as { TimestampTrigger?: new (ts: number) => unknown }).TimestampTrigger;
    if (TriggerCtor) {
      options.showTrigger = new TriggerCtor(payload.triggerAt);
    }
  }

  await sw.registration.showNotification(payload.title, options as NotificationOptions);
}

sw.addEventListener('message', (event: SWMessageEvent) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'SKIP_WAITING') {
    event.waitUntil(sw.skipWaiting());
    return;
  }

  if (msg.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_RUNTIME_CACHE));
    return;
  }

  if (msg.type === 'SHOW_SESSION_REMINDER' && msg.payload) {
    event.waitUntil(showLocalReminder(msg.payload));
    return;
  }

  if (msg.type === 'CANCEL_REMINDERS' && msg.tagPrefix) {
    const prefix = msg.tagPrefix;
    event.waitUntil(
      sw.registration.getNotifications({ includeTriggered: true }).then((list) => {
        for (const notif of list) {
          if (notif.tag && notif.tag.startsWith(prefix)) {
            notif.close();
          }
        }
      })
    );
  }
});

sw.addEventListener('notificationclick', (event: SWNotificationEvent) => {
  event.notification.close();
  if (event.action === 'dismiss') {
    return;
  }

  const data = event.notification.data || {};
  const targetPath = data.scheduledId
    ? `/?tab=programme&scheduledId=${encodeURIComponent(String(data.scheduledId))}`
    : data.url || '/?tab=programme';
  const targetUrl = new URL(targetPath, sw.location.origin).href;

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(sw.location.origin)) {
          await client.focus();
          client.postMessage({
            type: 'OPEN_SCHEDULED_SESSION',
            scheduledId: data.scheduledId ?? null,
            sessionId: data.sessionId ?? null,
            url: targetPath,
          });
          return;
        }
      }
      await sw.clients.openWindow(targetUrl);
    })
  );
});
