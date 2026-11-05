import type { AtelierTheme } from '../types'

export interface ThemeChrome {
  /** Browser chrome / status bar tint, mirrors --paper-ground of each theme. */
  themeColor: string
  /** iOS standalone status bar style; dark themes need light text. */
  appleStatusBar: 'default' | 'black-translucent'
}

export const THEME_CHROME: Record<AtelierTheme, ThemeChrome> = {
  'toot-puddle': { themeColor: '#e9e7e1', appleStatusBar: 'default' },
  'forest-dusk': { themeColor: '#f0ece0', appleStatusBar: 'default' },
  'mist-dawn': { themeColor: '#f5f2ea', appleStatusBar: 'default' },
  whimsical: { themeColor: '#f7edd6', appleStatusBar: 'default' },
  pure: { themeColor: '#fbf7f4', appleStatusBar: 'default' },
}

export function applyThemeChrome(theme: AtelierTheme) {
  document.documentElement.dataset.theme = theme
  const chrome = THEME_CHROME[theme] ?? THEME_CHROME['toot-puddle']
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', chrome.themeColor)
  document
    .querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', chrome.appleStatusBar)
}
