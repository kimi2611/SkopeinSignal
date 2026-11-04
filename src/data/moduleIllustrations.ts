import type { ViewKey } from '../types'

export interface ModuleIllustration {
  src: string
  book: string
  bookYear: number | null
  scene: string
  source: string
}

const TOOT = 'Toot & Puddle'
const SNOW = 'Toot & Puddle: Let It Snow'
const CHRISTMAS = 'Toot & Puddle: I’ll Be Home for Christmas'
const NEW_FRIEND = 'Toot & Puddle: The New Friend'
const UNKNOWN = 'Toot & Puddle series — volume not identified on source page'
const SOHU_NEW = 'https://www.sohu.com/a/380736395_99895881'
const SOHU_SNOW = 'https://www.sohu.com/a/436627127_99894096'
const SOHU_SERIES = 'https://www.sohu.com/a/572855662_121124774'
const SOHU_CHRISTMAS = 'https://www.sohu.com/a/122502840_240825'
const PLAYFUL = 'https://www.theplayfulpeacock.com/products/toot-puddle-let-it-snow-picture-book'

// Complete digital Holly Hobbie interiors: no covers, photographed books,
// Chinese text, in-image Chinese watermarks, or cross-group scene reuse.
export const MODULE_ILLUSTRATIONS: Record<ViewKey, ModuleIllustration> = {
  week: {
    src: '/module-pigs/week.webp', book: TOOT, bookYear: 1997,
    scene: 'A week away, a week home',
    source: 'https://turtleandrobot.wordpress.com/2012/11/19/toot-puddle-pure-joy/',
  },
  inbox: {
    src: '/module-pigs/inbox.webp', book: SNOW, bookYear: 2007,
    scene: 'Two parcels arrive for closer inspection', source: SOHU_SNOW,
  },
  shows: {
    src: '/module-pigs/shows.webp', book: SNOW, bookYear: 2007,
    scene: 'A page of games and journeys opens many directions', source: SOHU_SNOW,
  },
  dedupe: {
    src: '/module-pigs/dedupe.webp', book: UNKNOWN, bookYear: null,
    scene: 'Four friends compare the cards in their hands', source: SOHU_SERIES,
  },
  insights: {
    src: '/module-pigs/insights.webp', book: NEW_FRIEND, bookYear: 2004,
    scene: 'A burst of creative energy fills the room', source: SOHU_NEW,
  },
  study: {
    src: '/module-pigs/study.webp', book: TOOT, bookYear: 1997,
    scene: 'Travel widely from the listening desk',
    source: 'https://huaban.com/pins/3538996561/',
  },
  quiz: {
    src: '/module-pigs/quiz.webp', book: SNOW, bookYear: 2007,
    scene: 'Say back what the winter crossing taught you', source: PLAYFUL,
  },
  sparks: {
    src: '/module-pigs/sparks.webp', book: SNOW, bookYear: 2007,
    scene: 'A stream of small gifts becomes a field of ideas', source: SOHU_SNOW,
  },
  cards: {
    src: '/module-pigs/cards.webp', book: "Toot & Puddle: Puddle's ABC", bookYear: 2000,
    scene: 'Letters become memories',
    source: 'https://www.etsy.com/il-en/listing/4524827791/toot-puddle-puddles-abc-by-holly-hobbie',
  },
  gallery: {
    src: '/module-pigs/gallery.webp', book: CHRISTMAS, bookYear: 2001,
    scene: 'Two friends hang ornaments for a shared celebration', source: SOHU_CHRISTMAS,
  },
  notes: {
    src: '/module-pigs/notes.webp', book: NEW_FRIEND, bookYear: 2004,
    scene: 'A quiet bedside lamp keeps the day’s thoughts', source: SOHU_NEW,
  },
  guide: {
    src: '/module-pigs/guide.webp', book: SNOW, bookYear: 2007,
    scene: 'Two friends unfold a small sail and find a way forward', source: SOHU_SNOW,
  },
  account: {
    src: '/module-pigs/account.webp', book: SNOW, bookYear: 2007,
    scene: 'A familiar chair by the fire, kept under your name', source: PLAYFUL,
  },
  settings: {
    src: '/module-pigs/settings.webp', book: SNOW, bookYear: 2007,
    scene: 'Everyday tools and rituals arrange a personal space', source: SOHU_SNOW,
  },
}
