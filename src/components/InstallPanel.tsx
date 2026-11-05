import { useEffect, useState, useSyncExternalStore } from 'react'
import { CheckCircle2, Download, Info, Monitor, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { getInstallSnapshot, promptInstall, subscribeInstallState } from '../lib/pwa'
import { detectCapabilities, type CapabilityId } from '../lib/capabilities'
import { useI18n } from '../lib/i18n'

const CAPABILITY_LABEL: Record<CapabilityId, string> = {
  speech: 'Speech dictation',
  install: 'Install to desktop',
  microphone: 'Microphone',
  crossOriginIsolation: 'Threaded transcription',
  clipboard: 'Clipboard',
}

const CAPABILITY_NOTE: Record<CapabilityId, string> = {
  speech: 'Unavailable in Firefox desktop: type your answer instead, or open this site in Chrome, Edge, or Safari.',
  install: 'One click in Chrome and Edge; Safari 17 uses File → Add to Dock; Firefox desktop cannot install web apps.',
  microphone: 'Desktop browsers ask once per site and need HTTPS or localhost. Denying it blocks dictation, not typing.',
  crossOriginIsolation: 'Runs single-threaded by design, so long recordings take longer than the audio itself on older machines.',
  clipboard: 'Needs HTTPS or localhost; on plain http the copy button reports the failure instead of pretending.',
}

export function InstallPanel() {
  const { t } = useI18n()
  const install = useSyncExternalStore(subscribeInstallState, getInstallSnapshot, getInstallSnapshot)
  const [capabilities, setCapabilities] = useState(() => detectCapabilities())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    // Service worker control and standalone mode both change after mount.
    const refresh = () => setCapabilities(detectCapabilities())
    refresh()
    navigator.serviceWorker?.addEventListener('controllerchange', refresh)
    const timer = window.setInterval(refresh, 5000)
    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh)
      window.clearInterval(timer)
    }
  }, [])

  const installNow = async () => {
    setBusy(true)
    try {
      const outcome = await promptInstall()
      if (outcome === 'accepted') toast.success(t('Installing SkopeinSignal. The new window opens from your taskbar or Dock.'))
      else if (outcome === 'dismissed') toast.message(t('Installation was dismissed. You can install later from this panel.'))
      else toast.error(t('The install dialog gave no answer. If it is still open, finish it there; otherwise use the manual steps below.'))
    } finally {
      setBusy(false)
    }
  }

  const stateText = install.state === 'installed'
    ? t('Installed — this atelier runs in its own window.')
    : install.state === 'installable'
      ? t('This browser offers a one-click install.')
      : t('No one-click install in this browser; use the manual path below.')

  return <>
    <div className={`install-state install-state--${install.state}`}>
      <Monitor size={20} />
      <div>
        <strong>{install.state === 'installed' ? t('Installed') : install.state === 'installable' ? t('Ready to install') : t('Manual install')}</strong>
        <span>{stateText}</span>
      </div>
      {install.state === 'installable' && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void installNow()}>
          <Download size={16} />{t('Install SkopeinSignal')}
        </button>
      )}
    </div>

    {install.browser === 'firefox' && install.state !== 'installed' && (
      <div className="local-warning"><Info size={20} /><p><strong>{t('Firefox desktop')}</strong><br />{t('Firefox cannot install web apps on desktop. Everything works in a normal tab; for a standalone window, open this address once in Chrome or Edge and use the install icon in the address bar.')}</p></div>
    )}
    {install.browser === 'safari' && install.platform === 'macos' && install.state !== 'installed' && (
      <div className="local-warning"><Info size={20} /><p><strong>{t('Safari on macOS')}</strong><br />{t('Version 17 and later installs through File → Add to Dock. Earlier Safari keeps the site as a tab; every feature still works.')}</p></div>
    )}

    <ol className="install-steps">
      <li>{t('Chrome or Edge on Windows, macOS, or Linux: use the install icon in the address bar, or the button above when it appears.')}</li>
      <li>{t('Safari 17 or later on macOS: File → Add to Dock.')}</li>
      <li>{t('iPad or iPhone: open in Safari, tap Share, then Add to Home Screen.')}</li>
      <li>{t('Firefox desktop: no installation; keep a bookmark, all features work in the tab.')}</li>
    </ol>

    <h3 className="install-subheading">{t('What desktop can and cannot do')}</h3>
    <p className="form-hint">{t('Measured in this browser right now, before you click anything.')}</p>
    <div className="dependency-grid">
      {capabilities.map((capability) => {
        const ok = capability.available
        return (
          <div key={capability.id} className={`dependency-card ${ok ? 'is-ready' : 'is-warning'}`}>
            {ok ? <CheckCircle2 size={19} /> : <XCircle size={19} />}
            <strong>{t(CAPABILITY_LABEL[capability.id])}</strong>
            <span>{ok ? (capability.degraded ? t('Limited') : t('Available')) : t('Unavailable')}</span>
            {(!ok || capability.degraded) && <em className="dependency-fallback">{t(CAPABILITY_NOTE[capability.id])}</em>}
          </div>
        )
      })}
    </div>
  </>
}
