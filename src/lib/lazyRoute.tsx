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

export interface RouteComponent<P> {
  (props: P): React.ReactElement | null
  /** Drop the cached module so the next render imports it again. */
  retry: () => void
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
  loader: () => Promise<{ default: ComponentType<P> }>,
  options: LoadWithRetryOptions = {},
): RouteComponent<P> {
  let generation = 0
  let entry: ModuleEntry<P> | null = null
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const snapshot = () => generation

  function start(): ModuleEntry<P> {
    const current: ModuleEntry<P> = { status: 'pending' }
    const promise = loadWithRetry(loader, options).then(
      (module) => {
        current.status = 'done'
        current.module = module
        return module
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

  Route.retry = () => {
    generation += 1
    entry = null
    listeners.forEach((listener) => listener())
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
