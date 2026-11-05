import { describe, expect, it } from 'vitest'
import { markDefault, parseChannel, parseTier } from './defaultChannel'

describe('default channel preferences', () => {
  it('falls back to the server channel for anything unfamiliar', () => {
    expect(parseChannel(null)).toBe('server')
    expect(parseChannel('nonsense')).toBe('server')
    expect(parseChannel('cloud')).toBe('cloud')
  })

  it('treats every tier except medium as small', () => {
    expect(parseTier('medium')).toBe('medium')
    expect(parseTier('')).toBe('small')
  })

  it('marks one button and leaves the other untouched', () => {
    expect(markDefault('Transcribe on server', 'server', 'server')).toBe('Transcribe on server · your default')
    expect(markDefault('Transcribe on device', 'device', 'server')).toBe('Transcribe on device')
  })
})
