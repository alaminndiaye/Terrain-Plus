import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

interface SWExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface SWMessageEvent extends SWExtendableEvent {
  data: {
    type?: string;
  } | null;
}

interface SWClient {
  url: string;
  focus(): Promise<SWClient>;
  navigate?(url: string): Promise<SWClient | null>;
}

interface SWClientsNamespace {
  matchAll(options?: {
    type?: 'window' | 'worker' | 'sharedworker' | 'all';
    includeUncontrolled?: boolean;
  }): Promise<SWClient[]>;
  openWindow(url: string): Promise<SWClient | null>;
}

interface SWNotificationEvent extends SWExtendableEvent {
  notification: Notification & { data?: { url?: string } };
}

interface SWGlobalScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  clients: SWClientsNamespace;
  skipWaiting(): Promise<void>;
  addEventListener(type: 'message', listener: (event: SWMessageEvent) => void): void;
  addEventListener(type: 'install' | 'activate', listener: (event: SWExtendableEvent) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: SWNotificationEvent) => void): void;
}

declare global {
  interface Window {
    __WB_MANIFEST: Array<PrecacheEntry | string>;
  }
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

sw.addEventListener('message', (event: SWMessageEvent) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'SKIP_WAITING') {
    event.waitUntil(sw.skipWaiting());
    return;
  }

  if (msg.type === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_RUNTIME_CACHE));
  }
});

sw.addEventListener('notificationclick', (event: SWNotificationEvent) => {
  event.notification.close();
  const rawUrl = event.notification?.data?.url || '/';
  const targetUrl = new URL(rawUrl, sw.location.origin).href;

  event.waitUntil(
    sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(sw.location.origin)) {
          return client.focus().then((focused) => (focused.navigate ? focused.navigate(targetUrl) : focused));
        }
      }
      return sw.clients.openWindow(targetUrl);
    })
  );
});

