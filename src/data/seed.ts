import type { Episode } from '../types'

type SeedInput = Pick<Episode, 'showId' | 'title' | 'durationMinutes'> & Partial<Episode>

export const CURRENT_SEED_REVISION = 2
export const ORIGINAL_SEED_IDS = Array.from({ length: 14 }, (_, index) => `seed-${String(index + 1).padStart(2, '0')}`)
export const ORIGINAL_SEED_STATUSES: Record<string, Episode['status']> = {
  'seed-01': 'queue', 'seed-02': 'queue', 'seed-03': 'queue', 'seed-04': 'queue', 'seed-05': 'queue',
  'seed-06': 'inbox', 'seed-07': 'inbox', 'seed-08': 'inbox', 'seed-09': 'inbox', 'seed-10': 'inbox',
  'seed-11': 'inbox', 'seed-12': 'inbox', 'seed-13': 'inbox', 'seed-14': 'inbox',
}

const inputs: SeedInput[] = [
  {
    showId: 'acquired', title: 'Seinfeld', durationMinutes: 230, status: 'queue',
    guid: '9c3ce276-af3c-49a3-9d45-94b784b9c6a5', publishedAt: '2026-10-19T04:00:46.000Z',
    link: 'https://www.acquired.fm/episodes/seinfeld', audioUrl: 'https://pscrb.fm/rss/p/media.transistor.fm/96a5f313/515377c5.mp3',
    selectionReasons: ['A company and product history worth a full review', 'Directly connected to the business core thread'],
    description: 'Verified from Acquired’s public RSS feed; remove or replace it freely.',
  },
  {
    showId: 'toe', title: 'Hirosi Ooguri: Could AI Find Physics We Can’t Understand?', durationMinutes: 130, status: 'queue',
    guid: 'd32b9e6a-c828-11f1-bee8-a341ea79a41c', publishedAt: '2026-10-19T13:30:00.000Z',
    audioUrl: 'https://s.gum.fm/s-62d83916a854b1cc0031878d/pscrb.fm/rss/p/mgln.ai/e/p346854/traffic.megaphone.fm/TEMI9250070343.mp3',
    selectionReasons: ['At the intersection of physics and AI', 'A guest with a distinctive research perspective'],
    description: 'Verified from TOE’s public RSS feed; remove or replace it freely.',
  },
  {
    showId: 'exponential', title: 'Inside the $110 billion AI economy (and who is really paying for it)', durationMinutes: 15, status: 'queue',
    guid: '527bb3c4-95c3-424e-b07d-32f2fcbaecaf', publishedAt: '2026-10-22T20:03:22.000Z',
    link: 'https://www.exponentialview.co',
    audioUrl: 'https://afp-444457-injected.calisto.simplecastaudio.com/ea6da43b-cf32-4bb2-a71f-d5ad709d858f/episodes/0e573ad4-34f0-443d-ba09-f7c49dfd71b9/audio/128/default.mp3?aid=rss_feed&awCollectionId=ea6da43b-cf32-4bb2-a71f-d5ad709d858f&awEpisodeId=0e573ad4-34f0-443d-ba09-f7c49dfd71b9&feed=e_GRxR9a',
    selectionReasons: ['Adds an AI industry-structure perspective', 'A micro discussion suited to this week’s radar'],
    description: 'Verified from Exponential View’s public RSS feed.',
  },
  {
    showId: 'philosophy-bites', title: 'Daisy Dixon on Depraved Art', durationMinutes: 24, status: 'queue',
    guid: '65e1c48b-6cde-4248-b9c4-c98ed8ffae90', publishedAt: '2026-10-19T09:16:00.000Z',
    link: 'https://philosophybites.libsyn.com/daisy-dixon-on-depraved-art', audioUrl: 'https://traffic.libsyn.com/secure/philosophybites/Daisy_Dixon_on_Depraved_Art.mp3?dest-id=14010',
    selectionReasons: ['A clear entry into a philosophical question', 'A micro discussion suited to selective listening'],
    description: 'Verified from Philosophy Bites’ public RSS feed.',
  },
  {
    showId: 'nzz', title: 'Schicksalswahl für Trump: Korrespondentin Isabelle Jacobi zu den Midterms', durationMinutes: 22, status: 'queue',
    guid: '4d380a71fe007aa18b0e62fca1084876', publishedAt: '2026-10-31T01:30:00.000Z',
    link: 'https://akzent.podigee.io/1707-schicksalswahl-fur-trump-korrespondentin-isabelle-jacobi-zu-den-midterms', audioUrl: 'https://audio.podigee-cdn.net/2637173-m-b97f1969d57ecc70a01159e4f75572d4.mp3?source=feed',
    selectionReasons: ['Adds a German-language media perspective', 'A micro discussion suited to the signal radar'],
    description: 'Verified from NZZ Akzent’s public RSS feed.',
  },
  {
    showId: 'toe', title: 'Scott Aaronson: “I Heard That a Robot Solved the Math Problem You Worked On”', durationMinutes: 90, status: 'queue',
    guid: '162405f2-cfc4-11f1-b250-f7b62c2acad0', publishedAt: '2026-10-26T13:30:00.000Z',
    audioUrl: 'https://s.gum.fm/s-62d83916a854b1cc0031878d/pscrb.fm/rss/p/mgln.ai/e/p346854/traffic.megaphone.fm/TEMI5219628591.mp3',
    selectionReasons: ['A timely mathematics and AI research discussion', 'Directly connected to the physics and AI core thread'],
    description: 'Verified from TOE’s public RSS feed.',
  },
  {
    showId: 'tyler', title: 'Roman Mars on Flags, Phones, and the Design of Everyday Life', durationMinutes: 46, status: 'queue',
    guid: '96cd7982-4581-46e1-bc58-14fb382bb03e', publishedAt: '2026-10-28T11:09:00.000Z',
    link: 'https://cowenconvos.libsyn.com/roman-mars-on-flags-phones-and-the-design-of-everyday-life', audioUrl: 'https://traffic.libsyn.com/secure/cowenconvos/CWT-295-RomanMars-Podcast-v2-final.mp3?dest-id=850607',
    selectionReasons: ['A medium-length design and everyday-life perspective', 'Balances the week with an interdisciplinary interview'],
    description: 'Verified from Conversations with Tyler’s public RSS feed.',
  },
  {
    showId: 'das-klima', title: 'DK182 - Die Erderwärmung der letzten 10 Jahre', durationMinutes: 26,
    publishedAt: '2026-10-26T00:00:00.000Z', link: 'https://dasklima.podigee.io/182-dk182-die-erderwarmung-der-letzten-10-jahre',
    description: 'An inbox candidate from Das Klima’s public feed.',
  },
  {
    showId: 'intelligence-squared', title: 'The Forgotten War: Inside the Democratic Republic of Congo', durationMinutes: 40, status: 'queue',
    guid: '7554b468-d523-11f1-af81-77a69433b0b5', publishedAt: '2026-10-30T00:00:00.000Z',
    audioUrl: 'https://pdst.fm/e/pscrb.fm/rss/p/traffic.megaphone.fm/NSR2799970687.mp3',
    selectionReasons: ['A focused medium-length foreign-policy briefing', 'Adds current context on an underreported conflict'],
    description: 'Verified from Intelligence Squared’s public RSS feed.',
  },
  {
    showId: 'resonator', title: 'Danke und auf Wiederhören', durationMinutes: 2,
    description: 'An inbox candidate from Resonator’s public feed. Reference shows need not enter the weekly queue.',
  },
  {
    showId: 'good-fight', title: 'Dan Williams on Why AI (Probably) Won’t Kill Us', durationMinutes: 47, status: 'queue',
    guid: 'e4d0eb4a-d23a-11f1-8b0b-b799210f8645', publishedAt: '2026-10-31T10:00:00.000Z',
    audioUrl: 'https://www.podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/clrtpod.com/m/traffic.megaphone.fm/TGF1380969244.mp3',
    selectionReasons: ['A medium-length argument about AI risk', 'Offers a contrasting position to frontier-AI interviews'],
    description: 'Verified from The Good Fight’s public RSS feed.',
  },
  {
    showId: 'weather', title: 'What happens when flooding monitors shut down?', durationMinutes: null,
    description: 'An inbox candidate from Weather Realness’ public feed.',
  },
  {
    showId: 'treibholz', title: 'Süß und salzig – Eis für jeden Geschmack', durationMinutes: null,
    description: 'An inbox candidate from Treibholz’s public feed. Treibholz is an archive-tier reference show, so its episodes wait in the inbox as reference material and never claim a weekly queue slot unless you select them yourself.',
  },
  {
    showId: 'deep-convection', title: 'The Sumner Files, Episode Twelve: Milton Resnick, Part 2', durationMinutes: null,
    description: 'An inbox candidate from Deep Convection’s public feed.',
  },
  {
    showId: 'tyler', title: 'Liaquat Ahamed on Financial Crises, Gold, and the Lessons of 1873', durationMinutes: 45, status: 'queue',
    guid: '444f9639-3e69-447b-9c11-dd9d4d210a4e', publishedAt: '2026-10-14T11:07:00.000Z',
    link: 'https://cowenconvos.libsyn.com/liaquat-ahamed-on-financial-crises-gold-and-the-lessons-of-1873', audioUrl: 'https://traffic.libsyn.com/secure/cowenconvos/CWT-294-LiaquatAhamed-podcast-v2-final.mp3?dest-id=850607',
    selectionReasons: ['A medium-length financial-history perspective', 'Connects crises, gold, and present economic institutions'],
    description: 'Verified from Conversations with Tyler’s public RSS feed.',
  },
  {
    showId: 'good-fight', title: 'Galen Druke on the Midterms', durationMinutes: 75, status: 'queue',
    guid: 'a104de60-be8c-11f1-89be-a7885ce8cf8d', publishedAt: '2026-10-03T10:00:00.000Z',
    audioUrl: 'https://www.podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/clrtpod.com/m/traffic.megaphone.fm/TGF7452664232.mp3',
    selectionReasons: ['A long-form election analysis for the weekly budget', 'Adds a data-led political forecasting perspective'],
    description: 'Verified from The Good Fight’s public RSS feed.',
  },
  {
    showId: 'good-fight', title: "Malcolm Gaskill on Why Our Ancestors Weren't as Superstitious as We Think", durationMinutes: 59, status: 'queue',
    guid: '13cffc9e-cf37-11f1-a868-f75f9425937e', publishedAt: '2026-10-24T10:00:00.000Z',
    audioUrl: 'https://www.podtrac.com/pts/redirect.mp3/pscrb.fm/rss/p/clrtpod.com/m/traffic.megaphone.fm/TGF2033092578.mp3',
    selectionReasons: ['A medium-length history of belief and evidence', 'Adds historical context without exceeding one hour'],
    description: 'Verified from The Good Fight’s public RSS feed.',
  },
  {
    showId: 'intelligence-squared', title: 'Were Castles the Original Military-Industrial Complex? With Dan Jones', durationMinutes: 48, status: 'queue',
    guid: 'd7d7eb82-ceca-11f1-a9e1-2b8f080a5dd2', publishedAt: '2026-10-26T00:20:00.000Z',
    audioUrl: 'https://pdst.fm/e/pscrb.fm/rss/p/traffic.megaphone.fm/NSR3861480006.mp3',
    selectionReasons: ['A medium-length history and technology comparison', 'Connects military institutions with economic organization'],
    description: 'Verified from Intelligence Squared’s public RSS feed.',
  },
  {
    showId: 'exponential', title: 'What NVIDIA’s bet on OpenClaw means for the future of AI and your token budget', durationMinutes: 37, status: 'queue',
    guid: '05598a71-e662-4f2f-9cec-1001969bb6d4', publishedAt: '2026-03-25T16:22:55.000Z',
    link: 'https://www.exponentialview.co',
    audioUrl: 'https://afp-444457-injected.calisto.simplecastaudio.com/ea6da43b-cf32-4bb2-a71f-d5ad709d858f/episodes/d6d2680c-d010-4d0b-985e-2d2ff5f08905/audio/128/default.mp3?aid=rss_feed&awCollectionId=ea6da43b-cf32-4bb2-a71f-d5ad709d858f&awEpisodeId=d6d2680c-d010-4d0b-985e-2d2ff5f08905&feed=e_GRxR9a',
    selectionReasons: ['A medium-length AI infrastructure and cost analysis', 'Directly connected to the business-model thread'],
    description: 'Verified from Exponential View’s public RSS feed.',
  },
]

export function createSeedEpisodes(now: string): Episode[] {
  return inputs.map((input, index) => ({
    id: `seed-${String(index + 1).padStart(2, '0')}`,
    guid: input.guid ?? `seed:${input.showId}:${input.title}`,
    showId: input.showId,
    title: input.title,
    description: input.description ?? '',
    link: input.link ?? '',
    audioUrl: input.audioUrl ?? '',
    publishedAt: input.publishedAt ?? '',
    durationMinutes: input.durationMinutes,
    status: input.status ?? 'inbox',
    addedAt: now,
    selectionReasons: input.selectionReasons,
    source: 'seed',
  }))
}
