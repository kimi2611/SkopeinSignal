import { useState, type FormEvent } from 'react'
import { Pencil, Rss } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { PageHeader, RefreshButton } from '../components/Common'
import { useWorkspace } from '../hooks/useWorkspace'
import { TIER_SHORT } from '../lib/format'
import { moduleTitle } from '../lib/themeTitles'
import { useI18n } from '../lib/i18n'
import { publicHttpUrlError } from '../lib/publicUrl'
import { TIER_LABELS, type PodcastShow, type Tier } from '../types'

const TIER_ORDER: Tier[] = ['radar', 'main', 'supplement', 'archive']
const TIER_COPY: Record<Tier, string> = {
  radar: 'High-frequency signal inputs: scan without following every release; deep listening requires a clear question.',
  main: 'One default core source per subject, without making every episode compulsory.',
  supplement: 'Enter the queue only when the guest, motion, or information gain is explicit.',
  archive: 'A question-led reference library with no routine listening quota.',
}

export function ShowsView() {
  const { state } = useWorkspace()
  const theme = state.settings.theme
  const { t } = useI18n()
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = state.shows.find((show) => show.id === editingId) ?? null

  return (
    <div className="page-wrap">
      <PageHeader view="shows" kicker={t('SHOWS / FOUR TIERS')} title={t(moduleTitle(theme, 'shows'))} copy={t('Tiering resolves role conflict rather than simply deleting similar shows. Make each role explicit so episode selection becomes an actionable decision.')} />
      <div className="tier-summary">{TIER_ORDER.map((tier) => <div key={tier}><span>{t(TIER_SHORT[tier])}</span><strong>{state.shows.filter((show) => show.tier === tier).length}</strong></div>)}</div>
      <div className="show-groups">
        {TIER_ORDER.map((tier) => (
          <section className="show-group" key={tier}>
            <div className="show-group-heading"><div><span className="section-index">{TIER_LABELS[tier].slice(0, 2)}</span><h2>{t(TIER_SHORT[tier])}</h2></div><p>{t(TIER_COPY[tier])}</p></div>
            <div className="show-list">
              {state.shows.filter((show) => show.tier === tier).map((show) => (
                <article className="show-row" key={show.id}>
                  <div className="show-code">{show.code}</div>
                  <div className="show-info"><div className="show-title-line"><h3>{show.shortName}</h3><span>{show.language}</span><span>{show.domain}</span></div><p>{show.role}</p><div className="show-submeta"><span>{t('{count} snips', { count: show.totalSnips })}</span>{show.skipStreak > 0 && <span className={show.skipStreak >= 3 ? 'warning-text' : ''}>{t('{count} consecutive skips', { count: show.skipStreak })}{show.skipStreak >= 3 ? t(' · consider downgrade') : ''}</span>}<span>{t('{count} episodes in workspace', { count: state.episodes.filter((episode) => episode.showId === show.id).length })}</span></div></div>
                  <div className="show-actions"><button type="button" className="btn btn-ghost btn-small" onClick={() => setEditingId(show.id)}><Pencil size={15} />{t('Edit role')}</button><RefreshButton showIds={[show.id]} label="Refresh" secondary /></div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditingId(null)}>
        <DialogContent className="modal-content max-h-[88dvh] overflow-y-auto sm:max-w-xl">
          {editing && <ShowEditForm key={editing.id} show={editing} onClose={() => setEditingId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ShowEditForm({ show, onClose }: { show: PodcastShow; onClose: () => void }) {
  const { updateShow } = useWorkspace()
  const { t } = useI18n()
  const [tier, setTier] = useState<Tier>(show.tier)
  const [role, setRole] = useState(show.role)
  const [feedUrl, setFeedUrl] = useState(show.feedUrl)
  const [error, setError] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!role.trim()) { setError(t('Describe this show’s role in your system.')); return }
    const urlError = publicHttpUrlError(feedUrl, true)
    if (urlError) { setError(t(urlError)); return }
    updateShow(show.id, { tier, role: role.trim(), feedUrl: feedUrl.trim() })
    toast.success(t('{show} tier and role saved.', { show: show.shortName }))
    onClose()
  }
  return (
    <form onSubmit={submit}>
      <DialogHeader className="pr-8 text-left"><div className="modal-kicker">{show.domain} · {show.language}</div><DialogTitle className="modal-title">{show.shortName}</DialogTitle><DialogDescription className="modal-description">{t('A specific role makes overlap easier to judge during triage.')}</DialogDescription></DialogHeader>
      <div className="form-stack">
        <label className="field-label" htmlFor="show-tier">{t('Tier')}</label>
        <select id="show-tier" className="field" value={tier} onChange={(event) => setTier(event.target.value as Tier)}>{TIER_ORDER.map((key) => <option key={key} value={key}>{t(TIER_LABELS[key])}</option>)}</select>
        <p className="form-hint">{t(TIER_COPY[tier])}</p>
        <label className="field-label" htmlFor="show-role">{t('Show role')}</label>
        <textarea id="show-role" className="field textarea" rows={4} value={role} onChange={(event) => { setRole(event.target.value); setError('') }} />
        <label className="field-label" htmlFor="show-feed">{t('Public RSS / Atom URL')}</label>
        <div className="input-with-icon"><Rss size={16} /><input id="show-feed" className="field" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="https://…" /></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <DialogFooter className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>{t('Cancel')}</button><button type="submit" className="btn btn-primary">{t('Save changes')}</button></DialogFooter>
    </form>
  )
}
