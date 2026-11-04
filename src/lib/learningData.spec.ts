import { describe, expect, it } from 'vitest'
import { ensureIdeaEvolutions, sanitizeLearningCollections } from './learningData'
import type { ResourceReport } from '@contracts/research'
import type { Spark } from '../types'

const report: ResourceReport = {
  query: 'podcast memory',
  searchedAt: '2026-11-04T00:00:00.000Z',
  overallComparison: 'The idea overlaps with retrieval practice but concerns private podcast notes.',
  feasibility: 'A small spaced review experiment is feasible.',
  assumptions: ['The listener reviews after listening'],
  nextExperiment: 'Compare recall after one week.',
  caveats: ['Abstract-only evidence'],
  comparisons: [{
    expertView: 'Retrieval practice can support durable recall.',
    alignment: 'Both connect review to remembered argument.',
    keyDifference: 'The paper studies controlled materials, not private podcast archives.',
    evidenceScope: 'abstract',
    resource: {
      id: 'openalex-1',
      title: 'Retrieval practice and memory',
      authors: ['Researcher'],
      year: 2020,
      venue: 'Journal',
      url: 'https://openalex.org/W123',
      doi: '10.1000/test',
      database: 'OpenAlex',
      abstract: 'A real abstract returned by the search API.',
    },
  }],
}

describe('learning collection migration', () => {
  it('keeps only real HTTPS resource reports with evidence scope and source metadata', () => {
    const cleaned = sanitizeLearningCollections({
      resourceReports: [
        { id: 'saved-1', title: 'Saved report', idea: 'Memory improves when ideas are tested.', episodeId: 'episode-1', sparkId: 'spark-1', report, createdAt: '2026-11-01', updatedAt: '2026-11-01' },
        { id: 'bad', title: 'Bad', idea: 'Unsafe', episodeId: null, sparkId: null, report: { ...report, comparisons: [{ ...report.comparisons[0], resource: { ...report.comparisons[0].resource, url: 'javascript:alert(1)' } }] }, createdAt: '2026-11-01', updatedAt: '2026-11-01' },
      ],
    })
    expect(cleaned.resourceReports).toHaveLength(1)
    expect(cleaned.resourceReports[0].report.comparisons[0].resource.database).toBe('OpenAlex')
    expect(cleaned.resourceReports[0].report.comparisons[0].resource.doi).toBe('10.1000/test')
    expect(cleaned.resourceReports[0].report.comparisons[0].evidenceScope).toBe('abstract')
  })

  it('normalizes invalid task kinds and theme-map roles without deleting valid data', () => {
    const cleaned = sanitizeLearningCollections({
      learningTasks: [{ id: 'task-1', episodeId: 'episode-1', kind: 'unknown', title: 'Rewrite', detail: 'Use the feedback.', sourceId: null, startSeconds: null, status: 'open', createdAt: '2026-11-01', updatedAt: '2026-11-01', completedAt: null }] as unknown as Parameters<typeof sanitizeLearningCollections>[0]['learningTasks'],
      themeMaps: [{ id: 'map-1', title: 'Memory', synthesis: 'Two episodes disagree.', questions: ['What changed?'], claims: [{ claimId: 'claim-1', episodeId: 'episode-1', role: 'invalid' }], episodeIds: ['episode-1', 'episode-2'], createdAt: '2026-11-01', updatedAt: '2026-11-01' }] as unknown as Parameters<typeof sanitizeLearningCollections>[0]['themeMaps'],
    })
    expect(cleaned.learningTasks[0].kind).toBe('note')
    expect(cleaned.themeMaps[0].claims[0].role).toBe('support')
  })

  it('adds origin and AI-question stages to legacy sparks without duplicating existing evolutions', () => {
    const sparks: Spark[] = [
      { id: 'spark-1', episodeId: 'episode-1', text: 'Testing makes listening active.', reply: { evaluation: 'Strong', strengths: [], suggestions: [], followUp: 'What evidence would change your mind?' }, createdAt: '2026-11-01T00:00:00.000Z' },
      { id: 'spark-2', episodeId: null, text: 'Second idea', reply: null, createdAt: '2026-11-02T00:00:00.000Z' },
    ]
    const existing = [{ id: 'evolution-old', sparkId: 'spark-2', episodeId: null, title: 'Existing', stages: [], createdAt: '2026-11-02T00:00:00.000Z', updatedAt: '2026-11-02T00:00:00.000Z' }]
    const result = ensureIdeaEvolutions(sparks, existing)
    expect(result).toHaveLength(2)
    expect(result.find((item) => item.sparkId === 'spark-1')?.stages.map((stage) => stage.kind)).toEqual(['origin', 'ai-question'])
    expect(result.find((item) => item.sparkId === 'spark-2')?.id).toBe('evolution-old')
  })
})
