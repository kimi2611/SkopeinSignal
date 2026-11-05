import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { THEME_CHROME, type ThemeChrome } from './themeChrome'
import type { AtelierTheme } from '../types'

const css = readFileSync('src/index.css', 'utf8')
const indexHtml = readFileSync('index.html', 'utf8')

function paperGround(selector: string) {
  const block = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`))
  return block?.[1].match(/--paper-ground:\s*(#[0-9a-fA-F]{6})/)?.[1].toLowerCase()
}

describe('theme chrome colours', () => {
  it('covers every visual theme exactly once', () => {
    const themes: AtelierTheme[] = ['toot-puddle', 'forest-dusk', 'mist-dawn', 'whimsical', 'pure']
    expect(Object.keys(THEME_CHROME).sort()).toEqual(themes.sort())
  })

  it.each([
    ['toot-puddle', ':root'],
    ['forest-dusk', ":root\\[data-theme='forest-dusk'\\]"],
    ['mist-dawn', ":root\\[data-theme='mist-dawn'\\]"],
    ['whimsical', ":root\\[data-theme='whimsical'\\]"],
    ['pure', ":root\\[data-theme='pure'\\]"],
  ] as Array<[AtelierTheme, string]>)('%s chrome tint matches its --paper-ground', (theme, selector) => {
    const chrome: ThemeChrome = THEME_CHROME[theme]
    expect(chrome.themeColor.toLowerCase()).toBe(paperGround(selector))
  })

  it('keeps index.html default theme-color aligned with the default warm theme', () => {
    const meta = indexHtml.match(/<meta name="theme-color" content="([^"]+)"/)?.[1]
    expect(meta?.toLowerCase()).toBe(THEME_CHROME['toot-puddle'].themeColor.toLowerCase())
  })

  it('uses default status-bar text now that every theme is light', () => {
    for (const chrome of Object.values(THEME_CHROME)) {
      expect(chrome.appleStatusBar).toBe('default')
    }
  })
})
