import type {
  AsrConcreteLanguage,
  AsrLanguage,
  TranscribeProgress,
  TranscribeResult,
} from './localTranscribe'

/**
 * Server ASR path for the listening desk.
 *
 * Three things here were paid for with real failed uploads from an iPad:
 *
 * 1. `XMLHttpRequest`, not `fetch`. fetch cannot report upload progress, and on
 *    a 50 KB/s link the upload is five of the ten minutes — a progress bar that
 *    only starts moving after it finishes is worse than no bar.
 * 2. No request timeout. The server holds the response until transcription
 *    finishes, which is legitimately minutes. The honest long wait belongs to
 *    the caller's abort signal, not to a library default.
 * 3. Chunked uploads with resume. One 14 MB request over a link that drops
 *    every fifteen seconds never finishes — measured three times: aborted at
 *    9%, at 15 s and at 135 s. So the file now goes up 1.5 MB at a time and a
 *    dropped connection costs one piece, not the whole file.
 */

export type ServerModelTier = 'small' | 'medium'

export interface ServerTranscribeOptions {
  token?: string
  /** 'small' is fast and always resident; 'medium' is slower and loaded on demand. */
  tier?: ServerModelTier
  endpoint?: string
  /** Abort from a UI "cancel" without leaving a socket half-open. */
  signal?: AbortSignal
  contentType?: string
}

const DEFAULT_ENDPOINT = '/api/transcribe'

/** No byte for this long during upload means the connection is dead, not slow. */
const STALL_MS = 45_000

/** 1.5 MB: two retries per minute on a 40 KB/s link, small enough to lose. */
/**
 * Piece size. 512 KB, not megabytes: the failures that started all this were
 * 1.5 MB requests dying at 39-77 s on an iPad Safari over a VPN. Smaller pieces
 * cost one extra request each and fit inside whatever window the OS gives us.
 */
const CHUNK_BYTES = 512 * 1024

/** Smallest piece we will fall back to before calling the link unusable. */
const MIN_CHUNK_BYTES = 128 * 1024

/** Per-chunk silence limit. Shorter than the whole-request one: a dead chunk
 *  should be retried while the user is still watching, not after a minute. */
const CHUNK_STALL_MS = 30_000

/**
 * A chunk is retried for this long before the upload is declared dead.
 *
 * Attempt counts are the wrong unit here: a 9-second outage on a train eats
 * four attempts in eight seconds because every request fails instantly, and the
 * upload dies while the connection was fine again two seconds later. A time
 * budget rides out real outages and still gives up on a link that is gone.
 */
const CHUNK_RETRY_WINDOW_MS = 45 * 1000

/** Backoff between chunk retries: 1s, 2s, 4s, then 8s until the window ends. */
const CHUNK_BACKOFF_MAX_MS = 8000

/** Files at or below this go up in one request: chunking a 2 MB clip just adds
 *  round trips to a path that already works. */
const SINGLE_SHOT_LIMIT = CHUNK_BYTES * 1.5

export async function transcribeOnServer(
  data: ArrayBuffer,
  language: AsrLanguage,
  onProgress: (progress: TranscribeProgress) => void,
  options: ServerTranscribeOptions = {},
): Promise<TranscribeResult> {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT
  const token = options.token?.trim()
  const tier: ServerModelTier = options.tier ?? 'small'

  onProgress({ stage: 'uploading', progress: 0, detail: `${formatMb(data.byteLength)} to send` })

  const accepted = await uploadWithFallback(data, language, tier, endpoint, token, onProgress, options)

  const payload = accepted.final || !accepted.jobId
    ? accepted
    : await pollJob(endpoint, accepted.jobId, token, onProgress, options.signal)

  onProgress({ stage: 'transcribing', progress: 0.99, detail: 'assembling transcript' })

  const text = typeof payload.text === 'string' ? payload.text : ''
  const vtt = typeof payload.vtt === 'string' && payload.vtt.trim()
    ? payload.vtt
    : textToVtt(text, typeof payload.duration === 'number' ? payload.duration : undefined)

  const languageOut = (typeof payload.language === 'string' && payload.language ? payload.language : 'en') as AsrConcreteLanguage

  return {
    vtt,
    text,
    channel: 'mono',
    model: typeof payload.model === 'string' ? payload.model : 'server',
    language: languageOut,
    languages: [languageOut],
  }
}

// ---------------------------------------------------------------------------
// Path A: one request (short clips, and the fallback if chunks are unavailable)
// ---------------------------------------------------------------------------

/**
 * Chunking is an optimisation, not a requirement: a server that predates it (or
 * runs without the sidecar) answers 404, and the upload still has to work.
 */
async function uploadWithFallback(
  data: ArrayBuffer,
  language: AsrLanguage,
  tier: ServerModelTier,
  endpoint: string,
  token: string | undefined,
  onProgress: (progress: TranscribeProgress) => void,
  options: ServerTranscribeOptions,
): Promise<ServerPayload> {
  if (data.byteLength <= SINGLE_SHOT_LIMIT) {
    return uploadWhole(data, language, tier, endpoint, token, onProgress, options)
  }
  try {
    return await uploadInChunks(data, language, tier, endpoint, token, onProgress, options, CHUNK_BYTES)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message !== 'chunk-unavailable') {
      // A link that cannot carry a 1.5 MB request will not carry it on the
      // fourth try either. Halving the piece size is the one lever that turns
      // "everything fails" back into forward progress: the smaller the piece,
      // the less a drop costs and the sooner something completes.
      // Halving restarts from zero, which is only acceptable when we have
      // nothing to lose. Once a few parts are on the server, patience beats
      // cleverness: keep retrying the same piece so the resume stays valid.
      if (message.startsWith('upload-gave-up') && CHUNK_BYTES > MIN_CHUNK_BYTES) {
        const stored = (error as Error & { partsStored?: number }).partsStored ?? 0
        if (stored === 0) return uploadInSmallerPieces(data, language, tier, endpoint, token, onProgress, options)
      }
      throw error
    }
    onProgress({ stage: 'uploading', progress: 0, detail: 'server has no chunk support — sending in one piece' })
    return uploadWhole(data, language, tier, endpoint, token, onProgress, options)
  }
}

/**
 * Retry the whole upload at 512 KB, then 256 KB, then 128 KB pieces.
 *
 * Each round uses a fresh upload id (the id is derived from file + piece size),
 * so the server never sees two different geometries under one name; the previous
 * round's parts are dropped, since re-sending 14 MB in small pieces is the point.
 */
async function uploadInSmallerPieces(
  data: ArrayBuffer,
  language: AsrLanguage,
  tier: ServerModelTier,
  endpoint: string,
  token: string | undefined,
  onProgress: (progress: TranscribeProgress) => void,
  options: ServerTranscribeOptions,
): Promise<ServerPayload> {
  let lastError: Error | null = null
  for (const size of [512 * 1024, 256 * 1024, MIN_CHUNK_BYTES]) {
    onProgress({
      stage: 'uploading',
      progress: 0,
      detail: `the link dropped big pieces — restarting with ${Math.round(size / 1024)} KB pieces`,
    })
    try {
      return await uploadInChunks(data, language, tier, endpoint, token, onProgress, options, size)
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      if (failure.message === 'cancelled' || failure.message === 'unauthorized' || failure.message === 'chunk-unavailable') throw failure
      lastError = failure
    }
  }
  throw lastError ?? new Error('upload-gave-up: the link cannot carry this file')
}

async function uploadWhole(
  data: ArrayBuffer,
  language: AsrLanguage,
  tier: ServerModelTier,
  endpoint: string,
  token: string | undefined,
  onProgress: (progress: TranscribeProgress) => void,
  options: ServerTranscribeOptions,
): Promise<ServerPayload> {
  return new Promise<ServerPayload>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    // async=1: the POST answers with a job id as soon as the bytes land, so the
    // transcription itself can report progress instead of being a black box.
    xhr.open('POST', `${endpoint}?language=${encodeURIComponent(language)}&model=${tier}&async=1`, true)
    xhr.responseType = 'text'
    xhr.setRequestHeader('Content-Type', options.contentType ?? 'application/octet-stream')
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    let lastByteAt = Date.now()
    let sentBytes = 0
    let stalled = false
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastByteAt < STALL_MS) return
      stalled = true
      window.clearInterval(watchdog)
      xhr.abort()
    }, 5000)
    const stopWatchdog = () => window.clearInterval(watchdog)

    let rateFrom = Date.now()
    let rateBytes = 0
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      lastByteAt = Date.now()
      sentBytes = event.loaded
      const speed = measureSpeed(event.loaded, rateFrom, rateBytes)
      if (speed.restart) {
        rateFrom = speed.restart.from
        rateBytes = speed.restart.bytes
      }
      onProgress({
        stage: 'uploading',
        // Leave a sliver at the end: 100% upload is not 100% done.
        progress: Math.min(0.99, event.loaded / event.total),
        detail: `${formatMb(event.loaded)} / ${formatMb(event.total)}${speed.label}`,
      })
    }

    xhr.upload.onload = () => {
      stopWatchdog()
      onProgress({ stage: 'transcribing', progress: 0, detail: 'uploaded · starting on the server' })
    }

    xhr.onerror = () => { stopWatchdog(); reject(new Error('network-error')) }
    // abort() fires synchronously, so the watchdog records why before calling it.
    xhr.onabort = () => {
      stopWatchdog()
      reject(new Error(stalled ? `upload-stalled: ${formatMb(sentBytes)}` : 'cancelled'))
    }
    xhr.onload = () => { stopWatchdog(); handleLoad() }
    const handleLoad = () => {
      let parsed: unknown = null
      try {
        parsed = JSON.parse(xhr.responseText)
      } catch {
        parsed = null
      }
      const failure = statusToError(xhr.status, parsed)
      if (failure) return reject(failure)
      if ((parsed as { jobId?: string }).jobId) return resolve(parsed as ServerPayload)
      // A server without async support still answers synchronously; treat that
      // as a finished payload rather than failing the job.
      resolve({ ...(parsed as ServerPayload), final: true })
    }

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new Error('cancelled'))
        return
      }
      options.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(data)
  })
}

// ---------------------------------------------------------------------------
// Path B: chunks with resume
// ---------------------------------------------------------------------------

async function uploadInChunks(
  data: ArrayBuffer,
  language: AsrLanguage,
  tier: ServerModelTier,
  endpoint: string,
  token: string | undefined,
  onProgress: (progress: TranscribeProgress) => void,
  options: ServerTranscribeOptions,
  chunkBytes: number,
): Promise<ServerPayload> {
  const total = Math.ceil(data.byteLength / chunkBytes)
  const uploadId = uploadIdFor(data, chunkBytes)
  const storageKey = resumeKey(uploadId)

  let alreadyHave: number[] = []
  try {
    const probe = await fetch(`${endpoint}/upload/${encodeURIComponent(uploadId)}`, {
      headers: authHeaders(token),
      signal: options.signal,
    })
    if (probe.ok) {
      const state = (await probe.json()) as { receivedIndexes?: number[]; total?: number }
      if (state.total === total) alreadyHave = state.receivedIndexes ?? []
    }
  } catch {
    // Unknown upload id, old server, or offline: start from zero. Nothing here
    // is worth failing over — the chunk endpoint will tell us soon enough.
  }

  const done = new Set(alreadyHave)
  const bytesDone = () => [...done].reduce((sum, index) => sum + chunkLength(data.byteLength, index, total, chunkBytes), 0)

  if (done.size > 0) {
    onProgress({
      stage: 'uploading',
      progress: Math.min(0.99, bytesDone() / data.byteLength),
      detail: `resuming — ${done.size} of ${total} parts already on the server`,
    })
  }

  let rateFrom = Date.now()
  let rateBytes = bytesDone()

  for (let index = 0; index < total; index += 1) {
    if (options.signal?.aborted) throw new Error('cancelled')
    if (done.has(index)) continue

    const start = index * chunkBytes
    const slice = data.slice(start, Math.min(data.byteLength, start + chunkBytes))
    let lastError: Error | null = null
    const chunkDeadline = Date.now() + CHUNK_RETRY_WINDOW_MS

    for (let attempt = 1; ; attempt += 1) {
      if (options.signal?.aborted) throw new Error('cancelled')
      try {
        await sendChunk({
          endpoint,
          uploadId,
          index,
          total,
          totalBytes: data.byteLength,
          language,
          tier,
          token,
          body: slice,
          onBytes: (loaded) => {
            const sent = bytesDone() + loaded
            const speed = measureSpeed(sent, rateFrom, rateBytes)
            if (speed.restart) {
              rateFrom = speed.restart.from
              rateBytes = speed.restart.bytes
            }
            onProgress({
              stage: 'uploading',
              progress: Math.min(0.99, sent / data.byteLength),
              detail: `${formatMb(sent)} / ${formatMb(data.byteLength)}${speed.label} · part ${index + 1}/${total}`,
            })
          },
          signal: options.signal,
        })
        done.add(index)
        lastError = null
        break
      } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error))
        if (failure.message === 'cancelled' || failure.message === 'unauthorized') throw failure
        if (failure.message === 'not-deployed') throw new Error('chunk-unavailable')
        lastError = failure
        // Everything short of a dead server is worth waiting out: the pieces
        // already on the server are the whole point of chunking.
        const wait = Math.min(1000 * 2 ** (attempt - 1), CHUNK_BACKOFF_MAX_MS)
        if (Date.now() + wait > chunkDeadline) break
        onProgress({
          stage: 'uploading',
          progress: Math.min(0.99, bytesDone() / data.byteLength),
          detail: `part ${index + 1}/${total} lost the connection — retrying in ${Math.round(wait / 1000)}s`,
        })
        await sleep(wait, options.signal)
      }
    }

    if (lastError) {
      // Keep the pieces: pressing the button again (or reloading) resumes from
      // here instead of starting over. `partsStored` tells the caller whether a
      // full restart at a smaller piece size would actually cost anything.
      const gaveUp = new Error(`upload-gave-up: part ${index + 1}/${total} after ${Math.round(CHUNK_RETRY_WINDOW_MS / 1000)}s — ${lastError.message}`) as Error & { partsStored?: number }
      gaveUp.partsStored = done.size
      throw gaveUp
    }
  }

  onProgress({ stage: 'uploading', progress: 0.99, detail: `${total} parts on the server · starting` })

  const res = await fetch(`${endpoint}/upload/${encodeURIComponent(uploadId)}/complete?language=${encodeURIComponent(language)}&model=${tier}`, {
    method: 'POST',
    headers: authHeaders(token),
    signal: options.signal,
  })
  const parsed = (await res.json().catch(() => null)) as ServerPayload | null
  const failure = statusToError(res.status, parsed)
  if (failure) {
    if (res.status === 409) clearResumeKey(storageKey)
    throw failure
  }
  clearResumeKey(storageKey)
  return parsed ?? { final: true }
}

interface ChunkRequest {
  endpoint: string
  uploadId: string
  index: number
  total: number
  totalBytes: number
  language: AsrLanguage
  tier: ServerModelTier
  token: string | undefined
  body: ArrayBuffer
  onBytes: (loaded: number) => void
  signal?: AbortSignal
}

function sendChunk(request: ChunkRequest): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const query = new URLSearchParams({
      uploadId: request.uploadId,
      index: String(request.index),
      total: String(request.total),
      size: String(request.totalBytes),
      language: request.language,
      model: request.tier,
    })
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${request.endpoint}/chunk?${query.toString()}`, true)
    xhr.responseType = 'text'
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')
    if (request.token) xhr.setRequestHeader('Authorization', `Bearer ${request.token}`)

    let lastByteAt = Date.now()
    let stalled = false
    const watchdog = window.setInterval(() => {
      if (Date.now() - lastByteAt < CHUNK_STALL_MS) return
      stalled = true
      window.clearInterval(watchdog)
      xhr.abort()
    }, 3000)
    const stop = () => window.clearInterval(watchdog)

    if (xhr.upload) {
      xhr.upload.onprogress = (event) => {
        lastByteAt = Date.now()
        request.onBytes(event.loaded)
      }
    }

    xhr.onerror = () => { stop(); reject(new Error('network-error')) }
    xhr.onabort = () => { stop(); reject(new Error(stalled ? 'upload-stalled' : 'cancelled')) }
    xhr.ontimeout = () => { stop(); reject(new Error('network-error')) }
    xhr.onload = () => {
      stop()
      let parsed: unknown = null
      try {
        parsed = JSON.parse(xhr.responseText)
      } catch {
        parsed = null
      }
      const failure = statusToError(xhr.status, parsed)
      if (failure) return reject(failure)
      resolve()
    }

    if (request.signal) {
      if (request.signal.aborted) {
        reject(new Error('cancelled'))
        return
      }
      request.signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }

    xhr.send(request.body)
  })
}

function chunkLength(totalBytes: number, index: number, total: number, chunkBytes: number): number {
  if (index === total - 1) return totalBytes - index * chunkBytes
  return chunkBytes
}

/**
 * Identity for resume, built from the bytes rather than a filename: the caller
 * only hands us an ArrayBuffer, and two files with the same name are common.
 * Length plus the first and last 64 KB is enough to tell files apart and costs
 * nothing noticeable on a 14 MB buffer.
 */
function uploadIdFor(data: ArrayBuffer, chunkBytes: number): string {
  const key = resumeKey(`${fingerprint(data)}:${chunkBytes}`)
  try {
    const known = sessionStorage.getItem(key)
    if (known) return known
    const created = randomId()
    sessionStorage.setItem(key, created)
    return created
  } catch {
    // Private mode or a blocked sessionStore: chunking still works, it just
    // cannot survive a reload.
    return randomId()
  }
}

function fingerprint(data: ArrayBuffer): string {
  const view = new Uint8Array(data)
  let hash = 0x811c9dc5
  const sample = 64 * 1024
  const mix = (byte: number) => {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  for (let i = 0; i < Math.min(sample, view.length); i += 1) mix(view[i])
  for (let i = Math.max(0, view.length - sample); i < view.length; i += 1) mix(view[i])
  return `${view.length.toString(36)}-${(hash >>> 0).toString(36)}`
}

function randomId(): string {
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function resumeKey(id: string): string {
  return `skopein.upload.${id}`
}

function clearResumeKey(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // Nothing to clean up.
  }
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Speed is the number a user on a slow uplink actually needs: it tells them
 * "this will take 18 minutes" before they waste 18 minutes. Sampled every two
 * seconds so the figure is steady enough to read.
 */
function measureSpeed(
  loaded: number,
  from: number,
  fromBytes: number,
): { label: string; restart?: { from: number; bytes: number } } {
  const since = Date.now() - from
  if (since < 2000) return { label: '' }
  const perSecond = ((loaded - fromBytes) * 1000) / since / 1024
  const restart = { from: Date.now(), bytes: loaded }
  if (!(perSecond > 0)) return { label: '', restart }
  const label = perSecond >= 1024
    ? ` · ${(perSecond / 1024).toFixed(1)} MB/s`
    : ` · ${Math.round(perSecond)} KB/s`
  return { label, restart }
}

function statusToError(status: number, parsed: unknown): Error | null {
  if (status === 401) return new Error('unauthorized')
  if (status === 404) return new Error('not-deployed')
  if (status === 429) {
    const code = (parsed as { code?: string } | null)?.code
    return new Error(code === 'rate-limited' ? 'rate-limited' : 'server-busy')
  }
  // 507: the sidecar refused to load the model — not enough RAM on the box.
  if (status === 507) {
    const detail = (parsed as { error?: string } | null)?.error
    return new Error(detail ? `out-of-memory: ${detail}` : 'out-of-memory')
  }
  if (status < 200 || status >= 300) {
    const detail = (parsed as { error?: string } | null)?.error
    return new Error(detail ? `server-error: ${detail}` : `server-error: HTTP ${status}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// Job polling and payload shaping
// ---------------------------------------------------------------------------

async function pollJob(
  endpoint: string,
  jobId: string,
  token: string | undefined,
  onProgress: (progress: TranscribeProgress) => void,
  signal: AbortSignal | undefined,
): Promise<ServerPayload> {
  // Two seconds is the honest granularity: the sidecar emits a segment every
  // few seconds, so a tighter poll just costs requests.
  const INTERVAL_MS = 2000
  const MAX_WAIT_MS = 30 * 60 * 1000
  const startedAt = Date.now()
  // A deploy, a dropped connection or one 502 during a poll must not freeze the
  // page on the last frame it happened to see. The job lives on the sidecar and
  // outlives the web process, so keep asking.
  const MAX_CONSECUTIVE_FAILURES = 15
  let failures = 0

  for (;;) {
    if (signal?.aborted) throw new Error('cancelled')
    await sleep(INTERVAL_MS, signal)
    if (Date.now() - startedAt > MAX_WAIT_MS) throw new Error('server-timeout')

    let res: Response
    try {
      res = await fetch(`${endpoint}/jobs/${encodeURIComponent(jobId)}`, {
        headers: authHeaders(token),
        signal,
      })
    } catch (error) {
      if (signal?.aborted) throw new Error('cancelled')
      if (++failures > MAX_CONSECUTIVE_FAILURES) throw error
      onProgress({
        stage: 'transcribing',
        progress: Math.min(0.98, 0.9),
        detail: 'lost the server for a moment — still waiting for the transcript',
      })
      continue
    }
    if (res.status === 401) throw new Error('unauthorized')
    if (!res.ok) {
      // 5xx/404 in the middle of a poll is usually the web layer restarting;
      // the sidecar keeps the job. Anything else is a real answer.
      if (res.status >= 500 || res.status === 404) {
        if (++failures > MAX_CONSECUTIVE_FAILURES) throw new Error(`server-error: job status HTTP ${res.status}`)
        continue
      }
      throw new Error(`server-error: job status HTTP ${res.status}`)
    }
    failures = 0
    const job = (await res.json()) as ServerPayload & { status?: string; progress?: number; detail?: string; error?: string }

    if (job.status === 'error') throw new Error(job.error ? `server-error: ${job.error}` : 'server-error')
    if (job.status === 'done') {
      onProgress({ stage: 'transcribing', progress: 1, detail: 'transcribed' })
      return job
    }
    onProgress({
      stage: 'transcribing',
      progress: typeof job.progress === 'number' ? Math.min(0.98, job.progress) : 0,
      detail: job.detail ?? 'server is transcribing',
    })
  }
}

interface ServerPayload {
  final?: boolean
  status?: string
  progress?: number
  detail?: string
  jobId?: string
  text?: string
  vtt?: string
  model?: string
  language?: string
  duration?: number
  totalMs?: number
}

function formatMb(bytes: number): string {
  const mb = bytes / 1024 / 1024
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Sidecar vtt is preferred; this is the fallback for a server that returns only
 * text. One giant cue is honest about what we know: the words, no timings.
 */
function textToVtt(text: string, duration?: number): string {
  if (!text.trim()) return 'WEBVTT\n\n'
  const end = Number.isFinite(duration) && duration && duration > 0 ? duration : 0
  const stamp = (seconds: number) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`
  }
  return `WEBVTT\n\n00:00:00.000 --> ${stamp(end)}\n${text.trim()}\n`
}
