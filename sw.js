// Offline shell for the hosted build. The build stamps VERSION with the
// content hash of index.html, so every deploy gets its own cache and the
// previous one is removed on activation. Navigations are network-first so a
// new deploy shows up on the next reload; everything else is cache-first.
const VERSION = "__BUILD_VERSION__";
const CACHE = "roadster-" + VERSION;
const SHELL = [
  "./",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("roadster-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== location.origin
  )
    return;
  if (request.mode === "navigate") {
    const url = new URL(request.url);
    const base = new URL(self.registration.scope);
    const shell =
      url.pathname === base.pathname ||
      url.pathname === base.pathname + "index.html";
    // Keep the game shell separate from the visual study and other pages.
    // Query parameters select runtime modes, not separate document shells.
    const key = shell ? base.href : url.origin + url.pathname;
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE).then((cache) => cache.put(key, copy)),
            );
          }
          return response;
        })
        .catch(
          async () =>
            (await caches.match(key)) ||
            new Response("This page is not available offline yet.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            }),
        ),
    );
    return;
  }
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
