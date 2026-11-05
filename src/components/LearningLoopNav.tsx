import { useMemo } from 'react'
import { ChevronUp, Layers3, Lightbulb, Mic, NotebookPen } from 'lucide-react'
import { useWorkspace } from '../hooks/useWorkspace'
import { useI18n, ti } from '../lib/i18n'
import { buildActivityTimeline, type ActivityKind } from '../lib/activity'
import type { ViewKey } from '../types'

interface LoopTarget {
  kind: ActivityKind
  view: ViewKey
  label: string
  icon: typeof Mic
}

const LOOP_TARGETS: LoopTarget[] = [
  { kind: 'quiz', view: 'quiz', label: ti('Voice Quiz'), icon: Mic },
  { kind: 'review', view: 'cards', label: ti('Word Decks'), icon: Layers3 },
  { kind: 'spark', view: 'sparks', label: ti('Sparks'), icon: Lightbulb },
  { kind: 'note', view: 'notes', label: ti('Notes'), icon: NotebookPen },
]

/** The learning footprint: the four learning modules with counts and each
 * one's latest output. Read-only; clicking a row navigates to that module.
 * Lives in My Account (moved out of the sidebar 2026-11-05). */
export function LearningFootprint({ view, onNavigate }: { view?: ViewKey; onNavigate: (view: ViewKey) => void }) {
  const { state } = useWorkspace()
  const { t, locale } = useI18n()

  const timeline = useMemo(
    () => buildActivityTimeline({ sparks: state.sparks, notes: state.notes, quizAttempts: state.quizAttempts, cardProgress: state.cardProgress, vocabulary: state.vocabulary }),
    [state.sparks, state.notes, state.quizAttempts, state.cardProgress, state.vocabulary],
  )
  const byKind = useMemo(() => {
    const map = new Map<ActivityKind, { count: number; latest: { title: string; at: string } | null }>()
    for (const target of LOOP_TARGETS) {
      const items = timeline.filter((item) => item.kind === target.kind)
      map.set(target.kind, { count: items.length, latest: items[0] ? { title: items[0].title, at: items[0].at } : null })
    }
    return map
  }, [timeline])

  const relative = (at: string) => {
    const diffMs = Date.now() - new Date(at).getTime()
    const minutes = Math.round(diffMs / 60_000)
    const rtf = new Intl.RelativeTimeFormat(locale === 'en' ? 'en-US' : locale, { numeric: 'auto' })
    if (Math.abs(minutes) < 60) return rtf.format(-minutes, 'minute')
    const hours = Math.round(minutes / 60)
    if (Math.abs(hours) < 24) return rtf.format(-hours, 'hour')
    return rtf.format(-Math.round(hours / 24), 'day')
  }

  return (
    <div className="loop-footprint-list" role="group" aria-label={t('Learning footprint')}>
      {LOOP_TARGETS.map((target) => {
        const Icon = target.icon
        const info = byKind.get(target.kind)
        const active = view === target.view
        return (
          <button
            type="button"
            key={target.kind}
            className={`loop-nav-row ${active ? 'active' : ''}`}
            onClick={() => onNavigate(target.view)}
          >
            <Icon size={16} />
            <span className="loop-nav-row-body">
              <strong>{t(target.label)}<b className="loop-nav-count">{info?.count ?? 0}</b></strong>
              <small>{info?.latest ? `${info.latest.title} · ${relative(info.latest.at)}` : t('Nothing yet')}</small>
            </span>
            <ChevronUp size={12} className="loop-nav-goto" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
