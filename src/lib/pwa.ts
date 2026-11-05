// Install-to-desktop plumbing.
//
// `beforeinstallprompt` fires once, early, and only in Chromium browsers. If
// nothing calls preventDefault() before it fires, the browser shows its own
// mini-infobar and the event is gone — so this module is imported at the very
// top of main.tsx, before React renders, rather than from the component that
// draws the button.
//
// Firefox desktop has no install prompt at all, and Safari installs through
// File → Add to Dock, so "no event" cannot be reported as "nothing to do here":
// the panel has to name the browser and give the manual path. That is the whole
// point of this file.

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export type InstallState = 'installed' | 'installable' | 'unavailable'
export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'chromeos' | 'android' | 'ios' | 'unknown'
export type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari' | 'samsung' | 'unknown'

type Snapshot = { state: InstallState; platform: DesktopPlatform; browser: BrowserName }

let deferredPrompt: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()
let snapshot: Snapshot | null = null

function detectPlatform(): DesktopPlatform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/CrOS/.test(ua)) return 'chromeos'
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macos'
  if (/Win/.test(ua)) return 'windows'
  if (/Linux|X11/.test(ua)) return 'linux'
  return 'unknown'
}

function detectBrowser(): BrowserName {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  // Edge and Samsung both masquerade as Chrome, so order matters.
  if (/Edg\//.test(ua)) return 'edge'
  if (/SamsungBrowser/.test(ua)) return 'samsung'
  if (/Firefox\/|FxiOS/.test(ua)) return 'firefox'
  if (/Chrome\/|CriOS/.test(ua)) return 'chrome'
  if (/Safari\//.test(ua)) return 'safari'
  return 'unknown'
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true
}

function compute(): Snapshot {
  const state: InstallState = installed || isStandalone() ? 'installed' : deferredPrompt ? 'installable' : 'unavailable'
  const next: Snapshot = { state, platform: detectPlatform(), browser: detectBrowser() }
  const previous = snapshot
  if (!previous || previous.state !== next.state || previous.platform !== next.platform || previous.browser !== next.browser) {
    snapshot = next
  }
  return snapshot as Snapshot
}

function emit() {
  snapshot = null
  compute()
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Chromium would otherwise show its own infobar and consume the event.
    event.preventDefault()
    deferredPrompt = event as InstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    emit()
  })
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit)
}

export function subscribeInstallState(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getInstallSnapshot(): Snapshot {
  return snapshot ?? compute()
}

/** Returns the browser's answer, or 'unavailable' when there is no prompt to show. */
export async function promptInstall(timeoutMs = 20000): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable'
  const event = deferredPrompt
  // One event, one prompt: Chromium rejects a second prompt() on the same event.
  deferredPrompt = null
  try {
    // Neither prompt() nor userChoice is guaranteed to settle: headless Chrome
    // resolves neither, and an OS-dismissed dialog can leave userChoice pending
    // forever. Timing out the whole exchange is the only way to keep the button
    // from staying disabled for good.
    const exchange = (async () => {
      await event.prompt()
      return event.userChoice
    })()
    const choice = await Promise.race([
      exchange,
      new Promise<null>((resolve) => { setTimeout(() => resolve(null), timeoutMs) }),
    ])
    emit()
    if (!choice) return 'unavailable'
    return choice.outcome
  } catch {
    emit()
    return 'unavailable'
  }
}
