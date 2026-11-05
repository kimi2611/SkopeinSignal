export type ScholarlyDatabase = 'OpenAlex' | 'Crossref'
export type ScholarlyRetrieval = 'network' | 'cache' | 'stale-cache'

export interface ScholarlyProvenance {
  database: ScholarlyDatabase
  retrieval: ScholarlyRetrieval
  retrievedAt: string
}

export interface ResourceVerification {
  status: 'cross-verified' | 'single-source' | 'metadata-conflict'
  sources: ScholarlyDatabase[]
  conflicts: Array<'title' | 'year'>
  checkedAt: string
}

export interface ResearchResource {
  id: string
  title: string
  authors: string[]
  year: number | null
  venue: string
  url: string
  doi: string | null
  database: ScholarlyDatabase
  abstract: string
  verification?: ResourceVerification
  provenance?: ScholarlyProvenance[]
}

export interface ScholarlySourceOutcome {
  database: ScholarlyDatabase
  status: 'ok' | 'unavailable'
  recordCount: number
}

export interface ResourceComparison {
  expertView: string
  alignment: string
  keyDifference: string
  evidenceScope: 'abstract' | 'metadata'
  resource: ResearchResource
}

export interface ResourceReport {
  query: string
  searchedAt: string
  comparisons: ResourceComparison[]
  overallComparison: string
  feasibility: string
  assumptions: string[]
  nextExperiment: string
  caveats: string[]
  sourceOutcomes?: ScholarlySourceOutcome[]
}
