import type { RecordingId } from './recordings'
import { ti } from '../lib/translationMarker'

export interface RecordingIllustration {
  recordingId: RecordingId
  src: string
  scene: string
  book: string
  bookYear: number | null
  sourceUrl: string
  sourceLabel: string
}

const TOOT = 'Toot & Puddle'
const CHRISTMAS = 'Toot & Puddle: I’ll Be Home for Christmas'
const SNOW = 'Toot & Puddle: Let It Snow'
const UNKNOWN = 'Toot & Puddle series — volume not identified on source page'
const TURTLE = 'https://turtleandrobot.wordpress.com/2012/11/19/toot-puddle-pure-joy/'
const TIM = 'https://www.timwarnes.com/blog/2020/12/10/toot-and-puddle-bringing-christmas-home'
const NEW_FRIEND = 'Toot & Puddle: The New Friend'
const SOHU_NEW_FRIEND = 'https://www.sohu.com/a/380736395_99895881'
const SOHU_SNOW = 'https://www.sohu.com/a/436627127_99894096'
const SOHU_SERIES = 'https://www.sohu.com/a/572855662_121124774'
const SOHU_PAINTING = 'https://www.sohu.com/a/162922734_655203'
const SOHU_LABEL = 'Sohu picture-book presentation'
const turtle = (recordingId: RecordingId, scene: string): RecordingIllustration => ({
  recordingId, src: `/recording-pigs/${recordingId}.webp`, scene, book: TOOT, bookYear: 1997,
  sourceUrl: TURTLE, sourceLabel: 'TurtleAndRobot picture-book review',
})
const tim = (recordingId: RecordingId, scene: string, book: string, bookYear: number): RecordingIllustration => ({
  recordingId, src: `/recording-pigs/${recordingId}.webp`, scene, book, bookYear,
  sourceUrl: TIM, sourceLabel: 'Tim Warnes picture-book review',
})

/** One complete, non-reused digital interior page or scene per recording; no covers, photographs, Chinese text, or in-image Chinese watermarks. */
export const RECORDING_ILLUSTRATIONS: RecordingIllustration[] = [
  { recordingId: 'bassoon-glinka', src: '/recording-pigs/bassoon-glinka.webp', scene: ti('Two friends watch the rain through a window, a red sled outside'), book: SNOW, bookYear: 2007, sourceUrl: SOHU_SNOW, sourceLabel: SOHU_LABEL },
  turtle('bassoon-reicha', ti('Toot poses beside a friend dressed as a Spanish matador')),
  turtle('piano-goldberg', ti('Six bright skating variations')),
  { recordingId: 'bassoon', src: '/recording-pigs/bassoon.webp', scene: ti('A complete spread of gardening and a fenced spring garden'), book: 'Toot & Puddle: How Does Your Garden Grow?', bookYear: 2021, sourceUrl: 'https://www.amazon.co.uk/Toot-Puddle-Does-Your-Garden/dp/0593124669', sourceLabel: 'Amazon book preview' },
  turtle('bassoon-mozart', ti('A jubilant jump beside Pocket Pond')),
  turtle('flute', ti('A quiet room filled with morning light')),
  turtle('flute-courante', ti('Travelling light, with luggage and balloons')),
  { recordingId: 'flute-sarabande', src: '/recording-pigs/flute-sarabande.webp', scene: ti('A spare entrance hall with a small suitcase and hanging coats'), book: 'Toot & Puddle: Top of the World', bookYear: 2002, sourceUrl: 'http://lib.anniekids.org/club/hz259/list.asp?barcode=89405291', sourceLabel: 'Annie Kids library source page' },
  turtle('flute-syrinx', ti('A sunlit gathering among the hippos')),
  { recordingId: 'guitar', src: '/recording-pigs/guitar.webp', scene: ti('A complete page of playful gift and celebration vignettes'), book: SNOW, bookYear: 2007, sourceUrl: SOHU_SNOW, sourceLabel: SOHU_LABEL },
  turtle('guitar-sor', ti('A page of formal costumes and dance poses')),
  { recordingId: 'guitar-bach-laucke', src: '/recording-pigs/guitar-bach-laucke.webp', scene: ti('Two friends playing among golden autumn leaves'), book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW_FRIEND, sourceLabel: SOHU_LABEL },
  turtle('guitar-tarrega-lagrima', ti('Quiet everyday vignettes at Woodcock Pocket')),
  { recordingId: 'guitar-tarrega-adelita', src: '/recording-pigs/guitar-tarrega-adelita.webp', scene: ti('A chamber performance with violin, dance and attentive friends'), book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW_FRIEND, sourceLabel: SOHU_LABEL },
  { recordingId: 'harp', src: '/recording-pigs/harp.webp', scene: ti('A remote snowy cottage and a figure shovelling a path'), book: UNKNOWN, bookYear: null, sourceUrl: SOHU_PAINTING, sourceLabel: SOHU_LABEL },
  tim('harp-prelude', ti('A winter sleigh gliding through the woods'), CHRISTMAS, 2001),
  { recordingId: 'harp-mozart', src: '/recording-pigs/harp-mozart.webp', scene: ti('Friends admiring a decorated tree beside an armchair'), book: SNOW, bookYear: 2007, sourceUrl: SOHU_SNOW, sourceLabel: SOHU_LABEL },
  tim('cello-sarabande', ti('A solitary walk through a snowy forest'), CHRISTMAS, 2001),
  { recordingId: 'cello-courante', src: '/recording-pigs/cello-courante.webp', scene: ti('A train ready to leave the station'), book: 'Toot & Puddle: Charming Opal', bookYear: 2003, sourceUrl: 'https://www.hachette.com.au/holly-hobbie/toot-and-puddle-charming-opal', sourceLabel: 'Hachette Australia' },
  tim('orchestra-schubert', ti('A sleigh pressing through a winter storm'), CHRISTMAS, 2001),
  { recordingId: 'orchestra', src: '/recording-pigs/orchestra.webp', scene: ti('A ballet corps taking a bow on a lamplit stage'), book: UNKNOWN, bookYear: null, sourceUrl: SOHU_SERIES, sourceLabel: SOHU_LABEL },
  turtle('piano-liszt', ti('Two beds glowing in a quiet room')),
]

export const ILLUSTRATION_BY_RECORDING = Object.fromEntries(
  RECORDING_ILLUSTRATIONS.map((illustration) => [illustration.recordingId, illustration]),
) as Record<RecordingId, RecordingIllustration>

export const PICTURE_BOOK_CREDIT = 'Illustration: Holly Hobbie · Toot & Puddle · complete page/scene; resized for the selection key, with any removed text or margins lying outside the complete illustration.'
