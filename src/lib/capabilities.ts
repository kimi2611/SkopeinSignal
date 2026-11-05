// What this browser can actually do, checked at runtime rather than assumed.
//
// The rule from the acceptance criteria: a capability that is missing on the
// desktop build must be visible *before* the user clicks, never as a silent
// failure afterwards. So each row carries an honest fallback, and the panel
// shows the detected state next to it instead of a generic "supported" claim.

export type CapabilityId =
  | 'speech'
  | 'install'
  | 'microphone'
  | 'crossOriginIsolation'
  | 'clipboard'

export type Capability = {
  id: CapabilityId
  /** Detected now, in this browser. */
  available: boolean
  /** True when the capability exists but is slower or restricted on desktop. */
  degraded: boolean
}

export function detectCapabilities(): Capability[] {
  const w = typeof window === 'undefined' ? undefined : window
  const speech = w ? 'SpeechRecognition' in w || 'webkitSpeechRecognition' in w : false

  return [
    {
      id: 'speech',
      // Chrome, Edge, and Safari expose Web Speech; Firefox desktop does not,
      // which is the single most common "the microphone button does nothing".
      available: speech,
      degraded: false,
    },
    {
      id: 'install',
      available: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      degraded: true,
    },
    {
      id: 'microphone',
      available: Boolean(navigator?.mediaDevices?.getUserMedia),
      degraded: false,
    },
    // Offline shell and IndexedDB audio are already reported, with more detail,
    // in the reliability panel above; repeating them here would be noise.
    {
      id: 'crossOriginIsolation',
      // Threaded WASM needs COOP/COEP. The transcriber is built to run with one
      // thread regardless, so this row explains why it is slower, not why it fails.
      available: Boolean(w?.crossOriginIsolated),
      degraded: true,
    },
    {
      id: 'clipboard',
      available: Boolean(navigator?.clipboard?.writeText) && (w?.isSecureContext ?? false),
      degraded: false,
    },
  ]
}
