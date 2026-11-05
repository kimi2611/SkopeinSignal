import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * The service worker is the first line of defence against a chunk request that
 * never settles: it bounds its own asset fetches, so a dead network path turns
 * into a fast 504 that the app can retry, instead of a pending module load that
 * pins the Suspense fallback forever.
 *
 * This test evals public/sw.js with stubbed SW globals and drives the fetch
 * handler directly, because the failure mode is impossible to trigger from a
 * normal unit test (and hard to trigger even in a browser).
 */
function loadServiceWorker(fetchImpl: (request: Request) => Promise<Response>, cached?: Response) {
  // Shorten the production deadline so the test does not wait 15 s per attempt.
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
    .replace(/const ASSET_TIMEOUT_MS = \d+/, 'const ASSET_TIMEOUT_MS = 60')
  const listeners: Record<string, (event: unknown) => void> = {}
  const cache = {
    put: vi.fn(async () => {}),
    match: vi.fn(async () => cached ?? undefined),
  }
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => { listeners[type] = handler },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
    registration: { scope: 'https://example.test/' },
    location: { origin: 'https://example.test' },
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
    match: vi.fn(async () => cached ?? undefined),
  }
  const factory = new Function('self', 'caches', 'fetch', 'Response', 'Request', 'AbortController', 'setTimeout', 'clearTimeout', source)
  factory(self, caches, fetchImpl, Response, Request, AbortController, setTimeout, clearTimeout)
  return { listeners, cache }
}

function dispatchFetch(handler: (event: unknown) => void, url: string) {
  let responded: Promise<Response> | undefined
  const event = {
    request: new Request(url),
    respondWith: (promise: Promise<Response>) => { responded = promise },
    waitUntil: () => {},
  }
  handler(event)
  if (!responded) throw new Error('the fetch handler did not call respondWith')
  return responded
}

describe('service worker asset deadline', () => {
  it('answers 504 instead of hanging when a chunk request never settles', async () => {
    // a real fetch rejects when its signal aborts; the stub must too
    const hang = (_request: Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const { listeners } = loadServiceWorker(hang)
    const response = await dispatchFetch(listeners.fetch, 'https://example.test/assets/SettingsView-abc.js')
    expect(response.status).toBe(504)
  }, 8000)

  it('serves the cached copy when the network dies but a valid copy exists', async () => {
    const hang = (_request: Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
    const cached = new Response('console.log(1)', { status: 200, headers: { 'Content-Type': 'text/javascript' } })
    const { listeners } = loadServiceWorker(hang, cached)
    const response = await dispatchFetch(listeners.fetch, 'https://example.test/assets/WeekView-abc.js')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('console.log')
  }, 8000)
})
