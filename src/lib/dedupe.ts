import type { DuplicatePair, Episode } from '../types'

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'on', 'in', 'to', 'for', 'with', 'is', 'are', 'how', 'why', 'what',
  'der', 'die', 'das', 'und', 'oder', 'mit', 'von', 'zu', 'ein', 'eine', 'einer', 'einen', 'im', 'in',
  'episode', 'part', 'podcast', 'interview', 'conversation', 'the', 'this', 'that',
])

export function titleTokens(title: string): Set<string> {
  const normalized = title.toLocaleLowerCase().replace(/[’‘]/g, "'")
  const latin = normalized.match(/[a-z0-9äöüß]{3,}/g) ?? []
  const cjk = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? []
  return new Set([...latin, ...cjk].filter((token) => !STOP_WORDS.has(token)))
}

function jaccard(left: Set<string>, right: Set<string>): { score: number; shared: string[] } {
  const shared = [...left].filter((token) => right.has(token))
  const union = new Set([...left, ...right])
  return { score: union.size ? shared.length / union.size : 0, shared }
}

function pairKey(left: Episode, right: Episode): string {
  return [left.id, right.id].sort().join('::')
}

function guestHint(title: string): string {
  const colon = title.match(/^\s*([^:：]{3,60})[:：]/)?.[1]?.trim()
  const conversational = title.match(/^\s*(.{3,60}?)\s+(?:on|with)\s+/i)?.[1]?.trim()
  const candidate = colon || conversational || ''
  const words = candidate.split(/\s+/)
  if (!candidate || words.length > 5 || /^(episode|part|the|theories|conversations?)$/i.test(candidate)) return ''
  return candidate.toLocaleLowerCase()
}

export function findDuplicatePairs(episodes: Episode[], dismissedPairs: string[], manualPairs: string[] = []): DuplicatePair[] {
  const active = episodes.filter((episode) => episode.status === 'inbox' || episode.status === 'queue')
  const pairs: DuplicatePair[] = []

  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const left = active[i]
      const right = active[j]
      const key = pairKey(left, right)
      if (dismissedPairs.includes(key)) continue

      const exactKey = left.dedupKey && right.dedupKey && left.dedupKey.trim().toLowerCase() === right.dedupKey.trim().toLowerCase()
      const exactTitle = left.title.trim().toLocaleLowerCase() === right.title.trim().toLocaleLowerCase()
      const leftGuest = guestHint(left.title)
      const rightGuest = guestHint(right.title)
      const sameGuest = !!leftGuest && leftGuest === rightGuest
      const similarity = jaccard(titleTokens(left.title), titleTokens(right.title))
      const similarTitle = similarity.shared.length >= 2 && similarity.score >= 0.34
      const manual = manualPairs.includes(key)
      if (!manual && !exactKey && !exactTitle && !sameGuest && !similarTitle) continue

      pairs.push({
        key,
        left,
        right,
        score: manual ? Math.max(0.5, exactKey || exactTitle ? 1 : sameGuest ? Math.max(0.8, similarity.score) : similarity.score) : exactKey || exactTitle ? 1 : sameGuest ? Math.max(0.8, similarity.score) : similarity.score,
        shared: manual ? ['Marked manually', ...(exactKey ? ['Same dedupe key'] : exactTitle ? ['Same title'] : sameGuest ? [`Same guest hint: ${leftGuest}`] : similarity.shared.slice(0, 8))] : exactKey ? ['Same dedupe key'] : exactTitle ? ['Same title'] : sameGuest ? [`Same guest hint: ${leftGuest}`] : similarity.shared.slice(0, 8),
      })
    }
  }

  return pairs.sort((a, b) => b.score - a.score)
}
