import type { FetchedEpisode } from '../types'
import { publicHttpUrlError } from './publicUrl'

const MAX_DESCRIPTION = 1200

export const DEFAULT_PROXY_URL = 'https://api.allorigins.win/raw?url='

/** Public read-only CORS proxies tried in order when a direct request fails and no custom proxy is configured. */
export const FALLBACK_PROXY_URLS = [
  'https://api.codetabs.com/v1/proxy?quest=',
  'https://api.cors.lol/?url=',
]

/** Last-resort read-only bridge that re-serves a public feed as JSON (no key; fair-use limits apply). */
const JSON_BRIDGE_URL = 'https://api.rss2json.com/v1/api.json?rss_url='

function childrenByName(node: Element, name: string): Element[] {
  return Array.from(node.children).filter((child) => child.localName.toLowerCase() === name.toLowerCase())
}

function firstByName(node: Element, names: string[]): Element | undefined {
  for (const name of names) {
    const match = childrenByName(node, name)[0]
    if (match) return match
  }
  return undefined
}

function textOf(node: Element | undefined): string {
  return node?.textContent?.trim() ?? ''
}

function plainText(value: string): string {
  if (!value) return ''
  const doc = new DOMParser().parseFromString(value, 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
}

export function parseDuration(value: string): number | null {
  if (!value) return null
  const cleaned = value.trim()
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const seconds = Number(cleaned)
    return Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null
  }
  const parts = cleaned.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) return null
  let seconds = 0
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
  else if (parts.length === 2) seconds = parts[0] * 60 + parts[1]
  else return null
  return seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : null
}

function normalizeDate(value: string): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

function parseEntry(entry: Element): FetchedEpisode | null {
  const title = textOf(firstByName(entry, ['title']))
  if (!title) return null

  const linkNode = firstByName(entry, ['link'])
  const atomLink = Array.from(entry.children).find((node) => {
    if (node.localName.toLowerCase() !== 'link') return false
    const rel = node.getAttribute('rel')
    return !rel || rel === 'alternate'
  })
  const enclosure = Array.from(entry.getElementsByTagName('*')).find((node) => node.localName.toLowerCase() === 'enclosure')
  const guid = textOf(firstByName(entry, ['guid', 'id'])) || textOf(linkNode) || atomLink?.getAttribute('href') || title
  const descriptionNode = firstByName(entry, ['description', 'summary', 'subtitle', 'encoded', 'content'])
  const durationNode = firstByName(entry, ['duration'])

  return {
    guid,
    title,
    description: plainText(textOf(descriptionNode)),
    link: atomLink?.getAttribute('href') || textOf(linkNode),
    audioUrl: enclosure?.getAttribute('url') || '',
    publishedAt: normalizeDate(textOf(firstByName(entry, ['pubdate', 'published', 'updated', 'date']))),
    durationMinutes: parseDuration(textOf(durationNode)),
  }
}

export function parseFeed(xml: string, limit = 10): FetchedEpisode[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('The response is not valid RSS / Atom XML')
  const entries = Array.from(doc.getElementsByTagName('*')).filter((node) => {
    const name = node.localName.toLowerCase()
    return name === 'item' || name === 'entry'
  })
  if (!entries.length) throw new Error('No episodes were found in this feed')
  const seen = new Set<string>()
  const episodes: FetchedEpisode[] = []
  for (const entry of entries) {
    const episode = parseEntry(entry)
    if (!episode || seen.has(episode.guid)) continue
    seen.add(episode.guid)
    episodes.push(episode)
    if (episodes.length >= limit) break
  }
  if (!episodes.length) throw new Error('Feed episodes have no usable titles')
  return episodes
}

async function requestText(target: string, timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(target, { signal: controller.signal, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } })
    if (!response.ok) throw new Error(`Request failed (HTTP ${response.status})`)
    return await response.text()
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

function buildTargets(feedUrl: string, proxyUrl: string): string[] {
  const proxy = proxyUrl.trim()
  const proxies = proxy ? [proxy, ...FALLBACK_PROXY_URLS.filter((base) => base !== proxy)] : FALLBACK_PROXY_URLS
  const targets = [feedUrl, ...proxies.map((base) => `${base}${encodeURIComponent(feedUrl)}`)]
  // A trailing-slash twin recovers feeds whose host redirects /podcast → /podcast/ or vice versa.
  if (feedUrl.endsWith('/')) targets.push(feedUrl.slice(0, -1))
  else targets.push(`${feedUrl}/`)
  return targets
}

function targetTimeout(index: number, total: number): number {
  if (total <= 1) return 16000
  return index === 0 ? 8000 : 14000
}

interface JsonBridgeItem {
  title?: string
  link?: string
  guid?: string
  pubDate?: string
  description?: string
  content?: string
  enclosure?: { link?: string; url?: string }
}

function parseJsonFeed(json: string, limit = 10): FetchedEpisode[] {
  const payload = JSON.parse(json) as { status?: string; items?: JsonBridgeItem[] }
  if (payload.status !== 'ok' || !Array.isArray(payload.items)) throw new Error('The JSON bridge did not return episodes')
  const seen = new Set<string>()
  const episodes: FetchedEpisode[] = []
  for (const item of payload.items) {
    const title = (item.title ?? '').trim()
    if (!title) continue
    const guid = (item.guid || item.link || title).trim()
    if (seen.has(guid)) continue
    seen.add(guid)
    episodes.push({
      guid,
      title,
      description: plainText(item.description || item.content || ''),
      link: item.link ?? '',
      audioUrl: item.enclosure?.link || item.enclosure?.url || '',
      publishedAt: normalizeDate(item.pubDate ?? ''),
      durationMinutes: null,
    })
    if (episodes.length >= limit) break
  }
  if (!episodes.length) throw new Error('Feed episodes have no usable titles')
  return episodes
}

export const FEED_RECOVERY_ROUNDS = 3

export interface FeedFetchOptions {
  recovery?: boolean
  onRecoveryRound?: (round: number, total: number) => void
}

function isTransientFailure(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  if (error instanceof TypeError) return true
  const httpStatus = error instanceof Error ? error.message.match(/^Request failed \(HTTP (\d+)\)$/)?.[1] : undefined
  if (!httpStatus) return false
  const status = Number(httpStatus)
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function waitBeforeRetry(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, milliseconds)
    const abort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('The request was aborted', 'AbortError'))
    }
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function fetchFeed(feedUrl: string, proxyUrl: string, signal?: AbortSignal, options: FeedFetchOptions = {}): Promise<FetchedEpisode[]> {
  if (!feedUrl) throw new Error('No RSS URL is configured for this show')
  const feedUrlError = publicHttpUrlError(feedUrl)
  if (feedUrlError) throw new Error(feedUrlError)
  const proxyUrlError = publicHttpUrlError(proxyUrl, true)
  if (proxyUrlError) throw new Error(proxyUrlError)
  const targets = buildTargets(feedUrl, proxyUrl)
  let lastError: unknown = null
  const rounds = options.recovery ? FEED_RECOVERY_ROUNDS : 2

  for (let attempt = 0; attempt < rounds; attempt += 1) {
    if (options.recovery) options.onRecoveryRound?.(attempt + 1, rounds)
    let sawTransientFailure = false
    for (let index = 0; index < targets.length; index += 1) {
      if (!options.recovery && attempt > 0 && index >= 2) break // retry only direct + first proxy on the second pass
      try {
        const timeout = options.recovery ? (index === 0 ? 5000 : 6500) : targetTimeout(index, targets.length)
        const xml = await requestText(targets[index], timeout, signal)
        return parseFeed(xml)
      } catch (error) {
        if (signal?.aborted) throw error
        sawTransientFailure ||= isTransientFailure(error)
        lastError = error
      }
    }
    // Last resort: a JSON bridge that re-serves the public feed, for hosts that block every proxy.
    try {
      const json = await requestText(`${JSON_BRIDGE_URL}${encodeURIComponent(feedUrl)}`, options.recovery ? 7000 : 16000, signal)
      return parseJsonFeed(json)
    } catch (error) {
      if (signal?.aborted) throw error
      sawTransientFailure ||= isTransientFailure(error)
      if (!lastError) lastError = error
    }
    if (options.recovery && attempt + 1 < rounds && sawTransientFailure) await waitBeforeRetry(700 * (attempt + 1), signal)
    if (options.recovery && !sawTransientFailure) break
  }
  throw lastError instanceof Error ? lastError : new Error('The feed could not be read')
}

export function feedErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Request timed out; retry later or add the episode manually'
  if (error instanceof TypeError) return 'Network or CORS restriction; change the proxy, request directly, or add manually'
  return error instanceof Error ? error.message : 'This show’s feed could not be read'
}
