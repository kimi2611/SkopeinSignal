import { useSyncExternalStore } from 'react'
import { transcribeOnServer, type ServerModelTier } from './transcribeServer'
import {
  transcribeLocally,
  type AsrLanguage,
  type AsrModelTier,
  type TranscribeProgress,
  type TranscribeResult,
} from './localTranscribe'

export type TranscriptionRunner = (
  data: ArrayBuffer,
  language: AsrLanguage,
  onProgress: (progress: TranscribeProgress) => void,
  options: { model: AsrModelTier; audioContext?: AudioContext },
) => Promise<TranscribeResult>

export type TranscriptionProvider = 'local' | 'server'

export type ServerRunner = typeof transcribeOnServer

export interface TranscriptionJobInput {
  episodeId: string
  data: ArrayBuffer
  filename: string
  language: AsrLanguage
  model: AsrModelTier
  audioContext?: AudioContext
  /** Defaults to 'local': the on-device path is still the one that needs no token. */
  provider?: TranscriptionProvider
  /** Server path only. */
  token?: string
  contentType?: string
  /** Server path only: which faster-whisper tier to run. */
  tier?: ServerModelTier
}

export interface TranscriptionJob {
  id: string
  episodeId: string
  filename: string
  provider: TranscriptionProvider
  status: 'queued' | 'running' | 'done' | 'error'
  progress: TranscribeProgress
  result?: TranscribeResult
  error?: string
  /** 1-based position while queued; absent once running. */
  queuePosition?: number
  /** A completed result is delivered to the listening desk exactly once. */
  consumed: boolean
}

let sequence = 0

/**
 * Module-level owner for on-device transcription. The runner deliberately does
 * not live in StudySetup: changing modules only unsubscribes that view, while
 * inference, progress and the finished VTT remain here until the desk consumes
 * them. Nothing is persisted to storage; reloading the browser still cancels
 * local inference, which cannot be resumed honestly without a page reload.
 */
export class TranscriptionJobStore {
  private jobs = new Map<string, TranscriptionJob>()
  private listeners = new Set<() => void>()
  private localRunner: TranscriptionRunner
  private serverRunner: ServerRunner
  /**
   * One job at a time, across both providers. The server runs three CPU threads
   * on a four-core box and local inference saturates the same cores, so a second
   * concurrent job does not halve the wait — it doubles both.
   */
  private queue: Array<{ id: string; input: TranscriptionJobInput }> = []
  private active: string | null = null

  constructor(
    localRunner: TranscriptionRunner = transcribeLocally,
    serverRunner: ServerRunner = transcribeOnServer,
  ) {
    this.localRunner = localRunner
    this.serverRunner = serverRunner
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }

  private update(id: string, patch: Partial<TranscriptionJob>): void {
    const current = this.jobs.get(id)
    if (!current) return
    this.jobs.set(id, { ...current, ...patch })
    this.emit()
  }

  latestForEpisode = (episodeId: string): TranscriptionJob | undefined => {
    let found: TranscriptionJob | undefined
    for (const job of this.jobs.values()) if (job.episodeId === episodeId) found = job
    return found
  }

  latest = (): TranscriptionJob | undefined => {
    let found: TranscriptionJob | undefined
    for (const job of this.jobs.values()) found = job
    return found
  }

  start(input: TranscriptionJobInput): string {
    const existing = this.latestForEpisode(input.episodeId)
    if (existing?.status === 'running' || existing?.status === 'queued') return existing.id

    const provider = input.provider ?? 'local'
    const id = `transcription-${Date.now()}-${++sequence}`
    const busy = this.active !== null
    const job: TranscriptionJob = {
      id,
      episodeId: input.episodeId,
      filename: input.filename,
      provider,
      status: busy ? 'queued' : 'running',
      progress: busy
        ? { stage: 'queued', progress: 0, detail: `waiting for the current job · ${this.queue.length + 1} in line` }
        : { stage: provider === 'server' ? 'uploading' : 'checking', progress: 0 },
      queuePosition: busy ? this.queue.length + 1 : undefined,
      consumed: false,
    }
    this.jobs.set(id, job)
    if (busy) {
      this.queue.push({ id, input })
      this.emit()
      return id
    }
    this.active = id
    this.emit()
    void this.run(id, input)
    return id
  }

  /** Queue positions shift every time a job is promoted; rewrite them all. */
  private renumberQueue(): void {
    this.queue.forEach((entry, index) => {
      const job = this.jobs.get(entry.id)
      if (!job) return
      const position = index + 1
      this.jobs.set(entry.id, {
        ...job,
        queuePosition: position,
        progress: job.status === 'queued'
          ? { stage: 'queued', progress: 0, detail: position === 1 ? 'next up' : `waiting · ${position} in line` }
          : job.progress,
      })
    })
  }

  private pump(): void {
    if (this.active !== null) return
    const next = this.queue.shift()
    if (!next) return
    this.active = next.id
    this.update(next.id, {
      status: 'running',
      queuePosition: undefined,
      progress: { stage: next.input.provider === 'server' ? 'uploading' : 'checking', progress: 0 },
    })
    this.renumberQueue()
    this.emit()
    void this.run(next.id, next.input)
  }

  private async run(id: string, input: TranscriptionJobInput): Promise<void> {
    const provider = input.provider ?? 'local'
    try {
      const result = provider === 'server'
        ? await this.serverRunner(
            input.data,
            input.language,
            (progress) => this.update(id, { progress }),
            { token: input.token, contentType: input.contentType, tier: input.tier },
          )
        : await this.localRunner(
            input.data,
            input.language,
            (progress) => this.update(id, { progress }),
            { model: input.model, audioContext: input.audioContext },
          )
      this.update(id, { status: 'done', result, progress: { stage: 'done', progress: 1 } })
    } catch (reason) {
      this.update(id, {
        status: 'error',
        error: reason instanceof Error ? reason.message : 'transcription-failed',
      })
    } finally {
      // The decoder normally closes this itself. Early model-load failures do
      // not reach decoding, so ownership remains with the job, not the view.
      const context = input.audioContext
      if (context && context.state !== 'closed') void context.close().catch(() => undefined)
      this.active = null
      this.pump()
    }
  }

  consume(id: string): void {
    const job = this.jobs.get(id)
    if (job?.status === 'done' && !job.consumed) this.update(id, { consumed: true })
  }

  dismiss(id: string): void {
    const job = this.jobs.get(id)
    if (job?.status === 'queued') {
      this.queue = this.queue.filter((entry) => entry.id !== id)
      this.jobs.delete(id)
      this.renumberQueue()
      this.emit()
      return
    }
    if (job && job.status !== 'running') {
      this.jobs.delete(id)
      this.emit()
    }
  }
}

export const transcriptionJobs = new TranscriptionJobStore()

/** Subscribe a view without giving it ownership of the underlying task. */
export function useTranscriptionJob(episodeId?: string): TranscriptionJob | undefined {
  return useSyncExternalStore(
    transcriptionJobs.subscribe,
    () => episodeId ? transcriptionJobs.latestForEpisode(episodeId) : transcriptionJobs.latest(),
  )
}
