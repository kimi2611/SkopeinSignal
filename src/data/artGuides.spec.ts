import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART_GUIDES, ART_GUIDE_BY_ARTWORK } from './artGuides'
import { HISTORICAL_ARTWORKS } from './artworks'
import { MODULE_ILLUSTRATIONS } from './moduleIllustrations'
import { RECORDING_ILLUSTRATIONS } from './recordingIllustrations'

describe('picture-book artwork guides', () => {
  it('provides one fixed guide for every historical artwork', () => {
    expect(ART_GUIDES).toHaveLength(22)
    expect(new Set(ART_GUIDES.map((guide) => guide.artworkId)).size).toBe(22)
    expect(new Set(ART_GUIDES.map((guide) => guide.src)).size).toBe(22)
    expect(ART_GUIDES.map((guide) => guide.artworkId).sort()).toEqual(
      HISTORICAL_ARTWORKS.map((artwork) => artwork.id).sort(),
    )
    for (const artwork of HISTORICAL_ARTWORKS) {
      expect(ART_GUIDE_BY_ARTWORK[artwork.id].artworkId).toBe(artwork.id)
    }
  })

  it('does not reuse performance or module illustration paths', () => {
    const reserved = new Set([
      ...RECORDING_ILLUSTRATIONS.map((illustration) => illustration.src),
      ...Object.values(MODULE_ILLUSTRATIONS).map((illustration) => illustration.src),
    ])
    for (const guide of ART_GUIDES) {
      expect(guide.src).toMatch(/^\/art-guides\/[a-z0-9-]+\.webp$/)
      expect(reserved.has(guide.src)).toBe(false)
    }
  })

  it('keeps picture-book provenance separate and explicit', () => {
    for (const guide of ART_GUIDES) {
      expect(guide.scene.length).toBeGreaterThan(12)
      expect(guide.guide.length).toBeGreaterThan(80)
      expect(guide.book.length).toBeGreaterThan(3)
      expect(guide.sourceLabel.length).toBeGreaterThan(3)
      expect(guide.sourceUrl).toMatch(/^https?:\/\//)
      expect(`${guide.scene} ${guide.guide}`.toLowerCase()).not.toMatch(/\b(?:back-)?covers?\b/)
      expect(guide.bookYear === null || Number.isInteger(guide.bookYear)).toBe(true)
      if (guide.bookYear === null) expect(guide.book).toContain('volume not identified on source page')
    }
  })

  it('ships every referenced scene and keeps all 58 binary assets distinct', () => {
    const scenes = [
      ...RECORDING_ILLUSTRATIONS.map((item) => item.src),
      ...Object.values(MODULE_ILLUSTRATIONS).map((item) => item.src),
      ...ART_GUIDES.map((item) => item.src),
    ]
    expect(scenes).toHaveLength(58)
    expect(new Set(scenes).size).toBe(58)
    const hashes = scenes.map((src) => {
      const file = join(process.cwd(), 'public', src)
      expect(existsSync(file), src).toBe(true)
      return createHash('sha256').update(readFileSync(file)).digest('hex')
    })
    expect(new Set(hashes).size).toBe(58)
  })

  it('replaces the retired fruit still life everywhere, including its guide and files', () => {
    expect(HISTORICAL_ARTWORKS.some((item) => item.id === 'apples-pears-grapes')).toBe(false)
    expect(ART_GUIDES.some((item) => item.artworkId === 'apples-pears-grapes')).toBe(false)
    expect(existsSync(join(process.cwd(), 'public/artworks/apples-pears-grapes.webp'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'public/art-guides/apples-pears-grapes.webp'))).toBe(false)
    const replacement = HISTORICAL_ARTWORKS.find((item) => item.id === 'cezanne-auvers-panorama')
    expect(replacement).toMatchObject({
      title: 'Auvers, Panoramic View', artist: 'Paul Cézanne', date: '1873–1875',
      medium: 'Oil on canvas', collection: 'Art Institute of Chicago',
      sourceUrl: 'https://www.artic.edu/artworks/14556/auvers-panoramic-view', license: 'CC0 1.0',
    })
    expect(ART_GUIDE_BY_ARTWORK['cezanne-auvers-panorama'].src).toBe('/art-guides/cezanne-auvers-panorama.webp')
    expect(existsSync(join(process.cwd(), 'public', replacement!.src))).toBe(true)
  })
})
