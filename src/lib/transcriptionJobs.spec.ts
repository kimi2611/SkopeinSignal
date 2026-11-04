import { describe, expect, it } from 'vitest'
import { TranscriptionJobStore, type TranscriptionRunner } from './transcriptionJobs'
import type { TranscribeResult } from './localTranscribe'

const result: TranscribeResult = {
  vtt: 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHallo. Hello.\n',
  text: 'Hallo. Hello.',
  channel: 'mono',
  model: 'tiny',
  language: 'de',
  languages: ['de', 'en'],
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('TranscriptionJobStore — view-independent on-device transcription', () => {
  it('finishes after every view unsubscribes and retains the result for later collection', async () => {
    const pending = deferred<TranscribeResult>()
    const runner: TranscriptionRunner = (_data, _language, onProgress) => {
      onProgress({ stage: 'transcribing', progress: 0.4 })
      return pending.promise
    }
    const store = new TranscriptionJobStore(runner)
    let notifications = 0
    const unsubscribe = store.subscribe(() => { notifications++ })

    const id = store.start({
      episodeId: 'episode-1', data: new ArrayBuffer(8), filename: 'mixed.mp3', language: 'auto', model: 'tiny',
    })
    expect(store.latestForEpisode('episode-1')?.progress.progress).toBe(0.4)
    expect(notifications).toBeGreaterThan(0)

    unsubscribe() // equivalent to leaving Listen & Read for another module
    pending.resolve(result)
    await pending.promise
    await Promise.resolve()

    const done = store.latestForEpisode('episode-1')
    expect(done?.status).toBe('done')
    expect(done?.result).toEqual(result)
    expect(done?.consumed).toBe(false)
    expect(store.latest()?.id).toBe(id)
  })

  it('delivers a completed transcript only once', async () => {
    const store = new TranscriptionJobStore(async () => result)
    const id = store.start({
      episodeId: 'episode-1', data: new ArrayBuffer(8), filename: 'mixed.mp3', language: 'auto', model: 'tiny',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(store.latestForEpisode('episode-1')?.consumed).toBe(false)
    store.consume(id)
    expect(store.latestForEpisode('episode-1')?.consumed).toBe(true)
    store.consume(id)
    expect(store.latestForEpisode('episode-1')?.result).toEqual(result)
  })

  it('does not start a duplicate runner for an episode already transcribing', () => {
    const pending = deferred<TranscribeResult>()
    let calls = 0
    const store = new TranscriptionJobStore(() => { calls++; return pending.promise })
    const input = {
      episodeId: 'episode-1', data: new ArrayBuffer(8), filename: 'mixed.mp3', language: 'auto' as const, model: 'tiny' as const,
    }
    const first = store.start(input)
    const second = store.start(input)
    expect(second).toBe(first)
    expect(calls).toBe(1)
  })

  it('keeps failures inspectable across modules and allows dismissing them', async () => {
    const store = new TranscriptionJobStore(async () => { throw new Error('model-init-failed') })
    const id = store.start({
      episodeId: 'episode-1', data: new ArrayBuffer(8), filename: 'bad.mp3', language: 'de', model: 'tiny',
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(store.latestForEpisode('episode-1')?.status).toBe('error')
    expect(store.latestForEpisode('episode-1')?.error).toBe('model-init-failed')
    store.dismiss(id)
    expect(store.latestForEpisode('episode-1')).toBeUndefined()
  })
})
