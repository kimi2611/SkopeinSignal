/**
 * On-device speech-to-text via Whisper (transformers.js + ONNX WASM).
 *
 * Free by construction: no API key, no quota, and the chosen audio file never
 * leaves the browser. Both model tiers (~40 MB tiny / ~80 MB base, quantized)
 * ship with the site itself under /models (same-origin, so no third party ever
 * sees the request); the public hub and a mirror remain as fallbacks for
 * self-hosted copies that did not bundle the files.
 *
 * Mobile (iPad/WebKit) realities this file is built around:
 * - Capability gate first: Whisper needs WebAssembly SIMD (iOS/iPadOS 16.4+),
 *   BigInt64 and WebAudio. Missing any of them is reported up front instead of
 *   hanging after a 100% download.
 * - Download and INITIALIZATION are separate stages: after the last model file
 *   arrives, the ONNX session still has to compile — on an iPad that can take
 *   a minute or two. A failure there is terminal (retrying another host just
 *   re-downloads and fails again), so it never falls through to the mirrors.
 * - Decoding avoids OfflineAudioContext (memory-heavy and flaky on WebKit):
 *   channels are extracted and linear-resampled to 16 kHz in plain JS, and the
 *   decoded source buffer is released before inference starts.
 * - Length is NOT capped at a few minutes anymore — a cap would exclude every
 *   real podcast episode. Instead the decoder adapts: short files are decoded
 *   in one piece (AudioContext), while long MP3/WAV files stream through
 *   WebCodecs / a PCM reader and are resampled on the fly, so peak memory holds
 *   only the winning 16 kHz mono channel instead of full-rate multi-channel PCM.
 *   The channel audition listens to a 45-second prefix, not the whole file.
 *   Beyond MAX_ASR_SECONDS (3 h) the honest answer is still "split the file":
 *   even the mono working buffer would outgrow a browser tab.
 * - Transcription runs in 30-second windows so progress is real (window i/n),
 *   a bad window kills only its pass, and peak inference memory stays flat.
 *   Auto language mode probes ten-second slices and subdivides only mixed or
 *   uncertain windows; clear homogeneous windows still decode in one pass.
 *
 * Recognition quality levers, all local:
 * - multi-channel probing: stereo files are auditioned as downmix, left-only,
 *   and right-only; the cleanest candidate (level, clipping, silence, DC) wins;
 * - signal conditioning: DC removal, a 40 Hz high-pass against rumble, and RMS
 *   normalization toward speech-friendly levels. The corner sits at 40 Hz rather
 *   than the usual 80 Hz speech band-pass so a classical guitar's low E string
 *   (82 Hz) keeps its fundamental; DC removal already handles offset, so the
 *   lower corner only gives up sub-30 Hz turntable rumble rejection.
 * - bounded retry: if the winning channel recognizes nothing, the runner-up
 *   channel gets one more pass before giving up.
 *
 * Output is a draft VTT the listener reviews before creating a listening desk.
 */

/**
 * 'auto' lets Whisper itself name the language (see probeWhisperLanguage) —
 * without it a German episode set to English comes out as phonetic English
 * gibberish, because transformers.js silently defaults to English whenever no
 * language is forced.
 */
export type AsrLanguage = 'en' | 'de' | 'auto'
/** A language the model can actually be run with — 'auto' always resolves to one of these. */
export type AsrConcreteLanguage = 'en' | 'de'
export type AsrModelTier = 'tiny' | 'base'
export type ChannelLabel = 'mono' | 'downmix' | 'left' | 'right'

import { ensureModelFiles } from './modelStore'

export type AsrStage =
  | 'queued'
  | 'checking'
  | 'downloading'
  | 'initializing'
  | 'decoding'
  | 'uploading'
  | 'transcribing'
  | 'done'

export interface TranscribeProgress {
  stage: AsrStage
  /** 0..1 within the current stage (stages without a natural fraction stay 0). */
  progress: number
  /** Optional detail, e.g. which channel pass / window is running. */
  detail?: string
}

export interface TranscribeOptions {
  /** Model tier: tiny and base both ship with the site under /models. */
  model?: AsrModelTier
  /**
   * An AudioContext created and resumed synchronously inside the click
   * gesture (see unlockAudioContextForGesture). iPadOS Safari suspends any
   * context created later — model downloading sits between the click and the
   * decode — and resume() without an active gesture can never settle, which
   * is exactly the "stuck at decoding" hang this option exists to prevent.
   * Ownership transfers: the decode path closes it when done.
   */
  audioContext?: AudioContext
  /**
   * WASM worker threads for the ORT sessions. Defaults to single-thread unless
   * the page is cross-origin isolated: the threaded build needs
   * SharedArrayBuffer, which only exists under COOP+COEP. Callers that know
   * their own headers (the Whisper Lab bench) may force it.
   */
  threads?: number
}

/**
 * Create an AudioContext and kick its resume() while the user gesture is
 * still active. MUST be called synchronously from the click handler, before
 * the first await. Returns undefined where WebAudio is missing.
 */
export function unlockAudioContextForGesture(): AudioContext | undefined {
  const w = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }) : undefined
  const Ctor = w?.AudioContext ?? w?.webkitAudioContext
  if (!Ctor) return undefined
  try {
    const ctx = new Ctor()
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    return ctx
  } catch {
    return undefined
  }
}

export interface TranscribeResult {
  vtt: string
  text: string
  /** Which channel candidate actually produced the transcript. */
  channel: ChannelLabel
  /** 'tiny'/'base' on device; the server reports its own model id as a string. */
  model: string
  /** The language the transcript was produced in — dominant language when 'auto' was requested. */
  language: AsrConcreteLanguage
  /** Every language actually decoded, in first-use order; mixed audio reports both. */
  languages: AsrConcreteLanguage[]
}

const MODEL_IDS: Record<AsrModelTier, string> = {
  tiny: 'onnx-community/whisper-tiny',
  base: 'onnx-community/whisper-base',
}
/** decodeAudioData never resolving is a known WebKit failure mode — cap it. */
const DECODE_STALL_MS = 30_000
const TARGET_SAMPLE_RATE = 16_000
/** Whisper's native window: the encoder ingests exactly 30 s of 16 kHz audio. */
const WINDOW_SECONDS = 30
/** Auto mode subdivides only mixed/uncertain windows, so a mid-window language switch is not flattened. */
const LANGUAGE_SEGMENT_SECONDS = 10
/** A 30-second passage normally needs far fewer tokens; the cap stops runaway loops on noise. */
const MAX_WINDOW_TOKENS = 128
/**
 * Absolute duration cap: at 16 kHz mono the working buffer alone is 230 MB per
 * hour, and single-thread WASM transcription runs slower than real time on a
 * tablet. Beyond three hours the honest answer is "split the file".
 */
export const MAX_ASR_SECONDS = 3 * 3600
/**
 * Budget for the one-shot decodeAudioData path. The transient AudioBuffer holds
 * full-rate PCM for EVERY channel (stereo 44.1 kHz ≈ 21 MB per minute), so a
 * 640 MB ceiling keeps a browser tab — iPad above all — clear of the memory
 * cliff. Longer MP3/WAV files go through the incremental streaming decoder,
 * which never materializes the full-rate buffer at all.
 */
export const WHOLE_FILE_DECODE_MAX_BYTES = 640 * 1024 * 1024
/** Channel audition listens to this much audio — enough for level/clip/silence stats. */
export const AUDITION_SECONDS = 45
/** Speech-friendly target loudness for the encoder input. */
const TARGET_RMS = 10 ** (-23 / 20)
/** Rumble corner — deliberately below a classical guitar's low E (82 Hz). */
const HIGHPASS_HZ = 40


export type AsrChunk = { text: string; timestamp: [number, number | null] }
export type AsrPipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: AsrChunk[] }>

function formatVttTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = Math.floor(safe % 60)
  const ms = Math.round((safe % 1) * 1000)
  const pad = (value: number, size = 2) => String(value).padStart(size, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

/**
 * Whisper is a speech model: on purely instrumental audio it tends to invent a
 * looping lyric ("yeah, yeah, yeah…"). That output is fabrication, not a draft
 * — detect dominant-word repetition and low vocabulary variety so the caller
 * can fall through to an honest "no clear speech" result instead of shipping
 * invented text. Pure function, unit-tested.
 */
export function looksLikeHallucination(text: string): boolean {
  const words = text.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length < 12) return false
  const uniqueRatio = new Set(words).size / words.length
  if (uniqueRatio < 0.22) return true
  const freq = new Map<string, number>()
  let top = 0
  for (const word of words) {
    const n = (freq.get(word) ?? 0) + 1
    freq.set(word, n)
    if (n > top) top = n
  }
  return top / words.length > 0.45
}

/** Build a draft VTT from Whisper chunks; the last chunk's open end gets a short default span. */
export function chunksToVtt(chunks: AsrChunk[]): string {
  const cues = chunks
    .map((chunk, index) => {
      const text = chunk.text.trim()
      if (!text) return null
      const start = chunk.timestamp?.[0] ?? 0
      const end = chunk.timestamp?.[1] ?? chunks[index + 1]?.timestamp?.[0] ?? start + 2.5
      return `${formatVttTime(start)} --> ${formatVttTime(Math.max(end, start + 0.4))}\n${text}`
    })
    .filter(Boolean)
  return `WEBVTT\n\n${cues.join('\n\n')}\n`
}

// ---------------------------------------------------------------------------
// Environment gate
// ---------------------------------------------------------------------------

export interface AsrSupport {
  ok: boolean
  /** Machine names of missing capabilities, e.g. 'wasm-simd'. */
  missing: string[]
}

/**
 * Minimal WASM module using a v128 (SIMD) instruction — i32x4.splat. `WebAssembly.validate`
 * compiles without instantiating, so this is cheap.
 */
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 8, 1, 6,
  0, 65, 0, 253, 17, 11,
])

/**
 * Whisper-in-browser needs WebAssembly with SIMD (the only ONNX build we ship),
 * 64-bit big integers, and WebAudio decoding. iOS/iPadOS gained WASM SIMD in
 * 16.4; older WebKit simply cannot run the model, and discovering that AFTER a
 * 100% download is exactly the silent hang this gate exists to prevent.
 */
export function checkAsrSupport(): AsrSupport {
  const missing: string[] = []
  if (typeof WebAssembly === 'undefined') {
    missing.push('webassembly')
  } else {
    try {
      if (!WebAssembly.validate(SIMD_PROBE)) missing.push('wasm-simd')
    } catch {
      missing.push('wasm-simd')
    }
  }
  if (typeof BigInt64Array === 'undefined') missing.push('bigint64')
  const w = typeof window !== 'undefined' ? window : undefined
  const AudioCtor = w?.AudioContext ?? (w as unknown as { webkitAudioContext?: typeof AudioContext })?.webkitAudioContext
  if (!AudioCtor) missing.push('webaudio')
  return { ok: missing.length === 0, missing }
}

// ---------------------------------------------------------------------------
// Audio conditioning (pure, unit-tested)
// ---------------------------------------------------------------------------

export interface ChannelCandidate {
  label: ChannelLabel
  samples: Float32Array
  score: number
}

/**
 * Score a candidate channel for recognition quality: louder sustained speech
 * wins; clipping, long silence, and DC offset lose. Pure function so the
 * ranking is unit-testable.
 */
export function scoreCandidate(samples: Float32Array): number {
  if (!samples.length) return -Infinity
  let sumSquares = 0
  let sum = 0
  let clipped = 0
  let silent = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]
    sumSquares += v * v
    sum += v
    const a = Math.abs(v)
    if (a > 0.98) clipped++
    if (a < 0.0005) silent++
  }
  const rmsDb = 20 * Math.log10(Math.sqrt(sumSquares / samples.length) + 1e-9)
  const clipFrac = clipped / samples.length
  const silFrac = silent / samples.length
  const dc = Math.abs(sum / samples.length)
  return rmsDb - 4000 * clipFrac - 8 * silFrac - 120 * dc
}

/**
 * Condition the winning channel for the encoder: remove DC, apply a one-pole
 * high-pass against rumble, then RMS-normalize with a hard peak ceiling.
 */
export function conditionSignal(input: Float32Array, sampleRate = TARGET_SAMPLE_RATE): Float32Array {
  const out = new Float32Array(input.length)
  if (!input.length) return out
  let mean = 0
  for (let i = 0; i < input.length; i++) mean += input[i]
  mean /= input.length
  const alpha = Math.exp((-2 * Math.PI * HIGHPASS_HZ) / sampleRate)
  let prevIn = 0
  let prevOut = 0
  for (let i = 0; i < input.length; i++) {
    const centered = input[i] - mean
    const y = centered - prevIn + alpha * prevOut
    prevIn = centered
    prevOut = y
    out[i] = y
  }
  let sumSquares = 0
  let peak = 0
  for (let i = 0; i < out.length; i++) {
    sumSquares += out[i] * out[i]
    const a = Math.abs(out[i])
    if (a > peak) peak = a
  }
  const rms = Math.sqrt(sumSquares / out.length)
  if (rms < 1e-6) return out // silence: leave it alone rather than amplifying noise
  let gain = TARGET_RMS / rms
  if (peak * gain > 0.95) gain = 0.95 / peak
  for (let i = 0; i < out.length; i++) out[i] *= gain
  return out
}

/** Average every channel into one mono signal at the source rate. Pure. */
export function mixdownChannels(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice()
  const length = channels[0]?.length ?? 0
  const out = new Float32Array(length)
  for (const channel of channels) {
    for (let i = 0; i < length; i++) out[i] += channel[i]
  }
  const scale = 1 / channels.length
  for (let i = 0; i < length; i++) out[i] *= scale
  return out
}

/**
 * Linear-interpolation resampler. OfflineAudioContext would do this in higher
 * quality, but on WebKit it renders the whole buffer in one shot (a memory
 * spike per candidate) and has a history of never resolving — plain arithmetic
 * is deterministic, streamable, and more than accurate enough for speech.
 */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return input.slice()
  if (!input.length || fromRate <= 0 || toRate <= 0) return new Float32Array(0)
  const ratio = fromRate / toRate
  const outLength = Math.max(1, Math.round(input.length / ratio))
  const out = new Float32Array(outLength)
  const last = input.length - 1
  for (let i = 0; i < outLength; i++) {
    const position = i * ratio
    const index = Math.min(Math.floor(position), last)
    const next = Math.min(index + 1, last)
    const frac = position - index
    out[i] = input[index] * (1 - frac) + input[next] * frac
  }
  return out
}

// ---------------------------------------------------------------------------
// Decoding (WebKit-safe): probe first, whole-file for short audio, incremental
// streaming for long MP3/WAV — peak memory never holds full-rate multi-channel
// PCM for a long file, so a real podcast episode fits in a browser tab.
// ---------------------------------------------------------------------------

interface DecodedAudio {
  sampleRate: number
  duration: number
  channels: Float32Array[]
}

/**
 * Probe duration without decoding: an <audio> element reads only the container
 * metadata. Best-effort — a null result just means the strategy is decided
 * after the whole-file decode instead of before it.
 */
async function probeDurationSeconds(data: ArrayBuffer): Promise<number | null> {
  try {
    const url = URL.createObjectURL(new Blob([data]))
    try {
      const el = document.createElement('audio')
      el.preload = 'metadata'
      const probed = await Promise.race([
        new Promise<number | null>((resolve) => {
          el.onloadedmetadata = () => resolve(Number.isFinite(el.duration) ? el.duration : null)
          el.onerror = () => resolve(null)
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
      ])
      return probed
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

/** Conservative PCM estimate for the transient full-rate decode (48 kHz stereo f32). */
export function estimateDecodedBytes(durationSeconds: number): number {
  return durationSeconds * 48_000 * 2 * 4
}

/** Rank channels by listening to a short prefix of each — full-length scoring would defeat the memory budget on long files. */
export function auditionChannels(channels: Float32Array[], auditionSamples: number): { label: ChannelLabel; score: number }[] {
  if (channels.length < 2) return [{ label: 'mono', score: scoreCandidate(channels[0]?.subarray(0, auditionSamples) ?? new Float32Array(0)) }]
  const cut = (c: Float32Array) => c.subarray(0, Math.min(auditionSamples, c.length))
  const left = cut(channels[0])
  const right = cut(channels[1])
  const mix = new Float32Array(left.length)
  for (let i = 0; i < mix.length; i++) mix[i] = (left[i] + right[i]) / 2
  const ranked: { label: ChannelLabel; score: number }[] = [
    { label: 'downmix', score: scoreCandidate(mix) },
    { label: 'left', score: scoreCandidate(left) },
    { label: 'right', score: scoreCandidate(right) },
  ]
  return ranked.sort((a, b) => b.score - a.score)
}

/**
 * Streaming linear-interpolation resampler: push source-rate chunks, receive
 * 16 kHz chunks. Output is sample-for-sample identical to running
 * resampleLinear over the concatenated input — that equivalence is unit-tested.
 */
export class StreamingResampler {
  private readonly ratio: number
  private readonly fromRate: number
  private readonly toRate: number
  private prev: number | null = null
  private base = 0
  private nextOut = 0
  constructor(fromRate: number, toRate: number) {
    this.fromRate = fromRate
    this.toRate = toRate
    this.ratio = fromRate / toRate
  }
  push(chunk: Float32Array): Float32Array {
    if (this.fromRate === this.toRate) return chunk.slice()
    if (!chunk.length) return new Float32Array(0)
    const out: number[] = []
    const local = (absolute: number): number => (absolute === this.base - 1 ? (this.prev as number) : chunk[absolute - this.base])
    // Emit every output whose two source neighbours are both available now.
    while (true) {
      const p = this.nextOut * this.ratio
      const i = Math.floor(p)
      if (i > this.base + chunk.length - 2) break
      if (i < this.base - 1) { this.nextOut++; continue } // already-consumed position (defensive)
      const frac = p - i
      out.push(local(i) * (1 - frac) + local(i + 1) * frac)
      this.nextOut++
    }
    this.prev = chunk[chunk.length - 1]
    this.base += chunk.length
    return Float32Array.from(out)
  }
  /** Final outputs whose interpolation clamped against the very last sample. */
  flush(totalInputLength: number): Float32Array {
    if (this.fromRate === this.toRate) return new Float32Array(0)
    const outLength = Math.max(1, Math.round(totalInputLength / this.ratio))
    const out: number[] = []
    const last = this.prev ?? 0
    while (this.nextOut < outLength && this.prev != null) {
      const p = this.nextOut * this.ratio
      const i = Math.min(Math.floor(p), totalInputLength - 1)
      // Only the tail beyond the last full neighbourhood remains; the final
      // sample repeats as the upper neighbour, matching resampleLinear.
      const frac = p - i
      out.push(i >= totalInputLength - 1 ? last : last * (1 - frac) + last * frac)
      this.nextOut++
    }
    return Float32Array.from(out)
  }
}

/** Sniff the actual container from magic bytes — the file-name hint is not trusted. */
export function sniffAudioKind(data: ArrayBuffer): 'wav' | 'mp3' | 'other' {
  const head = new Uint8Array(data.slice(0, 16))
  if (head.length >= 12 && head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && head[8] === 0x57 && head[9] === 0x41 && head[10] === 0x56 && head[11] === 0x45) return 'wav'
  if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return 'mp3' // ID3v2 tag
  if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return 'mp3' // raw frame sync
  return 'other'
}

// --- WAV: pure-JS PCM reader (no decoder needed, random access by design) ---

export interface WavInfo { sampleRate: number; channels: number; dataOffset: number; dataLength: number; float: boolean; bytesPerSample: number }

export function parseWavInfo(data: ArrayBuffer): WavInfo {
  const view = new DataView(data)
  if (data.byteLength < 44) throw new Error('audio-decode-failed')
  let offset = 12 // skip RIFF header
  let sampleRate = 0
  let channels = 0
  let bits = 0
  let formatTag = 0
  let dataOffset = 0
  let dataLength = 0
  while (offset + 8 <= view.byteLength) {
    const id = String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
    const size = view.getUint32(offset + 4, true)
    if (id === 'fmt ') {
      formatTag = view.getUint16(offset + 8, true)
      channels = view.getUint16(offset + 10, true)
      sampleRate = view.getUint32(offset + 12, true)
      bits = view.getUint16(offset + 22, true)
    } else if (id === 'data') {
      dataOffset = offset + 8
      dataLength = Math.min(size, view.byteLength - dataOffset)
    }
    offset += 8 + size + (size % 2)
  }
  const isPcm16 = formatTag === 1 && bits === 16
  const isFloat32 = formatTag === 3 && bits === 32
  if (!sampleRate || !channels || !dataLength || (!isPcm16 && !isFloat32)) throw new Error('audio-decode-failed')
  return { sampleRate, channels, dataOffset, dataLength, float: isFloat32, bytesPerSample: bits / 8 }
}

/**
 * Read a frame range of one WAV channel ('mix' = average of all channels) into
 * f32 blocks, feeding a resampler — never holds the whole interleaved file as
 * floats. Returns the number of source frames processed.
 */
function wavChannelTo16k(
  data: ArrayBuffer,
  info: WavInfo,
  channel: number | 'mix',
  resampler: StreamingResampler,
  onBlock: (block: Float32Array) => void,
  startFrame = 0,
  endFrame?: number,
): number {
  const view = new DataView(data, info.dataOffset, info.dataLength)
  const frameBytes = info.channels * info.bytesPerSample
  const totalFrames = Math.floor(info.dataLength / frameBytes)
  const last = Math.min(endFrame ?? totalFrames, totalFrames)
  const BLOCK = 1 << 18 // ~5.9s at 44.1 kHz
  const readSample = (frame: number, c: number) => {
    const pos = frame * frameBytes + c * info.bytesPerSample
    return info.float ? view.getFloat32(pos, true) : view.getInt16(pos, true) / 32768
  }
  let done = startFrame
  while (done < last) {
    const frames = Math.min(BLOCK, last - done)
    const block = new Float32Array(frames)
    for (let f = 0; f < frames; f++) {
      const frame = done + f
      if (channel === 'mix') {
        let v = 0
        for (let c = 0; c < info.channels; c++) v += readSample(frame, c)
        block[f] = v / info.channels
      } else {
        block[f] = readSample(frame, Math.min(channel, info.channels - 1))
      }
    }
    const emitted = resampler.push(block)
    if (emitted.length) onBlock(emitted)
    done += frames
  }
  const processed = Math.max(0, last - startFrame)
  const tail = resampler.flush(processed)
  if (tail.length) onBlock(tail)
  return processed
}

/**
 * Stream a long WAV: random access makes the audition trivial — read a source-
 * rate prefix per channel, rank, then resample only the winning channel.
 * Exported (pure JS, no browser APIs) so the streaming path is unit-tested.
 */
export function streamWavTo16k(data: ArrayBuffer, info: WavInfo): StreamedWinner {
  const frameBytes = info.channels * info.bytesPerSample
  const totalFrames = Math.floor(info.dataLength / frameBytes)
  const durationSeconds = totalFrames / info.sampleRate
  if (durationSeconds > MAX_ASR_SECONDS) throw new Error('audio-too-long')

  const auditionFrames = Math.min(totalFrames, Math.round(AUDITION_SECONDS * info.sampleRate))
  const prefixes: Float32Array[] = []
  for (let c = 0; c < Math.min(info.channels, 2); c++) {
    const collector = cappedOutputCollector()
    // Identity resampler: the audition listens at the SOURCE rate.
    wavChannelTo16k(data, info, c, new StreamingResampler(info.sampleRate, info.sampleRate), (b) => collector.push(b), 0, auditionFrames)
    prefixes.push(collector.collect())
  }
  const winner = auditionChannels(prefixes, auditionFrames)[0].label
  const channel: number | 'mix' = winner === 'right' ? 1 : winner === 'downmix' ? 'mix' : 0

  const out = cappedOutputCollector()
  wavChannelTo16k(data, info, channel, new StreamingResampler(info.sampleRate, TARGET_SAMPLE_RATE), (b) => out.push(b))
  return { samples: out.collect(), channel: winner, durationSeconds }
}

// --- MP3: WebCodecs incremental decode (no full-rate buffer ever exists) ---

interface AudioDataLike {
  numberOfFrames: number
  numberOfChannels: number
  sampleRate: number
  copyTo(dest: Float32Array, options: { planeIndex: number; format?: string }): void
  close(): void
}
interface AudioDecoderLike {
  configure(config: { codec: string }): void
  decode(chunk: unknown): void
  flush(): Promise<void>
  close(): void
  readonly state: string
  readonly decodeQueueSize?: number
}
type AudioDecoderCtor = {
  new (init: { output: (frame: AudioDataLike) => void; error: (error: unknown) => void }): AudioDecoderLike
  isConfigSupported(config: { codec: string }): Promise<{ supported?: boolean }>
}

function audioDecoderCtor(): AudioDecoderCtor | undefined {
  return (globalThis as { AudioDecoder?: AudioDecoderCtor }).AudioDecoder
}

async function mp3StreamingSupported(): Promise<boolean> {
  const Ctor = audioDecoderCtor()
  if (!Ctor) return false
  try {
    const support = await Ctor.isConfigSupported({ codec: 'mp3' })
    return support.supported === true
  } catch {
    return false
  }
}

/** Strip an ID3v2 tag so the decoder sees frame-synced bytes from the start. */
export function skipId3v2(data: Uint8Array): Uint8Array {
  if (data.length >= 10 && data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
    const size = ((data[6] & 0x7f) << 21) | ((data[7] & 0x7f) << 14) | ((data[8] & 0x7f) << 7) | (data[9] & 0x7f)
    const footer = data[5] & 0x10 ? 10 : 0
    return data.subarray(Math.min(data.length, 10 + size + footer))
  }
  return data
}

export interface StreamedWinner {
  samples: Float32Array
  channel: ChannelLabel
  durationSeconds: number
}

/** Concatenate resampled blocks into the single 16 kHz working buffer. */
function concatBlocks(blocks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total)
  let offset = 0
  for (const block of blocks) {
    out.set(block, offset)
    offset += block.length
  }
  return out
}

/** Bounded collector for streamed 16 kHz output — crossing the cap fails honestly. */
function cappedOutputCollector(onBlock?: (block: Float32Array) => void) {
  const blocks: Float32Array[] = []
  let length = 0
  const maxSamples = MAX_ASR_SECONDS * TARGET_SAMPLE_RATE
  return {
    push(block: Float32Array) {
      if (!block.length) return
      if (length + block.length > maxSamples) throw new Error('audio-too-long')
      blocks.push(block)
      length += block.length
      onBlock?.(block)
    },
    collect(): Float32Array {
      const out = concatBlocks(blocks, length)
      blocks.length = 0
      return out
    },
    get length() {
      return length
    },
  }
}

/**
 * Decode a long MP3 through WebCodecs in encoded chunks. Only the audition
 * prefix ever exists at full rate; afterwards the winning channel is resampled
 * frame by frame, so a two-hour episode peaks at its 16 kHz mono working copy.
 */
async function streamDecodeMp3To16k(data: ArrayBuffer, onBytes: (fraction: number) => void): Promise<StreamedWinner> {
  const Ctor = audioDecoderCtor()
  if (!Ctor) throw new Error('audio-too-large')
  const source = skipId3v2(new Uint8Array(data))
  const CHUNK_BYTES = 2 * 1024 * 1024

  const out = cappedOutputCollector()
  let winner: ChannelLabel | null = null
  let resampler: StreamingResampler | null = null
  const prefixBlocks: Float32Array[][] = [] // per channel, source-rate audition prefix
  let prefixFrames = 0
  let auditionTarget = 0
  let sourceRate = 0
  let sourceFrames = 0
  let decodeError: unknown = null

  const pickWinnerPlane = (planes: Float32Array[]): Float32Array => {
    if (planes.length === 1 || winner === 'left' || winner === 'mono') return planes[0]
    if (winner === 'right') return planes[1] ?? planes[0]
    const mix = new Float32Array(planes[0].length)
    for (const plane of planes) for (let i = 0; i < mix.length; i++) mix[i] += plane[i]
    const scale = 1 / planes.length
    for (let i = 0; i < mix.length; i++) mix[i] *= scale
    return mix
  }

  const handleFrame = (frame: AudioDataLike) => {
    if (decodeError) {
      try { frame.close() } catch { /* ignore */ }
      return
    }
    try {
      const frames = frame.numberOfFrames
      const channels = Math.max(1, frame.numberOfChannels)
      if (frames > 0) {
        if (!sourceRate) {
          sourceRate = frame.sampleRate
          auditionTarget = Math.round(AUDITION_SECONDS * sourceRate)
          for (let c = 0; c < channels; c++) prefixBlocks.push([])
        } else if (!winner && prefixBlocks.length !== channels) {
          throw new Error('audio-decode-failed') // channel count changed mid-stream
        }
        const planes: Float32Array[] = []
        for (let c = 0; c < channels; c++) {
          const plane = new Float32Array(frames)
          frame.copyTo(plane, { planeIndex: c, format: 'f32-planar' })
          planes.push(plane)
        }
        sourceFrames += frames
        if (!winner) {
          for (let c = 0; c < channels; c++) prefixBlocks[c].push(planes[c])
          prefixFrames += frames
          if (prefixFrames >= auditionTarget) {
            const prefixes = prefixBlocks.map((blocks) => concatBlocks(blocks, prefixFrames))
            winner = auditionChannels(prefixes, auditionTarget)[0].label
            resampler = new StreamingResampler(sourceRate, TARGET_SAMPLE_RATE)
            out.push(resampler.push(pickWinnerPlane(prefixes)))
            prefixBlocks.length = 0 // release the full-rate prefix
          }
        } else {
          out.push((resampler as StreamingResampler).push(pickWinnerPlane(planes)))
        }
      }
      frame.close()
    } catch (error) {
      decodeError = decodeError ?? error
      try { frame.close() } catch { /* already closed */ }
    }
  }

  const decoder = new Ctor({
    output: handleFrame,
    error: (error) => { decodeError = decodeError ?? error },
  })
  try {
    decoder.configure({ codec: 'mp3' })
    let offset = 0
    while (offset < source.length && !decodeError) {
      const end = Math.min(source.length, offset + CHUNK_BYTES)
      decoder.decode({ type: 'key', timestamp: offset, data: source.subarray(offset, end) } as unknown)
      offset = end
      onBytes(end / source.length)
      // Backpressure + let output callbacks run between slices.
      while ((decoder.decodeQueueSize ?? 0) > 8 && !decodeError) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (!decodeError) {
      await Promise.race([
        decoder.flush(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('audio-decode-failed')), DECODE_STALL_MS)),
      ])
    }
  } catch (error) {
    decodeError = decodeError ?? error
  } finally {
    try { if (decoder.state !== 'closed') decoder.close() } catch { /* ignore */ }
  }
  if (decodeError) {
    if (decodeError instanceof Error && decodeError.message === 'audio-too-long') throw decodeError
    throw new Error('audio-decode-failed')
  }
  if (!sourceFrames || !sourceRate) throw new Error('audio-decode-failed')

  // File shorter than the audition window: the "prefix" IS the whole file —
  // pick the winner now and resample everything we kept.
  if (!winner) {
    const prefixes = prefixBlocks.map((blocks) => concatBlocks(blocks, prefixFrames))
    winner = auditionChannels(prefixes, prefixFrames)[0].label
    resampler = new StreamingResampler(sourceRate, TARGET_SAMPLE_RATE)
    out.push(resampler.push(pickWinnerPlane(prefixes)))
    prefixBlocks.length = 0
  }
  out.push((resampler as StreamingResampler).flush(sourceFrames))

  return { samples: out.collect(), channel: winner, durationSeconds: sourceFrames / sourceRate }
}

/**
 * One-shot decode through the browser's AudioContext. Used for short files of
 * ANY container the browser understands (mp3, m4a, ogg, wav, flac…) — the
 * transient full-rate buffer fits comfortably under WHOLE_FILE_DECODE_MAX_BYTES.
 */
async function decodeWholeFile(data: ArrayBuffer, shared?: AudioContext): Promise<DecodedAudio> {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor && !shared) throw new Error('asr-unsupported-browser')
  const own = !shared
  const probe = shared ?? new (Ctor as typeof AudioContext)()
  try {
    // iOS Safari creates contexts suspended outside a direct gesture; decoding
    // on a suspended context is one of the "never resolves" paths. resume()
    // itself can also never settle on WebKit when no gesture is active — race
    // it, and let the decode below report the honest failure either way.
    if (probe.state === 'suspended') {
      let resumeTimeout: ReturnType<typeof setTimeout> | undefined
      await Promise.race([
        probe.resume().catch(() => undefined),
        new Promise<void>((resolve) => {
          resumeTimeout = setTimeout(resolve, 5_000)
        }),
      ]).finally(() => clearTimeout(resumeTimeout))
    }
    let timeout: ReturnType<typeof setTimeout> | undefined
    const decoded = await Promise.race([
      probe.decodeAudioData(data.slice(0)),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('audio-decode-failed')), DECODE_STALL_MS)
      }),
    ]).finally(() => clearTimeout(timeout))
    if (!decoded.duration || !Number.isFinite(decoded.duration)) throw new Error('audio-decode-failed')
    if (decoded.duration > MAX_ASR_SECONDS) throw new Error('audio-too-long')
    // Copy the channel planes out NOW: after this function returns, the whole
    // AudioBuffer (source-rate, multi-channel — the largest allocation in the
    // pipeline) becomes garbage before inference starts.
    const channels: Float32Array[] = []
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      channels.push(decoded.getChannelData(c).slice())
    }
    return { sampleRate: decoded.sampleRate, duration: decoded.duration, channels }
  } catch (error) {
    if (error instanceof Error && (error.message === 'audio-too-long' || error.message === 'audio-decode-failed')) throw error
    throw new Error('audio-decode-failed')
  } finally {
    if (own) void probe.close() // a shared context is closed by its owner
  }
}

export interface DecodeOutcome {
  durationSeconds: number
  /** Sorted best-first; a streamed long file yields exactly one (the winner). */
  candidates: ChannelCandidate[]
}

/**
 * Adaptive decode: probe the duration cheaply, then choose a strategy that
 * keeps peak memory honest.
 * - Short file (fits the PCM budget) → one-shot decodeAudioData, and every
 *   plausible channel candidate is auditioned on the FULL signal.
 * - Long WAV → pure-JS PCM streaming reader; long MP3 → WebCodecs streaming.
 *   The audition listens to a 45 s prefix; only the winning channel is kept.
 * - Long file in a container we cannot stream (m4a/ogg/flac), or WebCodecs
 *   missing → honest 'audio-too-large' instead of an out-of-memory crash.
 *
 * audioContext: a gesture-unlocked context from the click handler (see
 * unlockAudioContextForGesture); ownership transfers here — it is closed
 * whether the decode used it or not.
 */
export async function decodeTo16kCandidates(
  data: ArrayBuffer,
  onBytes: (fraction: number) => void = () => {},
  audioContext?: AudioContext,
): Promise<DecodeOutcome> {
  try {
    return await decodeTo16kCandidatesInner(data, onBytes, audioContext)
  } finally {
    if (audioContext && audioContext.state !== 'closed') void audioContext.close().catch(() => undefined)
  }
}

async function decodeTo16kCandidatesInner(data: ArrayBuffer, onBytes: (fraction: number) => void, audioContext?: AudioContext): Promise<DecodeOutcome> {
  const kind = sniffAudioKind(data)

  // Exact duration and PCM size for WAV; cheap metadata probe otherwise.
  let wavInfo: WavInfo | null = null
  let durationSeconds: number | null = null
  let estimatedPcmBytes: number
  if (kind === 'wav') {
    wavInfo = parseWavInfo(data) // throws 'audio-decode-failed' on bad headers
    const frames = Math.floor(wavInfo.dataLength / (wavInfo.channels * wavInfo.bytesPerSample))
    durationSeconds = frames / wavInfo.sampleRate
    estimatedPcmBytes = frames * wavInfo.channels * 4
  } else {
    durationSeconds = await probeDurationSeconds(data)
    estimatedPcmBytes = durationSeconds ? estimateDecodedBytes(durationSeconds) : data.byteLength * 8 // pessimistic when unknown
  }
  if (durationSeconds != null && durationSeconds > MAX_ASR_SECONDS) throw new Error('audio-too-long')

  const canStream = kind === 'wav' || (kind === 'mp3' && (await mp3StreamingSupported()))
  const preferStream = estimatedPcmBytes > WHOLE_FILE_DECODE_MAX_BYTES

  const stream = async (): Promise<DecodeOutcome> => {
    if (kind === 'wav' && wavInfo) {
      const result = streamWavTo16k(data, wavInfo)
      return { durationSeconds: result.durationSeconds, candidates: [winnerCandidate(result)] }
    }
    if (kind === 'mp3' && (await mp3StreamingSupported())) {
      const result = await streamDecodeMp3To16k(data, onBytes)
      return { durationSeconds: result.durationSeconds, candidates: [winnerCandidate(result)] }
    }
    throw new Error('audio-too-large')
  }

  if (preferStream) {
    if (!canStream) throw new Error('audio-too-large')
    return stream()
  }

  try {
    const decoded = await decodeWholeFile(data, audioContext)
    const resampled = decoded.channels.map((channel) => resampleLinear(channel, decoded.sampleRate, TARGET_SAMPLE_RATE))
    const candidates: ChannelCandidate[] = []
    if (resampled.length >= 2) {
      const downmix = resampleLinear(mixdownChannels(decoded.channels), decoded.sampleRate, TARGET_SAMPLE_RATE)
      candidates.push(
        { label: 'downmix', samples: downmix, score: scoreCandidate(downmix) },
        { label: 'left', samples: resampled[0], score: scoreCandidate(resampled[0]) },
        { label: 'right', samples: resampled[1], score: scoreCandidate(resampled[1]) },
      )
    } else {
      candidates.push({ label: 'mono', samples: resampled[0], score: scoreCandidate(resampled[0]) })
    }
    decoded.channels.length = 0 // release the full-rate planes before inference
    return { durationSeconds: decoded.duration, candidates: candidates.sort((a, b) => b.score - a.score) }
  } catch (error) {
    if (error instanceof Error && (error.message === 'audio-too-long' || error.message === 'asr-unsupported-browser')) throw error
    // Whole-file decode failed (corrupt file, or the browser choked): streaming
    // is the graceful fallback for MP3/WAV rather than a hard failure.
    if (canStream) return stream()
    throw new Error('audio-decode-failed')
  }
}

/** The streamed path already auditioned — wrap its single winner as a candidate. */
function winnerCandidate(result: StreamedWinner): ChannelCandidate {
  return {
    label: result.channel,
    samples: result.samples,
    score: scoreCandidate(result.samples.subarray(0, AUDITION_SECONDS * TARGET_SAMPLE_RATE)),
  }
}

// ---------------------------------------------------------------------------
// Model loading: download and initialization are DIFFERENT stages
// ---------------------------------------------------------------------------

interface TransformersModule {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<AsrPipeline>
  env: {
    allowLocalModels: boolean
    remoteHost?: string
    /** Serve every model file from our own store instead of the network. */
    useCustomCache?: boolean
    customCache?: unknown
    useBrowserCache?: boolean
    backends: { onnx: { wasm: { wasmPaths?: string; numThreads?: number; proxy?: boolean } } }
  }
}

async function loadTransformers(threads?: number): Promise<TransformersModule> {
  const mod = (await import('@huggingface/transformers')) as unknown as TransformersModule
  mod.env.allowLocalModels = false
  // Self-hosted ONNX WASM runtime — no CDN dependency, so the app shell stays
  // consistent offline and no third party sees the request.
  mod.env.backends.onnx.wasm.wasmPaths = `${window.location.origin}/ort/`
  // Single-threaded by default, on purpose. The threaded build (onnxruntime-web
  // 1.31-dev) never settles `InferenceSession.create` in this app: both a 2- and
  // a 3-thread run sat at 0% CPU with no error until the watchdog fired, while
  // the same weights compile fine single-threaded. Until that is understood,
  // asking for threads is asking for a hang, so the default is 1. An explicit
  // request for more is still honoured (the bench exposes it for testing).
  mod.env.backends.onnx.wasm.numThreads = threads && threads > 0 ? threads : 1
  return mod
}

/** Marks WHY pipeline creation failed, so the caller knows whether another host could possibly help. */
class PipelineInitError extends Error {
  readonly downloadFinished: boolean
  constructor(message: string, downloadFinished: boolean, reason?: string) {
    // The reason is part of the message on purpose: this failure only ever
    // happens on a device we cannot inspect, so "model-init-failed" alone is
    // useless on a screenshot. "model-init-failed: Out of memory" is an answer.
    super(reason ? `${message}: ${reason}` : message)
    this.name = 'PipelineInitError'
    this.downloadFinished = downloadFinished
  }
}

/**
 * WASM compilation and session creation. Separate from the download on purpose:
 * on a tablet this is the long, silent stretch (30 MB of weights compiled by the
 * WASM backend), and the previous 3-minute cap killed runs that were still
 * making progress. It is not a network wait, so the budget is generous and the
 * elapsed time is shown.
 */
const INIT_STALL_MS = 15 * 60 * 1000

async function createPipeline(mod: TransformersModule, modelId: string, onProgress: (p: TranscribeProgress) => void): Promise<AsrPipeline> {
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let ticker: ReturnType<typeof setInterval> | undefined
  let rejectStall: (error: Error) => void = () => {}
  const stall = new Promise<never>((_, reject) => { rejectStall = reject })
  const started = Date.now()
  const arm = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => rejectStall(new PipelineInitError('model-init-timeout', true)), INIT_STALL_MS)
  }
  arm()
  onProgress({ stage: 'initializing', progress: 0, detail: 'compiling WASM' })
  ticker = setInterval(() => {
    const seconds = Math.round((Date.now() - started) / 1000)
    onProgress({ stage: 'initializing', progress: 0, detail: `compiling WASM · ${seconds}s` })
  }, 5000)
  try {
    // No progress_callback: the weights are served from our own cache (see
    // modelStore.ts), so the library has nothing to download and its per-loader
    // percentages would only reintroduce the lie this rewrite removed.
    const pipe = await Promise.race([
      mod.pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8',
        device: 'wasm',
      }) as Promise<AsrPipeline>,
      stall,
    ])
    return pipe
  } catch (error) {
    if (error instanceof PipelineInitError) throw error
    const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    throw new PipelineInitError('model-init-failed', true, reason)
  } finally {
    clearTimeout(watchdog)
    if (ticker) clearInterval(ticker)
  }
}

// ---------------------------------------------------------------------------
// Language auto-detection
// ---------------------------------------------------------------------------

/**
 * transformers.js has NO language detection in its ASR pipeline: when the
 * caller passes no language, `_retrieve_init_tokens` logs a warning and forces
 * English. German audio under an English decoder comes out as phonetic
 * English gibberish — the failure mode this probe exists to prevent.
 *
 * Whisper itself knows the answer. Forced to start from just the
 * start-of-transcript token, the multilingual model puts its language vote
 * into the logits of the language tokens at the very first decoder step. We
 * capture those logits with a one-off logits processor and compare <|en|>
 * against <|de|>. The vote is only a hint, not ground truth: tiny models can
 * misclassify synthetic or accented speech. Uncertain votes therefore fall
 * back to decoding both languages and comparing their generation likelihoods.
 */

/** Whisper generation internals the probe touches — present on every multilingual model we ship. */
interface WhisperProbeModel {
  generation_config: { decoder_start_token_id?: number; lang_to_id?: Record<string, number> }
  generate: (options: Record<string, unknown>) => Promise<unknown>
}
interface WhisperProbeProcessor {
  feature_extractor: (audio: Float32Array, options: { sampling_rate: number }) => Promise<{ input_features: unknown }>
}

export interface LanguageProbeResult {
  language: AsrConcreteLanguage
  /** Probability mass on the winning language, computed over en/de only. */
  confidence: number
}

/** Lock the detected language only on a decisive vote — real speech is never near this line. */
const LANGUAGE_LOCK_CONFIDENCE = 0.9
/** A weak probe is overturned only by a strong mean-log-probability margin (one nat/token). */
const DECODE_SCORE_OVERRIDE_MARGIN = 1
/** A window quieter than this fraction of the file RMS carries no language evidence worth probing. */
const LANGUAGE_PROBE_MIN_RMS_RATIO = 0.12

/** Root-mean-square level of a buffer — 0 for silence. */
export function rmsOf(samples: Float32Array): number {
  if (!samples.length) return 0
  let sumSquares = 0
  for (let i = 0; i < samples.length; i++) sumSquares += samples[i] * samples[i]
  return Math.sqrt(sumSquares / samples.length)
}

/**
 * Ask Whisper which of the supported languages a window is spoken in. Returns
 * null whenever the model internals are not the multilingual shape we expect
 * (or inference fails) — detection must never break transcription itself.
 */
export async function probeWhisperLanguage(pipe: AsrPipeline, audio: Float32Array): Promise<LanguageProbeResult | null> {
  try {
    const model = (pipe as unknown as { model?: WhisperProbeModel }).model
    const processor = (pipe as unknown as { processor?: WhisperProbeProcessor }).processor
    const config = model?.generation_config
    const startId = config?.decoder_start_token_id
    const enId = config?.lang_to_id?.['<|en|>']
    const deId = config?.lang_to_id?.['<|de|>']
    if (!model || !processor || startId == null || enId == null || deId == null) return null
    const features = await processor.feature_extractor(audio, { sampling_rate: TARGET_SAMPLE_RATE })
    let captured: number[] | null = null
    const capture = (_inputIds: unknown, logits: { data: ArrayLike<number> }) => {
      captured = Array.from(logits.data).slice(-(Math.max(enId, deId) + 1))
      return logits
    }
    await model.generate({
      input_features: features.input_features,
      max_new_tokens: 1,
      decoder_input_ids: [startId],
      logits_processor: [capture],
    })
    if (!captured) return null
    const e = captured[enId]
    const d = captured[deId]
    if (typeof e !== 'number' || typeof d !== 'number' || !Number.isFinite(e) || !Number.isFinite(d)) return null
    const m = Math.max(e, d)
    const pEn = Math.exp(e - m) / (Math.exp(e - m) + Math.exp(d - m))
    return pEn >= 0.5 ? { language: 'en', confidence: pEn } : { language: 'de', confidence: 1 - pEn }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Windowed transcription
// ---------------------------------------------------------------------------

interface WindowDecode {
  language: AsrConcreteLanguage
  result: { text: string; chunks?: AsrChunk[] }
  /** Mean greedy-token log probability; higher is a better acoustic/language fit. */
  score: number
}

/**
 * Decode once and retain the mean maximum token log probability. Generation is
 * greedy in the ASR pipeline, so the maximum is also the selected token's
 * probability. Keeping only one number per token avoids retaining vocabulary-
 * sized logits and makes a second language pass affordable on uncertain audio.
 */
async function decodeWindow(pipe: AsrPipeline, audio: Float32Array, language: AsrConcreteLanguage): Promise<WindowDecode> {
  let scoreTotal = 0
  let scoreCount = 0
  const capture = (_inputIds: unknown, logits: { data: ArrayLike<number> }) => {
    const data = logits.data
    let max = -Infinity
    for (let i = 0; i < data.length; i++) max = Math.max(max, data[i])
    if (!Number.isFinite(max)) return logits
    let exponentialSum = 0
    for (let i = 0; i < data.length; i++) exponentialSum += Math.exp(data[i] - max)
    scoreTotal += -Math.log(exponentialSum)
    scoreCount++
    return logits
  }
  const result = await pipe(audio, {
    language,
    task: 'transcribe',
    return_timestamps: true,
    max_new_tokens: MAX_WINDOW_TOKENS,
    logits_processor: [capture],
  })
  return { language, result, score: scoreCount ? scoreTotal / scoreCount : -Infinity }
}

/** Resolve an uncertain probe without mistaking a fluent wrong-language hallucination for evidence. */
function chooseUncertainDecode(
  english: WindowDecode,
  german: WindowDecode,
  probe: LanguageProbeResult,
): WindowDecode {
  const englishHallucinated = looksLikeHallucination(english.result.text)
  const germanHallucinated = looksLikeHallucination(german.result.text)
  if (englishHallucinated !== germanHallucinated) return englishHallucinated ? german : english
  if (english.score === -Infinity && german.score === -Infinity) {
    return probe.language === 'en' ? english : german
  }
  const scoredWinner = english.score >= german.score ? english : german
  const margin = Math.abs(english.score - german.score)
  // The first-step vote is still evidence. A small likelihood difference is
  // not enough to overturn it; a large one corrects the observed bad English
  // vote without turning every accented German passage into English phonetics.
  return margin >= DECODE_SCORE_OVERRIDE_MARGIN ? scoredWinner : (probe.language === 'en' ? english : german)
}

/**
 * Run the model over fixed 30-second windows (Whisper's native input length).
 * Progress is therefore real — window i of n — one corrupt window fails only
 * its own pass, and peak inference memory stays flat no matter how long the
 * file is. Timestamps come back window-relative and are offset here.
 *
 * With language 'auto', ten-second probes ensure no vote ever locks the whole
 * file. Three agreeing decisive probes keep the fast full-window decode. Mixed
 * or uncertain windows are decoded per segment; an uncertain segment decodes in
 * BOTH English and German and keeps the higher-likelihood transcript. Thus a
 * weak language token cannot send clear speech through the wrong decoder, and
 * a mid-window German/English switch is not flattened into one language.
 * Silent opening windows are deferred until the first audible window decides.
 */
export async function transcribeWindows(
  pipe: AsrPipeline,
  audio: Float32Array,
  language: AsrLanguage,
  onWindow: (done: number, total: number) => void,
): Promise<{ text: string; chunks: AsrChunk[]; hallucinatedWindows: number; windowsWithText: number; language: AsrConcreteLanguage; languages: AsrConcreteLanguage[] }> {
  const samplesPerWindow = WINDOW_SECONDS * TARGET_SAMPLE_RATE
  const samplesPerSegment = LANGUAGE_SEGMENT_SECONDS * TARGET_SAMPLE_RATE
  const total = Math.max(1, Math.ceil(audio.length / samplesPerWindow))
  const chunks: AsrChunk[] = []
  const texts: string[] = []
  let hallucinatedWindows = 0
  let windowsWithText = 0
  let done = 0
  const tick = async () => {
    onWindow(++done, total)
    // Let the UI paint the progress update; WASM inference blocks the thread
    // between windows, so without this yield the stage text never renders.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  const commitWindow = (offset: number, decode: WindowDecode): boolean => {
    const windowChunks = (decode.result.chunks ?? []).filter((chunk) => chunk.text.trim())
    const windowText = decode.result.text.trim()
    // A musical interlude inside an otherwise spoken episode makes Whisper
    // invent a lyric loop. Skip only that decoded window/segment, not the file.
    if (windowText && looksLikeHallucination(windowText)) {
      hallucinatedWindows++
      windowsWithText++
      return false
    }
    if (!windowText) return false
    windowsWithText++
    for (const chunk of windowChunks) {
      chunks.push({
        text: chunk.text,
        timestamp: [
          (chunk.timestamp?.[0] ?? 0) + offset,
          chunk.timestamp?.[1] == null ? null : chunk.timestamp[1] + offset,
        ],
      })
    }
    texts.push(windowText)
    return true
  }

  let lastGuess: AsrConcreteLanguage = language === 'auto' ? 'en' : language
  let foundAudibleWindow = language !== 'auto'
  /** Only a silent opening run is held back, never an uncertain speech window. */
  const pending: number[] = []
  const fileRms = language === 'auto' ? rmsOf(audio) : 0
  const languages: AsrConcreteLanguage[] = []
  const secondsByLanguage: Record<AsrConcreteLanguage, number> = { en: 0, de: 0 }
  const commitInLanguage = (offset: number, seconds: number, decode: WindowDecode) => {
    if (!commitWindow(offset, decode)) return
    if (!languages.includes(decode.language)) languages.push(decode.language)
    secondsByLanguage[decode.language] += seconds
  }
  const decodeRange = (start: number, end: number, windowLanguage: AsrConcreteLanguage) =>
    decodeWindow(pipe, audio.subarray(start, end), windowLanguage)

  for (let w = 0; w < total; w++) {
    const start = w * samplesPerWindow
    const end = Math.min(start + samplesPerWindow, audio.length)
    const slice = audio.subarray(start, end)
    const offset = w * WINDOW_SECONDS

    if (language !== 'auto') {
      commitInLanguage(offset, slice.length / TARGET_SAMPLE_RATE, await decodeRange(start, end, language))
      await tick()
      continue
    }

    // Silence votes English on the raw logits — only audible audio is probed.
    const audible = rmsOf(slice) >= fileRms * LANGUAGE_PROBE_MIN_RMS_RATIO
    if (!audible && !foundAudibleWindow) {
      pending.push(w)
      continue
    }
    if (!audible) {
      commitInLanguage(offset, slice.length / TARGET_SAMPLE_RATE, await decodeRange(start, end, lastGuess))
      await tick()
      continue
    }
    foundAudibleWindow = true

    // Probe three short slices before choosing a decoding strategy. Clear,
    // homogeneous speech still takes ONE full-window decode. Mixed language or
    // uncertain speech is decoded per ten-second slice, so a switch at second
    // 12 cannot force the whole thirty seconds through the wrong language.
    const plans: Array<{
      start: number
      end: number
      audible: boolean
      probe: LanguageProbeResult | null
    }> = []
    for (let segmentStart = start; segmentStart < end; segmentStart += samplesPerSegment) {
      const segmentEnd = Math.min(segmentStart + samplesPerSegment, end)
      const segment = audio.subarray(segmentStart, segmentEnd)
      const segmentAudible = rmsOf(segment) >= fileRms * LANGUAGE_PROBE_MIN_RMS_RATIO
      plans.push({
        start: segmentStart,
        end: segmentEnd,
        audible: segmentAudible,
        probe: segmentAudible ? await probeWhisperLanguage(pipe, segment) : null,
      })
    }
    const audiblePlans = plans.filter((plan) => plan.audible)
    const decisive = audiblePlans.filter((plan) => plan.probe && plan.probe.confidence >= LANGUAGE_LOCK_CONFIDENCE)
    const decisiveLanguages = new Set(decisive.map((plan) => plan.probe?.language))
    const allUnavailable = audiblePlans.every((plan) => plan.probe === null)
    const decoded: Array<{ offset: number; seconds: number; value: WindowDecode }> = []

    if (decisive.length === audiblePlans.length && decisiveLanguages.size === 1) {
      const windowLanguage = decisive[0].probe?.language ?? lastGuess
      lastGuess = windowLanguage
      decoded.push({ offset, seconds: slice.length / TARGET_SAMPLE_RATE, value: await decodeRange(start, end, windowLanguage) })
    } else if (allUnavailable) {
      // Test doubles and future runtimes without probe internals retain the
      // previous honest fallback; they must not trigger three needless decodes.
      decoded.push({ offset, seconds: slice.length / TARGET_SAMPLE_RATE, value: await decodeRange(start, end, lastGuess) })
    } else {
      for (const plan of plans) {
        const segmentOffset = offset + (plan.start - start) / TARGET_SAMPLE_RATE
        const seconds = (plan.end - plan.start) / TARGET_SAMPLE_RATE
        let value: WindowDecode
        if (plan.audible && plan.probe && plan.probe.confidence < LANGUAGE_LOCK_CONFIDENCE) {
          const english = await decodeRange(plan.start, plan.end, 'en')
          const german = await decodeRange(plan.start, plan.end, 'de')
          value = chooseUncertainDecode(english, german, plan.probe)
        } else {
          value = await decodeRange(plan.start, plan.end, plan.probe?.language ?? lastGuess)
        }
        lastGuess = value.language
        decoded.push({ offset: segmentOffset, seconds, value })
      }
    }

    // Commit the deferred silent opening before the first audible text so VTT
    // cues stay chronological. Its language is only a decoder hint; silence has
    // no transcript and cannot influence the reported spoken-language result.
    const openingLanguage = decoded.find((item) => item.value.result.text.trim())?.value.language ?? decoded[0]?.value.language ?? lastGuess
    for (const p of pending) {
      const pendingStart = p * samplesPerWindow
      const pendingEnd = Math.min(pendingStart + samplesPerWindow, audio.length)
      const pendingDecode = await decodeRange(pendingStart, pendingEnd, openingLanguage)
      commitInLanguage(p * WINDOW_SECONDS, (pendingEnd - pendingStart) / TARGET_SAMPLE_RATE, pendingDecode)
      await tick()
    }
    pending.length = 0
    for (const item of decoded) commitInLanguage(item.offset, item.seconds, item.value)
    await tick()
  }

  // An all-silent file has no language evidence; the no-speech accounting
  // below answers honestly without claiming a detection success.
  for (const p of pending) {
    const pendingStart = p * samplesPerWindow
    const pendingEnd = Math.min(pendingStart + samplesPerWindow, audio.length)
    const pendingDecode = await decodeRange(pendingStart, pendingEnd, lastGuess)
    commitInLanguage(p * WINDOW_SECONDS, (pendingEnd - pendingStart) / TARGET_SAMPLE_RATE, pendingDecode)
    await tick()
  }
  const dominant = languages.reduce<AsrConcreteLanguage>(
    (best, item) => secondsByLanguage[item] > secondsByLanguage[best] ? item : best,
    languages[0] ?? lastGuess,
  )
  return { text: texts.join(' '), chunks, hallucinatedWindows, windowsWithText, language: dominant, languages }
}

/**
 * Transcribe a local audio file entirely in the browser. English and German
 * for now — the multilingual models are reliable there; other languages need a
 * heavier model than a browser tab should carry. 'auto' (the default) asks
 * Whisper itself which of the two the audio is, per window, before committing.
 */
export async function transcribeLocally(
  data: ArrayBuffer,
  language: AsrLanguage,
  onProgress: (p: TranscribeProgress) => void = () => {},
  options: TranscribeOptions = {},
): Promise<TranscribeResult> {
  onProgress({ stage: 'checking', progress: 0, detail: 'browser capabilities' })
  const support = checkAsrSupport()
  if (!support.ok) throw new Error(`asr-unsupported-browser:${support.missing.join(',')}`)

  const tier: AsrModelTier = options.model ?? 'tiny'
  const modelId = MODEL_IDS[tier]
  // The dynamic import downloads the ONNX runtime chunk. On a tablet over a slow
  // link that is tens of seconds of silence, and a silent stage reads as a hang —
  // say which of the two waits is running.
  onProgress({ stage: 'checking', progress: 0, detail: 'loading onnxruntime bundle' })
  const mod = await loadTransformers(options.threads)
  onProgress({ stage: 'checking', progress: 0, detail: 'checking the model cache' })

  // Download first, ourselves, with resume; then hand the bytes to the pipeline
  // through a custom cache so it never touches the network. See modelStore.ts.
  const store = await ensureModelFiles(modelId, (p) => {
    const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`
    const remaining = p.total - p.loaded
    // A finished transfer keeps its last sample; printing "≈1 min left" on the
    // line that says "complete" made the bench look broken.
    const speed = p.bytesPerSecond > 0 && remaining > 0
      ? ` · ${(p.bytesPerSecond / 1024).toFixed(0)} KB/s · ≈${Math.max(1, Math.ceil(remaining / p.bytesPerSecond / 60))} min left`
      : remaining <= 0 ? ' · complete' : ''
    onProgress({
      stage: 'downloading',
      progress: p.total > 0 ? Math.min(1, p.loaded / p.total) : 0,
      detail: `${mb(p.loaded)} / ${mb(p.total)} · ${p.filesDone}/${p.filesTotal} files${speed}`,
    })
  })
  mod.env.useCustomCache = true
  mod.env.customCache = store
  // Our cache already holds everything; the browser cache would be a second copy.
  mod.env.useBrowserCache = false
  // Anything the manifest missed still resolves against our own origin.
  mod.env.remoteHost = `${window.location.origin}/models`
  const pipe = await createPipeline(mod, modelId, onProgress)

  onProgress({ stage: 'decoding', progress: 0 })
  const { candidates } = await decodeTo16kCandidates(
    data,
    (fraction) => {
      onProgress({ stage: 'decoding', progress: fraction })
    },
    options.audioContext,
  )
  // Bounded multi-pass: best-scored channel first; if it yields nothing — or
  // yields a fabricated repetition loop — the runner-up gets exactly one more
  // pass before the honest no-speech error. A long file decoded through the
  // streaming path has exactly ONE candidate (its audition winner), so there
  // is no second pass for it — re-streaming a two-hour file to re-audition a
  // losing channel would double the wait for a rare edge case.
  const passes = candidates.slice(0, 2)
  // Release every losing candidate's buffer before inference starts.
  for (const dropped of candidates.slice(2)) dropped.samples = new Float32Array(0)
  let sawHallucination = false
  for (let pass = 0; pass < passes.length; pass++) {
    const candidate = passes[pass]
    const audio = conditionSignal(candidate.samples)
    candidate.samples = new Float32Array(0) // conditioned copy is what we need
    let aggregate: { text: string; chunks: AsrChunk[]; hallucinatedWindows: number; windowsWithText: number; language: AsrConcreteLanguage; languages: AsrConcreteLanguage[] }
    try {
      aggregate = await transcribeWindows(pipe, audio, language, (done, total) => {
        onProgress({
          stage: 'transcribing',
          progress: (pass + done / total) / passes.length,
          detail: passes.length > 1 ? `pass ${pass + 1}/${passes.length} · ${candidate.label} · ${done}/${total}` : `${done}/${total}`,
        })
      })
    } catch (error) {
      throw error instanceof Error ? error : new Error('transcribe-failed')
    }
    const chunks = aggregate.chunks.filter((chunk) => chunk.text.trim())
    const text = aggregate.text.trim()
    if (chunks.length && text) {
      // Only a file where EVERY text-bearing window hallucinated counts as
      // "no speech" — otherwise the spoken windows stand on their own.
      const allHallucinated = aggregate.windowsWithText > 0 && aggregate.hallucinatedWindows === aggregate.windowsWithText
      if (allHallucinated) {
        sawHallucination = true
        continue
      }
      onProgress({ stage: 'done', progress: 1 })
      return { vtt: chunksToVtt(chunks), text, channel: candidate.label, model: tier, language: aggregate.language, languages: aggregate.languages }
    }
    if (aggregate.hallucinatedWindows > 0) sawHallucination = true
  }
  throw new Error(sawHallucination ? 'no-speech-found' : 'empty-transcript')
}
