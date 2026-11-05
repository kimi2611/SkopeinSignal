/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { AudioLines, Check, Clipboard, ExternalLink, Info, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { useWorkspace, type ManualEpisodeInput } from '../hooks/useWorkspace'
import { formatDate, formatDuration, getDurationCap, getEpisodeDurationCategory, TIER_SHORT } from '../lib/format'
import { openStudyEpisode } from '../lib/studyNavigation'
import { analyzeEpisodeLens, analyzeEpisodeValue, LENS_DESCRIPTIONS, LENS_NAMES } from '../lib/lenses'
import { useI18n } from '../lib/i18n'
import { publicHttpUrlError } from '../lib/publicUrl'
import type { Episode, PodcastShow } from '../types'

type ModalKind = 'detail' | 'select' | 'complete' | 'skip' | 'manual' | null

interface EpisodeActionsValue {
  openDetail: (episode: Episode) => void
  openSelect: (episode: Episode) => void
  openComplete: (episode: Episode) => void
  openSkip: (episode: Episode) => void
  openManual: () => void
}

const EpisodeActionsContext = createContext<EpisodeActionsValue | null>(null)

const REASONS = [
  'Directly connected to a current core thread',
  'The guest or author offers unique information',
  'Offers a new argument or evidence',
  'Addresses a question under active research',
  'Adds more information than competing candidates',
  'Worth keeping as topical reference',
]

export function EpisodeActionsProvider({ children }: { children: ReactNode }) {
  const { state, addManualEpisode, enqueueEpisode, completeEpisode, skipEpisode } = useWorkspace()
  const { t } = useI18n()
  const [modal, setModal] = useState<ModalKind>(null)
  const [episodeId, setEpisodeId] = useState<string | null>(null)
  const episode = state.episodes.find((item) => item.id === episodeId) ?? null
  const show = episode ? state.shows.find((item) => item.id === episode.showId) : null

  const open = (kind: Exclude<ModalKind, 'manual' | null>, item: Episode) => {
    setEpisodeId(item.id)
    setModal(kind)
  }
  const close = () => setModal(null)

  const value = useMemo<EpisodeActionsValue>(() => ({
    openDetail: (item) => open('detail', item),
    openSelect: (item) => open('select', item),
    openComplete: (item) => open('complete', item),
    openSkip: (item) => open('skip', item),
    openManual: () => setModal('manual'),
  }), [])

  const copyTitle = async () => {
    if (!episode) return
    try {
      await navigator.clipboard.writeText(episode.title)
      toast.success(t('Title copied. Paste it into Snipd search.'))
    } catch {
      toast.error(t('The browser blocked clipboard access; press and hold the title to copy it manually.'))
    }
  }

  return (
    <EpisodeActionsContext.Provider value={value}>
      {children}

      <Dialog open={modal === 'detail' && !!episode} onOpenChange={(openState) => !openState && close()}>
        <DialogContent className="modal-content max-h-[88dvh] overflow-y-auto sm:max-w-2xl" aria-describedby="episode-detail-description">
          {episode && (
            <>
              <DialogHeader className="pr-8 text-left">
                <div className="modal-kicker">{show?.shortName ?? t('Unknown show')} · {formatDuration(episode.durationMinutes)}</div>
                <DialogTitle className="modal-title">{episode.title}</DialogTitle>
                <DialogDescription className="modal-description">
                  {formatDate(episode.publishedAt, true)} · {episode.source === 'manual' ? t('Manual entry') : episode.source === 'seed' ? t('Initial candidate') : t('Public RSS')}
                </DialogDescription>
              </DialogHeader>
              <p id="episode-detail-description" className="detail-copy">{episode.description || t('No description yet. Open the original page or copy the title into Snipd to check its transcript.')}</p>
              <EpisodeRationale episode={episode} show={show ?? null} />
              {!!episode.selectionReasons?.length && (
                <div className="reason-block">
                  <span className="field-label">{t('Selection reasons')}</span>
                  <ul>{episode.selectionReasons.map((reason) => <li key={reason}><Check size={15} />{t(reason)}</li>)}</ul>
                </div>
              )}
              {episode.skipReason && <p className="notice-copy">{t('Skip reason: {reason}', { reason: t(episode.skipReason) })}</p>}
              <div className="link-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { close(); openStudyEpisode(episode.id) }}><AudioLines size={16} />{t('Open Listen & Read')}</button>
                <button type="button" className="btn btn-secondary" onClick={copyTitle}><Clipboard size={16} />{t('Copy title for Snipd search')}</button>
                {episode.link && <a className="btn btn-ghost" href={episode.link} target="_blank" rel="noreferrer">{t('Original page')}<ExternalLink size={15} /></a>}
                {!episode.link && episode.audioUrl && <a className="btn btn-ghost" href={episode.audioUrl} target="_blank" rel="noreferrer">{t('Audio URL')}<ExternalLink size={15} /></a>}
              </div>
              <DialogFooter className="modal-footer">
                {episode.status === 'inbox' && <button type="button" className="btn btn-primary" onClick={() => setModal('select')}><Plus size={16} />{t('Add to this week')}</button>}
                {episode.status === 'queue' && <button type="button" className="btn btn-primary" onClick={() => setModal('complete')}>{t('Record completion')}</button>}
                {(episode.status === 'inbox' || episode.status === 'queue') && <button type="button" className="btn btn-ghost" onClick={() => setModal('skip')}>{t('Skip episode')}</button>}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'select' && !!episode} onOpenChange={(openState) => !openState && close()}>
        <DialogContent className="modal-content max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          {episode && <SelectionForm episode={episode} onCancel={close} onSubmit={(reasons) => {
            const result = enqueueEpisode(episode.id, reasons)
            if (result.ok) { toast.success(t(result.message)); close() } else toast.error(t(result.message))
          }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'complete' && !!episode} onOpenChange={(openState) => !openState && close()}>
        <DialogContent className="modal-content max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          {episode && <CompleteForm episode={episode} onCancel={close} onSubmit={(note, snips) => {
            completeEpisode(episode.id, note, snips)
            toast.success(t('Saved to completion notes and decision history.'))
            close()
          }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'skip' && !!episode} onOpenChange={(openState) => !openState && close()}>
        <DialogContent className="modal-content sm:max-w-lg">
          {episode && <SkipForm episode={episode} onCancel={close} onSubmit={(reason) => {
            skipEpisode(episode.id, reason)
            const currentStreak = state.shows.find((item) => item.id === episode.showId)?.skipStreak ?? 0
            toast.success(t(currentStreak + 1 >= 3 ? 'Skip recorded; this show now has a downgrade suggestion.' : 'Skip reason recorded.'))
            close()
          }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'manual'} onOpenChange={(openState) => !openState && close()}>
        <DialogContent className="modal-content max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <ManualForm shows={state.shows} onCancel={close} onSubmit={(input) => {
            const created = addManualEpisode(input)
            toast.success(t('“{title}” was added to the inbox.', { title: created.title }))
            close()
          }} />
        </DialogContent>
      </Dialog>
    </EpisodeActionsContext.Provider>
  )
}

export function EpisodeValueReason({ episode, show }: { episode: Episode; show?: PodcastShow | null }) {
  const { t } = useI18n()
  const analysis = analyzeEpisodeValue(episode, show)
  const category = t(analysis.category === 'timely' ? 'Strong timeliness' : analysis.category === 'evergreen' ? 'Long replay value' : 'Unclassified')
  const terms = analysis.evidence.map((term) => `“${term}”`).join(', ')
  let copy: string
  if (analysis.manual) {
    copy = t('You manually assigned {category}. This choice is stored with the episode and will not be overwritten by local suggestions or RSS refreshes.', { category })
  } else if (analysis.category === 'uncategorized') {
    copy = analysis.evidence.length
      ? t('Local signals {terms} were tied or below the classification threshold. This episode remains Unclassified; review the evidence or assign a category manually.', { terms })
      : t('No time-sensitive or durable-research signal met the local threshold. This episode remains Unclassified; lack of timeliness never defaults it to Long replay value.')
  } else {
    copy = t(analysis.category === 'timely'
      ? 'Local rules matched time-sensitive signals {terms} in the title, description, selection reasons, or show context. This is a reviewable suggestion, not an AI judgment.'
      : 'Local rules matched durable-research signals {terms} in the title, description, selection reasons, or show context. This is a reviewable suggestion, not an AI judgment.', { terms })
  }
  return (
    <div className={`value-reason value-reason-${analysis.category}`} aria-live="polite">
      <div className="value-reason-heading"><span>{t('Why this category')}</span><strong>{category}</strong></div>
      <p>{copy}</p>
      <small>{t(analysis.manual ? 'Manual classification' : 'Local suggestion · editable')}</small>
    </div>
  )
}

function EpisodeRationale({ episode, show }: { episode: Episode; show: PodcastShow | null }) {
  const { state, updateEpisode } = useWorkspace()
  const { t } = useI18n()
  const [durationDraft, setDurationDraft] = useState(episode.durationMinutes === null ? '' : String(episode.durationMinutes))
  const durationCategory = getEpisodeDurationCategory(episode)
  const lensAnalysis = analyzeEpisodeLens(episode, show)
  const lens = lensAnalysis.lens
  const category = t(durationCategory === 'long' ? 'Long interview' : durationCategory === 'medium' ? 'Medium episode' : 'Micro discussion')
  const cap = getDurationCap(state.settings, durationCategory)
  const used = state.episodes.filter((item) => item.status === 'queue' && getEpisodeDurationCategory(item) === durationCategory).length
  const statusTitle = t(episode.status === 'queue' ? 'Selected for this week' : episode.status === 'inbox' ? 'Still awaiting triage' : episode.status === 'skipped' ? 'Filtered out by your skip decision' : episode.status === 'listened' ? 'Completed and retained' : 'Archived as reference')
  const statusCopy = episode.status === 'queue'
    ? t('You admitted this episode after recording {count} selection reasons. It was not selected automatically by an algorithm.', { count: episode.selectionReasons?.length ?? 0 })
    : episode.status === 'inbox'
      ? t('RSS or manual entry brought this candidate here, but no listening time has been committed. Selection still requires at least two explicit reasons and an open quota slot.')
      : episode.status === 'skipped'
        ? t(episode.skipReason || 'No skip reason was recorded. Restore the episode if this decision needs another review.')
        : episode.status === 'listened'
          ? t('This episode left the active queue after completion{date}. Its completion note and any new snips remain in decision history.', { date: episode.listenedAt ? t(' on {date}', { date: formatDate(episode.listenedAt, true) }) : '' })
          : t('This episode is kept outside the weekly flow as question-led reference material. It consumes no queue slot until restored.')
  const quotaCopy = episode.status === 'queue'
    ? t('{category}: {used}/{cap} matching slots are currently used, including this episode. {duration}', { category, used, cap, duration: episode.durationMinutes === null ? t('Duration is unknown, so it is treated as a long interview until verified.') : t('Recorded duration: {duration}.', { duration: formatDuration(episode.durationMinutes) }) })
    : t('{category} quota is currently {used}/{cap}. {availability} {unknown}', { category, used, cap, availability: t(used >= cap ? 'It is full; remove a matching episode before selecting this one.' : 'A matching slot is currently available.'), unknown: episode.durationMinutes === null ? t('Unknown duration is treated as long until verified.') : '' })
  const roleCopy = show ? `${t(TIER_SHORT[show.tier])}: ${show.role}` : t('The show is no longer available, so its tier role cannot be evaluated.')
  const evidenceCopy = episode.dedupKey
    ? t('Dedupe key “{key}” lets local rules flag another version with the same key. This is review evidence, not automatic deletion.', { key: episode.dedupKey })
    : episode.skipReason?.toLocaleLowerCase().includes('duplicat')
      ? t('The recorded skip explanation identifies redundancy. Compare the retained version in Dedupe or the activity record before restoring.')
      : t('No manual dedupe key is attached. Title and guest rules can still propose similarity, but only you can confirm semantic duplication.')
  const lensCopy = lensAnalysis.manual
    ? t('Manually assigned from the episode content. This choice is preserved across queue, completion, skip, and restore actions.')
    : lensAnalysis.evidence.length
      ? t('Local semantic rules matched {terms} in the title, description, or show context. This classifies subject matter, not your keep or skip decision.', { terms: lensAnalysis.evidence.map((term) => `“${term}”`).join(', ') })
      : t('No specific keyword stood out, so the broader show context determined the lens. You can correct it manually.')

  return (
    <section className="rationale-panel" aria-labelledby="rationale-title">
      <div className="rationale-heading"><Info size={17} /><div><h3 id="rationale-title">{t('Why this episode appears here')}</h3><p>{t('Decision evidence, not a recommendation score.')}</p></div></div>
      <dl className="rationale-list">
        <div><dt>{statusTitle}</dt><dd>{statusCopy}</dd></div>
        <div><dt>{t('Show role')}</dt><dd>{roleCopy}</dd></div>
        <div><dt>{t('Duration & quota fit')}</dt><dd>{quotaCopy}
          <div className="duration-edit" role="group" aria-label={t('Correct the duration manually')}>
            <input
              className="field"
              type="number"
              min={1}
              max={600}
              value={durationDraft}
              placeholder={t('minutes')}
              onChange={(event) => setDurationDraft(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                const minutes = durationDraft.trim() ? Number(durationDraft) : null
                if (minutes !== null && (!Number.isFinite(minutes) || minutes <= 0)) {
                  toast.error(t('Duration must be minutes greater than zero, or left empty.'))
                  return
                }
                updateEpisode(episode.id, { durationMinutes: minutes === null ? null : Math.round(minutes) })
                toast.success(minutes === null ? t('Duration marked unknown again; the episode counts as long until verified.') : t('Duration corrected to {minutes} min; quota categories and filters follow your entry.', { minutes: Math.round(minutes) }))
              }}
            >{t('Save duration')}</button>
          </div>
        </dd></div>
        <div><dt>{t('Research value')}</dt><dd><EpisodeValueReason episode={episode} show={show} /></dd></div>
        <div><dt>{t('Semantic lens')}</dt><dd><div className="lens-assignment"><strong className={`lens-badge lens-${lens}`}>{t(LENS_NAMES[lens])}</strong><span>{t(LENS_DESCRIPTIONS[lens])}</span><p>{lensCopy}</p><div className="lens-choice" role="group" aria-label={t('Change semantic lens')}>{(['aithrascope', 'dikelens'] as const).map((item) => <button type="button" key={item} className={lens === item ? 'active' : ''} aria-pressed={lens === item} disabled={lens === item} onClick={() => updateEpisode(episode.id, { lens: item })}>{t(LENS_NAMES[item])}</button>)}</div></div></dd></div>
        <div><dt>{t('Redundancy evidence')}</dt><dd>{evidenceCopy}</dd></div>
      </dl>
    </section>
  )
}

function SelectionForm({ episode, onCancel, onSubmit }: { episode: Episode; onCancel: () => void; onSubmit: (reasons: string[]) => void }) {
  const { t } = useI18n()
  const [selected, setSelected] = useState<string[]>(episode.selectionReasons ?? [])
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (selected.length < 2) { setError(t('Choose at least two reasons this episode deserves your time this week.')); return }
    onSubmit(selected)
  }
  return (
    <form onSubmit={submit}>
      <DialogHeader className="pr-8 text-left">
        <div className="modal-kicker">{t('Selection is not a subscription obligation')}</div>
        <DialogTitle className="modal-title">{t('Why is this episode worth hearing?')}</DialogTitle>
        <DialogDescription className="modal-description line-clamp-2">{episode.title}</DialogDescription>
      </DialogHeader>
      <fieldset className="choice-list">
        <legend className="sr-only">{t('Selection reasons; choose at least two')}</legend>
        {REASONS.map((reason) => (
          <label key={reason} className={`choice-row ${selected.includes(reason) ? 'is-selected' : ''}`}>
            <input type="checkbox" checked={selected.includes(reason)} onChange={() => {
              setSelected((current) => current.includes(reason) ? current.filter((item) => item !== reason) : [...current, reason])
              setError('')
            }} />
            <span>{t(reason)}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-between"><span className="form-hint">{t('{count} selected; at least 2 required', { count: selected.length })}</span>{error && <span className="form-error">{error}</span>}</div>
      <DialogFooter className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" className="btn btn-primary">{t('Confirm and add to queue')}</button>
      </DialogFooter>
    </form>
  )
}

function CompleteForm({ episode, onCancel, onSubmit }: { episode: Episode; onCancel: () => void; onSubmit: (note: string, snips: number) => void }) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const [snips, setSnips] = useState('0')
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const count = Number(snips)
    if (note.trim().length < 2) { setError(t('Write at least one summary sentence so this listening session leaves a reusable result.')); return }
    if (!Number.isInteger(count) || count < 0) { setError(t('Snips must be an integer of zero or more.')); return }
    onSubmit(note, count)
  }
  return (
    <form onSubmit={submit}>
      <DialogHeader className="pr-8 text-left">
        <div className="modal-kicker">{t('From heard to retained')}</div>
        <DialogTitle className="modal-title">{t('Record what this episode produced')}</DialogTitle>
        <DialogDescription className="modal-description line-clamp-2">{episode.title}</DialogDescription>
      </DialogHeader>
      <div className="form-stack">
        <label className="field-label" htmlFor="complete-note">{t('One-sentence summary / reusable conclusion')}</label>
        <textarea id="complete-note" className="field textarea" value={note} onChange={(event) => { setNote(event.target.value); setError('') }} placeholder={t('What understanding changed? Which argument could you reuse?')} rows={5} autoFocus />
        <label className="field-label" htmlFor="complete-snips">{t('New snips from this listen')}</label>
        <input id="complete-snips" className="field max-w-40" type="number" min="0" step="1" value={snips} onChange={(event) => setSnips(event.target.value)} />
        <p className="form-hint">{t('Count only new snips; TOE’s existing 41 are not counted again.')}</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <DialogFooter className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" className="btn btn-primary">{t('Save and mark complete')}</button>
      </DialogFooter>
    </form>
  )
}

function SkipForm({ episode, onCancel, onSubmit }: { episode: Episode; onCancel: () => void; onSubmit: (reason: string) => void }) {
  const { t } = useI18n()
  const [reason, setReason] = useState('Insufficient information gain')
  const [detail, setDetail] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(detail.trim() ? `${reason}：${detail.trim()}` : reason)
  }
  return (
    <form onSubmit={submit}>
      <DialogHeader className="pr-8 text-left">
        <div className="modal-kicker">{t('Skipping is a valid decision')}</div>
        <DialogTitle className="modal-title">{t('Why not keep this episode?')}</DialogTitle>
        <DialogDescription className="modal-description line-clamp-2">{episode.title}</DialogDescription>
      </DialogHeader>
      <div className="form-stack">
        <label className="field-label" htmlFor="skip-reason">{t('Primary reason')}</label>
        <select id="skip-reason" className="field" value={reason} onChange={(event) => setReason(event.target.value)}>
          {['Insufficient information gain', 'Duplicates another episode', 'Subject or guest mismatch', 'Not enough time this week', 'Keep only as reference'].map((item) => <option key={item} value={item}>{t(item)}</option>)}
        </select>
        <label className="field-label" htmlFor="skip-detail">{t('Additional detail (optional)')}</label>
        <input id="skip-detail" className="field" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={t('Example: duplicates the same guest’s Dwarkesh interview')} />
      </div>
      <DialogFooter className="modal-footer">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" className="btn btn-primary">{t('Confirm skip')}</button>
      </DialogFooter>
    </form>
  )
}

function ManualForm({ shows, onCancel, onSubmit }: { shows: ReturnType<typeof useWorkspace>['state']['shows']; onCancel: () => void; onSubmit: (input: ManualEpisodeInput) => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ showId: shows[0]?.id ?? '', title: '', description: '', link: '', audioUrl: '', publishedAt: '', duration: '', dedupKey: '' })
  const [error, setError] = useState('')
  const patch = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const submit = (event: FormEvent) => {
    event.preventDefault()
    const duration = form.duration ? Number(form.duration) : null
    if (!form.showId || !form.title.trim()) { setError(t('Show and episode title are required.')); return }
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) { setError(t('Duration must be minutes greater than zero, or left empty.')); return }
    const linkError = publicHttpUrlError(form.link, true) || publicHttpUrlError(form.audioUrl, true)
    if (linkError) { setError(t(linkError)); return }
    onSubmit({
      showId: form.showId,
      title: form.title,
      description: form.description,
      link: form.link,
      audioUrl: form.audioUrl,
      publishedAt: form.publishedAt,
      durationMinutes: duration === null ? null : Math.round(duration),
      dedupKey: form.dedupKey,
    })
  }
  return (
    <form onSubmit={submit}>
      <DialogHeader className="pr-8 text-left">
        <div className="modal-kicker">{t('A reliable fallback when RSS fails')}</div>
        <DialogTitle className="modal-title">{t('Add an episode manually')}</DialogTitle>
        <DialogDescription className="modal-description">{t('Only show and title are required; verify the rest later.')}</DialogDescription>
      </DialogHeader>
      <div className="form-grid">
        <div className="form-stack"><label className="field-label" htmlFor="manual-show">{t('Show *')}</label><select id="manual-show" className="field" value={form.showId} onChange={(event) => patch('showId', event.target.value)}>{shows.map((show) => <option key={show.id} value={show.id}>{show.shortName}</option>)}</select></div>
        <div className="form-stack form-span"><label className="field-label" htmlFor="manual-title">{t('Episode title *')}</label><input id="manual-title" className="field" value={form.title} onChange={(event) => patch('title', event.target.value)} placeholder={t('Paste the full title from Snipd or the show page')} autoFocus /></div>
        <div className="form-stack"><label className="field-label" htmlFor="manual-duration">{t('Duration (minutes)')}</label><input id="manual-duration" className="field" type="number" min="1" value={form.duration} onChange={(event) => patch('duration', event.target.value)} placeholder={t('For example, 45')} /></div>
        <div className="form-stack"><label className="field-label" htmlFor="manual-date">{t('Publication date')}</label><input id="manual-date" className="field" type="date" value={form.publishedAt} onChange={(event) => patch('publishedAt', event.target.value)} /></div>
        <div className="form-stack form-span"><label className="field-label" htmlFor="manual-link">{t('Original page URL')}</label><input id="manual-link" className="field" type="url" value={form.link} onChange={(event) => patch('link', event.target.value)} placeholder="https://…" /></div>
        <div className="form-stack form-span"><label className="field-label" htmlFor="manual-audio">{t('Audio URL (optional)')}</label><input id="manual-audio" className="field" type="url" value={form.audioUrl} onChange={(event) => patch('audioUrl', event.target.value)} placeholder={t('Useful when no original page is available')} /></div>
        <div className="form-stack form-span"><label className="field-label" htmlFor="manual-dedup">{t('Dedupe key (optional)')}</label><input id="manual-dedup" className="field" value={form.dedupKey} onChange={(event) => patch('dedupKey', event.target.value)} placeholder={t('Use the same key when one interview appears on multiple shows, such as guest-2026-ai')} /></div>
        <div className="form-stack form-span"><label className="field-label" htmlFor="manual-description">{t('Description / selection context')}</label><textarea id="manual-description" className="field textarea" rows={3} value={form.description} onChange={(event) => patch('description', event.target.value)} placeholder={t('Guest, central question, and possible duplicate episodes…')} /></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <DialogFooter className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onCancel}>{t('Cancel')}</button><button type="submit" className="btn btn-primary">{t('Add to inbox')}</button></DialogFooter>
    </form>
  )
}

export function useEpisodeActions(): EpisodeActionsValue {
  const context = useContext(EpisodeActionsContext)
  if (!context) throw new Error('useEpisodeActions must be used inside EpisodeActionsProvider')
  return context
}
