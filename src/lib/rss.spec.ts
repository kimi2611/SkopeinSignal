// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchFeed } from './rss'

const XML = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Episode One</title><link>https://example.com/1</link><guid>g1</guid><pubDate>Wed, 01 Oct 2026 10:00:00 GMT</pubDate><enclosure url="https://example.com/1.mp3"/></item></channel></rss>`

const JSON_BRIDGE = JSON.stringify({
  status: 'ok',
  items: [{ title: 'Episode One', link: 'https://example.com/1', guid: 'g1', pubDate: '2026-10-01T10:00:00Z', enclosure: { link: 'https://example.com/1.mp3' }, description: 'Shownotes' }],
})

function stubFetch(handler: (url: string) => string | Error) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const result = handler(url)
    if (result instanceof Error) throw new TypeError(result.message)
    return { ok: true, status: 200, text: async () => result } as Response
  }))
}

describe('fetchFeed fallback ladder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('returns episodes from a direct request without touching fallbacks', async () => {
    const calls: string[] = []
    stubFetch((url) => { calls.push(url); return XML })
    const episodes = await fetchFeed('https://example.com/feed', 'https://proxy.example/?url=')
    expect(episodes).toHaveLength(1)
    expect(episodes[0].title).toBe('Episode One')
    expect(calls).toEqual(['https://example.com/feed'])
  })

  it('walks direct → proxy → backup proxies until one answers', async () => {
    const calls: string[] = []
    stubFetch((url) => {
      calls.push(url)
      if (url.startsWith('https://api.codetabs.com/')) return XML
      return new TypeError('blocked')
    })
    const episodes = await fetchFeed('https://example.com/feed', 'https://proxy.example/?url=')
    expect(episodes).toHaveLength(1)
    expect(calls[0]).toBe('https://example.com/feed')
    expect(calls.some((url) => url.startsWith('https://proxy.example/'))).toBe(true)
    expect(calls.some((url) => url.startsWith('https://api.codetabs.com/'))).toBe(true)
  })

  it('falls back to the JSON bridge when every XML route fails', async () => {
    stubFetch((url) => url.startsWith('https://api.rss2json.com/') ? JSON_BRIDGE : new TypeError('blocked'))
    const episodes = await fetchFeed('https://example.com/feed', '')
    expect(episodes).toHaveLength(1)
    expect(episodes[0].audioUrl).toBe('https://example.com/1.mp3')
    expect(episodes[0].publishedAt).toBe('2026-10-01T10:00:00.000Z')
  })

  it('throws the last XML error when the JSON bridge also fails', async () => {
    stubFetch(() => new TypeError('blocked'))
    await expect(fetchFeed('https://example.com/feed', '')).rejects.toThrow()
  })

  it('recovery retries every channel for up to three rounds and stops as soon as one succeeds', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const rounds: number[] = []
    stubFetch((url) => {
      calls.push(url)
      if (url.startsWith('https://api.rss2json.com/') && calls.filter((item) => item.startsWith('https://api.rss2json.com/')).length === 3) return JSON_BRIDGE
      return new TypeError('temporary network failure')
    })
    const pending = fetchFeed('https://example.com/feed', '', undefined, { recovery: true, onRecoveryRound: (round) => rounds.push(round) })
    await vi.runAllTimersAsync()
    const episodes = await pending
    expect(episodes).toHaveLength(1)
    expect(rounds).toEqual([1, 2, 3])
    expect(calls.filter((url) => url === 'https://example.com/feed')).toHaveLength(3)
    expect(calls.filter((url) => url.startsWith('https://api.codetabs.com/'))).toHaveLength(3)
    expect(calls.filter((url) => url.startsWith('https://api.cors.lol/'))).toHaveLength(3)
    expect(calls.filter((url) => url.startsWith('https://api.rss2json.com/'))).toHaveLength(3)
  })

  it('recovery does not repeat the full ladder for a permanent HTTP configuration error', async () => {
    const calls: string[] = []
    const rounds: number[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url)
      return { ok: false, status: 404, text: async () => '' } as Response
    }))
    await expect(fetchFeed('https://example.com/feed', '', undefined, { recovery: true, onRecoveryRound: (round) => rounds.push(round) })).rejects.toThrow('Request failed (HTTP 404)')
    expect(rounds).toEqual([1])
    expect(calls).toHaveLength(5)
  })
})
