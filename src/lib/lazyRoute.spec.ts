import { describe, expect, it, vi } from 'vitest'
import { attemptWithTimeout, loadWithRetry, prefetchOnIdle, RouteLoadError } from './lazyRoute'

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
