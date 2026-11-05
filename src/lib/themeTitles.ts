import type { AtelierTheme, ViewKey } from '../types'
import { ti } from '../lib/i18n'

// Module headlines keep one shared meaning per view but speak in each theme's
// own register: Warm stays picture-book gentle, Contemplative quiet and
// reflective, Mysterious forest-dark and hushed, Whimsical playful, Pure
// plain and unadorned. Translations live in the locale dictionaries keyed by
// the English source strings below.
type ThemeTitles = Record<ViewKey, string>

const WARM: ThemeTitles = {
  week: ti('This week, listen only to what deserves to remain.'),
  inbox: ti('Triage first. Commit time second.'),
  study: ti('Hear the argument. Keep the language.'),
  notes: ti('Keep the thought, not just the timestamp.'),
  quiz: ti('Listening, checked kindly.'),
  cards: ti('Your marked words, ready to recall.'),
  insights: ti('Timely now. Useful later.'),
  sparks: ti('Catch the idea while it is still glowing.'),
  gallery: ti('Real musicians for the browsing hour.'),
  shows: ti('Every show has one job.'),
  dedupe: ti('Find similarity without deleting on your behalf.'),
  guide: ti('A deliberate path through every episode.'),
  account: ti('Your atelier, under your name.'),
  settings: ti('Your rules. Your data.'),
}

const CONTEMPLATIVE: ThemeTitles = {
  week: ti('A week measured by what stays with you.'),
  inbox: ti('What arrives may wait; what matters may enter.'),
  study: ti('Sit with the argument until it speaks back.'),
  notes: ti('Thoughts written down learn to stay.'),
  quiz: ti('Understanding, confirmed in silence.'),
  cards: ti('Words gathered for the slow return.'),
  insights: ti('Of the moment, and beyond it.'),
  sparks: ti('A thought appears like first light.'),
  gallery: ti('Music contemplated, one work at a time.'),
  shows: ti('Each voice holds its own horizon.'),
  dedupe: ti('Two shapes of one thought, seen side by side.'),
  guide: ti('The unhurried way through the whole landscape.'),
  account: ti('The quiet room that bears your name.'),
  settings: ti('The frame around your own attention.'),
}

const MYSTERIOUS: ThemeTitles = {
  week: ti('This week, follow only the voices worth the dark.'),
  inbox: ti('Every arrival knocks twice before entering.'),
  study: ti('Listen where the forest listens.'),
  notes: ti('What is written survives the forest.'),
  quiz: ti('Answers found by lantern light.'),
  cards: ti('Small words that guide you home.'),
  insights: ti('Glimmers now; landmarks later.'),
  sparks: ti('A spark deep in the trees.'),
  gallery: ti('Old music, still awake in the dark.'),
  shows: ti('Every path keeps its own secret.'),
  dedupe: ti('Two shadows that turn out to be one.'),
  guide: ti('A lantern for the longer way through.'),
  account: ti('The clearing that knows your name.'),
  settings: ti('Quiet adjustments keep the path open.'),
}

const WHIMSICAL: ThemeTitles = {
  week: ti('This week, only the delightful may stay for tea.'),
  inbox: ti('New arrivals, please perch in a row.'),
  study: ti('Hear it once, then hear it dance.'),
  notes: ti('Catch the thought before it hops away.'),
  quiz: ti('Questions, served with a smile.'),
  cards: ti('Little words, lined up like ducklings.'),
  insights: ti('Useful today, amusing forever.'),
  sparks: ti('Ideas pop like toast.'),
  gallery: ti('Music, musicians, and a boatload of honey.'),
  shows: ti('Every show sails in its own sieve.'),
  dedupe: ti('Two of a kind, sorted with a grin.'),
  guide: ti('A nonsense map that always finds the way.'),
  account: ti('Your name, cheerfully on the door.'),
  settings: ti('Every knob exactly as striped as you like.'),
}

const PURE: ThemeTitles = {
  week: ti('This week’s listening plan.'),
  inbox: ti('New arrivals, in order.'),
  study: ti('Listen and read.'),
  notes: ti('Your notes.'),
  quiz: ti('A short listening check.'),
  cards: ti('Words marked for review.'),
  insights: ti('Insights, timely and evergreen.'),
  sparks: ti('Ideas in brief.'),
  gallery: ti('The performance collection.'),
  shows: ti('Shows and tiers.'),
  dedupe: ti('Near-duplicate episodes.'),
  guide: ti('How to make this atelier work.'),
  account: ti('Account and workspace.'),
  settings: ti('Language, appearance, and other settings.'),
}

const TITLES: Record<AtelierTheme, ThemeTitles> = {
  'toot-puddle': WARM,
  'mist-dawn': CONTEMPLATIVE,
  'forest-dusk': MYSTERIOUS,
  whimsical: WHIMSICAL,
  pure: PURE,
}

export function moduleTitle(theme: AtelierTheme, view: ViewKey): string {
  return TITLES[theme]?.[view] ?? WARM[view]
}
