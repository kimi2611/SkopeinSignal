import { describe, expect, it } from 'vitest'
import { familyByEntry, findLemmaFamilies, lemmaKey } from './lemma'

describe('lemmaKey', () => {
  it('folds English plurals and verb inflections to one family', () => {
    expect(lemmaKey('running', 'English')).toBe(lemmaKey('run', 'English'))
    expect(lemmaKey('runs', 'English')).toBe(lemmaKey('run', 'English'))
    expect(lemmaKey('studies', 'English')).toBe(lemmaKey('study', 'English'))
    expect(lemmaKey('studied', 'English')).toBe(lemmaKey('study', 'English'))
    expect(lemmaKey('watches', 'English')).toBe(lemmaKey('watch', 'English'))
  })

  it('never strips words that merely end in s', () => {
    expect(lemmaKey('this', 'English')).toBe('this')
    expect(lemmaKey('bonus', 'English')).toBe('bonus')
    expect(lemmaKey('is', 'English')).toBe('is')
  })

  it('normalizes case and punctuation before grouping', () => {
    expect(lemmaKey(' Running! ', 'English')).toBe(lemmaKey('running', 'English'))
    expect(lemmaKey('“Run.”', 'English')).toBe('run')
  })

  it('folds regular German endings without touching the stem', () => {
    expect(lemmaKey('machen', 'Deutsch')).toBe('mach')
    expect(lemmaKey('machst', 'Deutsch')).toBe('mach')
    expect(lemmaKey('macht', 'Deutsch')).toBe('mach')
    expect(lemmaKey('mache', 'Deutsch')).toBe('mach')
    expect(lemmaKey('läuft', 'Deutsch')).toBe('läuf')
  })

  it('keeps Chinese surfaces and phrases on exact form', () => {
    expect(lemmaKey('中文', 'Chinese')).toBe('中文')
    expect(lemmaKey('machine learning', 'English')).toBe('machine learning')
  })
})

describe('findLemmaFamilies', () => {
  it('marks multi-form families and leaves lone forms unmarked', () => {
    const entries = [
      { id: '1', surface: 'run', language: 'English' },
      { id: '2', surface: 'running', language: 'English' },
      { id: '3', surface: 'runs', language: 'English' },
      { id: '4', surface: 'solitary', language: 'English' },
    ]
    const families = findLemmaFamilies(entries)
    expect(families.size).toBe(1)
    const family = [...families.values()][0]
    expect(family.memberIds.sort()).toEqual(['1', '2', '3'])
    expect(familyByEntry(entries).has('4')).toBe(false)
  })

  it('does not treat two identical surfaces as a family duplicate', () => {
    const entries = [
      { id: '1', surface: 'run', language: 'English' },
      { id: '2', surface: 'Run', language: 'English' },
    ]
    expect(findLemmaFamilies(entries).size).toBe(0)
  })
})
