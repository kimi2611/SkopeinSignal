import { useState } from 'react'
import { CheckCircle2, Download, ExternalLink, FileJson2, FileText, HardDrive, PackageCheck, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspace } from '../../hooks/useWorkspace'
import { compositeHandoffMarkdown, compositeHandoffText, downloadText, handoffFiles, handoffMarkdown, linguaCafeText, safeFilename, shareHandoff, vocabularyCsv, type CompositeHandoffSelection } from '../../lib/handoff'
import { transcriptToVtt } from '../../lib/transcript'
import { navigateToHash } from '../../lib/studyNavigation'
import { CloudStatusBadge } from '../CloudSync'
import { useI18n } from '../../lib/i18n'
import type { CloudSyncStatus } from '../../hooks/useCloudWorkspace'
import type { Episode, PodcastShow, StudySession, VocabularyEntry } from '../../types'

interface HandoffPanelProps {
  episode: Episode
  show: PodcastShow
  session: StudySession
  entries: VocabularyEntry[]
  onOpenTimeline: () => void
}

const ALL_PARTS: CompositeHandoffSelection = {
  transcript: true,
  summary: true,
  notes: true,
  vocabulary: true,
  sourceLinks: true,
  resourceReports: true,
}

export function HandoffPanel({ episode, show, session, entries, onOpenTimeline }: HandoffPanelProps) {
  const { state, cloud, updateStudySession } = useWorkspace()
  const { t, locale } = useI18n()
  const [selection, setSelection] = useState<CompositeHandoffSelection>({ ...ALL_PARTS })
  const [backupReceipt, setBackupReceipt] = useState('')
  const base = safeFilename(`${show.shortName}-${episode.title}`)
  const vtt = transcriptToVtt(session.segments)
  const summary = state.summaries.find((item) => item.episodeId === episode.id)
  const notes = state.notes.filter((item) => item.episodeId === episode.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const resourceReports = state.resourceReports.filter((item) => item.episodeId === episode.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const hasSourceLinks = Boolean(episode.link || show.feedUrl || (session.audioMode === 'rss' && (session.audioUrl || episode.audioUrl)))
  const available: CompositeHandoffSelection = {
    transcript: session.segments.length > 0,
    summary: Boolean(summary),
    notes: notes.length > 0,
    vocabulary: entries.length > 0,
    sourceLinks: hasSourceLinks,
    resourceReports: resourceReports.length > 0,
  }
  const effectiveSelection: CompositeHandoffSelection = {
    transcript: selection.transcript && available.transcript,
    summary: selection.summary && available.summary,
    notes: selection.notes && available.notes,
    vocabulary: selection.vocabulary && available.vocabulary,
    sourceLinks: selection.sourceLinks && available.sourceLinks,
    resourceReports: selection.resourceReports && available.resourceReports,
  }
  const selectedCount = Object.values(effectiveSelection).filter(Boolean).length
  const parts: Array<{ key: keyof CompositeHandoffSelection; label: string; detail: string }> = [
    { key: 'transcript', label: t('Original transcript'), detail: available.transcript ? t('{count} saved segments', { count: session.segments.length }) : t('No saved transcript — import one in Listen & Read.') },
    { key: 'summary', label: t('Kimi summary'), detail: available.summary ? t('Four-part summary saved') : t('No summary — create or import one in Value Insights.') },
    { key: 'notes', label: t('Notes & finished drafts'), detail: available.notes ? t('{count} saved notes or drafts', { count: notes.length }) : t('No notes — save a draft in Notes.') },
    { key: 'vocabulary', label: t('Vocabulary'), detail: available.vocabulary ? t('{count} episode words', { count: entries.length }) : t('No episode vocabulary — save words or import a word list.') },
    { key: 'sourceLinks', label: t('Source links'), detail: available.sourceLinks ? t('Episode, public audio, and feed addresses when available') : t('No episode, public audio, or feed link is available.') },
    { key: 'resourceReports', label: t('Resources reports'), detail: available.resourceReports ? t('{count} linked reports with their original DOI and source URLs', { count: resourceReports.length }) : t('No linked reports — save one in Resources and attach this episode.') },
  ]
  const cloudDescriptions: Record<CloudSyncStatus, string> = {
    disabled: t('This browser only. Text is not synced to another device until you sign in with Kimi.'),
    loading: t('Connecting to the cloud. The browser copy remains available; wait for a sync receipt before switching devices.'),
    migration: t('Cloud setup needs your choice. Open Settings to upload this browser workspace or start fresh; local audio never enters the cloud save.'),
    saving: t('Saving the text workspace to the cloud. Keep this browser copy until the synced status appears.'),
    synced: cloud.lastSyncedAt ? t('Cloud sync confirmed the text workspace at {date}. Local audio is still excluded.', { date: new Date(cloud.lastSyncedAt).toLocaleString(locale) }) : t('Cloud sync is active for the text workspace. Local audio is still excluded.'),
    error: t('Cloud sync has not confirmed the latest changes. This browser copy is retained; open Settings to retry.'),
    conflict: t('A cloud revision conflict needs your choice. Open Settings before replacing either workspace; nothing is overwritten here.'),
  }

  const markExported = () => updateStudySession(episode.id, { handoffExportedAt: new Date().toISOString() })
  const download = (kind: 'markdown' | 'text' | 'vtt' | 'csv') => {
    if (kind === 'markdown') downloadText(handoffMarkdown(episode, show, session, entries), `${base}-KimiClaw.md`, 'text/markdown;charset=utf-8')
    if (kind === 'text') downloadText(linguaCafeText(session), `${base}-LinguaCafe.txt`)
    if (kind === 'vtt' && vtt) downloadText(vtt, `${base}-LinguaCafe.vtt`, 'text/vtt;charset=utf-8')
    if (kind === 'csv') downloadText(vocabularyCsv(entries, episode, show), `${base}-vocabulary.csv`, 'text/csv;charset=utf-8')
    markExported()
    toast.success(t('File generated. Confirm it in Downloads or Files.'))
  }

  const downloadComposite = (format: 'markdown' | 'text') => {
    if (!selectedCount) return
    const input = { episode, show, session, entries, summary, notes, resourceReports, selection: effectiveSelection }
    if (format === 'markdown') downloadText(compositeHandoffMarkdown(input), `${base}-finished-document.md`, 'text/markdown;charset=utf-8')
    else downloadText(compositeHandoffText(input), `${base}-finished-document.txt`)
    markExported()
    toast.success(t('Finished document generated with {count} selected sections. Audio is not included; confirm the file in Downloads or Files.', { count: selectedCount }))
  }

  const exportBackup = () => {
    const filename = `SkopeinSignal-workspace-${new Date().toISOString().slice(0, 10)}.json`
    downloadText(JSON.stringify(state, null, 2), filename, 'application/json;charset=utf-8')
    const receipt = t('JSON backup download started: {filename}. It contains the text workspace but no audio. Confirm the file in Downloads or Files and keep original audio separately.', { filename })
    setBackupReceipt(receipt)
    toast.success(receipt)
  }

  const share = async () => {
    const result = await shareHandoff(handoffFiles(episode, show, session, entries), episode.title)
    if (result === 'shared') { markExported(); toast.success(t('Share flow completed. Confirm the files in the receiving app.')) }
    if (result === 'unavailable') { download('markdown'); toast.message(t('This browser does not support multi-file sharing, so the KimiClaw handoff document was downloaded instead.')) }
  }

  return (
    <section className="handoff-desk" aria-labelledby="handoff-title">
      <div className="study-section-heading">
        <div><span className="section-index">{t('HANDOFF / EXPORT')}</span><h2 id="handoff-title">{t('Convert & export')}</h2><p>{t('Turn this episode’s saved work into portable files. Playback completion prepares the content; cross-app transfer still requires your confirmation, so an export is never mislabeled as an import.')}</p></div>
        <span className={`handoff-status ${session.completedAt ? 'is-ready' : ''}`}>{session.completedAt ? <><CheckCircle2 size={16} />{t('Completed; handoff ready')}</> : t('Manual export is available before completion')}</span>
      </div>

      <div className="handoff-flow" aria-label={t('Handoff steps')}>
        <div><span>01</span><strong>SkopeinSignal</strong><p>{t('Transcript, timestamps, and episode vocabulary are packaged locally.')}</p></div>
        <div><span>02</span><strong>KimiClaw</strong><p>{t('Use system sharing, or download and upload in a conversation or workspace.')}</p></div>
        <div><span>03</span><strong>LinguaCafe</strong><p>{t('Choose Import in Library, then select plain text or subtitles.')}</p></div>
      </div>

      <section className="handoff-composite" aria-labelledby="composite-export-title">
        <div className="handoff-composite-heading">
          <div><span className="section-index">{t('FINISHED DOCUMENT / YOUR SELECTION')}</span><h3 id="composite-export-title">{t('Compose one finished document')}</h3><p>{t('Combine only the sections you want. Resources reports retain their saved DOI, database, landing pages, evidence scope, and limitations; no new citations are created.')}</p></div>
          <div className="handoff-composite-select-all"><button type="button" className="btn btn-ghost btn-small" onClick={() => setSelection({ ...ALL_PARTS })}>{t('Select all available')}</button><button type="button" className="btn btn-ghost btn-small" onClick={() => setSelection({ transcript: false, summary: false, notes: false, vocabulary: false, sourceLinks: false, resourceReports: false })}>{t('Clear selection')}</button></div>
        </div>
        <div className="handoff-part-grid">
          {parts.map((part) => <label key={part.key} className={`handoff-part ${effectiveSelection[part.key] ? 'is-selected' : ''} ${!available[part.key] ? 'is-disabled' : ''}`}>
            <input type="checkbox" checked={effectiveSelection[part.key]} disabled={!available[part.key]} onChange={(event) => setSelection((current) => ({ ...current, [part.key]: event.target.checked }))} />
            <span><strong>{part.label}</strong><small>{part.detail}</small></span>
          </label>)}
        </div>
        <div className="handoff-composite-actions">
          <button type="button" className="btn btn-primary" disabled={!selectedCount} title={!selectedCount ? t('Choose at least one available section first.') : undefined} onClick={() => downloadComposite('markdown')}><Download size={16} />{t('Download finished Markdown')}</button>
          <button type="button" className="btn btn-secondary" disabled={!selectedCount} title={!selectedCount ? t('Choose at least one available section first.') : undefined} onClick={() => downloadComposite('text')}><Download size={16} />{t('Download finished TXT')}</button>
          <p className="form-hint">{selectedCount ? t('{count} available sections selected. The original Markdown, TXT, VTT, CSV, and system sharing options remain below.', { count: selectedCount }) : t('Choose at least one available section. Disabled sections explain where to create the missing content.')}</p>
        </div>
      </section>

      <div className="handoff-actions-grid">
        <article>
          <PackageCheck size={21} />
          <h3>{t('Complete handoff package')}</h3>
          <p>{t('KimiClaw Markdown, LinguaCafe TXT, and vocabulary CSV in one system share flow.')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void share()}><Share2 size={16} />{t('Share handoff package')}</button>
          <a className="btn btn-ghost" href="https://www.kimi.com/bot" target="_blank" rel="noreferrer">{t('Open KimiClaw')}<ExternalLink size={15} /></a>
        </article>
        <article>
          <FileJson2 size={21} />
          <h3>{t('KimiClaw handoff document')}</h3>
          <p>{t('Includes episode metadata, timestamped transcript, vocabulary, and instructions.')}</p>
          <button type="button" className="btn btn-secondary" onClick={() => download('markdown')}><Download size={16} />{t('Download Markdown')}</button>
        </article>
        <article>
          <FileText size={21} />
          <h3>{t('LinguaCafe import files')}</h3>
          <p>{t('TXT preserves clean paragraphs; a complete source timeline can also be exported as VTT subtitles.')}</p>
          <div className="handoff-button-row"><button type="button" className="btn btn-secondary" onClick={() => download('text')}><Download size={16} />TXT</button><button type="button" className="btn btn-secondary" onClick={() => download('vtt')} disabled={!vtt} title={!vtt ? t('VTT needs a start and end time for every transcript segment.') : undefined}><Download size={16} />VTT</button></div>
          {!vtt && <div className="handoff-disabled-help"><p>{t('VTT is unavailable because at least one transcript segment has no start or end time. TXT is still available. Return to Transcript, choose Set timeline or Edit timeline, and complete every segment before exporting VTT.')}</p><button type="button" className="btn btn-ghost btn-small" onClick={onOpenTimeline}><FileText size={15} />{t('Open transcript & timeline')}</button></div>}
        </article>
        <article>
          <FileText size={21} />
          <h3>{t('Episode vocabulary')}</h3>
          <p>{t('{count} entries with translations, sentences, timestamps, show, and episode metadata.', { count: entries.length })}</p>
          <button type="button" className="btn btn-secondary" onClick={() => download('csv')} disabled={!entries.length}><Download size={16} />{t('Download CSV')}</button>
        </article>
      </div>

      <div className="handoff-storage-state" aria-label={t('Storage and sync status')}>
        <section><h3><HardDrive size={17} />{t('This browser')}</h3><p>{t('Transcripts, summaries, notes, vocabulary, and reports are cached in this browser. Download a separate JSON backup before clearing site data; JSON contains no audio.')}</p><div className="handoff-storage-actions"><button type="button" className="btn btn-secondary btn-small" onClick={exportBackup}><FileJson2 size={15} />{t('Download JSON backup (no audio)')}</button></div></section>
        <section><CloudStatusBadge compact /><p>{cloudDescriptions[cloud.status]}</p><div className="handoff-storage-actions"><button type="button" className="btn btn-ghost btn-small" onClick={() => navigateToHash(cloud.status === 'disabled' ? '/account' : '/settings')}>{cloud.status === 'disabled' ? t('Sign in for cloud sync') : t('Review sync & next steps')}</button></div></section>
        <section><h3><HardDrive size={17} />{t('Local audio · not in JSON')}</h3><p>{session.audioMode === 'local' ? t('This episode uses local-audio mode. Imported audio stays in this browser’s IndexedDB, outside cloud sync and JSON backups. Keep the original file and re-link it on another device.') : t('This episode uses a public audio address. The site streams rather than stores that audio; any local audio you import later remains outside cloud sync and JSON backups.')}</p></section>
        {backupReceipt && <p className="handoff-backup-receipt" role="status">{backupReceipt}</p>}
      </div>

      <div className="handoff-boundary">
        <strong>{t('What is not automatic')}</strong>
        <p>{t('This site has no private KimiClaw or LinguaCafe API access or authorization, so it cannot write files into those accounts after playback. Completion only marks the package ready; upload, receipt, and import must be confirmed in each target app. Audio files are not included.')}</p>
      </div>
      {session.handoffExportedAt && <p className="form-hint">{t('Latest local export/share: {date}. This is not an import receipt from the target app.', { date: new Date(session.handoffExportedAt).toLocaleString(locale) })}</p>}
    </section>
  )
}
