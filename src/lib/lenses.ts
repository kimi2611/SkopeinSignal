import type { Episode, EpisodeLens, EpisodeValueCategory, PodcastShow } from '../types'

export const LENS_NAMES: Record<EpisodeLens, string> = {
  aithrascope: 'AithraScope',
  dikelens: 'DikeLens',
}

export const LENS_DESCRIPTIONS: Record<EpisodeLens, string> = {
  aithrascope: 'Natural-world, scientific, technological, AI, and business-model inquiry.',
  dikelens: 'Society, institutions, history, ethics, philosophy, arts, and public-life judgment.',
}

const AITHRA_TERMS = [
  'artificial intelligence', 'ai', 'physics', 'mathematics', 'math problem', 'robot',
  'science', 'scientist', 'research', 'technology', 'engineering', 'climate',
  'global warming', 'erderwärmung', 'klima', 'weather', 'meteorology', 'flooding',
  'ocean', 'ozean', 'meer', 'eis', 'company', 'business', 'business model',
]

const DIKE_TERMS = [
  'foreign policy', 'geopolitics', 'war', 'election', 'midterms', 'trump',
  'democracy', 'liberalism', 'public debate', 'philosophy', 'ethics', 'morality',
  'art', 'artist', 'painter', 'music', 'literature', 'design', 'museum',
  'milton resnick', 'depraved', 'culture', 'flags', 'everyday life', 'society', 'history',
  'justice', 'policy', 'congo', 'metaphysics',
]

function containsTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(text)
}

function matchingTerms(text: string, terms: string[]): string[] {
  const normalized = text.toLocaleLowerCase()
  return terms.filter((term) => containsTerm(normalized, term))
}

export interface LensAnalysis {
  lens: EpisodeLens
  manual: boolean
  evidence: string[]
}

export function analyzeEpisodeLens(episode: Episode, show?: PodcastShow | null): LensAnalysis {
  if (episode.lens) return { lens: episode.lens, manual: true, evidence: [] }
  const title = episode.title.toLocaleLowerCase()
  const description = episode.description.toLocaleLowerCase()
  const domain = `${show?.domain ?? ''} ${show?.role ?? ''}`.toLocaleLowerCase()
  const aithraTitle = matchingTerms(title, AITHRA_TERMS)
  const dikeTitle = matchingTerms(title, DIKE_TERMS)
  const aithraDescription = matchingTerms(description, AITHRA_TERMS)
  const dikeDescription = matchingTerms(description, DIKE_TERMS)
  const aithraDomain = matchingTerms(domain, AITHRA_TERMS)
  const dikeDomain = matchingTerms(domain, DIKE_TERMS)
  const aithraScore = aithraTitle.length * 4 + aithraDescription.length * 2 + aithraDomain.length
  const dikeScore = dikeTitle.length * 4 + dikeDescription.length * 2 + dikeDomain.length
  const lens: EpisodeLens = aithraScore > dikeScore ? 'aithrascope' : 'dikelens'
  const evidence = lens === 'aithrascope'
    ? [...aithraTitle, ...aithraDescription, ...aithraDomain]
    : [...dikeTitle, ...dikeDescription, ...dikeDomain]
  return { lens, manual: false, evidence: [...new Set(evidence)].slice(0, 4) }
}

export function getEpisodeLens(episode: Episode, show?: PodcastShow | null): EpisodeLens {
  return analyzeEpisodeLens(episode, show).lens
}

const TIMELY_VALUE_TERMS = [
  'breaking', 'latest', 'news', 'current', 'timely', 'release', 'launch',
  'market', 'markets', 'ai economy', 'token budget', 'nvidia', 'earnings',
  'election', 'midterms', 'trump', 'war', 'congo', 'flooding', 'shut down',
  'weather', 'forecast', 'this week', 'today', 'schicksalswahl',
]

const EVERGREEN_VALUE_TERMS = [
  'history', 'historical', 'financial crises', 'lessons of', 'castles',
  'ancestors', 'superstitious', 'seinfeld', 'physics', 'mathematics', 'math problem',
  'philosophy', 'ethics', 'depraved', 'art', 'artist', 'milton resnick',
  'design', 'everyday life', 'flags', 'research', 'science', 'scientist',
  'framework', 'foundational', 'craft', 'music', 'literature', 'museums',
  'climate', 'erderwärmung', 'klima', 'eis', 'ai risk', 'won’t kill us',
]

export interface EpisodeValueAnalysis {
  category: EpisodeValueCategory
  manual: boolean
  evidence: string[]
}

const MIN_VALUE_SIGNAL_SCORE = 4

// Transparent local suggestions, not an AI judgment. Manual choices always win.
export function analyzeEpisodeValue(episode: Episode, show?: PodcastShow | null): EpisodeValueAnalysis {
  if (episode.valueCategory) return { category: episode.valueCategory, manual: true, evidence: [] }
  const title = episode.title.toLocaleLowerCase()
  const description = episode.description.toLocaleLowerCase()
  const reasons = (episode.selectionReasons ?? []).join(' ').toLocaleLowerCase()
  const context = `${show?.domain ?? ''} ${show?.role ?? ''}`.toLocaleLowerCase()
  const timelyTitle = matchingTerms(title, TIMELY_VALUE_TERMS)
  const timelyDescription = matchingTerms(description, TIMELY_VALUE_TERMS)
  const timelyReasons = matchingTerms(reasons, TIMELY_VALUE_TERMS)
  const timelyContext = matchingTerms(context, TIMELY_VALUE_TERMS)
  const evergreenTitle = matchingTerms(title, EVERGREEN_VALUE_TERMS)
  const evergreenDescription = matchingTerms(description, EVERGREEN_VALUE_TERMS)
  const evergreenReasons = matchingTerms(reasons, EVERGREEN_VALUE_TERMS)
  const evergreenContext = matchingTerms(context, EVERGREEN_VALUE_TERMS)
  const timelyScore = timelyTitle.length * 4 + timelyReasons.length * 3 + timelyDescription.length * 2 + timelyContext.length
  const evergreenScore = evergreenTitle.length * 4 + evergreenReasons.length * 3 + evergreenDescription.length * 2 + evergreenContext.length
  let category: EpisodeValueCategory = 'uncategorized'
  if (timelyScore >= MIN_VALUE_SIGNAL_SCORE && timelyScore > evergreenScore) category = 'timely'
  else if (evergreenScore >= MIN_VALUE_SIGNAL_SCORE && evergreenScore > timelyScore) category = 'evergreen'
  const timelyEvidence = [...timelyTitle, ...timelyReasons, ...timelyDescription, ...timelyContext]
  const evergreenEvidence = [...evergreenTitle, ...evergreenReasons, ...evergreenDescription, ...evergreenContext]
  const evidence = category === 'timely'
    ? timelyEvidence
    : category === 'evergreen'
      ? evergreenEvidence
      : [...timelyEvidence, ...evergreenEvidence]
  return { category, manual: false, evidence: [...new Set(evidence)].slice(0, 4) }
}

export function getEpisodeValueCategory(episode: Episode, show?: PodcastShow | null): EpisodeValueCategory {
  return analyzeEpisodeValue(episode, show).category
}
