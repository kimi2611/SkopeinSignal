import { beforeEach, describe, expect, it, vi } from 'vitest'
import { consumeNotesDraft, consumeStudySetup, consumeStudyTab, openNotesWriter, readStudyEpisode, stageTranscriptForStudy } from './studyNavigation'
import { readSetupDraft, writeSetupDraft } from './studySetupDraft'

class MemoryStorage {
  private map = new Map<string, string>()
  getItem(key: string) { return this.map.get(key) ?? null }
  setItem(key: string, value: string) { this.map.set(key, String(value)) }
  removeItem(key: string) { this.map.delete(key) }
}

beforeEach(() => {
  vi.stubGlobal('sessionStorage', new MemoryStorage())
  vi.stubGlobal('window', {
    location: { hash: '' },
    dispatchEvent: vi.fn(),
    scrollTo: vi.fn(),
  })
})

describe('cross-module study navigation', () => {
  it('stages a notes draft once and navigates without saving workspace content', () => {
    expect(openNotesWriter('episode-1', '# Draft\nContinue here')).toBe(true)
    expect(window.location.hash).toBe('/notes')
    expect(consumeNotesDraft()).toEqual({ episodeId: 'episode-1', body: '# Draft\nContinue here' })
    expect(consumeNotesDraft()).toBeNull()
  })

  it('merges a reclassified transcript into the existing setup draft and opens Listen & Read setup', () => {
    const key = 'skopein.study.setup.episode-1'
    writeSetupDraft(key, { audioMode: 'local', snipdUrl: 'https://share.snipd.com/episode/example' })
    expect(stageTranscriptForStudy('episode-1', 'First paragraph\n\nSecond paragraph', 'source.txt')).toBe(true)
    expect(readSetupDraft(key)).toEqual(expect.objectContaining({
      audioMode: 'local',
      snipdUrl: 'https://share.snipd.com/episode/example',
      transcript: 'First paragraph\n\nSecond paragraph',
      filename: 'source.txt',
    }))
    expect(readStudyEpisode()).toBe('episode-1')
    expect(consumeStudyTab()).toBe('transcript')
    expect(consumeStudySetup()).toBe(true)
    expect(window.location.hash).toBe('/study')
  })

  it('reports staging failure instead of claiming that a transcript was handed off', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable') },
      removeItem: () => undefined,
    })
    expect(stageTranscriptForStudy('episode-1', 'Transcript', 'source.txt')).toBe(false)
    expect(window.location.hash).toBe('')
  })
})
