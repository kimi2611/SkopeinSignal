/**
 * Whisper Lab — a standalone, login-free test bench for the on-device
 * speech-to-text path (and, once the sidecar exists, a server-side
 * faster-whisper control group).
 *
 * Deliberately outside WorkspaceProvider: the whole point is to open this on an
 * iPad before signing in and answer one question honestly — can this device run
 * Whisper in a tab, how fast, and how close is the result to a server run?
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  checkAsrSupport,
  transcribeLocally,
  type AsrLanguage,
  type AsrModelTier,
  type AsrStage,
  type TranscribeProgress,
  type TranscribeResult,
} from '../lib/localTranscribe'
import { clearModelCache, modelCacheStatus } from '../lib/modelStore'
import { probeOpusCompression, type CompressorProbeResult } from '../lib/compressorProbe'
import { transcribeOnServer } from '../lib/transcribeServer'

type StageMark = { stage: AsrStage; at: number; progress: number; detail?: string }

interface ServerResult {
  text: string
  vtt?: string
  ms: number
  model?: string
  error?: string
}

const STAGE_LABEL: Record<AsrStage, string> = {
  queued: 'Queued',
  checking: 'Check browser',
  downloading: 'Download model',
  initializing: 'Compile ONNX session',
  decoding: 'Decode audio',
  uploading: 'Upload audio',
  transcribing: 'Transcribe',
  done: 'Done',
}

function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function detectPlatform(): string {
  const ua = navigator.userAgent
  if (/iPad/.test(ua)) return 'iPad (iPadOS)'
  if (/iPhone/.test(ua)) return 'iPhone (iOS)'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  return 'Unknown'
}

function osVersion(): string {
  const m = navigator.userAgent.match(/OS (\d+)[_.](\d+)(?:[_.](\d+))?/)
  return m ? `${m[1]}.${m[2]}${m[3] ? `.${m[3]}` : ''}` : '—'
}

export default function WhisperLabView() {
  const [tier, setTier] = useState<AsrModelTier>('tiny')
  const [threads, setThreads] = useState<string>('auto')
  const [language, setLanguage] = useState<AsrLanguage>('auto')
  const [file, setFile] = useState<File | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<TranscribeProgress | null>(null)
  const [marks, setMarks] = useState<StageMark[]>([])
  const [result, setResult] = useState<TranscribeResult | null>(null)
  const [error, setError] = useState('')
  const [serverBusy, setServerBusy] = useState(false)
  const [serverNote, setServerNote] = useState('')
  // The bench defaults to the always-resident tier so a first test cannot cost
  // the server 1.5 GB of RAM without someone asking for it.
  const [serverTier, setServerTier] = useState<'small' | 'medium'>('small')
  const [serverElapsed, setServerElapsed] = useState(0)
  const [probe, setProbe] = useState<{ ms: number; ttfb: number; bytes: number; status: number; error?: string } | null>(null)
  const [probing, setProbing] = useState(false)
  const [cacheStatus, setCacheStatus] = useState<{ files: number; bytes: number } | null>(null)
  const [server, setServer] = useState<ServerResult | null>(null)
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem('skopein.whisper.token') ?? '' } catch { return '' }
  })
  const [compressor, setCompressor] = useState<CompressorProbeResult | null>(null)
  const [probingCompressor, setProbingCompressor] = useState(false)
  const startedAt = useRef(0)
  const audioInputRef = useRef<HTMLInputElement | null>(null)

  const support = useMemo(() => checkAsrSupport(), [])

  const refreshCacheStatus = useCallback(async () => {
    try {
      setCacheStatus(await modelCacheStatus(`onnx-community/whisper-${tier}`))
    } catch {
      setCacheStatus(null)
    }
  }, [tier])

  useEffect(() => { void refreshCacheStatus() }, [refreshCacheStatus])

  const webgpu = useMemo(() => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu
    return typeof gpu?.requestAdapter === 'function' ? 'available' : 'not exposed'
  }, [])

  const diagnostics = useMemo(() => {
    const nav = navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number }
    return [
      ['Device', `${detectPlatform()} · OS ${osVersion()}`],
      ['Browser', navigator.userAgent.slice(0, 120)],
      ['CPU cores', String(nav.hardwareConcurrency ?? '—')],
      ['Device memory', nav.deviceMemory ? `${nav.deviceMemory} GB (approx.)` : 'not exposed'],
      ['WASM SIMD', support.missing.includes('wasm-simd') ? 'MISSING' : 'ok'],
      ['BigInt64', support.missing.includes('bigint64') ? 'MISSING' : 'ok'],
      ['WebAudio', support.missing.includes('webaudio') ? 'MISSING' : 'ok'],
      ['SharedArrayBuffer', typeof SharedArrayBuffer === 'undefined' ? 'not available (single-thread WASM)' : 'available'],
      ['Cross-origin isolated', window.crossOriginIsolated ? 'yes — SharedArrayBuffer + worker threads usable' : 'no — single-threaded WASM'],
      ['WebGPU', webgpu],
      ['WebCodecs AudioDecoder', typeof (window as unknown as { AudioDecoder?: unknown }).AudioDecoder === 'function' ? 'ok' : 'absent'],
    ] as [string, string][]
  }, [support, webgpu])

  const runProbe = useCallback(async () => {
    if (probing) return
    setProbing(true); setProbe(null)
    const url = `${window.location.origin}/models/onnx-community/whisper-tiny/resolve/main/onnx/encoder_model_quantized.onnx`
    const t0 = performance.now()
    try {
      // 2 MB slice: enough to measure throughput, small enough that a dead link
      // costs seconds instead of minutes.
      const res = await fetch(url, { headers: { Range: 'bytes=0-2097151' } })
      const ttfb = performance.now() - t0
      if (!res.ok || !res.body) {
        setProbe({ ms: ttfb, ttfb, bytes: 0, status: res.status, error: `HTTP ${res.status}` })
        return
      }
      const reader = res.body.getReader()
      let bytes = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value?.byteLength ?? 0
        if (bytes >= 2 * 1024 * 1024) { void reader.cancel(); break }
      }
      setProbe({ ms: performance.now() - t0, ttfb, bytes, status: res.status })
    } catch (err) {
      setProbe({ ms: performance.now() - t0, ttfb: 0, bytes: 0, status: 0, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setProbing(false)
    }
  }, [probing])

  const run = useCallback(async () => {
    if (!file || running) return
    setRunning(true); setError(''); setResult(null); setServer(null); setMarks([]); setProgress(null)
    startedAt.current = performance.now()
    const push = (p: TranscribeProgress) => {
      setProgress(p)
      setMarks((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.stage === p.stage) {
          // Same stage keeps its arrival time but takes the newest detail: the
          // first event of "downloading" is always "0.0 MB", which told nobody
          // anything except that something had started.
          if (last.detail === p.detail) return prev
          return [...prev.slice(0, -1), { ...last, progress: p.progress, detail: p.detail }]
        }
        return [...prev, { stage: p.stage, at: performance.now() - startedAt.current, progress: p.progress, detail: p.detail }]
      })
    }
    try {
      const data = await file.arrayBuffer()
      const asr = await transcribeLocally(data, language, push, {
        model: tier,
        threads: threads === 'auto' ? undefined : Number(threads),
      })
      setResult(asr)
      push({ stage: 'done', progress: 1 })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
      // The status line is the only evidence the user has that the 41 MB they
      // just paid for is actually on disk; it used to go stale at "0 files".
      void refreshCacheStatus()
    }
  }, [file, language, running, tier, threads, refreshCacheStatus])

  // A 14 MB upload on a 50 KB/s link plus CPU transcription is a ten-minute
  // silent wait. Without a moving clock users read that as "hung".
  useEffect(() => {
    if (!serverBusy) return
    const started = performance.now()
    setServerElapsed(0)
    const id = window.setInterval(() => {
      setServerElapsed(Math.round((performance.now() - started) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [serverBusy])

  const runServer = useCallback(async () => {
    if (!file || serverBusy) return
    setServerBusy(true); setServer(null); setServerNote('')
    const t0 = performance.now()
    // Same pipeline as the listening desk: upload with real progress, then poll
    // the job. A single fetch that must survive ten silent minutes is exactly
    // what Safari killed here — "Load failed" while the proxy logged
    // "context canceled", i.e. the browser hung up, not the server.
    try {
      const data = await file.arrayBuffer()
      const asr = await transcribeOnServer(data, language, (p: TranscribeProgress) => {
        const pct = Math.round((p.progress ?? 0) * 100)
        const label = p.stage === 'uploading' ? `Uploading ${pct}%` : p.stage === 'queued' ? 'Queued on the server…' : `Transcribing ${pct}%`
        setServerNote(`${label}${p.detail ? ` · ${p.detail}` : ''}`)
      }, { token: token.trim(), tier: serverTier })
      const ms = performance.now() - t0
      setServer({ text: asr.text, vtt: asr.vtt, ms, model: asr.model })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const friendly = message === 'not-deployed'
        ? 'Server control group not deployed yet — endpoint /api/transcribe is not live.'
        : message === 'unauthorized'
          ? 'Unauthorized — paste the bench token below, then run again.'
          : message === 'rate-limited'
            ? 'Twelve transcriptions this hour from this address — the quota resets within the hour. Failed uploads no longer count, only ones the server actually received.'
          : message === 'server-busy'
            ? 'The server is busy with another file (one job at a time, 12 per hour). Try again shortly.'
          : message === 'network-error'
            ? 'The connection dropped mid-upload, so the server never received a complete file. Check the Wi-Fi and run again — this is not the server rejecting you.'
          : message.startsWith('upload-gave-up')
            ? 'Upload kept failing on one part, so it stopped. The parts already sent are still on the server — run it again and it resumes from there instead of starting over.'
          : message.startsWith('upload-stalled')
            ? 'Upload stalled — no bytes moved for 45 seconds, so it was stopped instead of hanging. Check the network and run again; on a slow uplink send the file through Kimi Claw instead.'
          : message === 'cancelled'
            ? 'Cancelled.'
          : message.startsWith('server-error')
            ? `The server rejected the job: ${message.replace(/^server-error:?\s*/, '')}`
            : message.startsWith('out-of-memory')
              ? `The server refused to load that model: ${message.replace(/^out-of-memory:?\s*/, '') || 'not enough RAM'}. Switch to small, or free memory in Settings.`
              : message
      setServer({ text: '', ms: performance.now() - t0, error: friendly })
    } finally {
      setServerBusy(false)
    }
  }, [file, language, serverBusy, token, serverTier])

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const total = result ? marks[marks.length - 1]?.at ?? performance.now() - startedAt.current : 0

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 20px 80px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif', color: '#1b1917' }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#8a7f72' }}>SkopeinSignal · Test Net</div>
        <h1 style={{ fontSize: 30, margin: '6px 0 8px', fontWeight: 650 }}>Whisper Lab</h1>
        <p style={{ margin: 0, color: '#5c544c', lineHeight: 1.6, maxWidth: 640 }}>
          On-device speech-to-text bench. Everything runs inside this browser tab — no upload, no API key.
          Pick an audio file, run it, and compare against the server-side faster-whisper control group once it is deployed.
        </p>
      </header>

      <section style={cardStyle}>
        <h2 style={h2Style}>1 · Device capabilities</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {diagnostics.map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '5px 12px 5px 0', color: '#8a7f72', whiteSpace: 'nowrap', verticalAlign: 'top' }}>{k}</td>
                <td style={{ padding: '5px 0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: support.ok ? '#eef6ee' : '#fbeeee', color: support.ok ? '#2f5d33' : '#8b2f2f', fontSize: 13 }}>
          {support.ok
            ? 'This browser can run Whisper locally.'
            : `This browser cannot run Whisper locally — missing: ${support.missing.join(', ')}. Use the server control group.`}
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>2 · Run locally</h2>
        <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: '#faf6ef', border: '1px solid #efe6d8' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={runProbe} disabled={probing} style={{ ...ghostButtonStyle, opacity: probing ? 0.5 : 1 }}>
              {probing ? 'Measuring…' : 'Measure model download speed (2 MB)'}
            </button>
            <span style={{ fontSize: 12, color: '#8a7f72' }}>Run this first — it tells us whether a 41 MB model is even practical on this link.</span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: '#8a7f72' }}>
            Model cache: {cacheStatus ? `${cacheStatus.files} file${cacheStatus.files === 1 ? '' : 's'} · ${(cacheStatus.bytes / 1024 / 1024).toFixed(1)} MB ready` : 'checking…'}
            <button
              onClick={async () => { await clearModelCache(); void refreshCacheStatus() }}
              style={{ ...ghostButtonStyle, marginLeft: 10, padding: '2px 8px', fontSize: 11.5 }}
            >
              Clear cached model
            </button>
          </div>
          {probe && (
            <div style={{ marginTop: 8, fontSize: 12.5, fontFamily: 'ui-monospace, monospace', color: probe.error ? '#8b2f2f' : '#2f5d33' }}>
              {probe.error
                ? `Failed: ${probe.error}`
                : `${(probe.bytes / 1024 / 1024).toFixed(2)} MB in ${(probe.ms / 1000).toFixed(1)} s · ${(probe.bytes / 1024 / probe.ms * 1000).toFixed(0)} KB/s · first byte ${(probe.ttfb / 1000).toFixed(1)} s · HTTP ${probe.status}`}
              {!probe.error && probe.bytes > 0 && (
                <span style={{ color: '#5c544c' }}> — 41 MB model ≈ {Math.ceil(41 * 1024 / (probe.bytes / 1024 / probe.ms * 1000) / 60)} min to download</span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <label style={labelStyle}>
            Model
            <select value={tier} onChange={(e) => setTier(e.target.value as AsrModelTier)} disabled={running} style={inputStyle}>
              <option value="tiny">tiny (~40 MB)</option>
              <option value="base">base (~80 MB)</option>
            </select>
          </label>
          <label style={labelStyle}>
            WASM threads
            <select value={threads} onChange={(e) => setThreads(e.target.value)} disabled={running} style={inputStyle}>
              <option value="auto">auto (single — threaded hangs)</option>
              <option value="1">1 (single)</option>
              <option value="2">2</option>
              <option value="4">4</option>
            </select>
          </label>
          <label style={labelStyle}>
            Language
            <select value={language} onChange={(e) => setLanguage(e.target.value as AsrLanguage)} disabled={running} style={inputStyle}>
              <option value="auto">auto-detect</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </label>
          <div style={labelStyle}>
            Audio file
            {/*
              Same shape as the study setup screen, which is proven on the
              user's iPad: a hidden input fired by a button. iOS Safari drops a
              selection when the input sits inside a <label> (the label forwards
              the tap a second time and cancels the picker), and it never fires
              change when the same file is chosen twice.
            */}
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              disabled={running}
              style={{ ...ghostButtonStyle, marginTop: 4, opacity: running ? 0.5 : 1 }}
            >
              {file ? 'Choose a different file' : 'Choose file'}
            </button>
            {/*
              No accept filter on purpose. iOS greys out files whose UTI it
              cannot resolve — an m4a that arrived through another app often
              resolves to plain data, so the row looks normal but refuses to
              open. Filtering after the choice is the same guarantee, minus the
              dead taps.
            */}
            <input
              ref={audioInputRef}
              className="sr-only"
              type="file"
              disabled={running}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                e.target.value = ''
                setFile(picked)
                setResult(null)
                setError('')
                setMarks([])
              }}
            />
          </div>
        </div>
        {file && <div style={{ fontSize: 12.5, color: '#2f5d33', marginBottom: 12 }}>✓ {file.name} · {fmtBytes(file.size)}</div>}
        <button
          onClick={run}
          disabled={!file || running || !support.ok}
          style={{ ...buttonStyle, opacity: !file || running || !support.ok ? 0.5 : 1 }}
        >
          {running ? 'Running…' : 'Transcribe in this browser'}
        </button>

        {progress && (
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
              <span>
                {STAGE_LABEL[progress.stage]}
                {progress.stage === 'downloading' && <span style={{ color: '#8a7f72', fontWeight: 400 }}> · overall</span>}
              </span>
              <span style={{ fontFamily: 'ui-monospace, monospace', color: '#8a7f72' }}>
                {progress.progress > 0 ? `${Math.round(progress.progress * 100)}%` : ''} {progress.detail ?? ''}
              </span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: '#eee7dd', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.max(2, progress.progress * 100)}%`, background: '#1b1917', transition: 'width .3s' }} />
            </div>
          </div>
        )}

        {marks.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 18 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8a7f72' }}>
                <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Stage</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Reached at</th>
                <th style={{ padding: '4px 8px', fontWeight: 500 }}>Delta</th>
                <th style={{ padding: '4px 0 4px 8px', fontWeight: 500 }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {marks.map((m, i) => (
                <tr key={`${m.stage}-${i}`}>
                  <td style={{ padding: '4px 8px 4px 0' }}>{STAGE_LABEL[m.stage]}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace' }}>{fmtMs(m.at)}</td>
                  <td style={{ padding: '4px 8px', fontFamily: 'ui-monospace, monospace', color: '#8a7f72' }}>{i === 0 ? '—' : `+${fmtMs(m.at - marks[i - 1].at)}`}</td>
                  <td style={{ padding: '4px 0 4px 8px', color: '#8a7f72' }}>{m.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && (
          <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: '#fbeeee', color: '#8b2f2f', fontSize: 13, fontFamily: 'ui-monospace, monospace', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: '#5c544c', marginBottom: 10 }}>
              Total <b>{fmtMs(total)}</b> · channel <b>{result.channel}</b> · model <b>{result.model}</b> · language <b>{result.languages.join(' + ')}</b> · {result.text.trim().split(/\s+/).filter(Boolean).length} words
            </div>
            <textarea
              readOnly
              value={result.text}
              style={{ width: '100%', minHeight: 180, padding: 12, borderRadius: 8, border: '1px solid #e2d9cc', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical', background: '#fcfaf6' }}
            />
            <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
              <button style={ghostButtonStyle} onClick={() => download(`${file?.name ?? 'audio'}-local.vtt`, result.vtt)}>Download VTT (local)</button>
              <button style={ghostButtonStyle} onClick={() => navigator.clipboard?.writeText(result.text)}>Copy text</button>
            </div>
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>3 · Server control group (faster-whisper)</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5c544c' }}>
          Uploads the same file to the staging server and transcribes it with faster-whisper. Use this to judge how much quality and speed the local model gives up.
        </p>
        <label style={{ display: 'block', margin: '0 0 10px', fontSize: 12.5, color: '#5c544c' }}>
          Access token&nbsp;
          <input
            type="password"
            value={token}
            onChange={(e) => {
              setToken(e.target.value)
              try { localStorage.setItem('skopein.whisper.token', e.target.value) } catch { /* private mode */ }
            }}
            placeholder="WHISPER_API_TOKEN"
            style={{ width: 260, padding: '6px 8px', borderRadius: 6, border: '1px solid #e2d9cc', fontSize: 12.5 }}
          />
        </label>
        <button onClick={runServer} disabled={!file || serverBusy} style={{ ...buttonStyle, opacity: !file || serverBusy ? 0.5 : 1 }}>
          {serverBusy ? `Server working… ${serverElapsed}s` : 'Transcribe on server'}
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginLeft: 12, fontSize: 12.5, color: '#5c544c' }}>
          Model
          <select value={serverTier} disabled={serverBusy} onChange={(e) => setServerTier(e.target.value as 'small' | 'medium')} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e2d9cc', fontSize: 12.5 }}>
            <option value="small">small — fast, always resident</option>
            <option value="medium">medium — slower, more accurate, loads 1.5 GB</option>
          </select>
        </label>
        {serverBusy && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: '#8a7f72' }}>
            {serverNote || 'Starting…'}<br />
            Elapsed {serverElapsed}s. Keep this tab in front and the screen awake — iPadOS suspends background tabs.
          </div>
        )}
        {server && (
          <div style={{ marginTop: 16 }}>
            {server.error ? (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fdf6e8', color: '#7a5a1f', fontSize: 13 }}>{server.error}</div>
            ) : (
              <>
                <div style={{ fontSize: 13, color: '#5c544c', marginBottom: 10 }}>
                  Round trip <b>{fmtMs(server.ms)}</b>{server.model ? <> · model <b>{server.model}</b></> : null}
                </div>
                <textarea
                  readOnly
                  value={server.text}
                  style={{ width: '100%', minHeight: 150, padding: 12, borderRadius: 8, border: '1px solid #e2d9cc', fontFamily: 'ui-monospace, monospace', fontSize: 12.5, lineHeight: 1.6, resize: 'vertical', background: '#fcfaf6' }}
                />
              </>
            )}
          </div>
        )}
      </section>

      <section style={cardStyle}>
        <h2 style={h2Style}>4 · Upload compression (Opus)</h2>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5c544c' }}>
          On a slow link the upload is the cost, not the transcription. A 15 minute episode is 14 MB as MP3 but about 2.7 MB as Opus at 24 kbit/s. This checks whether this device can encode Opus at all — it runs on a synthetic 3 second tone, no audio leaves the device.
        </p>
        <button
          onClick={async () => {
            setProbingCompressor(true)
            setCompressor(null)
            try { setCompressor(await probeOpusCompression()) } finally { setProbingCompressor(false) }
          }}
          disabled={probingCompressor}
          style={{ ...buttonStyle, opacity: probingCompressor ? 0.5 : 1 }}
        >
          {probingCompressor ? 'Probing…' : 'Check Opus encoding support'}
        </button>
        {compressor && (
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.9, fontFamily: 'ui-monospace, monospace', color: '#3d3a35' }}>
            <div>verdict: <b>{compressor.verdict}</b></div>
            <div>WebCodecs AudioEncoder: {compressor.webCodecs ? 'present' : 'absent'}</div>
            <div>opus config supported: {compressor.webCodecsOpus ? 'yes' : 'no'}{compressor.webCodecsError ? ` (${compressor.webCodecsError})` : ''}</div>
            {compressor.encodedBytes !== undefined && (
              <div>3 s tone encoded: {compressor.encodedBytes} bytes · {compressor.encodedMs} ms · ≈{compressor.effectiveKbps} kbps</div>
            )}
            <div>MediaRecorder opus types: {compressor.mediaRecorderOpus.length ? compressor.mediaRecorderOpus.join(', ') : 'none'}</div>
          </div>
        )}
      </section>

      <p style={{ fontSize: 12, color: '#8a7f72', lineHeight: 1.7 }}>
        Test net page — not linked from the app navigation, no login required, nothing stored server-side except the temporary audio file of a control-group run.
      </p>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fffdf9',
  border: '1px solid #ece3d7',
  borderRadius: 14,
  padding: '18px 20px',
  marginBottom: 18,
}

const h2Style: React.CSSProperties = {
  fontSize: 15,
  margin: '0 0 14px',
  fontWeight: 600,
  letterSpacing: 0.2,
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 12,
  color: '#8a7f72',
}

const inputStyle: React.CSSProperties = {
  padding: '7px 9px',
  borderRadius: 8,
  border: '1px solid #ded4c6',
  fontSize: 13,
  background: '#fff',
  color: '#1b1917',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 10,
  border: 'none',
  background: '#1b1917',
  color: '#fdf9f2',
  fontSize: 13.5,
  fontWeight: 550,
  cursor: 'pointer',
}

const ghostButtonStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 9,
  border: '1px solid #ded4c6',
  background: 'transparent',
  color: '#1b1917',
  fontSize: 12.5,
  cursor: 'pointer',
}
