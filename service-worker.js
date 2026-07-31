const CACHE_NAME = "painel-solicitacoes-v46";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./supabase-compat.js",
  "./supabase-config.js",
  "./security-config.js",
  "./save-flow.js",
  "./version.json",
  "./logo-soften.png",
  "./favicon.png",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.webmanifest"
];

const STATIC_PATHS = new Set(APP_SHELL.map((entry) => new URL(entry, self.location.href).pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put("./index.html", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("./index.html")) || Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }

  if (STATIC_PATHS.has(url.pathname)) {
    event.respondWith(cacheFirstStatic(event.request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CLEAR_PRIVATE_CACHE") return;
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("painel-private-")).map((key) => caches.delete(key))
    ))
  );
});
