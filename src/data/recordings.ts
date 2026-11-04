export type RecordingId =
  'bassoon-glinka' | 'bassoon-reicha' | 'piano-goldberg' |
  'bassoon' | 'bassoon-mozart' |
  'flute' | 'flute-courante' | 'flute-sarabande' | 'flute-syrinx' |
  'guitar' | 'guitar-sor' | 'guitar-bach-laucke' | 'guitar-tarrega-lagrima' | 'guitar-tarrega-adelita' |
  'harp' | 'harp-prelude' | 'harp-mozart' |
  'cello-sarabande' | 'cello-courante' |
  'orchestra-schubert' | 'orchestra' | 'piano-liszt'

export interface PerformanceRecording {
  id: RecordingId
  instrument: string
  character: string
  work: string
  composer: string
  performer: string
  format: 'Solo recording' | 'Duo recording' | 'Chamber recording' | 'Concerto recording' | 'Orchestral recording'
  note: string
  src: string
  sourceUrl: string
  license: string
  licenseUrl: string
  modification: 'Complete performance; gentle noise reduction applied; converted to MP3.' | 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.' |
    'Complete performance; stereo channels compared, two gentle noise-reduction passes applied, and converted to MP3.'
}

export const PERFORMANCE_RECORDINGS: PerformanceRecording[] = [
  {
    id: 'bassoon-glinka', instrument: 'Bassoon', character: 'Clarinet, bassoon & piano · 2:40 excerpt', work: 'Trio pathétique in D minor — opening', composer: 'Mikhail Glinka', performer: 'Arthur Grossman, bassoon · William McColl, clarinet · Stanley Chapple, piano', format: 'Chamber recording',
    note: 'Glinka’s “Pathétique” trio — Russian Romantic lyricism shared by clarinet, bassoon and piano, with some of its most plaintive lines entrusted to the bassoon. Bassoonist Arthur Grossman with William McColl and Stanley Chapple, from the Pandora Records / Al Goldstein archive; opening excerpt.',
    src: '/recordings/bassoon-glinka-trio-mccoll-grossman.mp3', sourceUrl: 'https://imslp.org/wiki/Trio_path%C3%A9tique_(Glinka,_Mikhail)', license: 'EFF Open Audio License 1.0', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:OAL-1', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'bassoon-reicha', instrument: 'Bassoon', character: 'Wind quintet · 2:40 excerpt', work: 'Wind Quintet in E-flat major, Op. 88 No. 2: I. Allegro — opening', composer: 'Anton Reicha', performer: 'Soni Ventorum Wind Quintet · Arthur Grossman, bassoon', format: 'Chamber recording',
    note: 'Reicha’s quintets made five winds equal partners — the bassoon moves between bass line and melody throughout. The Soni Ventorum Wind Quintet with bassoonist Arthur Grossman, recorded at Meany Theatre in 1986; opening of the first movement.',
    src: '/recordings/bassoon-reicha-quintet-soni-ventorum.mp3', sourceUrl: 'https://imslp.org/wiki/Wind_Quintet,_Op.88_No.2_(Reicha,_Anton)', license: 'EFF Open Audio License 1.0', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:OAL-1', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'piano-goldberg', instrument: 'Piano', character: 'Solo piano · 1:56', work: 'Goldberg Variations, BWV 988: Variatio 1 a 1 Clav.', composer: 'Johann Sebastian Bach', performer: 'Kimiko Ishizaka', format: 'Solo recording',
    note: 'The first variation of the Goldberg set — bright, hand-crossing energy right after the Aria. From Ishizaka’s crowdfunded Open Goldberg Variations, released under CC0.',
    src: '/recordings/piano-bach-goldberg-kimiko-ishizaka.mp3', sourceUrl: 'https://www.opengoldbergvariations.org/', license: 'CC0 1.0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'bassoon', instrument: 'Bassoon', character: 'Bassoon & piano · 2:40 excerpt', work: 'Sonata for Bassoon and Piano, Op. 168 — opening', composer: 'Camille Saint-Saëns', performer: 'Arthur Grossman · Joseph Levine', format: 'Duo recording',
    note: 'Saint-Saëns wrote this sonata in 1921, the last year of his life — pastoral calm for bassoon with piano. Bassoonist Arthur Grossman with pianist Joseph Levine; opening excerpt.',
    src: '/recordings/bassoon-saint-saens-grossman-levine.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Camille_Saint-Saens_-_Sonata_for_bassoon_with_piano_accompaniment_(opus_168).ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'bassoon-mozart', instrument: 'Bassoon', character: 'Bassoon & orchestra · 2:40 excerpt', work: 'Bassoon Concerto in B-flat major, K. 191: Rondo. Tempo di Menuetto — opening', composer: 'Wolfgang Amadeus Mozart', performer: 'Arthur Grossman · Seventh Army Symphony Orchestra · Ling Tung', format: 'Concerto recording',
    note: 'Mozart was eighteen when he wrote the B-flat concerto, still the most played of all bassoon concertos. Arthur Grossman with the Seventh Army Symphony Orchestra under Ling Tung; the opening of the Rondo finale.',
    src: '/recordings/bassoon-mozart-grossman-seventh-army.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Mozart_-_Bassoon_Concerto_in_Bb_major_-_Rondo_Tempo_di_Menuetto.ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'flute', instrument: 'Flute', character: 'Solo flute · 3:01', work: 'Partita for Solo Flute, BWV 1013: Allemande', composer: 'Johann Sebastian Bach', performer: 'Scott Goff', format: 'Solo recording',
    note: 'The Allemande that opens Bach’s only work for solo flute — a single line implying a whole harmony. Flutist Scott Goff, complete performance.',
    src: '/recordings/flute-bach-scott-goff.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bach_-_Partita_For_Solo_Flute_-_Modern_Flute_-_1._Allemande.ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'flute-courante', instrument: 'Flute', character: 'Solo flute · 2:36', work: 'Partita for Solo Flute, BWV 1013: Courante', composer: 'Johann Sebastian Bach', performer: 'Scott Goff', format: 'Solo recording',
    note: 'The Courante — the quickest, most playful dance of the partita, running in long unbroken streams. Scott Goff, complete performance.',
    src: '/recordings/flute-bach-courante-scott-goff.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bach_-_Partita_For_Solo_Flute_-_Modern_Flute_-_2._Courante.ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'flute-sarabande', instrument: 'Flute', character: 'Solo flute · 2:12', work: 'Partita for Solo Flute, BWV 1013: Sarabande', composer: 'Johann Sebastian Bach', performer: 'Scott Goff', format: 'Solo recording',
    note: 'The Sarabande — slow, spacious, built on two-note sighs; one of Bach’s most austere solo movements. Scott Goff, complete performance.',
    src: '/recordings/flute-bach-sarabande-scott-goff.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bach_-_Partita_For_Solo_Flute_-_Modern_Flute_-_3._Sarabande.ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'flute-syrinx', instrument: 'Flute', character: 'Solo flute · 2:26', work: 'Syrinx', composer: 'Claude Debussy', performer: 'Sarah Bassingthwaite', format: 'Solo recording',
    note: 'Debussy’s 1913 miniature for solo flute — music for the god Pan, all breath and arabesque. Sarah Bassingthwaite, complete performance.',
    src: '/recordings/flute-debussy-syrinx-sarah-bassingthwaite.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Debussy_-_Syrinx.ogg', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'guitar', instrument: 'Classical guitar', character: 'Solo guitar · 2:13', work: 'El Noi de la Mare', composer: 'Catalan traditional song', performer: 'Jujutacular', format: 'Solo recording',
    note: 'A Catalan carol arranged for classical guitar — warm and songful, the melody always singing above the accompaniment figure. Jujutacular, complete performance.',
    src: '/recordings/guitar-el-noi-jujutacular.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:El_Noi_de_la_Mare_(guitar).ogg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'guitar-sor', instrument: 'Classical guitar', character: 'Solo guitar · 3:08', work: 'Twelve Minuets, Op. 11: No. 2', composer: 'Fernando Sor', performer: 'Jujutacular', format: 'Solo recording',
    note: 'Fernando Sor’s minuet — classical-era guitar writing at its most elegant, from the guitarist-composer who defined the instrument’s early repertoire. Jujutacular, complete performance.',
    src: '/recordings/guitar-sor-jujutacular.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sor_Op_11_No_2.ogg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'guitar-bach-laucke', instrument: 'Classical guitar', character: 'Solo guitar · 7:04', work: 'Violin Partita No. 1 in B minor, BWV 1002: Bourrée and Double (Laucke transcription)', composer: 'Johann Sebastian Bach', performer: 'Michael Laucke', format: 'Solo recording',
    note: 'Bach’s Bourrée and its Double in Michael Laucke’s own guitar transcription — the dance returns with its two voices newly animated. Laucke’s complete 2007 performance, with the stereo mix, left and right channels compared before gentle noise reduction.',
    src: '/recordings/guitar-bach-bourree-double-michael-laucke.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:J.S._Bach_~_Bourree_and_Double._Classical_Guitar_by_Michael_Laucke.ogv', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', modification: 'Complete performance; stereo channels compared, two gentle noise-reduction passes applied, and converted to MP3.',
  },
  {
    id: 'guitar-tarrega-lagrima', instrument: 'Classical guitar', character: 'Solo guitar · 2:06', work: 'Lágrima', composer: 'Francisco Tárrega', performer: 'Ramón León Egea', format: 'Solo recording',
    note: 'Tárrega’s tiny prelude — a tear-shaped melody he reportedly improvised at a London gathering. Ramón León Egea plays it on a ten-string guitar, fingering without nails, as Tárrega himself did.',
    src: '/recordings/guitar-tarrega-lagrima-ramon-leon-egea.mp3', sourceUrl: 'https://imslp.org/wiki/L%C3%A1grima_(T%C3%A1rrega,_Francisco)', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'guitar-tarrega-adelita', instrument: 'Classical guitar', character: 'Solo guitar · 1:53', work: 'Adelita (Mazurka)', composer: 'Francisco Tárrega', performer: 'Ramón León Egea', format: 'Solo recording',
    note: 'A tender mazurka — Tárrega’s salon miniature at its most songful, the melody singing over a gentle sway. Ramón León Egea on ten-string guitar, complete performance.',
    src: '/recordings/guitar-tarrega-adelita-ramon-leon-egea.mp3', sourceUrl: 'https://imslp.org/wiki/Adelita_(T%C3%A1rrega,_Francisco)', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'harp', instrument: 'Harp', character: 'Harp with string orchestra · 4:50', work: 'Danse sacrée (from Danse sacrée et danse profane, CD 113)', composer: 'Claude Debussy', performer: 'MSgt. Karen Grimsey, harp · United States Marine Chamber Orchestra · Maj. Jason K. Fettig, conductor', format: 'Concerto recording',
    note: 'Debussy wrote the two Danses in 1904 for the Érard company’s harp-versus-piano contest. The Danse sacrée opens with the harp alone, modal and ceremonial, before muted strings answer. Karen Grimsey and the United States Marine Chamber Orchestra under Jason K. Fettig performed it live on 14 August 2010 at the Rachel M. Schlesinger Concert Hall; the federal-government recording is public domain.',
    src: '/recordings/harp-debussy-danse-sacree-marine-band.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Danse_Sacr%C3%A9e.ogg', license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'harp-prelude', instrument: 'Harp', character: 'Harp with string orchestra · 5:40', work: 'Danse profane (from Danse sacrée et danse profane, CD 113)', composer: 'Claude Debussy', performer: 'MSgt. Karen Grimsey, harp · United States Marine Chamber Orchestra · Maj. Jason K. Fettig, conductor', format: 'Concerto recording',
    note: 'The secular partner of the pair: where the Danse sacrée is ritual, the Danse profane dances — the harp trading quick figures with the string orchestra. This is the second dance from the same live Marine Chamber Orchestra concert on 14 August 2010 at the Rachel M. Schlesinger Concert Hall; the federal-government recording is public domain.',
    src: '/recordings/harp-debussy-danse-profane-marine-band.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Danse_Profane.ogg', license: 'Public domain', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'harp-mozart', instrument: 'Harp', character: 'Harp & flute with orchestra · 2:40 excerpt', work: 'Concerto for Flute and Harp, K. 299: II. Andantino — opening', composer: 'Wolfgang Amadeus Mozart', performer: 'Ann Yeung, harp · Alexander Murray, flute · University of Illinois Sinfonia da Camera · Ian Hobson', format: 'Concerto recording',
    note: 'The Andantino of Mozart’s double concerto — harp and flute trading one of his most tender melodies over muted strings. Harpist Ann Yeung with flutist Alexander Murray and Sinfonia da Camera under Ian Hobson, from the Pandora Records / Al Goldstein archive; opening excerpt.',
    src: '/recordings/harp-mozart-k299-andantino-yeung.mp3', sourceUrl: 'https://imslp.org/wiki/Flute_and_Harp_Concerto_in_C_major,_K.299/297c_(Mozart,_Wolfgang_Amadeus)', license: 'EFF Open Audio License 1.0', licenseUrl: 'https://commons.wikimedia.org/wiki/Template:OAL-1', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'cello-sarabande', instrument: 'Cello', character: 'Solo cello · 2:04', work: 'Cello Suite No. 1 in G major, BWV 1007: Sarabande', composer: 'Johann Sebastian Bach', performer: 'John Michel', format: 'Solo recording',
    note: 'The Sarabande — the still, inward center of the first suite, almost entirely single notes. John Michel, complete performance.',
    src: '/recordings/cello-bach-sarabande-john-michel.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:JOHN_MICHEL_CELLO-J_S_BACH_CELLO_SUITE_1_in_G_Sarabande.ogg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'cello-courante', instrument: 'Cello', character: 'Solo cello · 2:20', work: 'Cello Suite No. 1 in G major, BWV 1007: Courante', composer: 'Johann Sebastian Bach', performer: 'John Michel', format: 'Solo recording',
    note: 'The Courante — quick, dance-like runs across the strings, the most athletic movement of the first suite. John Michel, complete performance.',
    src: '/recordings/cello-bach-courante-john-michel.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:JOHN_MICHEL_CELLO-J_S_BACH_CELLO_SUITE_1_in_G_Courante.ogg', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'orchestra-schubert', instrument: 'Symphony orchestra', character: 'Full orchestra · 2000 · 2:40 excerpt', work: 'Symphony No. 8 in B minor, D. 759 “Unfinished”: I. Allegro moderato — opening', composer: 'Franz Schubert', performer: 'Fulda Symphonic Orchestra · Simon Schindler', format: 'Orchestral recording',
    note: 'Schubert’s “Unfinished” opens in a hush — cellos and basses murmur, then oboe and clarinet over trembling strings. The Fulda Symphonic Orchestra under Simon Schindler, recorded in 2000; opening excerpt.',
    src: '/recordings/orchestra-schubert-symphony8-fulda.mp3', sourceUrl: 'https://imslp.org/wiki/Symphony_No.8,_D.759_(Schubert,_Franz)', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'orchestra', instrument: 'Symphony orchestra', character: 'Full orchestra · 2:40 excerpt', work: 'Egmont Overture, Op. 84 — opening', composer: 'Ludwig van Beethoven', performer: 'Czech National Symphony Orchestra · Musopen', format: 'Orchestral recording',
    note: 'Beethoven’s overture to Goethe’s Egmont — defiance turning to victory. Musopen’s public-domain recording with the Czech National Symphony Orchestra; opening excerpt.',
    src: '/recordings/orchestra-beethoven-czech-nso.mp3', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Beethoven_-_Egmont_Overture,_Op._84_(Musopen_Symphony).flac', license: 'Public domain dedication by Musopen', licenseUrl: 'https://creativecommons.org/publicdomain/mark/1.0/', modification: 'Opening 2:40 excerpt; gentle noise reduction applied; converted to MP3.',
  },
  {
    id: 'piano-liszt', instrument: 'Piano', character: 'Solo piano · 4:17', work: 'Consolation No. 3 in D-flat major, S. 172', composer: 'Franz Liszt', performer: 'German Kitkin', format: 'Solo recording',
    note: 'Liszt’s third Consolation — a slow, songful miniature in D-flat major, calm music for late hours. Pianist German Kitkin’s 2024 studio recording, complete performance.',
    src: '/recordings/piano-liszt-consolation3-kitkin.mp3', sourceUrl: 'https://imslp.org/wiki/Consolations,_S.172_(Liszt,_Franz)', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', modification: 'Complete performance; gentle noise reduction applied; converted to MP3.',
  },
]
