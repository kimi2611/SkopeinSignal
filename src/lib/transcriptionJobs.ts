import { useSyncExternalStore } from 'react'
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

export interface TranscriptionJobInput {
  episodeId: string
  data: ArrayBuffer
  filename: string
  language: AsrLanguage
  model: AsrModelTier
  audioContext?: AudioContext
}

export interface TranscriptionJob {
  id: string
  episodeId: string
  filename: string
  status: 'running' | 'done' | 'error'
  progress: TranscribeProgress
  result?: TranscribeResult
  error?: string
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
  private runner: TranscriptionRunner

  constructor(runner: TranscriptionRunner = transcribeLocally) {
    this.runner = runner
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
    if (existing?.status === 'running') return existing.id

    const id = `transcription-${Date.now()}-${++sequence}`
    const job: TranscriptionJob = {
      id,
      episodeId: input.episodeId,
      filename: input.filename,
      status: 'running',
      progress: { stage: 'checking', progress: 0 },
      consumed: false,
    }
    this.jobs.set(id, job)
    this.emit()
    void this.run(id, input)
    return id
  }

  private async run(id: string, input: TranscriptionJobInput): Promise<void> {
    try {
      const result = await this.runner(
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
    }
  }

  consume(id: string): void {
    const job = this.jobs.get(id)
    if (job?.status === 'done' && !job.consumed) this.update(id, { consumed: true })
  }

  dismiss(id: string): void {
    const job = this.jobs.get(id)
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
