/**
 * Route chunk loading with a deadline — and a cache we can actually reset.
 *
 * Why this is not plain `React.lazy`:
 *   1. `lazy()` has no notion of time. If a chunk request never settles (dead
 *      VPN path, laptop asleep, iOS tab thawing out) React keeps the Suspense
 *      fallback up forever — reproduced 2026-11-05 by stalling one chunk
 *      request: 15 s and counting, no error, no way out.
 *   2. `lazy()` caches a rejected import permanently, so a retry button on a
 *      naive error card would be a lie: the same rejection is re-thrown.
 *
 * So the module cache lives here. One entry per generation; `retry()` bumps the
 * generation and the next render starts a genuinely new import.
 *
 * Two ways out of a failure, in order of cheapness:
 *   1. Timeout — the import promise is still pending, so re-awaiting the *same*
 *      promise with a fresh deadline recovers the moment the network does.
 *   2. Rejection — the URL is pinned in the module map, but the map is keyed by
 *      the resolved URL, so appending `?route-retry=N` is a different key and a
 *      real fetch. This is why the card can honestly offer "Try again"; a bare
 *      re-import would re-throw the cached failure (measured: fetch 200, import
 *      still rejects).
 * Anything else (no URL recoverable) falls back to a page reload.
 */
import { useSyncExternalStore, type ComponentType } from 'react'

export class RouteLoadError extends Error {
  readonly timedOut: boolean

  constructor(message: string, timedOut = false) {
    super(message)
    this.name = 'RouteLoadError'
    this.timedOut = timedOut
  }
}

export interface LoadWithRetryOptions {
  /** Per-attempt deadline in milliseconds. */
  timeoutMs?: number
  /**
   * Total attempts, including the first one. Route imports keep this at 1 on
   * purpose: a rejected import is pinned by the browser's module map, so a
   * second import of the same URL re-throws without touching the network.
   */
  attempts?: number
  /** Pause between attempts; an instant retry just re-awaits the same hung load. */
  retryDelayMs?: number
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** One attempt with a hard deadline. The losing promise is never left unhandled. */
export function attemptWithTimeout<T>(loader: () => Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new RouteLoadError(`route chunk did not load within ${timeoutMs}ms`, true))
    }, timeoutMs)

    let pending: Promise<T>
    try {
      pending = loader()
    } catch (error) {
      settled = true
      clearTimeout(timer)
      reject(error)
      return
    }

    pending.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function loadWithRetry<T>(loader: () => Promise<T>, options: LoadWithRetryOptions = {}): Promise<T> {
  const { timeoutMs = 18000, attempts = 1, retryDelayMs = 400 } = options
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await attemptWithTimeout(loader, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt < attempts) await sleep(retryDelayMs)
    }
  }
  throw lastError instanceof Error ? lastError : new RouteLoadError(String(lastError))
}

/** Chrome/Safari name the offending chunk in the error; that URL is our way back in. */
export function urlFromError(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error)
  const match = message.match(/https?:\/\/[^\s'"]+?\.js(?:\?[^\s'"]*)?/)
  if (!match) return undefined
  try {
    const parsed = new URL(match[0])
    if (typeof location !== 'undefined' && parsed.origin !== location.origin) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

/** Same chunk, different module-map key. The only way to un-pin a failed import. */
export function bust(url: string, generation: number): string {
  const parsed = new URL(url)
  parsed.searchParams.set('route-retry', String(generation))
  return parsed.href
}

/** What an in-place retry can do with a given failure. */
export type RetryPlan =
  | { kind: 'reuse' }
  | { kind: 'bust'; url: string }
  | { kind: 'reload' }

/**
 * Decide how to retry without touching React, so the choice is testable.
 * `reuse` covers a timed-out load (the request is still in flight), `bust`
 * covers a rejected import (URL is pinned, a new key is not), `reload` is the
 * honest answer when the error carries no usable URL.
 */
export function planRetry(error: unknown, hasPendingImport: boolean, nextGeneration: number): RetryPlan {
  if (error instanceof RouteLoadError && error.timedOut && hasPendingImport) return { kind: 'reuse' }
  const failedUrl = urlFromError(error)
  // Already busted once and it failed again: the pin is on a *dependency* of the
  // route chunk (busting the entry URL cannot unlock that), so a second in-place
  // attempt is theatre. Reload gets a fresh module map and actually works.
  if (failedUrl) return nextGeneration > 1 ? { kind: 'reload' } : { kind: 'bust', url: bust(failedUrl, nextGeneration) }
  return { kind: 'reload' }
}

export interface RouteComponent<P> {
  (props: P): React.ReactElement | null
  /** Drop the cached module so the next render imports it again. False = reload needed. */
  retry: () => boolean
}

interface ModuleEntry<P> {
  status: 'pending' | 'done' | 'error'
  promise?: Promise<{ default: ComponentType<P> }>
  module?: { default: ComponentType<P> }
  error?: unknown
}

/**
 * Suspense-compatible route component with a resettable module cache.
 *
 * Throwing the import promise suspends the tree; throwing the error lets
 * RouteBoundary offer a retry that is not a page reload.
 */
export function createRoute<P extends object = object>(
  /**
   * `() => import('./pages/X')` — untouched, so Vite still sees a static
   * specifier and emits a real chunk. Named export is picked separately, which
   * is what lets a retry re-import the *same chunk* under a new URL and still
   * land on the same component.
   */
  loader: () => Promise<Record<string, unknown>>,
  exportName = 'default',
  options: LoadWithRetryOptions = {},
): RouteComponent<P> {
  let generation = 0
  let entry: ModuleEntry<P> | null = null
  /** Loader to use for the next start, when a retry needs a different URL. */
  let nextLoader: (() => Promise<Record<string, unknown>>) | null = null
  /** Last import promise; kept so a timed-out load can be re-awaited, not restarted. */
  let lastImport: Promise<Record<string, unknown>> | null = null
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const snapshot = () => generation

  const pick = (module: Record<string, unknown>) => {
    const component = module[exportName] as ComponentType<P> | undefined
    if (!component) throw new RouteLoadError(`route module has no export "${exportName}"`)
    return component
  }

  function start(): ModuleEntry<P> {
    const current: ModuleEntry<P> = { status: 'pending' }
    const load = nextLoader ?? loader
    nextLoader = null
    const tracked = () => {
      const pending = load()
      lastImport = pending
      return pending
    }
    const promise = loadWithRetry(tracked, options).then(
      (module) => {
        const mapped = { default: pick(module as Record<string, unknown>) }
        current.status = 'done'
        current.module = mapped
        return mapped
      },
      (error) => {
        current.status = 'error'
        current.error = error
        throw error
      },
    )
    // A rejected import must not surface as an unhandled rejection once the
    // render that awaited it has unmounted.
    promise.catch(() => {})
    current.promise = promise
    entry = current
    return current
  }

  function useModule(): ComponentType<P> {
    useSyncExternalStore(subscribe, snapshot, snapshot)
    const current = entry ?? start()
    if (current.status === 'done' && current.module) return current.module.default
    if (current.status === 'error') throw current.error
    throw current.promise
  }

  function Route(props: P) {
    const Component = useModule()
    // The component identity comes from the loaded chunk, not from render.
    // eslint-disable-next-line react-hooks/static-components
    return <Component {...props} />
  }

  /**
   * Retry in the same document: re-await a timed-out load, or import the failed
   * chunk under a cache-busting query. Returns false when neither is available
   * and the caller should reload instead of pretending.
   */
  Route.retry = (): boolean => {
    const failure = entry?.status === 'error' ? entry.error : null
    const plan = planRetry(failure, Boolean(lastImport), generation + 1)
    console.debug('[route] retry plan', plan.kind, failure && String((failure as Error).message))
    if (plan.kind === 'reload') return false
    if (plan.kind === 'reuse') {
      const stillPending = lastImport as Promise<Record<string, unknown>>
      nextLoader = () => stillPending
    } else {
      const bustedUrl = plan.url
      nextLoader = () => import(/* @vite-ignore */ bustedUrl) as Promise<Record<string, unknown>>
    }

    generation += 1
    entry = null
    listeners.forEach((listener) => listener())
    return true
  }

  return Route as RouteComponent<P>
}

/**
 * Warm route chunks while the browser is idle so a click never starts a network
 * round trip. Failures are swallowed: prefetching is an optimisation, the real
 * load path owns error reporting.
 */
export function prefetchOnIdle(tasks: Array<() => Promise<unknown>>, gapMs = 250): () => void {
  if (typeof window === 'undefined' || tasks.length === 0) return () => {}
  const timers: ReturnType<typeof setTimeout>[] = []
  const schedule = () => {
    tasks.forEach((task, index) => {
      timers.push(setTimeout(() => { void task().catch(() => {}) }, index * gapMs))
    })
  }
  const requestIdle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback
  if (typeof requestIdle === 'function') requestIdle(schedule, { timeout: 3000 })
  else timers.push(setTimeout(schedule, 1200))
  return () => { timers.forEach(clearTimeout) }
}
