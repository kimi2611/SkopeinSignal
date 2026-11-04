import { describe, expect, it } from 'vitest'
import { findDuplicatePairs } from './dedupe'
import type { Episode } from '../types'

function episode(id: string, title: string): Episode {
  return {
    id,
    showId: 'show-a',
    guid: `guid-${id}`,
    title,
    description: '',
    link: '',
    audioUrl: '',
    publishedAt: '2026-01-01T00:00:00.000Z',
    addedAt: '2026-01-01T00:00:00.000Z',
    durationMinutes: null,
    status: 'inbox',
    tier: 'core',
    reasons: [],
    dedupKey: '',
  } as unknown as Episode
}

describe('findDuplicatePairs manual review', () => {
  it('surfaces a manually marked pair even when rules find no overlap', () => {
    const left = episode('a', 'Completely different title alpha')
    const right = episode('b', 'Nothing alike beta omega')
    expect(findDuplicatePairs([left, right], [])).toHaveLength(0)
    const pairs = findDuplicatePairs([left, right], [], ['a::b'])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].shared).toContain('Marked manually')
  })

  it('dismissed pairs stay hidden even when manually marked', () => {
    const left = episode('a', 'Same title')
    const right = episode('b', 'Same title')
    expect(findDuplicatePairs([left, right], ['a::b'], ['a::b'])).toHaveLength(0)
  })
})
