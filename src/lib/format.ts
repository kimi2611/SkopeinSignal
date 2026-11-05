import type { Episode, EpisodeDurationCategory, Tier, WorkspaceSettings } from '../types'
import { getActiveLocale, translateUi } from './i18n'

export const TIER_SHORT: Record<Tier, string> = {
  radar: 'Signal Radar',
  main: 'Core Threads',
  supplement: 'Selective Listening',
  archive: 'Reference Library',
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return translateUi('Duration unknown')
  if (minutes < 60) return translateUi('{minutes} min', { minutes })
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? translateUi('{hours} hr {minutes} min', { hours, minutes: rest }) : translateUi('{hours} hr', { hours })
}

export function formatDate(value: string | undefined, withYear = false): string {
  if (!value) return translateUi('Date to verify')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return translateUi('Date to verify')
  const locale = getActiveLocale()
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date)
}

export const DURATION_CATEGORY_ORDER: EpisodeDurationCategory[] = ['long', 'medium', 'micro']

export const DURATION_CATEGORY_LABELS: Record<EpisodeDurationCategory, string> = {
  long: 'Long interviews',
  medium: 'Medium episodes',
  micro: 'Micro discussions',
}

export function getDurationCategory(durationMinutes: number | null): EpisodeDurationCategory {
  if (durationMinutes === null || !Number.isFinite(durationMinutes)) return 'long'
  if (durationMinutes <= 30) return 'micro'
  if (durationMinutes <= 60) return 'medium'
  return 'long'
}

export function getEpisodeDurationCategory(episode: Episode): EpisodeDurationCategory {
  return getDurationCategory(episode.durationMinutes)
}

export function getDurationCap(
  settings: Pick<WorkspaceSettings, 'longCap' | 'mediumCap' | 'microCap'>,
  category: EpisodeDurationCategory,
): number {
  if (category === 'long') return settings.longCap
  if (category === 'medium') return settings.mediumCap
  return settings.microCap
}

export function getWeekNumber(date = new Date()): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export function episodeIsThisMonth(dateValue: string): boolean {
  const date = new Date(dateValue)
  const now = new Date()
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
}

export function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
