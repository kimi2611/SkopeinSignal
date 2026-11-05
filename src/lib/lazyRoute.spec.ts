import { describe, expect, it, vi } from 'vitest'
import { attemptWithTimeout, bust, loadWithRetry, planRetry, prefetchOnIdle, RouteLoadError, urlFromError } from './lazyRoute'

const never = <T,>() => new Promise<T>(() => {})

describe('attemptWithTimeout', () => {
  it('resolves a fast loader untouched', async () => {
    await expect(attemptWithTimeout(async () => 'ok', 500)).resolves.toBe('ok')
  })

  it('rejects with a timeout error instead of hanging forever', async () => {
    vi.useFakeTimers()
    const pending = attemptWithTimeout(never, 1000)
    const assertion = expect(pending).rejects.toBeInstanceOf(RouteLoadError)
    await vi.advanceTimersByTimeAsync(1001)
    await assertion
    vi.useRealTimers()
  })

  it('surfaces a loader that throws synchronously', async () => {
    await expect(attemptWithTimeout(() => { throw new Error('boom') }, 500)).rejects.toThrow('boom')
  })
})

describe('loadWithRetry', () => {
  it('retries a failed attempt and returns the second result', async () => {
    let calls = 0
    const loader = async () => {
      calls += 1
      if (calls === 1) throw new Error('chunk 404')
      return 'second'
    }
    await expect(loadWithRetry(loader, { attempts: 2, retryDelayMs: 0 })).resolves.toBe('second')
    expect(calls).toBe(2)
  })

  it('gives up after the configured number of attempts', async () => {
    let calls = 0
    const loader = async () => { calls += 1; throw new Error('offline') }
    await expect(loadWithRetry(loader, { attempts: 3, retryDelayMs: 0 })).rejects.toThrow('offline')
    expect(calls).toBe(3)
  })

  it('treats a hung chunk as a failure and reports it as a timeout', async () => {
    vi.useFakeTimers()
    const pending = loadWithRetry(never, { attempts: 1, timeoutMs: 250 })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'RouteLoadError', timedOut: true })
    await vi.advanceTimersByTimeAsync(300)
    await assertion
    vi.useRealTimers()
  })
})

describe('prefetchOnIdle', () => {
  it('warms every task and swallows failures so prefetch can never break the shell', async () => {
    vi.useFakeTimers()
    // node has no window; give the scheduler a stand-in without requestIdleCallback
    // so the setTimeout fallback path runs
    vi.stubGlobal('window', {})
    const ok = vi.fn(async () => undefined)
    const bad = vi.fn(async () => { throw new Error('nope') })
    const cancel = prefetchOnIdle([ok, bad], 5)
    await vi.advanceTimersByTimeAsync(1400)
    expect(ok).toHaveBeenCalledTimes(1)
    expect(bad).toHaveBeenCalledTimes(1)
    cancel()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
})


describe('urlFromError', () => {
  it('recovers the chunk URL the browser names in a failed dynamic import', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: https://skopeinsignal.example/assets/SettingsView-DkalfJjN.js')
    expect(urlFromError(error)).toBe('https://skopeinsignal.example/assets/SettingsView-DkalfJjN.js')
  })

  it('keeps an existing query string on the recovered URL', () => {
    const error = new Error('boom https://a.example/assets/x.js?route-retry=1')
    expect(urlFromError(error)).toContain('?route-retry=1')
  })

  it('ignores errors that name no URL, so callers fall back to a reload', () => {
    expect(urlFromError(new Error('Failed to fetch dynamically imported module'))).toBeUndefined()
    expect(urlFromError(new RouteLoadError('route chunk did not load within 18000ms', true))).toBeUndefined()
  })
})

describe('bust', () => {
  it('produces a fresh module-map key per generation', () => {
    const first = bust('https://a.example/assets/x.js', 1)
    const second = bust('https://a.example/assets/x.js', 2)
    expect(first).toBe('https://a.example/assets/x.js?route-retry=1')
    expect(second).not.toBe(first)
  })

  it('overwrites an older attempt instead of stacking parameters', () => {
    expect(bust('https://a.example/assets/x.js?route-retry=1', 3)).toBe('https://a.example/assets/x.js?route-retry=3')
  })
})

describe('planRetry', () => {
  it('reuses the in-flight request when a load timed out', () => {
    expect(planRetry(new RouteLoadError('too slow', true), true, 2)).toEqual({ kind: 'reuse' })
  })

  it('busts the URL when the import was rejected', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: https://a.example/assets/x.js')
    expect(planRetry(error, true, 1)).toEqual({ kind: 'bust', url: 'https://a.example/assets/x.js?route-retry=1' })
  })

  it('stops busting once a busted retry has already failed (dependency pin)', () => {
    const error = new TypeError('Failed to fetch dynamically imported module: https://a.example/assets/x.js')
    expect(planRetry(error, true, 2)).toEqual({ kind: 'reload' })
  })

  it('falls back to a reload when nothing usable is left', () => {
    expect(planRetry(new Error('Failed to fetch dynamically imported module'), false, 2)).toEqual({ kind: 'reload' })
  })
})
