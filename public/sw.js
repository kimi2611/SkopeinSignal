const CACHE = 'skopein-shell-v37'
const CORE = [
  './manifest.webmanifest',
  './icons/icon-192-v52.png', './icons/icon-512-v52.png', './icons/icon-512-maskable-v52.png', './icons/apple-touch-icon-v52.png',
  './module-pigs/week.webp', './module-pigs/inbox.webp', './module-pigs/shows.webp',
  './module-pigs/dedupe.webp', './module-pigs/insights.webp', './module-pigs/study.webp',
  './module-pigs/cards.webp', './module-pigs/gallery.webp', './module-pigs/notes.webp',
  './module-pigs/guide.webp', './module-pigs/settings.webp', './module-pigs/entrance-pig.png',
  './module-pigs/stage-pig-tutu.png', './module-pigs/stage-pig-gift.png', './module-pigs/stage-pig-water.png',
]

// The on-device transcription runtime (Whisper model shards + ONNX WASM, well
// over 100 MB combined) must never enter the Cache API: on iOS/iPadOS a single
// cache is capped at roughly 50 MB per origin, and a failed cache.put rejects
// the whole respondWith chain, breaking the very transcription fetch it tried
// to accelerate. These paths are always served straight from the network.
const NEVER_CACHE = /^\/(models|ort)\//

// A chunk request that never settles is worse than one that fails: the module
// loader stays pending, React keeps the Suspense fallback up, and the user has
// no error to react to. Bound every asset fetch so a dead path becomes a fast
// failure the app can retry.
const ASSET_TIMEOUT_MS = 12000

async function fetchWithDeadline(request, ms = ASSET_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(request, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function timedOut(error) {
  return !!error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

async function safePut(cache, key, response) {
  try {
    await cache.put(key, response)
  } catch {
    // Quota or quota-policy failures must never break the fetch response.
  }
}

function isExpectedAssetResponse(url, response) {
  if (!response || response.status !== 200) return false
  const contentType = response.headers.get('Content-Type') || ''
  if (url.pathname.endsWith('.css')) return contentType.includes('text/css')
  if (url.pathname.endsWith('.js')) return /javascript|ecmascript/.test(contentType)
  return true
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // Vite emits root-absolute /assets/ URLs. Precache both the document and
    // its real JS/CSS assets before activating; otherwise an offline reopen
    // can render the saved workspace with browser-default, unstyled HTML.
    const response = await fetch('./index.html', { cache: 'no-store' })
    if (!response.ok || !(response.headers.get('Content-Type') || '').includes('text/html')) {
      throw new Error('The application document could not be cached')
    }
    const html = await response.clone().text()
    await cache.put('./index.html', response.clone())
    await cache.put('./', response.clone())
    const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)]
      .map((match) => new URL(match[1], self.registration.scope))
      .filter((url) => url.origin === self.location.origin && (url.pathname.startsWith('/assets/') || url.pathname.includes('/icons/')))
    for (const url of [...new Set(assets.map((item) => item.href))]) {
      const assetResponse = await fetch(url, { cache: 'no-store' })
      if (!isExpectedAssetResponse(new URL(url), assetResponse)) {
        throw new Error(`Invalid application asset: ${url}`)
      }
      await cache.put(url, assetResponse)
    }
    // Decorative shell files are optional: a single missing illustration or a
    // quota error must not strand the browser on an older service worker.
    await Promise.allSettled(CORE.map(async (url) => {
      const assetResponse = await fetch(url)
      if (assetResponse.status === 200) await safePut(cache, url, assetResponse)
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => (key.startsWith('tingwen-shell-') || key.startsWith('skopein-shell-')) && key !== CACHE).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

async function cachedRangeResponse(request) {
  const cached = await caches.match(request.url)
  if (!cached) return null
  const match = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || '')
  if (!match) return null
  const buffer = await cached.arrayBuffer()
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), buffer.byteLength - 1) : buffer.byteLength - 1
  if (start >= buffer.byteLength || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buffer.byteLength}` } })
  const body = buffer.slice(start, end + 1)
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': cached.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Length': String(body.byteLength),
      'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
      'Accept-Ranges': 'bytes',
    },
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Authentication and workspace revisions must always come from the server.
  // Cache only the app shell and media; never reuse a private API response.
  if (url.pathname.startsWith('/api/')) return
  if (NEVER_CACHE.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request)
        if (response.status === 200 && (response.headers.get('Content-Type') || '').includes('text/html')) {
          const cache = await caches.open(CACHE)
          await safePut(cache, './index.html', response.clone())
          return response
        }
        if (response.status >= 500) {
          const cached = (await caches.match('./index.html')) || (await caches.match('./'))
          if (cached) return cached
        }
        return response
      } catch {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error()
      }
    })())
    return
  }

  if (request.headers.has('range')) {
    event.respondWith((async () => {
      const synthesized = await cachedRangeResponse(request)
      if (synthesized) return synthesized
      // Chromium's media stack kills any response *streamed* through
      // respondWith — proxied or not, the element dies ~1s in with
      // MEDIA_ERR_NETWORK. A fully buffered 206 with explicit Content-Length
      // plays cleanly. Local recordings are a few MB, so buffering is safe.
      const response = await fetch(request.url)
      if (!response.ok) return response
      const buffer = await response.arrayBuffer()
      const match = /bytes=(\d+)-(\d*)/.exec(request.headers.get('range') || 'bytes=0-')
      const start = match ? Number(match[1]) : 0
      const end = match && match[2] ? Math.min(Number(match[2]), buffer.byteLength - 1) : buffer.byteLength - 1
      const body = buffer.slice(start, end + 1)
      return new Response(body, {
        status: 206,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
          'Content-Length': String(body.byteLength),
          'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
          'Accept-Ranges': 'bytes',
        },
      })
    })())
    if (url.pathname.includes('/recordings/')) {
      event.waitUntil((async () => {
        const cached = await caches.match(request.url)
        if (cached) return
        const response = await fetch(request.url)
        if (response.status === 200) {
          const cache = await caches.open(CACHE)
          await safePut(cache, request.url, response.clone())
        }
      })().catch(() => undefined))
    }
    return
  }

  // Illustrations live at stable paths (no content hash), so a cache-first
  // strategy would keep showing artwork from whichever build first cached it.
  // V49 shipped five themed art sets; returning visitors were still seeing the
  // pre-V49 images from cache `skopein-shell-v32`. Media is network-first now,
  // with the cached copy as the offline fallback.
  const isIllustration = /^\/(module-art|module-pigs|artworks|art-guides)\//.test(url.pathname)

  event.respondWith((async () => {
    const isBundleAsset = url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))
    if (isIllustration) {
      const cachedArt = await caches.match(request)
      try {
        const fresh = await fetchWithDeadline(request)
        if (fresh.status === 200) {
          const cache = await caches.open(CACHE)
          await safePut(cache, request, fresh.clone())
          return fresh
        }
        return cachedArt || fresh
      } catch (error) {
        if (cachedArt) return cachedArt
        if (timedOut(error)) return new Response('Artwork fetch timed out', { status: 504 })
        throw error
      }
    }
    const cached = await caches.match(request)
    // Bundle URLs are hashed, but a preview proxy or an interrupted earlier
    // load may have left an HTML error document cached under a CSS/JS URL.
    // Network-first bundle recovery repairs that copy instead of preserving a
    // permanently unstyled page. Offline, the validated pre-cache still wins.
    if (cached && (!isBundleAsset || isExpectedAssetResponse(url, cached)) && !isBundleAsset) return cached
    try {
      const response = await fetchWithDeadline(request)
      if (response.status === 200 && (!isBundleAsset || isExpectedAssetResponse(url, response))) {
        const cache = await caches.open(CACHE)
        await safePut(cache, request, response.clone())
        return response
      }
      if (cached && isExpectedAssetResponse(url, cached)) return cached
      return response
    } catch (error) {
      if (cached && (!isBundleAsset || isExpectedAssetResponse(url, cached))) return cached
      // Fail fast and clearly: a rejected module load can be retried by the
      // app, a hung one cannot.
      if (timedOut(error)) return new Response('Asset fetch timed out', { status: 504 })
      throw error
    }
  })())
})
