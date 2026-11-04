import { ti } from '../lib/translationMarker'

export interface ArtGuide {
  artworkId: string
  src: string
  scene: string
  guide: string
  book: string
  bookYear: number | null
  sourceUrl: string
  sourceLabel: string
}

const TOOT = 'Toot & Puddle'
const SNOW = 'Toot & Puddle: Let It Snow'
const CHRISTMAS = 'Toot & Puddle: I’ll Be Home for Christmas'
const NEW_FRIEND = 'Toot & Puddle: The New Friend'
const PRESENT = 'Toot & Puddle: A Present for Toot'
const GARDEN = 'Toot & Puddle: How Does Your Garden Grow?'
const UNKNOWN = 'Toot & Puddle series — volume not identified on source page'
const SOHU_NEW = 'https://www.sohu.com/a/380736395_99895881'
const SOHU_SNOW = 'https://www.sohu.com/a/436627127_99894096'
const SOHU_SERIES = 'https://www.sohu.com/a/572855662_121124774'
const SOHU_CHRISTMAS = 'https://www.sohu.com/a/122502840_240825'
const SOHU_PAINTING = 'https://www.sohu.com/a/162922734_655203'
const PLAYFUL = 'https://www.theplayfulpeacock.com/products/toot-puddle-let-it-snow-picture-book'
const ANNIE = 'http://lib.anniekids.org/club/hz259/list.asp?barcode=88364728'
const ART_IS_ALL_AROUND_US = 'https://artisallaroundus.wordpress.com/2011/03/22/toot-and-puddle-the-artistry-of-holly-hobbie/'
const SOHU_LABEL = 'Sohu picture-book presentation'
const PLAYFUL_LABEL = 'The Playful Peacock digital book preview'

/**
 * A fixed one-to-one visual dialogue with the historical catalogue. Every guide
 * uses a different complete, clear digital Holly Hobbie interior page or scene;
 * no cover, photographed book, Chinese text, or in-image Chinese watermark is
 * used. Pairings never depend on episode content or random selection.
 */
export const ART_GUIDES: ArtGuide[] = [
  {
    artworkId: 'seurat-bathers-study', src: '/art-guides/seurat-bathers-study.webp',
    scene: ti('A small figure beneath birches beside a long stone wall'),
    guide: ti('Repeated trunks and individual stones make a landscape from separate touches. Seurat’s preparatory panel likewise lets us notice how figures, shadows and patches of colour are placed before they become a unified riverside world.'),
    book: SNOW, bookYear: 2007, sourceUrl: SOHU_SNOW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'van-gogh-poets-garden', src: '/art-guides/van-gogh-poets-garden.webp',
    scene: ti('Friends gathering firewood in a rose-gold autumn wood'),
    guide: ti('Logs, leaves and upright trunks turn a patch of woodland into a layered enclosure. Van Gogh’s garden is built with a similar density: paths and plants do not merely surround the scene, they give it structure.'),
    book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'caillebotte-skiffs', src: '/art-guides/caillebotte-skiffs.webp',
    scene: ti('A complete garden-in-the-rain preview spread'),
    guide: ti('Umbrellas and garden rows set up crossing directions in cool weather. Caillebotte’s skiffs create a related rhythm with hulls and paddles: repeated diagonals turn an ordinary outing into deliberate movement.'),
    book: GARDEN, bookYear: 2021, sourceUrl: 'https://www.amazon.in/Toot-Puddle-Does-Your-Garden/dp/0593124669', sourceLabel: 'Amazon book preview',
  },
  {
    artworkId: 'cassatt-reader', src: '/art-guides/cassatt-reader.webp',
    scene: ti('A complete bathroom scene with a bubble bath and an attentive friend'),
    guide: ti('Attention gathers around a private everyday ritual: one figure watches while another remains absorbed in the moment. Cassatt’s reader asks for the same close looking, making inward concentration more important than a returned gaze.'),
    book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'song-lark', src: '/art-guides/song-lark.webp',
    scene: ti('A silent snowy clearing with a swing and buried fence'),
    guide: ti('An empty swing and a fence disappearing into snow make silence almost visible. Breton’s listener pauses in a similarly open field; both images leave enough stillness for a small sound to become an event.'),
    book: SNOW, bookYear: 2007, sourceUrl: PLAYFUL, sourceLabel: PLAYFUL_LABEL,
  },
  {
    artworkId: 'cezanne-auvers-panorama', src: '/art-guides/cezanne-auvers-panorama.webp',
    scene: ti('Friends gathering in a sunlit autumn wood'),
    guide: ti('Separate figures, golden clearings and upright trees make this gathering a landscape of connected patches. Cézanne likewise lets roofs, vegetation and fields occupy distinct planes, asking us to read a view through relationships rather than a single focal object.'),
    book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'lautrec-equestrienne', src: '/art-guides/lautrec-equestrienne.webp',
    scene: ti('A line of friends in inventive costumes holding paper snowflakes'),
    guide: ti('Costume turns each member of the row into a distinct performer. Lautrec’s circus also balances spectacle with character: beyond the central trick, posture, dress and expectation reveal the people around it.'),
    book: UNKNOWN, bookYear: null, sourceUrl: SOHU_SERIES, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'renoir-woman-piano', src: '/art-guides/renoir-woman-piano.webp',
    scene: ti('Two friends sharing a quiet green clearing'),
    guide: ti('Two figures share a close atmosphere without needing to explain their bond; one gestures while the other listens. Renoir’s pianist creates a comparable privacy through bowed attention, dark surroundings and the quiet interval before the next phrase.'),
    book: UNKNOWN, bookYear: null, sourceUrl: SOHU_SERIES, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'monet-petite-creuse', src: '/art-guides/monet-petite-creuse.webp',
    scene: ti('A complete garden preview spread beside a pond'),
    guide: ti('Reflections and overhanging leaves pull the eye across the pond rather than letting it remain a background. Monet’s river works through a related exchange of light, foliage and broken touches across the surface.'),
    book: GARDEN, bookYear: 2021, sourceUrl: 'https://www.amazon.ca/Toot-Puddle-Does-Your-Garden/dp/0593124669', sourceLabel: 'Amazon book preview',
  },
  {
    artworkId: 'monet-bennecourt', src: '/art-guides/monet-bennecourt.webp',
    scene: ti('A complete page with a red sled and a winter seedpod gift'),
    guide: ti('Two small episodes rest within a broad field of white, connected by text and empty space. Monet’s riverside scene also depends on intervals: the seated figure, shaded bank and reflective water become meaningful through their spacing.'),
    book: SNOW, bookYear: 2007, sourceUrl: PLAYFUL, sourceLabel: PLAYFUL_LABEL,
  },
  {
    artworkId: 'van-gogh-fishing-spring', src: '/art-guides/van-gogh-fishing-spring.webp',
    scene: ti('A snow-blue house and glowing window at night'),
    guide: ti('Cool blue surrounds one concentrated point of warm light. Van Gogh’s spring river uses a different palette but a related principle: small contrasting touches activate the whole surface and guide the eye toward human activity.'),
    book: TOOT, bookYear: 1997, sourceUrl: 'https://www.goodreads.com/book/show/22071423', sourceLabel: 'Goodreads reader image page',
  },
  {
    artworkId: 'monet-poppy-field', src: '/art-guides/monet-poppy-field.webp',
    scene: ti('A tiny traveller beneath a great tree in falling snow'),
    guide: ti('A minute figure measures the scale of a vast, atmospheric field. Monet’s poppies also make the landscape larger than its human presence, while repeated marks across the surface let weather and vegetation carry the emotion.'),
    book: CHRISTMAS, bookYear: 2001, sourceUrl: SOHU_CHRISTMAS, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'degas-yellow-dancers', src: '/art-guides/degas-yellow-dancers.webp',
    scene: ti('The Bb/Cc alphabet spread, including a ballerina'),
    guide: ti('Practice makes movement visible. The alphabet’s ballerina and Degas’s dancers remind us that grace is assembled through repeated positions, patient correction and many small acts of balance, even before applause begins.'),
    book: "Toot & Puddle: Puddle's ABC", bookYear: 2000, sourceUrl: 'http://toddlymummy.blogspot.com/2011/11/recommendations-toot-puddle-puddles-abc.html', sourceLabel: 'Toddly Mummy picture-book review',
  },
  {
    artworkId: 'pissarro-crystal-palace', src: '/art-guides/pissarro-crystal-palace.webp',
    scene: ti('A tiny traveller inside the open door of a freight train'),
    guide: ti('Freight cars, rails and a distant station organise modern life into lines of travel. Pissarro’s London view likewise puts roads and everyday movement in front of the famous building, making the city more than its landmark.'),
    book: UNKNOWN, bookYear: null, sourceUrl: SOHU_SERIES, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'van-gogh-moulin-blute-fin', src: '/art-guides/van-gogh-moulin-blute-fin.webp',
    scene: ti('Two friends leaping with luggage and a flying hat'),
    guide: ti('A high-spirited departure turns luggage, clothing and open space into signs of movement. Van Gogh’s Montmartre terrace also makes a leisure place legible through its structures and visitors rather than through the windmill alone.'),
    book: UNKNOWN, bookYear: null, sourceUrl: SOHU_PAINTING, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'two-schooners', src: '/art-guides/two-schooners.webp',
    scene: ti('Two friends among tall trees'),
    guide: ti('Two companions move between upright trunks as boats rest among masts. The pairing is about rhythm rather than subject: separated verticals, open air and the quiet distance between things.'),
    book: UNKNOWN, bookYear: null, sourceUrl: ART_IS_ALL_AROUND_US, sourceLabel: 'Art Is All Around Us picture-book review',
  },
  {
    artworkId: 'sailing-gloucester', src: '/art-guides/sailing-gloucester.webp',
    scene: ti('A quiet bus interior with a sleeping passenger'),
    guide: ti('A solitary traveller inside a pale, spare interior echoes the single sail in Homer’s open space. Both images make room for silence, and let a small dark form measure the distance.'),
    book: UNKNOWN, bookYear: null, sourceUrl: ART_IS_ALL_AROUND_US, sourceLabel: 'Art Is All Around Us picture-book review',
  },
  {
    artworkId: 'blue-boat', src: '/art-guides/blue-boat.webp',
    scene: ti('Two friends pulling a glowing, decorated wagon'),
    guide: ti('A small vehicle becomes the centre of a broad, warm field, with one figure pulling and another steadying the load. Homer’s canoe makes cooperation equally visible: balance depends on two people reading the same movement.'),
    book: SNOW, bookYear: 2007, sourceUrl: SOHU_SNOW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'simplon-pass', src: '/art-guides/simplon-pass.webp',
    scene: ti('Two sled lights approaching through a dark, snowy forest'),
    guide: ti('Weather reduces the world to tree trunks, snowfall and two points of light. Sargent’s Alpine watercolour also lets atmosphere dominate precise description, making the mountain something felt at body scale.'),
    book: CHRISTMAS, bookYear: 2001, sourceUrl: SOHU_CHRISTMAS, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'mending-sail', src: '/art-guides/mending-sail.webp',
    scene: ti('A complete page of bookshop and hardware-shop vignettes'),
    guide: ti('Work is a sequence of hands, tools and materials. These shop vignettes echo Sargent’s sailors: ordinary labour becomes absorbing when posture and task are observed closely enough.'),
    book: PRESENT, bookYear: 1998, sourceUrl: ANNIE, sourceLabel: 'Annie Kids library source page',
  },
  {
    artworkId: 'mountain-fire', src: '/art-guides/mountain-fire.webp',
    scene: ti('A solitary attic window beneath a star-filled black sky'),
    guide: ti('The dark field overwhelms the small architectural form, while a few stars keep the surface active. Sargent’s mountain fire similarly turns solid terrain into shifting atmosphere rather than a neatly outlined object.'),
    book: NEW_FRIEND, bookYear: 2004, sourceUrl: SOHU_NEW, sourceLabel: SOHU_LABEL,
  },
  {
    artworkId: 'melon-boats', src: '/art-guides/melon-boats.webp',
    scene: ti('A complete shop interior with a green cabinet and hanging canopy'),
    guide: ti('A cropped canopy and crowded counter turn looking into a succession of fragments. Sargent’s boats work similarly: sail, hull and shadow are cut into bold shapes by hard southern light.'),
    book: PRESENT, bookYear: 1998, sourceUrl: ANNIE, sourceLabel: 'Annie Kids library source page',
  },
]

export const ART_GUIDE_BY_ARTWORK = Object.fromEntries(
  ART_GUIDES.map((guide) => [guide.artworkId, guide]),
) as Record<string, ArtGuide>
