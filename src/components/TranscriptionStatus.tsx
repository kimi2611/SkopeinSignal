import { ArrowUpRight, AudioLines, Check, X } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { transcriptionJobs, useTranscriptionJob } from '../lib/transcriptionJobs'
import type { ViewKey } from '../types'

interface TranscriptionStatusProps {
  view: ViewKey
  onNavigate: (view: ViewKey) => void
}

/** A small receipt for the module-level job; it never owns or cancels inference. */
export function TranscriptionStatus({ view, onNavigate }: TranscriptionStatusProps) {
  const { t } = useI18n()
  const job = useTranscriptionJob()
  if (!job || view === 'study' || (job.status === 'done' && job.consumed)) return null

  return (
    <aside className={`transcription-status is-${job.status}`} aria-label={t('On-device transcription status')}>
      <span className="transcription-status-mark" aria-hidden="true">
        {job.status === 'done' ? <Check size={17} /> : <AudioLines size={17} />}
      </span>
      <div className="transcription-status-copy">
        <strong>{t(job.status === 'running' ? 'Transcription continues across modules' : job.status === 'done' ? 'Your transcript is ready' : 'Transcription needs attention')}</strong>
        <span>{job.status === 'running'
          ? t('{stage} · {progress}%', { stage: t(job.progress.stage), progress: Math.round(job.progress.progress * 100) })
          : job.status === 'done' ? job.filename : t('Return to Listen & Read to review the error.')}</span>
        {job.status === 'running' && <progress value={job.progress.progress} max={1} aria-label={t('Transcription progress')} />}
      </div>
      {job.status !== 'error' && <button type="button" className="transcription-status-return" onClick={() => onNavigate('study')}>
        <span>{t('Listen & Read')}</span><ArrowUpRight size={15} />
      </button>}
      {job.status === 'error' && <>
        <button type="button" className="transcription-status-return" onClick={() => onNavigate('study')}><span>{t('Review')}</span><ArrowUpRight size={15} /></button>
        <button type="button" className="transcription-status-dismiss" onClick={() => transcriptionJobs.dismiss(job.id)} aria-label={t('Dismiss transcription notification')}><X size={16} /></button>
      </>}
    </aside>
  )
}
