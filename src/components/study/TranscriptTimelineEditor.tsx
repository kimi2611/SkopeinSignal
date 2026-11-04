import { useState } from 'react'
import { Check, Clock3, Crosshair, Gauge, Trash2, X } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { formatTimecode } from '../../lib/transcript'
import {
  buildTimedSegments,
  estimateTimelineDrafts,
  TimelineValidationError,
  timelineDraftsFromSegments,
  type TimelineDraft,
} from '../../lib/transcriptTimeline'
import type { TranscriptSegment } from '../../types'

interface TranscriptTimelineEditorProps {
  segments: TranscriptSegment[]
  currentTime: number
  durationSeconds: number | null
  onSave: (segments: TranscriptSegment[]) => void
  onClear: () => void
  onCancel: () => void
}

export function TranscriptTimelineEditor({ segments, currentTime, durationSeconds, onSave, onClear, onCancel }: TranscriptTimelineEditorProps) {
  const { t } = useI18n()
  const [drafts, setDrafts] = useState<Record<string, TimelineDraft>>(() => timelineDraftsFromSegments(segments))
  const [error, setError] = useState('')
  const [estimated, setEstimated] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const hasTimeline = segments.some((segment) => segment.start !== null || segment.end !== null)
  const clearActionLabel = confirmClear ? t('Confirm remove timeline') : t('Remove timeline')

  const update = (segmentId: string, key: keyof TimelineDraft, value: string) => {
    setDrafts((current) => ({ ...current, [segmentId]: { ...current[segmentId], [key]: value } }))
    setError('')
    setEstimated(false)
    setConfirmClear(false)
  }

  const estimate = () => {
    try {
      setDrafts(estimateTimelineDrafts(segments, durationSeconds ?? Number.NaN))
      setEstimated(true)
      setError('')
      setConfirmClear(false)
    } catch {
      setError(t('Load valid audio metadata before estimating. The audio must be long enough to give every segment a distinct timestamp.'))
    }
  }

  const save = () => {
    try {
      onSave(buildTimedSegments(segments, drafts, durationSeconds))
    } catch (reason) {
      if (!(reason instanceof TimelineValidationError)) throw reason
      const number = reason.segmentIndex + 1
      if (reason.reason === 'missing') setError(t('Segment {number}: enter both a start and an end time.', { number }))
      else if (reason.reason === 'invalid') setError(t('Segment {number}: use MM:SS.mmm or HH:MM:SS.mmm, for example 01:05.250.', { number }))
      else if (reason.reason === 'order') setError(t('Segment {number}: the end must be later than the start.', { number }))
      else if (reason.reason === 'overlap') setError(t('Segment {number}: its start must not be earlier than the previous segment’s end.', { number }))
      else if (reason.reason === 'duration') setError(t('Segment {number}: the end exceeds the audio duration of {duration}.', { number, duration: formatTimecode(durationSeconds, true) }))
      else setError(t('The audio is too short to estimate a distinct timestamp for every segment.'))
    }
  }

  return (
    <div className="timeline-editor" aria-labelledby="timeline-editor-title">
      <div className="timeline-editor-heading">
        <div>
          <span className="section-index">{t('MANUAL TIMELINE')}</span>
          <h3 id="timeline-editor-title">{t('Set the transcript timeline')}</h3>
          <p>{t('Assign a start and end to every segment. Play the audio and capture the current position, or create an estimate and review it before saving.')}</p>
        </div>
        <div className="timeline-current-time"><Clock3 size={16} /><span>{t('Playback position')}</span><strong>{formatTimecode(currentTime, true)}</strong></div>
      </div>

      <div className="timeline-editor-actions">
        <button type="button" className="btn btn-secondary" onClick={estimate}><Gauge size={16} />{t('Estimate from audio duration')}</button>
        {hasTimeline && <button type="button" className={`btn ${confirmClear ? 'btn-primary' : 'btn-ghost'}`} onClick={() => {
          if (confirmClear) onClear()
          else { setConfirmClear(true); setError('') }
        }}><Trash2 size={16} />{clearActionLabel}</button>}
      </div>
      <p className="form-hint">{t('Estimation distributes time by text length only; it is not speech recognition or forced alignment. No timestamps change until you save. Use MM:SS.mmm or HH:MM:SS.mmm.')}</p>
      {estimated && <p className="timeline-estimate-notice" role="status">{t('Estimated draft created. Listen and correct the segment boundaries, then save the timeline.')}</p>}
      {confirmClear && <p className="form-error" role="alert">{t('Confirm again to remove every timestamp. Transcript text will be preserved and return to reading-only mode.')}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="timeline-rows">
        {segments.map((segment, index) => <article className="timeline-row" key={segment.id}>
          <div className="timeline-row-heading"><span>{String(index + 1).padStart(2, '0')}</span><p>{segment.text}</p></div>
          <div className="timeline-fields">
            <div className="timeline-field">
              <label htmlFor={`timeline-start-${segment.id}`}>{t('Start')}</label>
              <div><input id={`timeline-start-${segment.id}`} className="field" value={drafts[segment.id]?.start ?? ''} onChange={(event) => update(segment.id, 'start', event.target.value)} placeholder="00:00.000" inputMode="decimal" autoComplete="off" spellCheck={false} /><button type="button" className="btn btn-ghost btn-icon" onClick={() => update(segment.id, 'start', formatTimecode(currentTime, true))} aria-label={t('Set start of segment {number} to current playback time', { number: index + 1 })} title={t('Capture current playback time')}><Crosshair size={17} /></button></div>
            </div>
            <div className="timeline-field">
              <label htmlFor={`timeline-end-${segment.id}`}>{t('End')}</label>
              <div><input id={`timeline-end-${segment.id}`} className="field" value={drafts[segment.id]?.end ?? ''} onChange={(event) => update(segment.id, 'end', event.target.value)} placeholder="00:04.000" inputMode="decimal" autoComplete="off" spellCheck={false} /><button type="button" className="btn btn-ghost btn-icon" onClick={() => update(segment.id, 'end', formatTimecode(currentTime, true))} aria-label={t('Set end of segment {number} to current playback time', { number: index + 1 })} title={t('Capture current playback time')}><Crosshair size={17} /></button></div>
            </div>
          </div>
        </article>)}
      </div>

      <div className="timeline-save-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}><X size={16} />{t('Cancel')}</button>
        <button type="button" className="btn btn-primary" onClick={save}><Check size={16} />{t('Save timeline')}</button>
      </div>
    </div>
  )
}
