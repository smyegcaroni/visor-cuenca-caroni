"use strict";

const CACHE_PREFIX = "visor-caroni-pwa";
const CACHE_VERSION = "20261014visoricon1";
const CORE_CACHE = `${CACHE_PREFIX}-core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`;
const IMAGE_CACHE = `${CACHE_PREFIX}-images-${CACHE_VERSION}`;

const OFFLINE_FALLBACK_ASSETS = [
  "./caroni-assets/favicons/favicon-16.png?v=20261014visoricon1",
  "./caroni-assets/favicons/favicon-32.png?v=20261014visoricon1",
  "./caroni-assets/favicons/favicon.ico?v=20261014visoricon1",
  "./caroni-assets/favicons/favicon.svg?v=20261014visoricon1",
  "./favicon.ico",
  "./offline.html",
  "./pwa.css?v=20261008theme1",
  "./caroni-branding/caroni-colors.css?v=1b5903823bc5",
  "./pwa.js?v=20261014visoricon1",
  "./caroni-assets/favicons/site.webmanifest?v=20261014visoricon1",
  "./caroni-assets/favicons/pwa-icon-192x192.png?v=20261014visoricon1",
  "./caroni-assets/favicons/pwa-icon-512x512.png?v=20261014visoricon1",
  "./caroni-assets/favicons/pwa-maskable-icon-192x192.png?v=20261014visoricon1",
  "./caroni-assets/favicons/pwa-maskable-icon-512x512.png?v=20261014visoricon1"
];

const APP_SHELL_ASSETS = [
  "./index.html",
  "./config.json",
  "./init/smyeg_geolens_auto.json",
  "./images/logo_fao.svg",
  "./build/TerriaMap.css",
  "./build/TerriaMap.js",
  "./build/svg-sprite.js",
  "./caroni-branding/logo-same-tab.js",
  "./caroni-assets/favicons/apple-touch-icon.png?v=20261014visoricon1"
];

function scopedUrl(relativePath) {
  return new URL(relativePath, self.registration.scope).href;
}

async function cacheCoreAssets() {
  const cache = await caches.open(CORE_CACHE);
  const cacheRequired = (assets) =>
    Promise.all(
      assets.map(async (asset) => {
        const request = new Request(scopedUrl(asset), { cache: "reload" });
        const response = await fetch(request);
        if (!response.ok) throw new Error(`No se pudo almacenar ${asset}`);
        await cache.put(request, response);
      })
    );

  await cacheRequired(OFFLINE_FALLBACK_ASSETS);

  try {
    await cacheRequired(APP_SHELL_ASSETS);
    await cache.put(
      scopedUrl("./__pwa_shell_ready__"),
      new Response("ready", { headers: { "Content-Type": "text/plain" } })
    );
  } catch (error) {
    console.warn(
      "La interfaz completa no pudo almacenarse para uso sin conexión.",
      error
    );
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(
    keys
      .slice(0, Math.max(0, keys.length - maxEntries))
      .map((key) => cache.delete(key))
  );
}

function canCache(response) {
  return (
    response &&
    response.ok &&
    response.type !== "opaque" &&
    !/no-store/i.test(response.headers.get("Cache-Control") || "")
  );
}

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (canCache(response)) {
      const cache = await caches.open(CORE_CACHE);
      await cache.put(scopedUrl("./index.html"), response.clone());
    }
    return response;
  } catch (_error) {
    const cache = await caches.open(CORE_CACHE);
    const shellReady = await cache.match(scopedUrl("./__pwa_shell_ready__"));
    if (shellReady) {
      const appShell = await cache.match(scopedUrl("./index.html"));
      if (appShell) return appShell;
    }
    return (await cache.match(scopedUrl("./offline.html"))) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached =
    (await cache.match(request)) ||
    (await (await caches.open(CORE_CACHE)).match(request));
  const networkUpdate = fetch(request)
    .then(async (response) => {
      if (canCache(response)) {
        await cache.put(request, response.clone());
        await trimCache(cacheName, maxEntries);
      }
      return response;
    })
    .catch(() => undefined);

  return cached || (await networkUpdate) || Response.error();
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheCoreAssets().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith(CACHE_PREFIX) &&
                ![CORE_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (/\/(proxy|api)\//i.test(url.pathname)) return;

  const localData =
    /\/(config|version)\.json$/i.test(url.pathname) ||
    /\/(init|languages)\//i.test(url.pathname);
  const staticResource = ["script", "style", "worker", "font"].includes(
    request.destination
  );

  if (localData || staticResource) {
    event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE, 120));
    return;
  }

  if (request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE, 80));
  }
});
