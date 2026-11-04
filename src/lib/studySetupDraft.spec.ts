import { beforeAll, describe, expect, it, vi } from 'vitest'
import { clearSetupDraft, isSetupDraft, readSetupDraft, writeSetupDraft } from './studySetupDraft'

const KEY = 'test.setup.draft'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null }
  setItem(k: string, v: string) { this.map.set(k, String(v)) }
  removeItem(k: string) { this.map.delete(k) }
}

beforeAll(() => {
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})

describe('studySetupDraft', () => {
  it('round-trips a full draft', () => {
    writeSetupDraft(key(), {
      audioMode: 'rss',
      snipdUrl: 'https://share.snipd.com/episode/abc12345',
      audioUrlOverride: 'https://cdn.example.com/ep.mp3',
      snipdResult: {
        feedUrl: 'https://feeds.example.com/show',
        audioUrl: 'https://cdn.example.com/ep.mp3',
        showTitle: 'Show',
        episodeTitle: 'Episode',
        guid: 'g1',
        pubDate: '2026-01-01T00:00:00Z',
        durationSeconds: 3600,
        matchedBy: 'guid',
        warnings: [],
      },
    })
    expect(readSetupDraft(key())).toEqual({
      audioMode: 'rss',
      snipdUrl: 'https://share.snipd.com/episode/abc12345',
      audioUrlOverride: 'https://cdn.example.com/ep.mp3',
      snipdResult: expect.objectContaining({ episodeTitle: 'Episode' }),
    })
  })

  it('keeps an unsaved transcript and its language metadata across module switches', () => {
    writeSetupDraft(key(), {
      audioMode: 'local',
      transcript: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nGuten Morgen',
      filename: 'sample.ondevice.vtt',
      asrChannel: 'mono',
      asrDetectedLangs: ['de', 'en'],
    })
    expect(readSetupDraft(key())).toEqual(expect.objectContaining({
      transcript: expect.stringContaining('Guten Morgen'),
      filename: 'sample.ondevice.vtt',
      asrChannel: 'mono',
      asrDetectedLangs: ['de', 'en'],
    }))
  })

  it('rejects malformed transcription metadata', () => {
    expect(isSetupDraft({ transcript: 42 })).toBe(false)
    expect(isSetupDraft({ asrChannel: 'surround' })).toBe(false)
    expect(isSetupDraft({ asrDetectedLangs: ['fr'] })).toBe(false)
  })

  it('returns null when nothing was written', () => {
    expect(readSetupDraft(`${KEY}.untouched`)).toBeNull()
  })

  it('rejects malformed payloads instead of trusting them', () => {
    sessionStorage.setItem(`${KEY}.bad`, '{"audioMode":"carrier-pigeon"}')
    expect(readSetupDraft(`${KEY}.bad`)).toBeNull()
    sessionStorage.setItem(`${KEY}.bad`, '{"snipdUrl":42}')
    expect(readSetupDraft(`${KEY}.bad`)).toBeNull()
    sessionStorage.setItem(`${KEY}.bad`, 'not json')
    expect(readSetupDraft(`${KEY}.bad`)).toBeNull()
    sessionStorage.setItem(`${KEY}.bad`, '{"snipdResult":{"warnings":["invented-warning"],"audioUrl":null,"feedUrl":null}}')
    expect(readSetupDraft(`${KEY}.bad`)).toBeNull()
  })

  it('accepts a draft without a resolve result', () => {
    expect(isSetupDraft({ audioMode: 'local', snipdUrl: '' })).toBe(true)
    expect(isSetupDraft({})).toBe(true)
    expect(isSetupDraft(null)).toBe(false)
    expect(isSetupDraft('rss')).toBe(false)
  })

  it('clears the draft', () => {
    writeSetupDraft(`${KEY}.clear`, { audioMode: 'rss' })
    clearSetupDraft(`${KEY}.clear`)
    expect(readSetupDraft(`${KEY}.clear`)).toBeNull()
  })
})

function key() {
  return KEY
}
