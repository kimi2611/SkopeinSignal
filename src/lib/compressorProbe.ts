/**
 * Can this device compress audio before upload?
 *
 * The bench's whole cost model on a slow link is "bytes on the wire". A 15
 * minute episode is 14 MB as MP3; Opus at 24 kbit/s is about 2.7 MB, which
 * turns a five minute upload into under a minute. Whether iPad Safari can
 * actually encode Opus is not something to assume — WebKit shipped WebCodecs
 * video support first and audio later, and MediaRecorder's Opus container
 * support differs between iOS versions. So we measure it here and print the
 * numbers instead of guessing in a design doc.
 *
 * Everything runs on a 3 second synthetic tone: no user audio leaves the
 * device, and the result is comparable across machines.
 */

export interface CompressorProbeResult {
  webCodecs: boolean
  webCodecsOpus: boolean
  webCodecsError?: string
  encodedBytes?: number
  encodedMs?: number
  effectiveKbps?: number
  mediaRecorderOpus: string[]
  verdict: 'opus-webcodecs' | 'media-recorder-only' | 'none'
}

const TONE_SECONDS = 3
const SAMPLE_RATE = 48_000
const TARGET_BITRATE = 24_000

function tone(seconds: number): Float32Array {
  const frames = Math.round(seconds * SAMPLE_RATE)
  const out = new Float32Array(frames)
  for (let i = 0; i < frames; i += 1) {
    // Two-tone sweep: a pure sine compresses unrealistically well.
    const t = i / SAMPLE_RATE
    out[i] = 0.3 * Math.sin(2 * Math.PI * (220 + 180 * t) * t)
  }
  return out
}

export async function probeOpusCompression(): Promise<CompressorProbeResult> {
  const result: CompressorProbeResult = {
    webCodecs: typeof (globalThis as { AudioEncoder?: unknown }).AudioEncoder === 'function',
    webCodecsOpus: false,
    mediaRecorderOpus: [],
    verdict: 'none',
  }

  const types = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/mp4;codecs=opus',
    'audio/mp4',
  ]
  if (typeof MediaRecorder !== 'undefined') {
    result.mediaRecorderOpus = types.filter((t) => {
      try {
        return MediaRecorder.isTypeSupported(t)
      } catch {
        return false
      }
    })
  }

  if (!result.webCodecs) return result

  const Encoder = (globalThis as unknown as { AudioEncoder: new (init: unknown) => AudioEncoderLike }).AudioEncoder
  const config = { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: TARGET_BITRATE }

  try {
    const support = await (Encoder as unknown as {
      isConfigSupported: (c: unknown) => Promise<{ supported?: boolean }>
    }).isConfigSupported(config)
    if (!support?.supported) {
      result.webCodecsError = 'isConfigSupported returned supported:false'
      return result
    }
  } catch (error) {
    result.webCodecsError = error instanceof Error ? error.message : String(error)
    return result
  }

  result.webCodecsOpus = true

  try {
    let bytes = 0
    const started = performance.now()
    const encoder = new Encoder({
      ...config,
      output: (chunk: { byteLength: number }) => {
        bytes += chunk.byteLength
      },
      error: (err: Error) => {
        result.webCodecsError = err.message
      },
    })
    const pcm = tone(TONE_SECONDS)
    const framesPerChunk = SAMPLE_RATE / 10
    for (let offset = 0; offset < pcm.length; offset += framesPerChunk) {
      const slice = pcm.subarray(offset, Math.min(offset + framesPerChunk, pcm.length))
      encoder.encode(
        new AudioData({
          format: 'f32-planar',
          sampleRate: SAMPLE_RATE,
          numberOfFrames: slice.length,
          numberOfChannels: 1,
          timestamp: Math.round((offset / SAMPLE_RATE) * 1_000_000),
          data: slice.slice(),
        }),
      )
    }
    await encoder.flush()
    encoder.close()
    const elapsed = performance.now() - started
    result.encodedBytes = bytes
    result.encodedMs = Math.round(elapsed)
    if (bytes > 0) {
      result.effectiveKbps = Math.round((bytes * 8) / TONE_SECONDS / 1000)
    }
  } catch (error) {
    result.webCodecsError = error instanceof Error ? error.message : String(error)
    result.webCodecsOpus = false
  }

  result.verdict = result.webCodecsOpus
    ? 'opus-webcodecs'
    : result.mediaRecorderOpus.length > 0
      ? 'media-recorder-only'
      : 'none'
  return result
}

interface AudioEncoderLike {
  encode: (data: unknown) => void
  flush: () => Promise<void>
  close: () => void
}
