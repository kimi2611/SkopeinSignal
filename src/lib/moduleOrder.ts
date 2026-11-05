import type { ViewKey } from '../types'

// Daily learning comes first, followed by optional deep work, maintenance, and support.
// The desktop sidebar, mobile drawer, and guide map all share this exact order.
export const MODULE_ORDER = [
  'week',
  'inbox',
  'study',
  'notes',
  'quiz',
  'cards',
  'insights',
  'sparks',
  'gallery',
  'shows',
  'dedupe',
  'guide',
  'account',
  'settings',
] as const satisfies readonly ViewKey[]
