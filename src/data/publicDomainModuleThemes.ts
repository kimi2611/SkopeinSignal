import { MODULE_ILLUSTRATIONS, type ModuleIllustration } from './moduleIllustrations'
import type { AtelierTheme, ViewKey } from '../types'
import { ti } from '../lib/i18n'

export interface PublicDomainModuleTheme {
  name: string
  artist: string
  illustrations: Partial<Record<ViewKey, ModuleIllustration>>
}

const COMMONS = 'https://commons.wikimedia.org/wiki/File:'

// Fourteen module vignettes per theme. Individual performance recordings and
// artwork guides intentionally keep their original content without new art.
export const PUBLIC_DOMAIN_MODULE_THEMES: Record<'forest-dusk' | 'mist-dawn' | 'whimsical', PublicDomainModuleTheme> = {
  'forest-dusk': {
    name: ti('Mysterious'),
    artist: 'John Bauer',
    illustrations: {
      week: { src: '/module-art/forest-dusk/week.webp', book: ti('The Princess and the Four Trolls'), bookYear: 1915, scene: ti('A small week held within a much larger story'), source: `${COMMONS}John_Bauer_1915.jpg` },
      inbox: { src: '/module-art/forest-dusk/inbox.webp', book: ti('Princess Tuvstarr gazing down into the dark waters of the forest tarn'), bookYear: 1913, scene: ti('New arrivals invite a closer look beneath the surface'), source: `${COMMONS}John_Bauer_-_Princess_Tuvstarr_gazing_down_into_the_dark_waters_of_the_forest_tarn._-_Google_Art_Project.jpg` },
      study: { src: '/module-art/forest-dusk/study.webp', book: ti('The Princess in the Forest'), bookYear: 1915, scene: ti('Listening quietly at the edge of the forest'), source: 'https://picryl.com/media/princessa-i-skogen-by-john-bauer-1915-daaa6b' },
      notes: { src: '/module-art/forest-dusk/notes.webp', book: ti('The Elk and the Little Princess'), bookYear: 1912, scene: ti('Thoughts travel farther when they are written down'), source: `${COMMONS}John-Bauer-Elk-Cotton3.jpg` },
      quiz: { src: '/module-art/forest-dusk/quiz.webp', book: ti('The Boy Who Was Never Afraid'), bookYear: 1912, scene: ti('A courageous answer begins with careful listening'), source: `${COMMONS}Illustration_from_%27The_boy_who_never_was_afraid%27.png` },
      cards: { src: '/module-art/forest-dusk/cards.webp', book: ti('Poor Little Bear!'), bookYear: 1912, scene: ti('Small words become companions worth remembering'), source: `${COMMONS}Stackars_lilla_Basse!.jpg` },
      insights: { src: '/module-art/forest-dusk/insights.webp', book: ti('The Ring'), bookYear: 1914, scene: ti('A meaningful detail reveals the shape of the whole'), source: `${COMMONS}The_Ring_(2)_by_John_Bauer_1914.jpg` },
      sparks: { src: '/module-art/forest-dusk/sparks.webp', book: ti('The Gnome Boy'), bookYear: 1909, scene: ti('A tiny discovery can set an idea in motion'), source: `${COMMONS}Tomtepojken_by_John_Bauer_1909.jpg` },
      shows: { src: '/module-art/forest-dusk/shows.webp', book: ti('The Knight Rides'), bookYear: null, scene: ti('Different voices set out along different paths'), source: `${COMMONS}Riddaren_rider_by_John_Bauer.jpg` },
      gallery: { src: '/module-art/forest-dusk/gallery.webp', book: ti('The Giant Who Slept for Ten Thousand Years'), bookYear: 'ca. 1910', scene: ti('An ancient presence listens to the music of the city'), source: 'https://fineartamerica.com/featured/the-giant-who-slept-for-ten-thousand-years-ca-1910-john-bauer.html' },
      dedupe: { src: '/module-art/forest-dusk/dedupe.webp', book: ti('The Princess and the Trolls'), bookYear: 1913, scene: ti('Compare closely before deciding what belongs together'), source: `${COMMONS}John_Bauer_-_The_Princess_and_the_Trolls_-_Google_Art_Project.jpg` },
      guide: { src: '/module-art/forest-dusk/guide.webp', book: ti('Humpe'), bookYear: 1912, scene: ti('An old guide helps a new traveller find the way'), source: `${COMMONS}Humpe_1_by_John_Bauer_1912.jpg` },
      account: { src: '/module-art/forest-dusk/account.webp', book: ti('Freyja and Svipdag'), bookYear: null, scene: ti('A familiar meeting place for your own listening journey'), source: `${COMMONS}Freyja_and_Svipdag_-_John_Bauer.jpg` },
      settings: { src: '/module-art/forest-dusk/settings.webp', book: ti('Troll Trouble'), bookYear: 1909, scene: ti('Many small adjustments keep the forest path open'), source: `${COMMONS}Troll_trouble_by_John_Bauer.jpg` },
    },
  },
  'mist-dawn': {
    name: ti('Contemplative'),
    artist: 'Caspar David Friedrich',
    illustrations: {
      week: { src: '/module-art/mist-dawn/week.webp', book: ti('The Stages of Life'), bookYear: 1835, scene: ti('One week within the longer voyage of attention'), source: 'https://www.europosters.eu/the-stages-of-life-1835-v22386' },
      inbox: { src: '/module-art/mist-dawn/inbox.webp', book: ti('Woman at a Window'), bookYear: 1822, scene: ti('New signals arrive at the window of attention'), source: `${COMMONS}Caspar_David_Friedrich_-_Frau_am_Fenster_-_Google_Art_Project.jpg` },
      study: { src: '/module-art/mist-dawn/study.webp', book: ti('The Dreamer'), bookYear: 1840, scene: ti('A quiet room for reading, listening, and reflection'), source: `${COMMONS}Caspar_David_Friedrich_011.jpg` },
      notes: { src: '/module-art/mist-dawn/notes.webp', book: ti('Man and Woman Contemplating the Moon'), bookYear: 1824, scene: ti('Shared attention gives thoughts somewhere to gather'), source: `${COMMONS}Caspar_David_Friedrich_-_Man_and_Woman_Contemplating_the_Moon_-_WGA08271.jpg` },
      quiz: { src: '/module-art/mist-dawn/quiz.webp', book: ti('The Monk by the Sea'), bookYear: '1808–1810', scene: ti('One clear voice within a wide field of listening'), source: `${COMMONS}Caspar_David_Friedrich_-_Der_M%C3%B6nch_am_Meer_-_Google_Art_Project.jpg` },
      cards: { src: '/module-art/mist-dawn/cards.webp', book: ti('The Tree of Crows'), bookYear: 1822, scene: ti('Branch by branch, words become a living structure'), source: 'https://en.wikipedia.org/wiki/The_Tree_of_Crows' },
      insights: { src: '/module-art/mist-dawn/insights.webp', book: ti('The Sea of Ice'), bookYear: '1823–1824', scene: ti('Fragments align into a larger field of meaning'), source: `${COMMONS}Caspar_David_Friedrich_-_The_Sea_of_Ice_-_WGA8270.jpg` },
      sparks: { src: '/module-art/mist-dawn/sparks.webp', book: ti('The Solitary Tree'), bookYear: 1822, scene: ti('A single idea can open an entire landscape'), source: 'https://www.wikiart.org/en/caspar-david-friedrich/solitary-tree-1822' },
      shows: { src: '/module-art/mist-dawn/shows.webp', book: ti('Morning in the Mountains'), bookYear: 1808, scene: ti('Many voices recede and return across the listening horizon'), source: `${COMMONS}Friedrich,_Caspar_David_-_Morning_in_the_Mountains.jpg` },
      gallery: { src: '/module-art/mist-dawn/gallery.webp', book: ti('The Abbey in the Oakwood'), bookYear: '1809–1810', scene: ti('Music gathers in a vast and silent architectural space'), source: `${COMMONS}Caspar_David_Friedrich_-_Abtei_im_Eichwald_-_Google_Art_Project.jpg` },
      dedupe: { src: '/module-art/mist-dawn/dedupe.webp', book: ti('Two Men Contemplating the Moon'), bookYear: 'ca. 1825–1830', scene: ti('Two perspectives meet around the same point of light'), source: 'https://www.metmuseum.org/art/collection/search/438417' },
      guide: { src: '/module-art/mist-dawn/guide.webp', book: ti('Wanderer above the Sea of Fog'), bookYear: 1818, scene: ti('A clear vantage point for finding your next step'), source: `${COMMONS}Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg` },
      account: { src: '/module-art/mist-dawn/account.webp', book: ti('On the Sailing Boat'), bookYear: '1818–1819', scene: ti('Your workspace accompanies the direction you choose'), source: `${COMMONS}Caspar_David_Friedrich_-_On_the_Sailing_Boat_-_WGA8255.jpg` },
      settings: { src: '/module-art/mist-dawn/settings.webp', book: ti('Chalk Cliffs on Rügen'), bookYear: 'ca. 1825', scene: ti('A clear frame where every tool rests between sea and sky'), source: `${COMMONS}Caspar_David_Friedrich_-_Kreidefelsen_auf_R%C3%BCgen_(ca.1825).jpg` },
    },
  },
  whimsical: {
    name: ti('Whimsical'),
    artist: 'Edward Lear',
    illustrations: {
      week: { src: '/module-art/whimsical/week.webp', book: ti('There was an Old Man with a beard'), bookYear: 1846, scene: ti('A whole week of visitors nesting in one beard'), source: `${COMMONS}Edward_Lear_A_Book_of_Nonsense_84.jpg` },
      inbox: { src: '/module-art/whimsical/inbox.webp', book: ti('There was an Old Man on whose nose most birds of the air could repose'), bookYear: 1846, scene: ti('Every arrival finds a perch'), source: `${COMMONS}Edward_Lear_A_Book_of_Nonsense_16.jpg` },
      study: { src: '/module-art/whimsical/study.webp', book: ti('There was an Old Person of Ischia'), bookYear: 1846, scene: ti('A lively desk where listening turns to dance'), source: `${COMMONS}Edward_Lear_A_Book_of_Nonsense_14.jpg` },
      notes: { src: '/module-art/whimsical/notes.webp', book: ti('Nonsense Alphabet: G was a little old Goose'), bookYear: 'ca. 1865', scene: ti('Letters gather into lines of thought'), source: 'https://collections.vam.ac.uk/item/O1023241/nonsense-alphabet-drawing-lear-edward/' },
      quiz: { src: '/module-art/whimsical/quiz.webp', book: ti('There was an Old Man in a tree'), bookYear: 1846, scene: ti('A brisk question lands exactly where expected'), source: `${COMMONS}Edward_Lear_A_Book_of_Nonsense_87.jpg` },
      cards: { src: '/module-art/whimsical/cards.webp', book: ti('Nonsense Alphabet: J was a small jackdaw'), bookYear: 'ca. 1865', scene: ti('One word per card, each still in view'), source: 'https://collections.vam.ac.uk/item/O1023238/nonsense-alphabet-drawing-lear-edward/' },
      insights: { src: '/module-art/whimsical/insights.webp', book: ti('Manypeeplia Upsidownia'), bookYear: '1871–1877', scene: ti('Meaning appears when the picture turns upside down'), source: 'https://publicdomainreview.org/collection/edward-lears-nonsense-botany-1871-77/' },
      sparks: { src: '/module-art/whimsical/sparks.webp', book: ti('The Dong with a Luminous Nose'), bookYear: 1877, scene: ti('A single bright idea lights the way'), source: 'https://www.nonsenselit.org/Lear/ll/dln.html' },
      shows: { src: '/module-art/whimsical/shows.webp', book: ti('The Jumblies'), bookYear: 1871, scene: ti('Every show sails together in one sieve'), source: 'https://www.nonsenselit.org/Lear/ns/jumblies.html' },
      gallery: { src: '/module-art/whimsical/gallery.webp', book: ti('The Owl and the Pussy-Cat'), bookYear: 1871, scene: ti('Two musicians and a boatload of honey'), source: 'https://www.illustrationhistory.org/illustrations/the-owl-and-the-pussy-cat' },
      dedupe: { src: '/module-art/whimsical/dedupe.webp', book: ti('The Daddy Long-legs and the Fly'), bookYear: 1871, scene: ti('Two of a kind, sorted out at last'), source: 'https://www.nonsenselit.org/Lear/ns/dll.html' },
      guide: { src: '/module-art/whimsical/guide.webp', book: ti('Tickia Orologica'), bookYear: '1888', scene: ti('A stem of small clocks keeping the schedule'), source: 'https://pdimagearchive.org/images/d67d5829-4e1c-408f-b735-4d88bdfb7ef1/' },
      account: { src: '/module-art/whimsical/account.webp', book: ti('The Scroobious Pip'), bookYear: '1872', scene: ti('One account, cheerfully unclassifiable'), source: 'https://www.theparisreview.org/blog/2017/11/08/edward-lears-scroobious-pip/' },
      settings: { src: '/module-art/whimsical/settings.webp', book: ti('Nonsense Alphabet: C was a lovely Pussy Cat'), bookYear: 'ca. 1865', scene: ti('Every preference exactly as striped as you like'), source: 'https://collections.vam.ac.uk/item/O1023245/nonsense-alphabet-drawing-lear-edward/' },
    },
  },
}

export function getModuleIllustration(theme: AtelierTheme, view: ViewKey): { illustration: ModuleIllustration; artist: string } | null {
  if (theme === 'toot-puddle') return { illustration: MODULE_ILLUSTRATIONS[view], artist: 'Holly Hobbie' }
  if (theme === 'pure') return null
  const illustration = PUBLIC_DOMAIN_MODULE_THEMES[theme].illustrations[view]
  return illustration ? { illustration, artist: PUBLIC_DOMAIN_MODULE_THEMES[theme].artist } : null
}
