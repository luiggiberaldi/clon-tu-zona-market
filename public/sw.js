// Retire the legacy PWA: private checkout/account responses must not be cached.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const legacy = ['apis', 'others', 'next-data', 'cross-origin', 'static-data-assets'];
    const names = await caches.keys();
    await Promise.all(names.filter(name => legacy.includes(name) || name.startsWith('workbox-precache')).map(name => caches.delete(name)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
