import { describe, expect, it, vi } from 'vitest'
import { TranscriptionJobStore } from './transcriptionJobs'
import type { TranscriptionRunner } from './transcriptionJobs'
import type { TranscribeResult } from './localTranscribe'
import type { transcribeOnServer } from './transcribeServer'

/**
 * The interesting behaviour is the queue, not the runners: one job at a time
 * across both providers, FIFO, and honest positions. A second concurrent job
 * does not halve the wait on this hardware — it doubles both — so these tests
 * pin the serialisation rather than the transcription.
 */

function result(text: string, model = 'tiny'): TranscribeResult {
  return { vtt: `WEBVTT\n\n${text}\n`, text, channel: 'mono', model, language: 'en', languages: ['en'] }
}

/** A runner whose promises resolve only when the test says so. */
function deferredRunner() {
  const pending: Array<{ text: string; resolve: (r: TranscribeResult) => void }> = []
  const runner: TranscriptionRunner = (data, _language, onProgress, options) => {
    const text = String(data.byteLength)
    onProgress({ stage: 'transcribing', progress: 0.5 })
    return new Promise<TranscribeResult>((resolve) => {
      pending.push({ text: `${text}:${options.model}`, resolve })
    })
  }
  return { runner, pending }
}

function input(episodeId: string, bytes = 4) {
  return {
    episodeId,
    data: new ArrayBuffer(bytes),
    filename: `${episodeId}.m4a`,
    language: 'en' as const,
    model: 'tiny' as const,
  }
}

describe('TranscriptionJobStore queue', () => {
  it('runs one job at a time and promotes the next when it finishes', async () => {
    const { runner, pending } = deferredRunner()
    const store = new TranscriptionJobStore(runner)

    const first = store.start(input('ep-1'))
    const second = store.start(input('ep-2'))

    expect(pending).toHaveLength(1)
    expect(store.latestForEpisode('ep-2')?.status).toBe('queued')
    expect(store.latestForEpisode('ep-2')?.queuePosition).toBe(1)

    pending[0].resolve(result('one'))
    await Promise.resolve()
    await Promise.resolve()

    expect(store.latestForEpisode('ep-1')?.status).toBe('done')
    expect(pending).toHaveLength(2)
    expect(store.latestForEpisode('ep-2')?.status).toBe('running')
    expect(store.latestForEpisode('ep-2')?.queuePosition).toBeUndefined()

    pending[1].resolve(result('two'))
    await Promise.resolve()
    await Promise.resolve()
    expect(store.latestForEpisode('ep-2')?.status).toBe('done')
    expect(first).not.toBe(second)
  })

  it('renumbers positions when a queued job is dismissed', () => {
    const { runner } = deferredRunner()
    const store = new TranscriptionJobStore(runner)

    store.start(input('ep-1'))
    const second = store.start(input('ep-2'))
    const third = store.start(input('ep-3'))

    expect(store.latestForEpisode('ep-3')?.queuePosition).toBe(2)
    store.dismiss(second)
    expect(store.latestForEpisode('ep-2')).toBeUndefined()
    expect(store.latestForEpisode('ep-3')?.queuePosition).toBe(1)
    expect(store.latestForEpisode('ep-3')?.status).toBe('queued')
    expect(third).toBeTruthy()
  })

  it('does not start a duplicate job for an episode already in line', () => {
    const { runner } = deferredRunner()
    const store = new TranscriptionJobStore(runner)

    const first = store.start(input('ep-1'))
    const again = store.start(input('ep-1'))
    expect(again).toBe(first)
  })

  it('dispatches the server provider to the server runner, with the token', async () => {
    const { runner } = deferredRunner()
    const serverRunner = vi.fn(async (...args: Parameters<typeof transcribeOnServer>) =>
      result(String(args[0].byteLength), 'faster-whisper-small'))
    const store = new TranscriptionJobStore(runner, serverRunner)

    const id = store.start({ ...input('ep-9', 1024), provider: 'server', token: 'abc123' })
    await Promise.resolve()
    await Promise.resolve()

    expect(serverRunner).toHaveBeenCalledTimes(1)
    expect(serverRunner.mock.calls[0][3]).toMatchObject({ token: 'abc123' })
    expect(store.latestForEpisode('ep-9')?.provider).toBe('server')
    expect(store.latestForEpisode('ep-9')?.result?.model).toBe('faster-whisper-small')
    expect(id).toBeTruthy()
  })

  it('frees the queue after a failure so the next job still runs', async () => {
    const failing: TranscriptionRunner = () => Promise.reject(new Error('network-error'))
    const { runner, pending } = deferredRunner()
    let calls = 0
    const selective: TranscriptionRunner = (data, language, onProgress, options) => {
      calls += 1
      return calls === 1 ? failing(data, language, onProgress, options) : runner(data, language, onProgress, options)
    }
    const store = new TranscriptionJobStore(selective)

    store.start(input('ep-1'))
    store.start(input('ep-2'))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(store.latestForEpisode('ep-1')?.status).toBe('error')
    expect(store.latestForEpisode('ep-2')?.status).toBe('running')
    expect(pending).toHaveLength(1)
  })
})
