import { describe, expect, it } from 'vitest'
import {
  auditionChannels,
  checkAsrSupport,
  chunksToVtt,
  conditionSignal,
  estimateDecodedBytes,
  looksLikeHallucination,
  mixdownChannels,
  parseWavInfo,
  probeWhisperLanguage,
  resampleLinear,
  rmsOf,
  scoreCandidate,
  skipId3v2,
  sniffAudioKind,
  StreamingResampler,
  streamWavTo16k,
  decodeTo16kCandidates,
  transcribeWindows,
  unlockAudioContextForGesture,
} from './localTranscribe'

describe('looksLikeHallucination — refuse fabricated loops on instrumental audio', () => {
  it('flags the classic whisper-on-music lyric loop', () => {
    const loop = "I'm gonna be the best of you. " + 'Yeah, '.repeat(60) + 'Thank you.'
    expect(looksLikeHallucination(loop)).toBe(true)
  })

  it('flags a single-word chant', () => {
    expect(looksLikeHallucination('music '.repeat(40))).toBe(true)
  })

  it('passes ordinary varied speech', () => {
    const speech = 'And so my fellow Americans, ask not what your country can do for you — ask what you can do for your country. The energy, the faith, the devotion which we bring to this endeavor will light our country and all who serve it.'
    expect(looksLikeHallucination(speech)).toBe(false)
  })

  it('passes short utterances under the word threshold', () => {
    expect(looksLikeHallucination('yeah yeah yeah')).toBe(false)
  })
})

describe('chunksToVtt', () => {
  it('writes a WEBVTT header and one cue per non-empty chunk', () => {
    const vtt = chunksToVtt([
      { text: ' Hello world ', timestamp: [0, 1.5] },
      { text: 'second line', timestamp: [2, 4] },
    ])
    expect(vtt.startsWith('WEBVTT\n\n')).toBe(true)
    expect(vtt).toContain('00:00:00.000 --> 00:00:01.500\nHello world')
    expect(vtt).toContain('00:00:02.000 --> 00:00:04.000\nsecond line')
  })

  it('drops empty chunks and gives the open-ended last chunk a short span', () => {
    const vtt = chunksToVtt([
      { text: '   ', timestamp: [0, 1] },
      { text: 'tail', timestamp: [61.25, null] },
    ])
    expect(vtt).not.toContain('00:00:00.000')
    expect(vtt).toContain('00:01:01.250 --> 00:01:03.750\ntail')
  })

  it('enforces a minimum 0.4s cue span', () => {
    const vtt = chunksToVtt([{ text: 'x', timestamp: [5, 5] }])
    expect(vtt).toContain('00:00:05.000 --> 00:00:05.400\nx')
  })
})

describe('scoreCandidate — ranking channel candidates', () => {
  const sine = (amplitude: number, seconds = 0.5, rate = 16_000) => {
    const out = new Float32Array(Math.floor(seconds * rate))
    for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / rate)
    return out
  }

  it('ranks a healthy speech-level channel above a near-silent one', () => {
    expect(scoreCandidate(sine(0.2))).toBeGreaterThan(scoreCandidate(sine(0.0001)))
  })

  it('penalises a hard-clipped channel below a clean quieter one', () => {
    const clipped = sine(1.6) // peaks far past ±1
    const clean = sine(0.15)
    expect(scoreCandidate(clean)).toBeGreaterThan(scoreCandidate(clipped))
  })

  it('returns -Infinity for an empty candidate', () => {
    expect(scoreCandidate(new Float32Array(0))).toBe(-Infinity)
  })
})

describe('conditionSignal — DC removal, high-pass, loudness normalization', () => {
  it('removes a DC offset and normalizes RMS toward the target', () => {
    const rate = 16_000
    const input = new Float32Array(rate / 2)
    for (let i = 0; i < input.length; i++) input[i] = 0.4 + 0.02 * Math.sin((2 * Math.PI * 200 * i) / rate)
    const out = conditionSignal(input, rate)
    let mean = 0
    let sumSquares = 0
    for (const v of out) { mean += v; sumSquares += v * v }
    mean /= out.length
    const rms = Math.sqrt(sumSquares / out.length)
    expect(Math.abs(mean)).toBeLessThan(0.01)
    expect(rms).toBeGreaterThan(0.04) // normalized upward from a quiet source
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThanOrEqual(0.9501)
  })

  it('leaves digital silence untouched instead of amplifying noise', () => {
    const out = conditionSignal(new Float32Array(8000))
    expect(Math.max(...Array.from(out, Math.abs))).toBe(0)
  })

  it('caps loud signals so peaks never exceed the ceiling', () => {
    const rate = 16_000
    const input = new Float32Array(rate / 4)
    for (let i = 0; i < input.length; i++) input[i] = 0.9 * Math.sin((2 * Math.PI * 200 * i) / rate)
    const out = conditionSignal(input, rate)
    expect(Math.max(...Array.from(out, Math.abs))).toBeLessThanOrEqual(0.9501)
  })
})

describe('mixdownChannels — stereo to mono without OfflineAudioContext', () => {
  it('averages channels sample by sample', () => {
    const left = new Float32Array([1, -1, 0.5])
    const right = new Float32Array([0, 1, 0.5])
    const mix = mixdownChannels([left, right])
    expect(Array.from(mix)).toEqual([0.5, 0, 0.5])
  })

  it('copies a single channel instead of aliasing it', () => {
    const mono = new Float32Array([0.25, -0.25])
    const out = mixdownChannels([mono])
    expect(Array.from(out)).toEqual([0.25, -0.25])
    expect(out).not.toBe(mono)
  })
})

describe('resampleLinear — deterministic JS resampling (no OfflineAudioContext)', () => {
  it('halves the sample count when halving the rate', () => {
    const input = new Float32Array(100).fill(0.5)
    const out = resampleLinear(input, 32_000, 16_000)
    expect(out.length).toBe(50)
    expect(out[25]).toBeCloseTo(0.5)
  })

  it('interpolates between neighbours', () => {
    const out = resampleLinear(new Float32Array([0, 1]), 2, 4)
    // ratio 0.5: positions 0, 0.5, 1, 1.5(clamped) → 0, 0.5, 1, 1
    expect(out.length).toBe(4)
    expect(out[0]).toBe(0)
    expect(out[1]).toBeCloseTo(0.5)
    expect(out[2]).toBe(1)
  })

  it('passes audio through untouched when the rate already matches', () => {
    const input = new Float32Array([0.5, -0.25, 0.75])
    expect(Array.from(resampleLinear(input, 16_000, 16_000))).toEqual([0.5, -0.25, 0.75])
  })

  it('returns empty output for empty input', () => {
    expect(resampleLinear(new Float32Array(0), 44_100, 16_000).length).toBe(0)
  })
})

describe('checkAsrSupport — capability gate before any download starts', () => {
  it('reports missing WebAudio under the test runtime (node has no AudioContext)', () => {
    const support = checkAsrSupport()
    expect(support.missing).toContain('webaudio')
    expect(support.ok).toBe(false)
  })

  it('detects WebAssembly and BigInt64 where the runtime provides them', () => {
    const support = checkAsrSupport()
    expect(support.missing).not.toContain('webassembly')
    expect(support.missing).not.toContain('bigint64')
    expect(support.missing).not.toContain('wasm-simd')
  })
})

describe('StreamingResampler — chunked output must equal batch resampleLinear', () => {
  const signal = (length: number) => {
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      out[i] = 0.4 * Math.sin((2 * Math.PI * 200 * i) / 44_100) + 0.1 * Math.sin((2 * Math.PI * 3000 * i) / 44_100)
    }
    return out
  }

  it('matches batch output sample-for-sample across awkward chunk boundaries', () => {
    const input = signal(100_000)
    const batch = resampleLinear(input, 44_100, 16_000)
    const streamer = new StreamingResampler(44_100, 16_000)
    const pieces: Float32Array[] = []
    let offset = 0
    // MP3-like frame sizes, deliberately not aligned to the resample ratio.
    for (const size of [1152, 1153, 7000, 1, 4096, 23_000]) {
      if (offset >= input.length) break
      const end = Math.min(input.length, offset + size)
      pieces.push(streamer.push(input.subarray(offset, end)))
      offset = end
    }
    while (offset < input.length) {
      const end = Math.min(input.length, offset + 1152)
      pieces.push(streamer.push(input.subarray(offset, end)))
      offset = end
    }
    pieces.push(streamer.flush(input.length))
    const total = pieces.reduce((sum, p) => sum + p.length, 0)
    const streamed = new Float32Array(total)
    let at = 0
    for (const piece of pieces) {
      streamed.set(piece, at)
      at += piece.length
    }
    expect(streamed.length).toBe(batch.length)
    for (let i = 0; i < batch.length; i++) expect(streamed[i]).toBe(batch[i])
  })

  it('handles the single-push case and the flush tail', () => {
    const input = signal(10_000)
    const batch = resampleLinear(input, 48_000, 16_000)
    const streamer = new StreamingResampler(48_000, 16_000)
    const head = streamer.push(input)
    const tail = streamer.flush(input.length)
    const streamed = new Float32Array(head.length + tail.length)
    streamed.set(head, 0)
    streamed.set(tail, head.length)
    expect(streamed.length).toBe(batch.length)
    for (let i = 0; i < batch.length; i++) expect(streamed[i]).toBe(batch[i])
  })

  it('passes audio through untouched at matching rates', () => {
    const streamer = new StreamingResampler(16_000, 16_000)
    const input = new Float32Array([0.5, -0.25, 0.75])
    expect(Array.from(streamer.push(input))).toEqual([0.5, -0.25, 0.75])
    expect(streamer.flush(input.length).length).toBe(0)
  })
})

describe('sniffAudioKind — trust magic bytes, not the file name', () => {
  const buf = (...bytes: number[]) => new Uint8Array(bytes).buffer

  it('detects WAV by RIFF/WAVE', () => {
    expect(sniffAudioKind(buf(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45))).toBe('wav')
  })

  it('detects MP3 by ID3v2 tag and by raw frame sync', () => {
    expect(sniffAudioKind(buf(0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0))).toBe('mp3')
    expect(sniffAudioKind(buf(0xff, 0xfb, 0x90, 0x00))).toBe('mp3')
  })

  it('reports anything else as other', () => {
    expect(sniffAudioKind(buf(0x4f, 0x67, 0x67, 0x53, 0, 2))).toBe('other') // ogg
    expect(sniffAudioKind(buf())).toBe('other')
  })
})

describe('skipId3v2 — syncsafe tag stripping', () => {
  it('skips the header plus the syncsafe-sized body', () => {
    // size bytes 00 00 02 01 → (0<<21)|(0<<14)|(2<<7)|1 = 257
    const tag = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 2, 1])
    const payload = new Uint8Array(257).fill(7)
    const audio = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
    const all = new Uint8Array(tag.length + payload.length + audio.length)
    all.set(tag, 0)
    all.set(payload, tag.length)
    all.set(audio, tag.length + payload.length)
    const stripped = skipId3v2(all)
    expect(Array.from(stripped)).toEqual([0xff, 0xfb, 0x90, 0x00])
  })

  it('returns the input untouched without an ID3 tag', () => {
    const raw = new Uint8Array([0xff, 0xfb, 0x90, 0x00])
    expect(skipId3v2(raw)).toBe(raw)
  })
})

/** Build a minimal PCM16 WAV in memory. */
function makeWav16(channels: number, sampleRate: number, frames: number, fill: (channel: number, frame: number) => number): ArrayBuffer {
  const dataSize = frames * channels * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }
  writeAscii(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(8, 'WAVE')
  writeAscii(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, 'data')
  view.setUint32(40, dataSize, true)
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      view.setInt16(44 + (f * channels + c) * 2, Math.max(-32768, Math.min(32767, Math.round(fill(c, f) * 32767))), true)
    }
  }
  return buffer
}

describe('parseWavInfo — RIFF walking', () => {
  it('reads format and data chunk geometry', () => {
    const info = parseWavInfo(makeWav16(2, 44_100, 1000, () => 0))
    expect(info.sampleRate).toBe(44_100)
    expect(info.channels).toBe(2)
    expect(info.float).toBe(false)
    expect(info.bytesPerSample).toBe(2)
    expect(info.dataLength).toBe(4000)
  })

  it('rejects a truncated file honestly', () => {
    expect(() => parseWavInfo(new ArrayBuffer(10))).toThrow('audio-decode-failed')
  })
})

describe('auditionChannels — prefix-based ranking', () => {
  it('picks the channel with real signal over a silent side', () => {
    const rate = 44_100
    const length = Math.floor(rate * 0.5)
    const left = new Float32Array(length)
    const right = new Float32Array(length) // digital silence
    for (let i = 0; i < length; i++) left[i] = 0.3 * Math.sin((2 * Math.PI * 200 * i) / rate)
    const ranked = auditionChannels([left, right], length)
    expect(ranked[0].label).toBe('left')
    expect(ranked.map((r) => r.label)).toContain('downmix')
  })

  it('labels a single channel as mono', () => {
    const mono = new Float32Array(1000).fill(0.1)
    const ranked = auditionChannels([mono], 1000)
    expect(ranked.length).toBe(1)
    expect(ranked[0].label).toBe('mono')
  })
})

describe('estimateDecodedBytes — memory budget estimate', () => {
  it('estimates stereo 48 kHz f32 at 384 KB per second', () => {
    expect(estimateDecodedBytes(60)).toBe(60 * 48_000 * 2 * 4)
  })
})

describe('streamWavTo16k — long-file streaming path (pure JS, runs in tests)', () => {
  it('auditions channels on a prefix and resamples only the winner', () => {
    const rate = 44_100
    const seconds = 2
    const frames = rate * seconds
    // Left carries a healthy tone; right is digital silence → left must win.
    const wav = makeWav16(2, rate, frames, (channel, f) => (channel === 0 ? 0.3 * Math.sin((2 * Math.PI * 200 * f) / rate) : 0))
    const info = parseWavInfo(wav)
    const result = streamWavTo16k(wav, info)
    expect(result.channel).toBe('left')
    expect(result.durationSeconds).toBeCloseTo(seconds, 3)
    const expectedLength = Math.max(1, Math.round(frames / (rate / 16_000)))
    expect(result.samples.length).toBe(expectedLength)
    // The streamed samples track the source tone (non-trivial amplitude).
    let peak = 0
    for (const v of result.samples) peak = Math.max(peak, Math.abs(v))
    expect(peak).toBeGreaterThan(0.15)
  })

  it('downmixes when the winner is the downmix candidate', () => {
    const rate = 16_000
    const frames = rate
    // Both sides equally loud → downmix scores at least as well as either side.
    const wav = makeWav16(2, rate, frames, (_c, f) => 0.25 * Math.sin((2 * Math.PI * 220 * f) / rate))
    const result = streamWavTo16k(wav, parseWavInfo(wav))
    expect(['downmix', 'left']).toContain(result.channel)
    expect(result.samples.length).toBe(frames) // identity rate: 16k → 16k
  })

  it('handles a mono file', () => {
    const rate = 32_000
    const frames = Math.floor(rate * 0.5)
    const wav = makeWav16(1, rate, frames, (_c, f) => 0.2 * Math.sin((2 * Math.PI * 200 * f) / rate))
    const result = streamWavTo16k(wav, parseWavInfo(wav))
    expect(result.channel).toBe('mono')
    expect(result.samples.length).toBe(Math.max(1, Math.round(frames / 2)))
  })
})

describe('decodeTo16kCandidates — gesture-unlocked AudioContext ownership', () => {
  function fakeContext(): { ctx: AudioContext; closed: () => boolean } {
    let isClosed = false
    const ctx = {
      state: 'running',
      close: () => { isClosed = true; return Promise.resolve() },
    } as unknown as AudioContext
    return { ctx, closed: () => isClosed }
  }

  it('closes a provided context after a successful (fallback-streamed) decode', async () => {
    const { ctx, closed } = fakeContext()
    const rate = 16_000
    const wav = makeWav16(1, rate, rate / 2, (_c, f) => 0.2 * Math.sin((2 * Math.PI * 200 * f) / rate))
    // Node has no window → whole-file decode is unavailable, the WAV streaming
    // fallback answers instead; the shared context must still be closed.
    const outcome = await decodeTo16kCandidates(wav, () => {}, ctx)
    expect(outcome.candidates.length).toBe(1)
    expect(closed()).toBe(true)
  })

  it('closes a provided context even when the decode fails', async () => {
    const { ctx, closed } = fakeContext()
    const wav = makeWav16(1, 16_000, 100, () => 0)
    new DataView(wav).setUint8(0, 0x00) // corrupt the RIFF magic
    await expect(decodeTo16kCandidates(wav, () => {}, ctx)).rejects.toThrow('audio-decode-failed')
    expect(closed()).toBe(true)
  })
})

describe('unlockAudioContextForGesture', () => {
  it('returns undefined where WebAudio is missing (test runtime has no window)', () => {
    expect(unlockAudioContextForGesture()).toBeUndefined()
  })
})

describe('transcribeWindows — window-level hallucination handling', () => {
  const speech = 'The quick brown fox jumps over the lazy dog and keeps running through the forest.'
  const lyricLoop = 'yeah '.repeat(30)

  function stubPipe(outputs: { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }[]): import('./localTranscribe').AsrPipeline {
    let call = 0
    return async () => outputs[Math.min(call++, outputs.length - 1)]
  }

  it('skips a hallucinated music window but keeps the spoken windows', async () => {
    // 2 windows of 30 s → window 0 speech, window 1 a lyric-loop hallucination.
    const audio = new Float32Array(60 * 16_000)
    const result = await transcribeWindows(
      stubPipe([
        { text: speech, chunks: [{ text: speech, timestamp: [0, 4] }] },
        { text: lyricLoop, chunks: [{ text: lyricLoop, timestamp: [0, 29] }] },
      ]),
      audio,
      'en',
      () => {},
    )
    expect(result.text).toBe(speech)
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.text).toBe(speech)
    expect(result.hallucinatedWindows).toBe(1)
    expect(result.windowsWithText).toBe(2)
  })

  it('reports an all-hallucinated file so the caller can answer no-speech honestly', async () => {
    const audio = new Float32Array(45 * 16_000) // 2 windows, both pure music
    const result = await transcribeWindows(
      stubPipe([
        { text: lyricLoop, chunks: [{ text: lyricLoop, timestamp: [0, 29] }] },
        { text: lyricLoop, chunks: [{ text: lyricLoop, timestamp: [0, 14] }] },
      ]),
      audio,
      'en',
      () => {},
    )
    expect(result.text).toBe('')
    expect(result.chunks).toHaveLength(0)
    expect(result.hallucinatedWindows).toBe(2)
    expect(result.windowsWithText).toBe(2)
  })

  it('keeps genuinely repetitive SPOKEN text (a real chant is not a hallucination)', async () => {
    const chant = 'Wir sind die Mannschaft. '.repeat(3) + 'Und wir spielen heute zuhause.'
    const audio = new Float32Array(30 * 16_000)
    const result = await transcribeWindows(
      stubPipe([{ text: chant, chunks: [{ text: chant, timestamp: [0, 8] }] }]),
      audio,
      'de',
      () => {},
    )
    expect(result.text).toBe(chant.trim())
    expect(result.hallucinatedWindows).toBe(0)
  })
})

describe('rmsOf — signal level for the probe gate', () => {
  it('is 0 for silence and for an empty buffer', () => {
    expect(rmsOf(new Float32Array(1000))).toBe(0)
    expect(rmsOf(new Float32Array(0))).toBe(0)
  })

  it('matches the amplitude of a constant signal', () => {
    expect(rmsOf(new Float32Array(100).fill(0.5))).toBeCloseTo(0.5, 5)
  })
})

describe('probeWhisperLanguage — whisper logits language vote', () => {
  const EN = 50259
  const DE = 50261

  function probeStub(options: { enLogit?: number; deLogit?: number; fail?: boolean } = {}) {
    let generateCalls = 0
    const pipe = (async () => ({ text: '', chunks: [] })) as unknown as import('./localTranscribe').AsrPipeline
    const internals = pipe as unknown as { model: unknown; processor: unknown }
    internals.model = {
      generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
      generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
        generateCalls++
        if (options.fail) throw new Error('inference blew up')
        const logits = new Float32Array(DE + 1)
        logits[EN] = options.enLogit ?? 0
        logits[DE] = options.deLogit ?? 0
        for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
        return {}
      },
    }
    internals.processor = { feature_extractor: async () => ({ input_features: {} }) }
    return { pipe, generateCalls: () => generateCalls }
  }

  it('votes German when the de logit dominates, with overwhelming confidence', async () => {
    const { pipe } = probeStub({ enLogit: 15.5, deLogit: 22.9 }) // measured on real German speech
    const probe = await probeWhisperLanguage(pipe, new Float32Array(16000).fill(0.1))
    expect(probe?.language).toBe('de')
    expect(probe?.confidence).toBeGreaterThan(0.99)
  })

  it('votes English when the en logit dominates', async () => {
    const { pipe } = probeStub({ enLogit: 26.9, deLogit: 18.4 }) // measured on real English speech
    const probe = await probeWhisperLanguage(pipe, new Float32Array(16000).fill(0.1))
    expect(probe?.language).toBe('en')
    expect(probe?.confidence).toBeGreaterThan(0.99)
  })

  it('returns null instead of breaking transcription when internals are missing', async () => {
    const bare = (async () => ({ text: '', chunks: [] })) as unknown as import('./localTranscribe').AsrPipeline
    expect(await probeWhisperLanguage(bare, new Float32Array(16000))).toBeNull()
  })

  it('returns null when inference throws', async () => {
    const { pipe } = probeStub({ fail: true })
    expect(await probeWhisperLanguage(pipe, new Float32Array(16000))).toBeNull()
  })
})

describe('transcribeWindows — auto language detection', () => {
  const speech = 'The quick brown fox jumps over the lazy dog and keeps running through the forest.'
  const german = 'Der schnelle braune Fuchs springt über den faulen Hund und läuft weiter durch den Wald.'

  function stubPipeWithProbe(
    outputs: { text: string; chunks?: { text: string; timestamp: [number, number | null] }[] }[],
    probe: { enLogit: number; deLogit: number } | null,
  ) {
    const EN = 50259
    const DE = 50261
    let call = 0
    let generateCalls = 0
    const languages: string[] = []
    const pipe = (async (_audio: Float32Array, pipeOptions: Record<string, unknown>) => {
      languages.push(String(pipeOptions.language))
      return outputs[Math.min(call++, outputs.length - 1)]
    }) as unknown as import('./localTranscribe').AsrPipeline
    if (probe) {
      const internals = pipe as unknown as { model: unknown; processor: unknown }
      internals.model = {
        generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
        generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
          generateCalls++
          const logits = new Float32Array(DE + 1)
          logits[EN] = probe.enLogit
          logits[DE] = probe.deLogit
          for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
          return {}
        },
      }
      internals.processor = { feature_extractor: async () => ({ input_features: {} }) }
    }
    return { pipe, languages, generateCalls: () => generateCalls }
  }

  const tone = (seconds: number, amplitude = 0.3) => {
    const out = new Float32Array(seconds * 16_000)
    for (let i = 0; i < out.length; i++) out[i] = amplitude * Math.sin((2 * Math.PI * 200 * i) / 16_000)
    return out
  }

  it('never probes when the language was chosen explicitly', async () => {
    const { pipe, languages, generateCalls } = stubPipeWithProbe(
      [{ text: german, chunks: [{ text: german, timestamp: [0, 4] }] }],
      { enLogit: 26.9, deLogit: 18.4 }, // would vote 'en' — must be ignored
    )
    const result = await transcribeWindows(pipe, tone(30), 'de', () => {})
    expect(generateCalls()).toBe(0)
    expect(languages).toEqual(['de'])
    expect(result.language).toBe('de')
    expect(result.text).toBe(german)
  })

  it('detects German on the first window and transcribes in German throughout', async () => {
    const { pipe, languages } = stubPipeWithProbe(
      [
        { text: german, chunks: [{ text: german, timestamp: [0, 4] }] },
        { text: german, chunks: [{ text: german, timestamp: [0, 4] }] },
      ],
      { enLogit: 15.5, deLogit: 22.9 }, // measured German vote
    )
    const result = await transcribeWindows(pipe, tone(60), 'auto', () => {})
    expect(languages).toEqual(['de', 'de'])
    expect(result.language).toBe('de')
    expect(result.text).toBe(`${german} ${german}`)
  })

  it('decodes alternating German and English windows independently instead of locking the file language', async () => {
    const EN = 50259
    const DE = 50261
    const votes = ['de', 'de', 'de', 'en', 'en', 'en', 'de', 'de', 'de'] as const
    const outputs = [
      { text: german, chunks: [{ text: german, timestamp: [0, 4] as [number, number | null] }] },
      { text: speech, chunks: [{ text: speech, timestamp: [0, 4] as [number, number | null] }] },
      { text: german, chunks: [{ text: german, timestamp: [0, 4] as [number, number | null] }] },
    ]
    let call = 0
    let probeCount = 0
    const languages: string[] = []
    const pipe = (async (_audio: Float32Array, pipeOptions: Record<string, unknown>) => {
      languages.push(String(pipeOptions.language))
      return outputs[Math.min(call++, outputs.length - 1)]
    }) as unknown as import('./localTranscribe').AsrPipeline
    const internals = pipe as unknown as { model: unknown; processor: unknown }
    internals.model = {
      generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
      generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
        const vote = votes[Math.min(probeCount++, votes.length - 1)]
        const logits = new Float32Array(DE + 1)
        logits[EN] = vote === 'en' ? 12 : 0
        logits[DE] = vote === 'de' ? 12 : 0
        for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
        return {}
      },
    }
    internals.processor = { feature_extractor: async () => ({ input_features: {} }) }

    const result = await transcribeWindows(pipe, tone(90), 'auto', () => {})
    expect(languages).toEqual(['de', 'en', 'de'])
    expect(result.languages).toEqual(['de', 'en'])
    expect(result.language).toBe('de') // two German windows vs one English window
    expect(result.text).toBe(`${german} ${speech} ${german}`)
  })

  it('never locks a language onto a silent intro — the first SPEECH window decides', async () => {
    // Window 0 is digital silence; window 1 carries the tone. Silence votes
    // English on raw logits, so it must not be probed at all.
    const audio = new Float32Array(60 * 16_000)
    audio.set(tone(30), 30 * 16_000)
    const { pipe, languages, generateCalls } = stubPipeWithProbe(
      [
        { text: '', chunks: [] }, // window 0, transcribed after the lock
        { text: german, chunks: [{ text: german, timestamp: [0, 4] }] },
      ],
      { enLogit: 15.5, deLogit: 22.9 },
    )
    const result = await transcribeWindows(pipe, audio, 'auto', () => {})
    expect(generateCalls()).toBe(3) // only the three speech slices were probed, never the silent opening
    expect(languages).toEqual(['de', 'de']) // deferred silence still lands in the locked language
    expect(result.language).toBe('de')
  })

  it('splits one 30-second window when German changes to English inside it', async () => {
    const EN = 50259
    const DE = 50261
    const votes = ['de', 'de', 'en'] as const
    let probeCount = 0
    const attempted: string[] = []
    const pipe = (async (_audio: Float32Array, pipeOptions: Record<string, unknown>) => {
      const language = String(pipeOptions.language)
      attempted.push(language)
      const text = language === 'de' ? german : speech
      return { text, chunks: [{ text, timestamp: [0, 4] as [number, number | null] }] }
    }) as unknown as import('./localTranscribe').AsrPipeline
    const internals = pipe as unknown as { model: unknown; processor: unknown }
    internals.model = {
      generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
      generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
        const vote = votes[Math.min(probeCount++, votes.length - 1)]
        const logits = new Float32Array(DE + 1)
        logits[EN] = vote === 'en' ? 12 : 0
        logits[DE] = vote === 'de' ? 12 : 0
        for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
        return {}
      },
    }
    internals.processor = { feature_extractor: async () => ({ input_features: {} }) }

    const result = await transcribeWindows(pipe, tone(30), 'auto', () => {})
    expect(attempted).toEqual(['de', 'de', 'en'])
    expect(result.languages).toEqual(['de', 'en'])
    expect(result.text).toBe(`${german} ${german} ${speech}`)
    expect(result.chunks.map((chunk) => chunk.timestamp)).toEqual([[0, 4], [10, 14], [20, 24]])
  })

  it('decodes an unsure window in both languages and keeps the higher-likelihood transcript', async () => {
    const EN = 50259
    const DE = 50261
    const attempted: string[] = []
    const pipe = (async (_audio: Float32Array, pipeOptions: Record<string, unknown>) => {
      const language = String(pipeOptions.language)
      attempted.push(language)
      // English is the much more confident acoustic fit, despite the weak
      // first-step German vote below.
      const logits = language === 'en' ? new Float32Array([2, 0]) : new Float32Array(4)
      for (const proc of (pipeOptions.logits_processor as Array<(ids: unknown, value: { data: Float32Array }) => unknown>) ?? []) {
        proc(null, { data: logits })
      }
      return language === 'en'
        ? { text: speech, chunks: [{ text: speech, timestamp: [0, 4] as [number, number | null] }] }
        : { text: german, chunks: [{ text: german, timestamp: [0, 4] as [number, number | null] }] }
    }) as unknown as import('./localTranscribe').AsrPipeline
    const internals = pipe as unknown as { model: unknown; processor: unknown }
    internals.model = {
      generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
      generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
        const logits = new Float32Array(DE + 1)
        logits[EN] = 0
        logits[DE] = 1 // p_de ≈ 0.73 — unsure and, in this case, wrong
        for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
        return {}
      },
    }
    internals.processor = { feature_extractor: async () => ({ input_features: {} }) }
    const result = await transcribeWindows(pipe, tone(10), 'auto', () => {})
    expect(attempted).toEqual(['en', 'de'])
    expect(result.languages).toEqual(['en'])
    expect(result.language).toBe('en')
    expect(result.text).toBe(speech)
  })

  it('does not overturn a weak German probe for a small English score advantage', async () => {
    const EN = 50259
    const DE = 50261
    const pipe = (async (_audio: Float32Array, pipeOptions: Record<string, unknown>) => {
      const language = String(pipeOptions.language)
      const logits = language === 'en' ? new Float32Array([2, 0]) : new Float32Array([0, 0])
      for (const proc of (pipeOptions.logits_processor as Array<(ids: unknown, value: { data: Float32Array }) => unknown>) ?? []) {
        proc(null, { data: logits })
      }
      return language === 'en'
        ? { text: speech, chunks: [{ text: speech, timestamp: [0, 4] as [number, number | null] }] }
        : { text: german, chunks: [{ text: german, timestamp: [0, 4] as [number, number | null] }] }
    }) as unknown as import('./localTranscribe').AsrPipeline
    const internals = pipe as unknown as { model: unknown; processor: unknown }
    internals.model = {
      generation_config: { decoder_start_token_id: 50258, lang_to_id: { '<|en|>': EN, '<|de|>': DE } },
      generate: async (genOptions: { logits_processor?: Array<(ids: unknown, logits: { data: Float32Array }) => unknown> }) => {
        const logits = new Float32Array(DE + 1)
        logits[DE] = 1
        for (const proc of genOptions.logits_processor ?? []) proc(null, { data: logits })
        return {}
      },
    }
    internals.processor = { feature_extractor: async () => ({ input_features: {} }) }
    const result = await transcribeWindows(pipe, tone(10), 'auto', () => {})
    expect(result.language).toBe('de')
    expect(result.text).toBe(german)
  })

  it('falls back to English when the probe internals are unavailable', async () => {
    const { pipe, languages } = stubPipeWithProbe(
      [{ text: speech, chunks: [{ text: speech, timestamp: [0, 4] }] }],
      null, // no model/processor internals at all
    )
    const result = await transcribeWindows(pipe, tone(30), 'auto', () => {})
    expect(languages).toEqual(['en'])
    expect(result.language).toBe('en')
    expect(result.text).toBe(speech)
  })
})
