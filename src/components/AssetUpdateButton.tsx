import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import { refreshLocalAssetCopy } from '../lib/refreshAsset'

/** One-click refresh of a bundled recording/artwork's local cached copy. */
export function AssetUpdateButton({ src }: { src: string }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')
  const [kb, setKb] = useState(0)

  const run = async () => {
    if (busy) return
    setBusy(true)
    setStatus('idle')
    const result = await refreshLocalAssetCopy(src)
    setBusy(false)
    if (result.ok) {
      setKb(Math.max(1, Math.round(result.bytes / 1024)))
      setStatus('ok')
    } else {
      setStatus('error')
    }
  }

  return (
    <span className="asset-update">
      <button type="button" className="btn btn-secondary" onClick={() => void run()} disabled={busy}>
        <RefreshCw size={14} className={busy ? 'spin' : ''} />{busy ? t('Updating copy…') : t('Update copy')}
      </button>
      {status === 'ok' && <span className="asset-update-status is-ok">{t('Fresh copy · {kb} KB', { kb })}</span>}
      {status === 'error' && <span className="asset-update-status is-error">{t('Update failed — check the connection; the existing copy still plays.')}</span>}
    </span>
  )
}
