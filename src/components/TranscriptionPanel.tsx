import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../lib/i18n'

/**
 * Transcription channels, in one place, with their real costs visible.
 *
 * The design rule: never show a channel that cannot run. Every row here answers
 * "can this work right now" from the server, not from a hardcoded guess — the
 * sidecar may be down, medium may be on disk but not resident, and the cloud
 * channel may have no key. A greyed row with a reason beats a button that fails.
 */

interface TierInfo {
  tier: 'small' | 'medium'
  label: string
  onDisk: boolean
  sizeMb: number
  loaded: boolean
  pinned: boolean
}

interface Roster {
  tiers: TierInfo[]
  default: string
  freeMb: number
  rssMb: number
  minFreeMbToLoad: number
}

interface CloudProvider {
  id: string
  label: string
  domestic: boolean
  kind: 'openai-compatible' | 'url-subtitle' | 'manual'
  baseUrl?: string
  suggestedModel?: string
  needsPublicUrl?: boolean
  docsUrl: string
  note: string
}

interface CloudProviderRoster {
  providers: CloudProvider[]
  manual: { id: string; label: string; note: string }
  envConfigured: boolean
}

const CLOUD_KEY_PREFIX = 'skopein.whisper.cloudkey.'
const CLOUD_MODEL_PREFIX = 'skopein.whisper.cloudmodel.'

function readCloudKey(id: string): string {
  try { return localStorage.getItem(CLOUD_KEY_PREFIX + id) ?? '' } catch { return '' }
}

function storeCloudKey(id: string, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(CLOUD_KEY_PREFIX + id, value.trim())
    else localStorage.removeItem(CLOUD_KEY_PREFIX + id)
  } catch { /* private mode */ }
}

function readCloudModel(id: string): string {
  try { return localStorage.getItem(CLOUD_MODEL_PREFIX + id) ?? '' } catch { return '' }
}

function storeCloudModel(id: string, value: string): void {
  try {
    if (value.trim()) localStorage.setItem(CLOUD_MODEL_PREFIX + id, value.trim())
    else localStorage.removeItem(CLOUD_MODEL_PREFIX + id)
  } catch { /* private mode */ }
}

interface Channels {
  device: { available: boolean; detail: string }
  server: { available: boolean; detail: string }
  cloud: { available: boolean; model: string | null; detail: string }
}

export const TOKEN_STORAGE_KEY = 'skopein.whisper.token'
export const TIER_STORAGE_KEY = 'skopein.whisper.tier'
export const CHANNEL_STORAGE_KEY = 'skopein.whisper.channel'

export type TranscriptionChannel = 'device' | 'server' | 'cloud'

export function readStored(): { token: string; tier: 'small' | 'medium' } {
  try {
    const tier = localStorage.getItem(TIER_STORAGE_KEY)
    return {
      token: localStorage.getItem(TOKEN_STORAGE_KEY) ?? '',
      tier: tier === 'medium' ? 'medium' : 'small',
    }
  } catch {
    return { token: '', tier: 'small' }
  }
}

export function storeToken(token: string): void {
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token) } catch { /* private mode */ }
}

export function storeTier(tier: 'small' | 'medium'): void {
  try { localStorage.setItem(TIER_STORAGE_KEY, tier) } catch { /* private mode */ }
}

export type DefaultChannel = 'device' | 'server' | 'cloud'

export function readDefaultChannel(): DefaultChannel {
  try {
    const raw = localStorage.getItem(CHANNEL_STORAGE_KEY)
    if (raw === 'device' || raw === 'server' || raw === 'cloud') return raw
  } catch { /* private mode */ }
  return 'server'
}

export function storeDefaultChannel(channel: DefaultChannel): void {
  try { localStorage.setItem(CHANNEL_STORAGE_KEY, channel) } catch { /* private mode */ }
}

export function readStoredTier(): 'small' | 'medium' {
  try { return localStorage.getItem(TIER_STORAGE_KEY) === 'medium' ? 'medium' : 'small' } catch { return 'small' }
}

export default function TranscriptionPanel() {
  const { t } = useI18n()
  const [token, setToken] = useState(() => readStored().token)
  const [roster, setRoster] = useState<Roster | null>(null)
  const [channels, setChannels] = useState<Channels | null>(null)
  const [busy, setBusy] = useState<'load' | 'unload' | null>(null)
  const [cloud, setCloud] = useState<CloudProviderRoster | null>(null)
  const [openProvider, setOpenProvider] = useState<string>('')
  const [cloudKeys, setCloudKeys] = useState<Record<string, string>>({})
  const [cloudModels, setCloudModels] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  // One place decides what a new episode opens with. Before this, the settings
  // page could load medium and the study sheet still defaulted to small — the
  // switch existed but nothing read it.
  const [defaultChannel, setDefaultChannel] = useState<DefaultChannel>(() => readDefaultChannel())
  const [defaultTier, setDefaultTier] = useState<'small' | 'medium'>(() => readStoredTier())

  const headers = useCallback(() => (token.trim() ? { Authorization: `Bearer ${token.trim()}` } : undefined), [token])

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/transcribe/cloud/providers')
      if (!res.ok) return
      const body = (await res.json()) as CloudProviderRoster
      setCloud(body)
      const keys: Record<string, string> = {}
      const models: Record<string, string> = {}
      for (const provider of body.providers) {
        keys[provider.id] = readCloudKey(provider.id)
        models[provider.id] = readCloudModel(provider.id)
      }
      setCloudKeys(keys)
      setCloudModels(models)
    } catch { /* the panel still works without the roster */ }
  }, [])

  useEffect(() => { void loadProviders() }, [loadProviders])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/transcribe/models', { headers: headers() })
      if (res.status === 401) { setError(t('Paste the access token to see server models.')); setRoster(null); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setRoster((await res.json()) as Roster)
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '')
    }
  }, [headers])

  useEffect(() => {
    void fetch('/api/transcribe/channels')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setChannels(data as Channels | null))
      .catch(() => setChannels(null))
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const act = async (action: 'load' | 'unload') => {
    setBusy(action)
    setError('')
    try {
      const res = await fetch(`/api/transcribe/models/${action}?tier=medium`, { method: 'POST', headers: headers() })
      const body = (await res.json().catch(() => ({}))) as Roster & { error?: string; unloaded?: boolean }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setRoster(body)
      if (action === 'load') toast.success(t('Medium is loaded and will stay resident until you drop it or restart the server.'))
      else toast.success(t('Medium released. The file stays on disk; nothing was downloaded again.'))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '')
    } finally {
      setBusy(null)
    }
  }

  const medium = roster?.tiers.find((tier) => tier.tier === 'medium')

  return (
    <section className="settings-section">
      <div className="settings-heading"><span>07</span><div><h2>{t('Transcription channels')}</h2><p>{t('Five ways to turn audio into text. They differ in privacy, accuracy, and how long you wait — pick per episode, not once for ever.')}</p></div></div>

      <ol className="install-steps">
        <li><strong>{t('On this device')}</strong> — {t('free and private, runs in the tab, best for clips under ten minutes; the page must stay in front and awake.')}</li>
        <li><strong>{t('Server · small')}</strong> — {channels?.server.available ? t('about 3× real time, always resident, the sane default for a full episode.') : t('not available on this deployment.')}</li>
        <li><strong>{t('Server · medium')}</strong> — {medium?.loaded ? t('resident now: more accurate, roughly twice as slow, keeps 1.5 GB of RAM.') : t('bigger and slower; it is loaded on demand and can be released again.')}</li>
        <li><strong>{t('Cloud AI')}</strong> — {t('someone else\'s GPU, your key. Fastest for a long file, and the only option that does not care how old your iPad is. Bring your own key below.')}</li>
        <li><strong>{t('Send it to Kimi Claw')}</strong> — {t('drop the file in the group chat and we transcribe it on this host, no key needed. Queued by hand, so it is the slow-but-certain option.')}</li>
      </ol>

      <label className="field-label" htmlFor="asr-default-channel">{t('Default channel for a new episode')}</label>
      <div className="proxy-row">
        <select
          id="asr-default-channel"
          className="field"
          value={defaultChannel}
          onChange={(event) => { const next = event.target.value as DefaultChannel; setDefaultChannel(next); storeDefaultChannel(next) }}
        >
          <option value="device">{t('On this device — private, fine for short clips')}</option>
          <option value="server">{t('Server — the sane default for a full episode')}</option>
          <option value="cloud">{t('Cloud — only if you have already pasted a key below')}</option>
        </select>
        <select
          className="field"
          value={defaultTier}
          onChange={(event) => { const next = event.target.value as 'small' | 'medium'; setDefaultTier(next); storeTier(next) }}
        >
          <option value="small">{t('Server model: fast (small)')}</option>
          <option value="medium">{t('Server model: careful (medium)')}</option>
        </select>
      </div>
      <p className="form-hint">{t('The study sheet reads this every time it opens. Choosing a channel there for one episode does not change it — this is the setting that sticks.')}</p>

      <label className="field-label" htmlFor="asr-token">{t('Server access token')}</label>
      <div className="proxy-row">
        <input id="asr-token" className="field" type="password" value={token} placeholder={t('Only needed for the server channels')} onChange={(event) => { setToken(event.target.value); storeToken(event.target.value) }} />
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>{t('Check')}</button>
      </div>

      {roster && (
        <div className="local-warning">
          <p>
            <strong>{t('Server memory')}</strong><br />
            {t('{free} MB free · sidecar using {rss} MB · medium needs {need} MB free before it will load.', { free: roster.freeMb, rss: roster.rssMb, need: roster.minFreeMbToLoad })}
            {' '}
            {t('On disk: small {small} MB, medium {medium} MB. Files on disk cost nothing; only residency does.', { small: roster.tiers.find((tier) => tier.tier === 'small')?.sizeMb ?? 0, medium: medium?.sizeMb ?? 0 })}
          </p>
        </div>
      )}

      <div className="backup-actions">
        <button type="button" className="btn btn-secondary" disabled={busy !== null || !medium?.onDisk || medium?.loaded} onClick={() => void act('load')}>
          {busy === 'load' ? t('Loading medium…') : t('Load medium (1.5 GB RAM)')}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy !== null || !medium?.loaded} onClick={() => void act('unload')}>
          {busy === 'unload' ? t('Releasing…') : t('Release medium from memory')}
        </button>
      </div>
      <p className="form-hint">{t('Releasing only frees RAM — the model file stays where it is. If memory is tight, leave medium unloaded and the server keeps using small.')}</p>
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="settings-heading" style={{ marginTop: '2rem' }}>
        <span>07b</span>
        <div>
          <h2>{t('Cloud providers (BYOK)')}</h2>
          <p>{t('Ordered by whether they work from mainland China without a proxy. Keys live in this browser only and travel with each request — the deployment\'s server does see them in flight, so do not paste a company master key.')}</p>
        </div>
      </div>

      <ul className="install-steps">
        {cloud?.providers.map((provider) => {
          const open = openProvider === provider.id
          const key = cloudKeys[provider.id] ?? ''
          const model = cloudModels[provider.id] ?? ''
          return (
            <li key={provider.id}>
              <button type="button" className="btn btn-ghost" style={{ padding: 0, textAlign: 'left' }} onClick={() => setOpenProvider(open ? '' : provider.id)}>
                <strong>{t(provider.label)}</strong>
                {' · '}
                {provider.domestic ? t('works in mainland China') : t('needs a proxy — leave it last')}
                {' · '}
                {provider.kind === 'openai-compatible' ? t('accepts file upload') : t('needs a public URL')}
                {' '}
                {key ? '✓' : ''}
              </button>
              {open && (
                <div className="local-warning" style={{ marginTop: '0.5rem' }}>
                  <p>{t(provider.note)}</p>
                  <p>
                    <a href={provider.docsUrl} target="_blank" rel="noreferrer">{t('Vendor documentation')}</a>
                    {provider.baseUrl ? <> {' · '} <code>{provider.baseUrl}</code></> : null}
                  </p>
                  <div className="proxy-row">
                    <input
                      className="field"
                      type="password"
                      placeholder={t('API key for {label}', { label: t(provider.label) })}
                      value={key}
                      onChange={(event) => { const next = event.target.value; setCloudKeys((prev) => ({ ...prev, [provider.id]: next })); storeCloudKey(provider.id, next) }}
                    />
                  </div>
                  {provider.kind === 'openai-compatible' && (
                    <div className="proxy-row">
                      <input
                        className="field"
                        placeholder={provider.suggestedModel ? t('Model — suggested: {model}', { model: provider.suggestedModel }) : t('Model name')}
                        value={model}
                        onChange={(event) => { const next = event.target.value; setCloudModels((prev) => ({ ...prev, [provider.id]: next })); storeCloudModel(provider.id, next) }}
                      />
                    </div>
                  )}
                  {provider.needsPublicUrl && (
                    <p className="form-hint">{t('This one takes a link, not a file. Upload the audio somewhere public first (object storage, a share link that ends in .mp3 or .m4a) and paste that URL when you start a transcription.')}</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
        {cloud?.manual && (
          <li>
            <button type="button" className="btn btn-ghost" style={{ padding: 0, textAlign: 'left' }} onClick={() => setOpenProvider(openProvider === cloud.manual.id ? '' : cloud.manual.id)}>
              <strong>{t(cloud.manual.label)}</strong> · {t('no key, queued by hand')}
            </button>
            {openProvider === cloud.manual.id && (
              <div className="local-warning" style={{ marginTop: '0.5rem' }}>
                <p>{t(cloud.manual.note)}</p>
                <p className="form-hint">{t('What to send: the audio file itself, plus the language if it is not English. You get back plain text, an SRT file, and the word list — the same four deliverables as the podcast pipeline.')}</p>
              </div>
            )}
          </li>
        )}
      </ul>
    </section>
  )
}
