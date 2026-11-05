import { describe, expect, it } from 'vitest'
import { buildObsidianNewUri, OBSIDIAN_DIRECT_URI_MAX } from './obsidian'

describe('Obsidian new-note URI', () => {
  it('encodes the Vault, nested note path and complete Markdown content', () => {
    const uri = buildObsidianNewUri({ vault: 'Listening Vault', file: 'Podcasts/Listening/Note #1.md', content: '# Ideas\n\nObserve & listen.' })
    expect(uri.startsWith('obsidian://new?')).toBe(true)
    const params = new URLSearchParams(uri.slice('obsidian://new?'.length))
    expect(params.get('vault')).toBe('Listening Vault')
    expect(params.get('file')).toBe('Podcasts/Listening/Note #1.md')
    expect(params.get('content')).toBe('# Ideas\n\nObserve & listen.')
    expect(params.get('clipboard')).toBeNull()
  })

  it('uses clipboard mode instead of duplicating content in the URI', () => {
    const uri = buildObsidianNewUri({ file: 'SkopeinSignal/Notes.md', content: 'not inlined', clipboard: true })
    const params = new URLSearchParams(uri.slice('obsidian://new?'.length))
    expect(params.get('clipboard')).toBe('true')
    expect(params.get('content')).toBeNull()
    expect(params.get('vault')).toBeNull()
  })

  it('keeps the direct-transfer guard explicitly conservative', () => {
    expect(OBSIDIAN_DIRECT_URI_MAX).toBe(7000)
    const long = buildObsidianNewUri({ file: 'Notes.md', content: 'x'.repeat(7000) })
    expect(long.length).toBeGreaterThan(OBSIDIAN_DIRECT_URI_MAX)
  })
})
