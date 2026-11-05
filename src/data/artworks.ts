export type ArtworkTechnique = 'oil' | 'watercolor'

export interface HistoricalArtwork {
  id: string
  title: string
  artist: string
  date: string
  medium: string
  technique: ArtworkTechnique
  collection: string
  note: string
  src: string
  sourceUrl: string
  license: string
  licenseUrl: string
}

const PUBLIC_DOMAIN_MARK = 'https://creativecommons.org/publicdomain/mark/1.0/'

export const HISTORICAL_ARTWORKS: HistoricalArtwork[] = [
  {
    id: 'seurat-bathers-study', title: 'Final Study for “Bathers at Asnières”', artist: 'Georges Seurat', date: '1883',
    medium: 'Oil on panel', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'A small preparatory panel for Seurat’s monumental riverside painting — men and boys rest along the Seine at Asnières while the larger composition is still taking shape.',
    src: '/artworks/seurat-bathers-study.webp',
    sourceUrl: 'https://www.artic.edu/artworks/20199/final-study-for-bathers-at-asnieres', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'van-gogh-poets-garden', title: 'The Poet’s Garden', artist: 'Vincent van Gogh', date: '1888',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'A public garden in Arles becomes a dense weave of lawns, shrubs and trees — Van Gogh planned the scene as part of a decorative series for the Yellow House.',
    src: '/artworks/van-gogh-poets-garden.webp',
    sourceUrl: 'https://www.artic.edu/artworks/14586/the-poet-s-garden', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'caillebotte-skiffs', title: 'Skiffs', artist: 'Gustave Caillebotte', date: '1877',
    medium: 'Oil on canvas', technique: 'oil', collection: 'National Gallery of Art, Washington',
    note: 'Flat-bottomed canoes zigzag along the Yerres near Caillebotte’s family estate — broken strokes and bright paddles turn a quiet outing into a diagonal rhythm.',
    src: '/artworks/caillebotte-skiffs.webp',
    sourceUrl: 'https://www.nga.gov/artworks/66404-skiffs', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'cassatt-reader', title: 'The Reader', artist: 'Mary Cassatt', date: '1877',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Crystal Bridges Museum of American Art — promised gift',
    note: 'A young woman remains absorbed in her book rather than returning our gaze — Cassatt makes reading, leisure and inward attention the true subject of the portrait.',
    src: '/artworks/cassatt-reader.webp',
    sourceUrl: 'https://crystalbridges.org/artworks/a2003-007', license: 'Public domain in the United States', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'song-lark', title: 'The Song of the Lark', artist: 'Jules Breton', date: '1884',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'A farm girl pauses in the field at dawn, arrested by a bird’s song — Breton’s hymn to rural labour and music.',
    src: '/artworks/song-lark.webp',
    sourceUrl: 'https://www.artic.edu/artworks/94841/the-song-of-the-lark', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'cezanne-auvers-panorama', title: 'Auvers, Panoramic View', artist: 'Paul Cézanne', date: '1873–1875',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Looking over Auvers’s rooftops toward open fields, Cézanne builds the village from blocky patches of colour and ragged brushwork — a landscape about the sensation of seeing as much as the view itself.',
    src: '/artworks/cezanne-auvers-panorama.webp',
    sourceUrl: 'https://www.artic.edu/artworks/14556/auvers-panoramic-view', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'lautrec-equestrienne', title: 'Equestrienne (At the Cirque Fernando)', artist: 'Henri de Toulouse-Lautrec', date: '1887–1888',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'At the Cirque Fernando, a rider prepares to rise and pass through a paper hoop — Lautrec catches the charged instant before the trick rather than its applause.',
    src: '/artworks/lautrec-equestrienne.webp',
    sourceUrl: 'https://www.artic.edu/artworks/16146/equestrienne-at-the-cirque-fernando', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'renoir-woman-piano', title: 'Woman at the Piano', artist: 'Pierre-Auguste Renoir', date: '1875–1876',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'A pianist turns toward the score in a dark, close interior — white fabric and touches at the keyboard hold the quiet concentration of a private performance.',
    src: '/artworks/renoir-woman-piano.webp',
    sourceUrl: 'https://www.artic.edu/artworks/25825/woman-at-the-piano', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'monet-petite-creuse', title: 'The Petite Creuse River', artist: 'Claude Monet', date: '1889',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Sunlight splinters across the Petite Creuse in the Creuse valley — Monet returned to this view in a series, even having new oak leaves removed to prolong his first composition.',
    src: '/artworks/monet-petite-creuse.webp',
    sourceUrl: 'https://www.artic.edu/artworks/81546/the-petite-creuse-river', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'monet-bennecourt', title: 'On the Bank of the Seine, Bennecourt', artist: 'Claude Monet', date: '1868',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Camille Doncieux sits on an island in the Seine and looks toward Gloton — reflection, shade and a resting figure hold this early riverside scene together.',
    src: '/artworks/monet-bennecourt.webp',
    sourceUrl: 'https://www.artic.edu/artworks/81539/on-the-bank-of-the-seine-bennecourt', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'van-gogh-fishing-spring', title: 'Fishing in Spring, the Pont de Clichy (Asnières)', artist: 'Vincent van Gogh', date: '1887',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Near the Pont de Clichy, short touches of pure colour flicker across the Seine — a spring view shaped by Van Gogh’s encounters with Signac, Seurat and divisionism.',
    src: '/artworks/van-gogh-fishing-spring.webp',
    sourceUrl: 'https://www.artic.edu/artworks/109314/fishing-in-spring-the-pont-de-clichy-asnieres', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'monet-poppy-field', title: 'Poppy Field (Giverny)', artist: 'Claude Monet', date: '1890–1891',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'One of four closely related Giverny canvases begun in July 1890 — poppies, trees and distant hills are developed through an increasingly even weave of brushwork.',
    src: '/artworks/monet-poppy-field.webp',
    sourceUrl: 'https://www.artic.edu/artworks/4783/poppy-field-giverny', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'degas-yellow-dancers', title: 'Yellow Dancers (In the Wings)', artist: 'Edgar Degas', date: '1874–1876',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Degas places us in the stage wings, where yellow costumes and partial views turn performance into glimpses, gestures and anticipation; he signed the work before the 1876 Impressionist exhibition.',
    src: '/artworks/degas-yellow-dancers.webp',
    sourceUrl: 'https://www.artic.edu/artworks/18951/yellow-dancers-in-the-wings', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'pissarro-crystal-palace', title: 'The Crystal Palace', artist: 'Camille Pissarro', date: '1871',
    medium: 'Oil on canvas', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Painted during Pissarro’s stay in Lower Norwood, London — the Crystal Palace sits at the left while roads, walkers and daily modern life claim the foreground.',
    src: '/artworks/pissarro-crystal-palace.webp',
    sourceUrl: 'https://www.artic.edu/artworks/110541/the-crystal-palace', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'van-gogh-moulin-blute-fin', title: 'Terrace and Observation Deck at the Moulin de Blute-Fin, Montmartre', artist: 'Vincent van Gogh', date: 'early 1887',
    medium: 'Oil on canvas, mounted on pressboard', technique: 'oil', collection: 'Art Institute of Chicago',
    note: 'Van Gogh looks across Montmartre from the terrace beside the Blute-Fin windmill — once a working mill, by then part of a leisure destination with an observation deck.',
    src: '/artworks/van-gogh-moulin-blute-fin.webp',
    sourceUrl: 'https://www.artic.edu/artworks/27954/terrace-and-observation-deck-at-the-moulin-de-blute-fin-montmartre', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  {
    id: 'two-schooners', title: 'Two Schooners, Gloucester', artist: 'Winslow Homer', date: 'c. 1880',
    medium: 'Watercolor, gouache and graphite pencil on wove paper', technique: 'watercolor', collection: 'Philadelphia Museum of Art',
    note: 'Fishing schooners at anchor in Gloucester harbor — Homer’s watercolor begins as drawing and ends as pure light on paper.',
    src: '/artworks/two-schooners.webp',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Winslow_Homer_-_Two_Schooners,_Gloucester.jpg', license: 'Public domain', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'sailing-gloucester', title: 'Sailing off Gloucester', artist: 'Winslow Homer', date: 'c. 1880',
    medium: 'Watercolor on wove paper', technique: 'watercolor', collection: 'Yale University Art Gallery',
    note: 'A single sailboat within a broad, pale reserve of sea and sky — delicate washes and untouched paper carry the light.',
    src: '/artworks/sailing-gloucester.webp',
    sourceUrl: 'https://artgallery.yale.edu/collections/objects/75142', license: 'Public domain', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'blue-boat', title: 'The Blue Boat', artist: 'Winslow Homer', date: '1892',
    medium: 'Watercolor over graphite pencil on paper', technique: 'watercolor', collection: 'Museum of Fine Arts, Boston',
    note: 'Two fishermen working from a small blue canoe — one of the celebrated late watercolors from the 1890s, light built from layered washes.',
    src: '/artworks/blue-boat.webp',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:The_Blue_Boat_1892_Winslow_Homer.jpg', license: 'Public domain', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'simplon-pass', title: 'In the Simplon Pass', artist: 'John Singer Sargent', date: '1909',
    medium: 'Translucent watercolor, touches of opaque watercolor and wax resist with graphite underdrawing', technique: 'watercolor', collection: 'Brooklyn Museum',
    note: 'A figure with a parasol in the high Alps — passages of the face and parasol shaft remain unfinished, while translucent washes and wax resist animate the mountain light.',
    src: '/artworks/simplon-pass.webp',
    sourceUrl: 'https://www.brooklynmuseum.org/objects/94287', license: 'Public domain; no known copyright restrictions', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'mending-sail', title: 'Mending a Sail', artist: 'John Singer Sargent', date: '1905–1906',
    medium: 'Watercolor over graphite on heavy white paper', technique: 'watercolor', collection: 'Brooklyn Museum',
    note: 'Sailors bent over canvas — a working moment caught in quick, salt-bright washes of blue and ochre.',
    src: '/artworks/mending-sail.webp',
    sourceUrl: 'https://www.brooklynmuseum.org/opencollection/objects/20382', license: 'Public domain; no known copyright restrictions', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'mountain-fire', title: 'Mountain Fire', artist: 'John Singer Sargent', date: 'c. 1906–1907',
    medium: 'Opaque and translucent watercolor', technique: 'watercolor', collection: 'Brooklyn Museum',
    note: 'An expansive Alpine view veiled by smoke and steam — opaque white and freely bleeding wet washes make this one of Sargent’s most abstracted watercolors.',
    src: '/artworks/mountain-fire.webp',
    sourceUrl: 'https://www.brooklynmuseum.org/objects/20383', license: 'Public domain; no known copyright restrictions', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
  {
    id: 'melon-boats', title: 'Melon Boats', artist: 'John Singer Sargent', date: 'c. 1908',
    medium: 'Opaque and translucent watercolor with graphite underdrawing', technique: 'watercolor', collection: 'Brooklyn Museum',
    note: 'Ordinary work vessels, very likely painted at Haifa — dramatic cropping, a broad expanse of sail and bright white accents recreate intense sunlight.',
    src: '/artworks/melon-boats.webp',
    sourceUrl: 'https://www.brooklynmuseum.org/objects/20381', license: 'Public domain; no known copyright restrictions', licenseUrl: PUBLIC_DOMAIN_MARK,
  },
]

export function artworkForEpisode(episodeId: string): HistoricalArtwork {
  const oilWorks = HISTORICAL_ARTWORKS.filter((artwork) => artwork.technique === 'oil')
  const hash = Array.from(episodeId).reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7)
  return oilWorks[hash % oilWorks.length]
}
