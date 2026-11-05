import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { MODULE_ILLUSTRATIONS } from './moduleIllustrations'
import { getModuleIllustration, PUBLIC_DOMAIN_MODULE_THEMES } from './publicDomainModuleThemes'
import type { AtelierTheme, ViewKey } from '../types'

const MODULES: ViewKey[] = ['week', 'inbox', 'shows', 'dedupe', 'insights', 'study', 'quiz', 'sparks', 'cards', 'gallery', 'notes', 'guide', 'account', 'settings']

describe('atelier module themes', () => {
  it('keeps every original Toot & Puddle module illustration', () => {
    for (const view of MODULES) expect(getModuleIllustration('toot-puddle', view)?.illustration).toEqual(MODULE_ILLUSTRATIONS[view])
  })

  it.each(['forest-dusk', 'mist-dawn', 'whimsical'] as const)('%s has fourteen unique local images including the Performance Room header', (theme) => {
    const illustrations = PUBLIC_DOMAIN_MODULE_THEMES[theme].illustrations
    expect(Object.keys(illustrations)).toHaveLength(14)
    expect(illustrations.gallery).toBeDefined()
    expect(new Set(Object.values(illustrations).map((item) => item?.src)).size).toBe(14)
    for (const view of MODULES) {
      const result = getModuleIllustration(theme, view)
      expect(result?.artist).toBe(PUBLIC_DOMAIN_MODULE_THEMES[theme].artist)
      expect(result?.illustration.source).toMatch(/^https:\/\//)
      expect(existsSync(`public${result?.illustration.src}`)).toBe(true)
    }
  })

  it('removes all module vignettes in Pure without changing module availability', () => {
    for (const view of MODULES) expect(getModuleIllustration('pure', view)).toBeNull()
  })

  it('supports exactly five persisted theme identifiers', () => {
    const themes: AtelierTheme[] = ['toot-puddle', 'forest-dusk', 'mist-dawn', 'whimsical', 'pure']
    expect(themes).toHaveLength(5)
  })
})
