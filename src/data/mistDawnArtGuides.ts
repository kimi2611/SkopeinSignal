import { ti } from '../lib/translationMarker'
import type { ArtGuide } from './artGuides'

const CDF = 'Caspar David Friedrich — '
const COMMONS = 'Wikimedia Commons'

/**
 * Mist-dawn (哲思) variant of the art-study guides: a one-to-one visual
 * dialogue between a complete Caspar David Friedrich painting (public domain)
 * and each work in the historical catalogue. No painting is repeated, and
 * none overlaps with the mist-dawn module header images.
 */
export const MIST_DAWN_ART_GUIDES: ArtGuide[] = [
  {
    artworkId: 'seurat-bathers-study', src: '/art-guides/mist-dawn/seurat-bathers-study.webp',
    scene: ti('Bathers resting by a river as evening settles over the fields'),
    guide: ti('Friedrich’s Evening gathers small figures into one long, quiet band of light before darkness. Seurat’s study asks the same patience: separate bathers and patches of grass only become a riverside world once we let the eye assemble them.'),
    book: CDF + 'The Times of Day: The Evening', bookYear: 1821, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Caspar_David_Friedrich_-_Tageszeitenzyklus,_Der_Abend_(1821-22).jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'van-gogh-poets-garden', src: '/art-guides/mist-dawn/van-gogh-poets-garden.webp',
    scene: ti('Ancient graves hidden among dense, shadowed trees'),
    guide: ti('Friedrich folds stone monuments into a thicket so that history feels overgrown and inward. Van Gogh’s public garden works in the opposite direction yet with a similar density: paths and plants enclose a space made for private thought.'),
    book: CDF + 'Ancient Heroes’ Graves', bookYear: 1812, sourceUrl: 'https://zh.wikipedia.org/zh-cn/File:Caspar_David_Friedrich_021.jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'caillebotte-skiffs', src: '/art-guides/mist-dawn/caillebotte-skiffs.webp',
    scene: ti('A river winding through night mountains under a dark sky'),
    guide: ti('Friedrich lets the river carry all movement through an otherwise sleeping valley. Caillebotte’s skiffs create a related rhythm in daylight: hulls and paddles turn an ordinary outing into deliberate, measured motion.'),
    book: CDF + 'Mountainous River Landscape (Night)', bookYear: 1830, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Mountainous_River_Landscape_(Night_Version).jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'cassatt-reader', src: '/art-guides/mist-dawn/cassatt-reader.webp',
    scene: ti('A walled town resting quietly beneath tall towers'),
    guide: ti('Friedrich’s Neubrandenburg holds a whole town in stillness, its life condensed into walls and spires. Cassatt’s reader asks for the same close looking: concentration turned inward, the world reduced to a single absorbed figure.'),
    book: CDF + 'Neubrandenburg', bookYear: 1816, sourceUrl: 'https://www.landesmuseum-mv.de/en/exhibit/caspar-david-friedrich-neubrandenburg/', sourceLabel: 'Landesmuseum MV',
  },
  {
    artworkId: 'song-lark', src: '/art-guides/mist-dawn/song-lark.webp',
    scene: ti('An open ploughed field rising gently under a wide morning sky'),
    guide: ti('Friedrich leaves the field almost empty so that light itself becomes the event. Breton’s listener pauses in a similarly open expanse; both images hold enough stillness for a small sound to fill the whole scene.'),
    book: CDF + 'Hill and Ploughed Field near Dresden', bookYear: 1824, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_H%C3%BCgel_und_Bruchacker_bei_Dresden.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'cezanne-auvers-panorama', src: '/art-guides/mist-dawn/cezanne-auvers-panorama.webp',
    scene: ti('A moonlit town with nets and masts gathered at the waterfront'),
    guide: ti('Friedrich reads Greifswald through relationships — masts, nets, spire and moonlight held in one nocturne. Cézanne likewise builds Auvers from distinct planes of roofs and fields, asking us to read a view as a whole rather than a single focal object.'),
    book: CDF + 'Greifswald in Moonlight', bookYear: 1817, sourceUrl: 'https://www.artchive.com/artwork/greifswald-in-moonlight-caspar-david-friedrich-1817/', sourceLabel: 'Artchive',
  },
  {
    artworkId: 'lautrec-equestrienne', src: '/art-guides/mist-dawn/lautrec-equestrienne.webp',
    scene: ti('A dolmen standing among autumn birches at dusk'),
    guide: ti('Friedrich gives a prehistoric grave the presence of a monument by isolating it in autumn light. Lautrec does something similar inside the circus: beyond the central trick, posture and focus single out the performer from the crowd.'),
    book: CDF + 'Dolmen in Autumn', bookYear: 1820, sourceUrl: 'https://www.meisterdrucke.com/kunstdrucke/Caspar-David-Friedrich/685716/H%C3%BCnengrab-im-Herbst.html', sourceLabel: 'Meisterdrucke',
  },
  {
    artworkId: 'renoir-woman-piano', src: '/art-guides/mist-dawn/renoir-woman-piano.webp',
    scene: ti('Two swans among reeds at the first light of dawn'),
    guide: ti('Friedrich’s swans rest inside a hushed shelter of reeds, the crescent moon still in the sky. Renoir’s pianist creates a comparable privacy through bowed attention — the quiet interval before the next phrase.'),
    book: CDF + 'Swans in the Reeds at First Dawn', bookYear: 1832, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Schw%C3%A4ne_im_Schilf_beim_ersten_Morgenrot.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'monet-petite-creuse', src: '/art-guides/mist-dawn/monet-petite-creuse.webp',
    scene: ti('A mountain lake holding the stillness of early morning'),
    guide: ti('Friedrich lets the lake mirror morning light until water and sky nearly exchange places. Monet’s river works through a related exchange: light, foliage and broken touches move across the surface until reflection becomes the subject.'),
    book: CDF + 'Landscape with Mountain Lake, Morning', bookYear: 1823, sourceUrl: 'https://www.artera.ae/artworks/b894e36f-2f8e-4f94-9be8-dbf91b7816db', sourceLabel: 'Artera artwork page',
  },
  {
    artworkId: 'monet-bennecourt', src: '/art-guides/mist-dawn/monet-bennecourt.webp',
    scene: ti('A pale morning landscape with a village church beyond the fields'),
    guide: ti('Friedrich dissolves distance into milky light, so the church and river emerge only gradually. Monet’s riverside morning also depends on spacing and haze: the seated figure, bank and water become meaningful through their intervals.'),
    book: CDF + 'Bohemian Landscape with Mount Milleschauer', bookYear: 1808, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_B%C3%B6hmische_Landschaft_mit_dem_Milleschauer_-_WGA08241.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'van-gogh-fishing-spring', src: '/art-guides/mist-dawn/van-gogh-fishing-spring.webp',
    scene: ti('A quiet harbour with sailing ships waiting at anchor'),
    guide: ti('Friedrich makes a harbour contemplative: rigging and hulls stand in patient stillness. Van Gogh’s spring river uses a different palette but a related principle — small human activity set inside a carefully observed expanse of water.'),
    book: CDF + 'View of a Harbour', bookYear: 1815, sourceUrl: 'https://commons.wikimedia.org/wiki/File:View_of_a_Harbour.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'monet-poppy-field', src: '/art-guides/mist-dawn/monet-poppy-field.webp',
    scene: ti('A couple walking through a wide summer landscape'),
    guide: ti('Friedrich places two small figures inside a vast summer field so the landscape carries the emotion. Monet’s poppy field does the same with repeated marks of colour: weather and vegetation grow larger than the human presence.'),
    book: CDF + 'Summer (Landscape with a Couple)', bookYear: 1807, sourceUrl: 'https://www.meisterdrucke.com/kunstdrucke/Caspar-David-Friedrich/685218/Der-Sommer.html', sourceLabel: 'Meisterdrucke',
  },
  {
    artworkId: 'degas-yellow-dancers', src: '/art-guides/mist-dawn/degas-yellow-dancers.webp',
    scene: ti('Willow bushes glowing against a low setting sun'),
    guide: ti('Friedrich’s willows catch the last light like figures held in a final pose. Degas’s dancers share that suspended instant: grace assembled from balance and repetition, glimpsed in the wings before the applause.'),
    book: CDF + 'Willow Bushes under a Setting Sun', bookYear: 1832, sourceUrl: 'https://www.posterlounge.com/p/641784.html', sourceLabel: 'Posterlounge print page',
  },
  {
    artworkId: 'pissarro-crystal-palace', src: '/art-guides/mist-dawn/pissarro-crystal-palace.webp',
    scene: ti('An imagined Gothic cathedral rising above rock and forest'),
    guide: ti('Friedrich’s cathedral is architecture as vision — a towering structure imagined beyond any real city. Pissarro takes the opposite route with a real landmark, putting roads and everyday movement in front of the Crystal Palace; both ask what a great building means to the life around it.'),
    book: CDF + 'The Cathedral', bookYear: 1818, sourceUrl: 'https://www.posterlounge.co.uk/p/641788.html', sourceLabel: 'Posterlounge print page',
  },
  {
    artworkId: 'van-gogh-moulin-blute-fin', src: '/art-guides/mist-dawn/van-gogh-moulin-blute-fin.webp',
    scene: ti('Terraced mountains remembered in soft, receding layers'),
    guide: ti('Friedrich paints the Riesengebirge from memory, letting each ridge fade like a recollection. Van Gogh’s Montmartre terrace likewise makes a place legible through its structures and visitors rather than through the windmill alone.'),
    book: CDF + 'Memory of the Riesengebirge', bookYear: 1835, sourceUrl: 'https://www.meisterdrucke.com/kunstdrucke/Caspar-David-Friedrich/685844/Erinnerung-an-das-Riesengebirge.html', sourceLabel: 'Meisterdrucke',
  },
  {
    artworkId: 'two-schooners', src: '/art-guides/mist-dawn/two-schooners.webp',
    scene: ti('Snow falling on firs and a quiet, empty valley'),
    guide: ti('Friedrich reduces the world to snowfall, trunks and open air — a rhythm of separated verticals. Homer’s two schooners rest among masts with the same grammar: quiet distance measured between upright forms.'),
    book: CDF + 'Early Snow', bookYear: 1828, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Caspar_David_Friedrich_-_Fr%C3%BChschnee.jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'sailing-gloucester', src: '/art-guides/mist-dawn/sailing-gloucester.webp',
    scene: ti('Figures gathering on the Baltic shore as evening falls'),
    guide: ti('Friedrich lets a small group on the shore measure an enormous evening sky. Homer’s single sail does the same at sea: one dark form inside open space, making room for silence.'),
    book: CDF + 'Evening on the Baltic Shore', bookYear: 1831, sourceUrl: 'https://www.meisterdrucke.com/kunstdrucke/Caspar-David-Friedrich/685807/Abend-am-Ostseestrand.html', sourceLabel: 'Meisterdrucke',
  },
  {
    artworkId: 'blue-boat', src: '/art-guides/mist-dawn/blue-boat.webp',
    scene: ti('A snow-covered hut standing alone in a vast white field'),
    guide: ti('Friedrich centres one small shelter inside an overwhelming field of snow. Homer’s canoe makes a similar wager at sea: a single boat becomes legible, and balance depends on reading the whole expanse around it.'),
    book: CDF + 'Snow-covered Hut', bookYear: 1827, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Verschneite_H%C3%BCtte.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'simplon-pass', src: '/art-guides/mist-dawn/simplon-pass.webp',
    scene: ti('A lonely cairn emerging from snow beneath a grey sky'),
    guide: ti('Friedrich lets weather reduce the world to stone, snow and one dark marker. Sargent’s Alpine watercolour also lets atmosphere dominate precise description, making the mountain something felt at body scale.'),
    book: CDF + 'Cairn in Snow', bookYear: 1807, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Caspar_David_Friedrich_-_Cairn_in_Snow_-_Google_Art_Project.jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'mending-sail', src: '/art-guides/mist-dawn/mending-sail.webp',
    scene: ti('A great oak standing bare against winter snow'),
    guide: ti('Friedrich’s oak endures through structure: every branch a decision that survived the season. Sargent’s sailors mending a sail share that respect for craft — ordinary labour becomes absorbing when form and task are observed closely enough.'),
    book: CDF + 'Oak Tree in the Snow', bookYear: 1829, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Caspar_David_Friedrich_-_Oak_in_the_Snow_-_WGA8281.jpg', sourceLabel: COMMONS,
  },
  {
    artworkId: 'mountain-fire', src: '/art-guides/mist-dawn/mountain-fire.webp',
    scene: ti('A dark cemetery gate beneath towering bare trees'),
    guide: ti('Friedrich turns an ordinary churchyard gate into a passage between worlds, the dark mass of trees overwhelming the small architecture. Sargent’s mountain fire similarly lets terrain dissolve into shifting atmosphere rather than a neatly outlined object.'),
    book: CDF + 'The Cemetery Gate', bookYear: 1825, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Caspar_David_Friedrich_-_The_Cemetery_Gate_(The_Churchyard)_-_WGA8276.jpg', sourceLabel: 'Wikipedia',
  },
  {
    artworkId: 'melon-boats', src: '/art-guides/mist-dawn/melon-boats.webp',
    scene: ti('A stranded shipwreck on a moonlit shore of dark rocks'),
    guide: ti('Friedrich cuts hull, mast and shore into bold shapes of moonlight and rock. Sargent’s melon boats work similarly in hard southern sun: sail, hull and shadow become a succession of strong fragments.'),
    book: CDF + 'Sea Shore with Shipwreck by Moonlight', bookYear: 1830, sourceUrl: 'https://de.wikipedia.org/wiki/Datei:Caspar_David_Friedrich_-_Meeresk%C3%BCste_bei_Mondschein.jpg', sourceLabel: 'Wikipedia',
  },
]

export const MIST_DAWN_ART_GUIDE_BY_ARTWORK = Object.fromEntries(
  MIST_DAWN_ART_GUIDES.map((guide) => [guide.artworkId, guide]),
) as Record<string, ArtGuide>
