import { describe, expect, it } from 'vitest'
import { parseVocabularyFileText, parseVocabularyLines } from './vocabularyImport'

describe('vocabulary list import', () => {
  it('preserves every existing manual-paste format and ignores blank lines', () => {
    expect(parseVocabularyLines('\uFEFFserendipity = 意外之喜\naufmerksam, 专注的\n阈值，threshold\nfrüh\tearly\n\nword\n')).toEqual([
      { surface: 'serendipity', translation: '意外之喜' },
      { surface: 'aufmerksam', translation: '专注的' },
      { surface: '阈值', translation: 'threshold' },
      { surface: 'früh', translation: 'early' },
      { surface: 'word', translation: '' },
    ])
  })

  it('reimports the site’s seven-column CSV by header, including commas and escaped quotes', () => {
    const csv = '\uFEFF"Word","Translation","Language","Context","Timestamp","Episode","Show"\n"observe","观察","English","Observe, then ""listen"".","01:05","An episode, with commas","The ""Listening"" Show"\n'
    expect(parseVocabularyFileText(csv, 'csv')).toEqual([{ surface: 'observe', translation: '观察' }])
  })

  it('accepts headerless quoted CSV without losing commas inside translations', () => {
    expect(parseVocabularyFileText('"nuance","细微差别，语义差异"\n"allein","单独的"\n', 'csv')).toEqual([
      { surface: 'nuance', translation: '细微差别，语义差异' },
      { surface: 'allein', translation: '单独的' },
    ])
  })

  it('supports Chinese and English TSV headers', () => {
    expect(parseVocabularyFileText('单词\t释义\n阈值\tthreshold\n', 'tsv')).toEqual([{ surface: '阈值', translation: 'threshold' }])
    expect(parseVocabularyFileText('Word\tTranslation\nfrüh\tearly\n', 'tsv')).toEqual([{ surface: 'früh', translation: 'early' }])
  })

  it('allows word-only entries and skips rows with an empty word cell', () => {
    expect(parseVocabularyFileText('Word,Translation\nobserve,\n,orphan translation\n', 'csv')).toEqual([{ surface: 'observe', translation: '' }])
  })

  it('flattens whitespace from quoted multiline cells', () => {
    expect(parseVocabularyFileText('"multi\nline","first line\nsecond line"', 'csv')).toEqual([{ surface: 'multi line', translation: 'first line second line' }])
  })

  it('rejects an unfinished quoted cell instead of importing a corrupt list', () => {
    expect(() => parseVocabularyFileText('"unfinished,translation', 'csv')).toThrow('INVALID_DELIMITED_FILE')
  })

  it('returns no entries for an empty file or a header-only file', () => {
    expect(parseVocabularyFileText('', 'txt')).toEqual([])
    expect(parseVocabularyFileText('Word,Translation\n', 'csv')).toEqual([])
  })
})
