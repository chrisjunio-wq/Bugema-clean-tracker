
'use strict';

/* =========================================================
   BUGEMA CLEAN COMMUNITY TRACKER
   Progressive Web App service worker
   ========================================================= */

const CACHE_NAME = 'bugema-clean-v6';

const STATIC_ASSETS = [
  '/home.html',
  '/report.html',
  '/track.html',
  '/style.css',
  '/app.js',
  '/locations.js',
  '/teams.js',
  '/reporters.js',
  '/logs.js',
  '/manifest.json',
  '/icon.svg'
];

const NEVER_CACHE_PATHS = [
  '/api/',
  '/admin',
  '/track'
];

/* -------------------------
   Install
------------------------- */

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(
          STATIC_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: 'reload' }))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

/* -------------------------
   Activate
------------------------- */

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((name) => name.startsWith('bugema-clean-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/* -------------------------
   Cache exclusions
------------------------- */

function shouldNeverCache(url) {
  return NEVER_CACHE_PATHS.some((path) =>
    url.pathname === path ||
    url.pathname.startsWith(path + '/') ||
    url.pathname.startsWith(path + '?')
  );
}

function isStaticAsset(url) {
  return STATIC_ASSETS.includes(url.pathname);
}

/* -------------------------
   Static asset strategy
   Cache first, network fallback
------------------------- */

async function handleStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);

    if (response.ok && response.type === 'basic') {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    return new Response('This resource is unavailable offline.', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
  }
}

/* -------------------------
   Page navigation strategy
   Network first, offline fallback
------------------------- */

async function handleNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE_NAME);

    const requestedPage = new URL(request.url).pathname;

    const cachedPage = await cache.match(requestedPage);

    if (cachedPage) {
      return cachedPage;
    }

    const homePage = await cache.match('/home.html');

    if (homePage) {
      return homePage;
    }

    return new Response(
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head><body><h2>You are offline</h2><p>Please reconnect to use the Bugema Clean Community Tracker.</p></body></html>',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8'
        }
      }
    );
  }
}

/* -------------------------
   Fetch handling
------------------------- */

self.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (shouldNeverCache(url)) {
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
  }
});
