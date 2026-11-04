/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { zhCN } from './translations/zh-CN'
import { de } from './translations/de'
import type { UiLocale } from '../types'

export type { UiLocale } from '../types'
export type TranslationValues = Record<string, string | number>

const dictionaries: Record<Exclude<UiLocale, 'en'>, Record<string, string>> = {
  'zh-CN': zhCN,
  de,
}

let activeLocale: UiLocale = 'en'

export function getActiveLocale(): UiLocale {
  return activeLocale
}

export function translateUi(text: string, values?: TranslationValues, locale: UiLocale = activeLocale): string {
  const template = locale === 'en' ? text : dictionaries[locale][text] ?? text
  if (!values) return template
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key: string) => key in values ? String(values[key]) : match)
}

interface I18nContextValue {
  locale: UiLocale
  t: (text: string, values?: TranslationValues) => string
}

/**
 * Marks a string as "translate at render" — identity here, translated later via t().
 * scripts/i18n-sync.mjs collects ti(…) literals exactly like t(…) literals, so
 * module-level constants and data tables stay in sync with the dictionaries.
 */
export const ti = (text: string): string => text

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  // Non-React date and duration helpers read this idempotent locale mirror.
  // eslint-disable-next-line react-hooks/globals
  activeLocale = locale
  useEffect(() => {
    document.documentElement.lang = locale
    document.title = {
      en: 'SkopeinSignal · Private Podcast Learning Atelier',
      'zh-CN': '调频中 · 私人播客艺术',
      de: 'SkopeinSignal · Privates Podcast-Lernatelier',
    }[locale]
    document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
      ?.setAttribute('content', locale === 'zh-CN' ? '调频中' : 'SkopeinSignal')
  }, [locale])
  const value = useMemo<I18nContextValue>(() => ({
    locale,
    t: (text, values) => translateUi(text, values, locale),
  }), [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
