import { useState } from 'react'
import { AudioLines, BookOpenCheck, Copy, Database, ExternalLink, FileInput, GitBranch, GraduationCap, Languages, Layers3, Library, Lightbulb, ListChecks, MessageCircleQuestion, Mic, Music2, Network, NotebookPen, RotateCcw, ScanSearch, Search, Settings, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '../components/Common'
import { REPLAY_ENTRANCE_EVENT } from '../components/EntranceOverlay'
import { HISTORICAL_ARTWORKS } from '../data/artworks'
import { ART_GUIDES } from '../data/artGuides'
import { MODULE_ILLUSTRATIONS } from '../data/moduleIllustrations'
import { PERFORMANCE_RECORDINGS } from '../data/recordings'
import { RECORDING_ILLUSTRATIONS } from '../data/recordingIllustrations'
import { useI18n, ti } from '../lib/i18n'
import { MODULE_ORDER } from '../lib/moduleOrder'
import type { ViewKey } from '../types'

interface GuideViewProps {
  onNavigate: (view: ViewKey) => void
}

const KIMI_HOME = 'https://www.kimi.com/'

const MODULE_LABELS: Record<ViewKey, string> = {
  week: 'This Week', inbox: 'Inbox', shows: 'Show Tiers', dedupe: 'Dedupe', insights: 'Value Insights', study: 'Listen & Read', quiz: 'Voice Quiz', sparks: 'Sparks', cards: 'Word Decks', gallery: 'Performance Room', notes: 'Notes', guide: 'Guide', account: 'My Account', settings: 'Settings',
}

const GUIDE_GROUPS: Array<{ key: string; label: string; hint: string; links: Array<[string, string]> }> = [
  { key: 'learning', label: ti('Learning loop & AI evidence'), hint: ti('Continue learning, understanding, feedback, ideas'), links: [['#guide-learning-record', '03A · Learning record & next steps'], ['#guide-understanding', '03B · Understanding & themes'], ['#guide-quiz', '06 · Voice quiz'], ['#guide-sparks', '07 · Idea sparks'], ['#guide-idea-evolution', '07A · Idea evolution & self-defense'], ['#guide-resources', '07B · Resources & research reports'], ['#guide-loop', '07C · The learning loop — four features, one memory']] },
  { key: 'path', label: ti('Start & the listening path'), hint: ti('From candidate to listening desk'), links: [['#guide-map', '00 · Complete feature map'], ['#guide-week', '01 · Weekly triage & semantic lenses'], ['#guide-shows-dedupe', '01A · Show tiers & dedupe'], ['#guide-transcript', '02 · Transcript round trip'], ['#guide-workflow', '02A · Continuous content workflow'], ['#guide-study', '03 · Listen & read']] },
  { key: 'memory', label: ti('Language, memory & handoff'), hint: ti('Words, notes, search, external notebooks'), links: [['#guide-language', '04 · Words & notes'], ['#guide-search', '04C · Unified workspace search'], ['#guide-obsidian', '04A · Obsidian import'], ['#guide-anki', '04B · Anki deck import']] },
  { key: 'account', label: ti('Media, account & AI'), hint: ti('Media rules, sync, and optional AI calls'), links: [['#guide-media', '05 · Media rules'], ['#guide-data', '08 · Account, sharing & data'], ['#guide-settings', '08A · Settings, repair & recovery'], ['#guide-ai', '09 · AI calls & common questions']] },
  { key: 'support', label: ti('Help & sources'), hint: ti('Ask Kimi, FAQs, full credits'), links: [['#guide-help', '10 · Help center & ask Kimi'], ['#guide-credits', '11 · Credits & sources']] },
]

export function GuideView({ onNavigate }: GuideViewProps) {
  const { t } = useI18n()
  const [kimiQuestion, setKimiQuestion] = useState('')

  const kimiPresets = [
    t('How do I move my SkopeinSignal workspace to my second iPad?'),
    t('Why did the voice quiz say AI_QUOTA_EXHAUSTED, and what can I do?'),
    t('How do I bring a Snipd episode transcript back with KimiClaw?'),
  ]

  const askKimi = async () => {
    const question = kimiQuestion.trim()
    try {
      if (question) await navigator.clipboard.writeText(question)
    } catch {
      // Clipboard access can be denied; the question stays selected in the box.
    }
    window.open(KIMI_HOME, '_blank', 'noopener,noreferrer')
    toast.success(question ? t('Question copied — paste it into Kimi in the new tab.') : t('Kimi opened in a new tab.'))
  }

  return (
    <div className="page-wrap guide-page">
      <PageHeader view="guide" kicker={t('GUIDE / FROM CANDIDATE TO MEMORY')} title={t('A deliberate path through every episode.')} copy={t('Use this guide as an operating manual. Every section stays folded until you open it; start with the learning loop, then open the workflow, language, account, or reference sections as needed.')} actions={<button type="button" className="btn btn-primary" onClick={() => onNavigate('week')}>{t('Open this week')}</button>} />

      <nav className="guide-contents" aria-label={t('Guide contents')}>
        {GUIDE_GROUPS.map((group, index) => (
          <div className="guide-group" key={group.key}>
            <div className="guide-group-head"><span className="guide-group-letter">{String.fromCharCode(65 + index)}</span><div><strong>{t(group.label)}</strong><small>{t(group.hint)}</small></div></div>
            {group.links.map(([href, label]) => <a key={href} href={href} onClick={(event) => { event.preventDefault(); document.querySelector(href)?.scrollIntoView({ block: 'start' }) }}>{t(label)}</a>)}
          </div>
        ))}
      </nav>

      <div className="guide-sections">
        <details id="guide-map" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>00</span><Layers3 size={22} /><div><h2>{t('Find every module and its main job')}</h2><p>{t('A complete map of all fourteen navigation entries; every existing module and workflow remains available.')}</p></div></summary>
          <div className="guide-fold-body">
            <p className="guide-paragraph">{t('Use this map to find an entry, then open its detailed folded section below. The usual path is Inbox → This Week → Listen & Read → Quiz, Notes or Sparks → Word Decks; the other modules support that path rather than replacing it.')}</p>
            <div className="guide-format-grid guide-faq-grid">
              <article><strong>{t(MODULE_LABELS.week)}</strong><p>{t('See the selected weekly queue and attention quotas, resume the latest learning thread, record completion with a summary, or skip with a reason. Selecting and finishing happen here or in the episode detail—not automatically from RSS.')}</p></article>
              <article><strong>{t(MODULE_LABELS.inbox)}</strong><p>{t('Search and filter candidates by show, tier, duration, and semantic lens. Add an episode manually, refresh feeds, open its decision evidence, select at least two reasons, and review or restore items in Decision history.')}</p></article>
              <article><strong>{t(MODULE_LABELS.study)}</strong><p>{t('Set up public or local audio, import or draft a transcript, align its timeline, follow synchronized playback, save words and timestamped notes, and open the learning record and Handoff & export.')}</p></article>
              <article><strong>{t(MODULE_LABELS.notes)}</strong><p>{t('Search the whole workspace, write or edit notes, draw with Apple Pencil, practise IELTS Writing Task 2, export Markdown, and hand selected notes to Obsidian or a pencil page to Goodnotes.')}</p></article>
              <article><strong>{t(MODULE_LABELS.quiz)}</strong><p>{t('Generate short or long-form comprehension questions, answer by voice, review saved results and follow-up tasks, or prepare unofficial IELTS Speaking Parts 1–3 from episode material.')}</p></article>
              <article><strong>{t(MODULE_LABELS.cards)}</strong><p>{t('Import or paste vocabulary, review browser-local schedules, filter language or episode decks, collapse word-family variants, and run a free local test or an optional AI-built test.')}</p></article>
              <article><strong>{t(MODULE_LABELS.insights)}</strong><p>{t('Classify research value, generate or import a Kimi summary, create source-linked understanding records, and build cross-episode theme maps with a visible coverage receipt.')}</p></article>
              <article><strong>{t(MODULE_LABELS.sparks)}</strong><p>{t('Capture and evaluate an idea, recognise an Apple Pencil page, develop evolution stages and self-defense, pin evidence, and compare the idea with real scholarly metadata in Resources.')}</p></article>
              <article><strong>{t(MODULE_LABELS.gallery)}</strong><p>{t('Choose a performance by instrument and illustration, play or pause it, seek and adjust volume, then use floating controls while browsing other modules. Episode audio takes priority.')}</p></article>
              <article><strong>{t(MODULE_LABELS.shows)}</strong><p>{t('Assign each show to Signal Radar, Core Threads, Selective Listening, or Reference Library. Edit its role and public RSS / Atom address, save the changes, and refresh that show alone.')}</p></article>
              <article><strong>{t(MODULE_LABELS.dedupe)}</strong><p>{t('Review automatic and manually marked pairs. Compare both episode details, keep both or keep either side, and restore dismissed pairs. Nothing is deleted automatically.')}</p></article>
              <article><strong>{t(MODULE_LABELS.guide)}</strong><p>{t('Open step-by-step operating instructions, ask Kimi a prepared question, check common answers, and inspect recording, artwork, illustration, and license sources in Credits.')}</p></article>
              <article><strong>{t(MODULE_LABELS.account)}</strong><p>{t('Sign in with Kimi, make the first-device migration choice, monitor the 12 MB workspace limit, sync manually, resolve revision conflicts, or sign out without deleting the cloud copy.')}</p></article>
              <article><strong>{t(MODULE_LABELS.settings)}</strong><p>{t('Change interface language, weekly caps and daily RSS, export or restore JSON, inspect offline dependencies, configure the advanced proxy, install to the Home Screen, replay the entrance, and repair failed feeds.')}</p></article>
            </div>
            <div className="guide-actions">
              {MODULE_ORDER.filter((view) => view !== 'guide').map((view) => <button type="button" key={view} className="btn btn-ghost" onClick={() => onNavigate(view)}>{t(MODULE_LABELS[view])}</button>)}
            </div>
          </div>
        </details>

        <details id="guide-learning-record" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>03A</span><ListChecks size={22} /><div><h2>{t('Keep every thread of one episode together')}</h2><p>{t('Learning record, continue-learning entry, and error-to-learning follow-ups.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Open the episode learning record.')}</strong><p>{t('In Listen & Read, the Episode learning record above the player gathers playback position, timeline state, saved words, notes, the latest quiz score, sparks, research reports, and open follow-up tasks for the selected episode. It collapses after review and never changes the underlying materials.')}</p></li>
            <li><strong>{t('Resume from This Week.')}</strong><p>{t('The Continue learning entry on This Week returns to the episode with the most recent active learning thread, restoring its saved playback position instead of opening the desk at the beginning.')}</p></li>
            <li><strong>{t('Turn feedback into a task — only when you choose.')}</strong><p>{t('After a quiz or IELTS result, a not-fully-understood answer offers four follow-ups: replay the related transcript passage, rewrite the argument in Notes, develop a new idea, or add a later retest. Duplicate follow-ups are prevented by their source; card schedules and review intervals never change automatically from one AI verdict.')}</p></li>
            <li><strong>{t('Trust only grounded replay.')}</strong><p>{t('A replay task carries a timestamp only when the feedback shows positive lexical overlap with a real transcript segment. When no reliable match exists, the task opens the episode without claiming a precise source position.')}</p></li>
            <li><strong>{t('Manage tasks in the record.')}</strong><p>{t('Open, complete, reopen, or delete follow-up tasks inside the episode learning record. Completing a task never deletes the note, spark, or quiz it came from.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('study')}>{t('Open listen & read')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('week')}>{t('Open this week')}</button></div>
          </div>
        </details>

        <details id="guide-understanding" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>03B</span><Network size={22} /><div><h2>{t('Understand the whole argument, not its opening')}</h2><p>{t('Source-linked understanding records and cross-episode theme maps.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Generate an understanding record in Value Insights.')}</strong><p>{t('Choose Full transcript or the opening, middle, or closing third. Long transcripts are read in bounded sequential chunks plus one synthesis call; “Full” runs only when the transcript fits the chunk limit, and the receipt always reports the actual characters and segments covered.')}</p></li>
            <li><strong>{t('Check evidence before saving judgment.')}</strong><p>{t('Every claim must quote a verbatim passage from the analyzed selection and link back to its transcript segment and timestamp. If the AI cannot ground its evidence, nothing is saved and no request is retried automatically.')}</p></li>
            <li><strong>{t('Mark your own position.')}</strong><p>{t('Each claim can be marked Agree, Unsure, or Verify. These are your private review marks; they never change the record’s text.')}</p></li>
            <li><strong>{t('Carry a claim into Notes.')}</strong><p>{t('Add evidence to Notes stores the claim together with its quoted passage and timestamp, so later writing cites the source rather than a memory of it.')}</p></li>
            <li><strong>{t('Compare across episodes.')}</strong><p>{t('With saved understanding records for at least two episodes, open Across episodes and build a theme map. Grouped claims keep their original episode and evidence links; deleting a theme map never deletes the source records.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('insights')}>{t('Open value insights')}</button></div>
          </div>
        </details>

        <details id="guide-week" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>01</span><ScanSearch size={22} /><div><h2>{t('Decide before you listen')}</h2><p>{t('Inbox → selection reasons → weekly quota → completion or reasoned skip.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Bring in candidates.')}</strong><p>{t('Refresh public RSS feeds or use Add episode for a manual title and link. New items stay in the inbox; arrival never commits your time.')}</p></li>
            <li><strong>{t('Add one episode manually when RSS is not enough.')}</strong><p>{t('In Inbox, choose Add episode. Show and title are required; optionally add duration, publication date, original page, direct audio URL, a shared dedupe key, and selection context. Submit Add to inbox, then open the title to verify the saved details. Public links only—never include private feed tokens.')}</p></li>
            <li><strong>{t('Correct duration before trusting quota fit.')}</strong><p>{t('Open the episode detail and find Duration & quota fit. Enter minutes and choose Save duration, or clear the field to mark it unknown again. Filters and quota categories update from your entry; unknown duration is deliberately treated as long until verified.')}</p></li>
            <li><strong>{t('Refresh all feeds or just one show.')}</strong><p>{t('In Settings → Feed status, Refresh all feeds checks the whole catalogue in sequence; each show also has its own Refresh button. The active row identifies the exact feed being checked. A failed request never erases existing episodes, and the last result remains visible for review. Repair all failed retries only failed feeds through up to three rounds of direct, custom and backup proxies, the alternate address, and JSON recovery. Temporary network failures pause briefly between rounds; permanent address or RSS errors stop early. Any remaining failure keeps its row-level Repair link to Show Tiers for address correction.')}</p></li>
            <li><strong>{t('Compare the role.')}</strong><p>{t('Click an episode title to open its decision explanation. You will see its show tier, recorded reasons, duration category, quota fit, and any skip or redundancy evidence. Inbox filters can isolate long, medium, or micro candidates.')}</p></li>
            <li><strong>{t('Read the semantic lens separately.')}</strong><p>{t('AithraScope and DikeLens classify subject matter, not selection status. Open the episode explanation to see the local keyword evidence and correct the lens manually; your choice survives queue, completion, skip, and restore actions.')}</p></li>
            <li><strong>{t('Classify research value and attach evidence.')}</strong><p>{t('In Value Insights, mark an episode Strong timeliness or Long replay value, or leave it Unclassified when neither signal qualifies. Non-timely episodes never default to Long replay value. With a saved transcript, Generate with Kimi creates and saves the four-part summary in one billable call; a failed call never replaces an existing summary. You can still paste or import Kimi JSON, Markdown, or TXT yourself. The site cannot read private Kimi conversations.')}</p></li>
            <li><strong>{t('Select with at least two reasons.')}</strong><p>{t('The default attention budget is four long interviews, seven medium episodes, and three micro discussions. Micro is ≤ 30 minutes, medium is > 30 and ≤ 60 minutes, and long is > 60 minutes; unknown durations are treated as long until verified. Change the three caps in Settings.')}</p></li>
            <li><strong>{t('Leave a result.')}</strong><p>{t('Complete with a reusable summary, or skip with a reason. Duplicate versions skipped in Dedupe do not add a downgrade signal. Open Decision history in the inbox to review completed, skipped, and archived items or restore the latter two.')}</p></li>
          </ol>
          <div className="guide-format-grid two-columns lens-guide-grid"><article><strong>{t('AithraScope')}</strong><p>{t('Natural-world, scientific, technological, AI, and business-model inquiry.')}</p></article><article><strong>{t('DikeLens')}</strong><p>{t('Society, institutions, history, ethics, philosophy, arts, and public-life judgment.')}</p></article></div>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('inbox')}>{t('Open inbox')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('insights')}>{t('Open value insights')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('dedupe')}>{t('Review duplicates')}</button></div>
          </div>
        </details>

        <details id="guide-shows-dedupe" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>01A</span><ScanSearch size={22} /><div><h2>{t('Maintain show roles and review duplicates by hand')}</h2><p>{t('Correct a feed at its source, then decide every duplicate pair without automatic deletion.')}</p></div></summary>
          <div className="guide-fold-body">
            <ol className="guide-steps">
              <li><strong>{t('Give each show one explicit role.')}</strong><p>{t('Open Show Tiers and compare the four groups: Signal Radar for high-frequency scanning, Core Threads for default subject sources, Selective Listening for explicit guest or information gain, and Reference Library for question-led archives. Tier changes alter the role context; they do not delete episodes or force selection.')}</p></li>
              <li><strong>{t('Edit the role or repair the public feed address.')}</strong><p>{t('Choose Edit role on a show, update its tier, role, or public RSS / Atom URL, then Save changes. Use that row’s Refresh to verify the address. A failed feed’s Repair button in Settings opens this same module; existing episodes remain untouched while you correct it.')}</p></li>
              <li><strong>{t('Scan, then inspect the evidence.')}</strong><p>{t('Open Dedupe and choose Scan again to refresh the review count. Local rules compare dedupe keys, normalised titles, guest or title-prefix hints, and title-token overlap. Open either episode title to compare show, date, duration, description, and decision evidence; similarity is only a review hint.')}</p></li>
              <li><strong>{t('Choose the outcome yourself.')}</strong><p>{t('Keep both dismisses the pair and preserves both episodes. Keep left, skip right or Keep right, skip left moves only the other version to skipped history and records the retained title. Keep neither moves both versions to skipped history; either can be restored separately from Decision history. Every duplicate skip adds no show-downgrade signal. Nothing is erased, and skipped items remain reviewable in Decision history.')}</p></li>
              <li><strong>{t('Mark a pair the title rules missed.')}</strong><p>{t('Under Mark a pair the rules missed, choose two different active episodes from Inbox or This Week as Episode A and Episode B, then Mark as duplicate pair. The pair appears above with the same four outcomes; no semantic match is claimed automatically.')}</p></li>
              <li><strong>{t('Restore a dismissed decision.')}</strong><p>{t('In Dismissed pairs, choose Restore to return a pair to active review. Dismissal only hides that pair from future scans; it never removes transcripts, notes, vocabulary, or either episode.')}</p></li>
            </ol>
            <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('shows')}>{t('Open show tiers')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('dedupe')}>{t('Review duplicates')}</button></div>
          </div>
        </details>

        <details id="guide-transcript" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>02</span><FileInput size={22} /><div><h2>{t('Request a transcript, then bring it back')}</h2><p>{t('SkopeinSignal prepares the request and imports the returned file; audio is never uploaded. For English or German local audio, a free on-device transcriber can also draft a transcript right in the browser.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Open Listen & Read and choose an episode.')}</strong><p>{t('If no listening desk exists, the transcript-request panel appears above setup. To redo an existing desk, choose Audio & transcript.')}</p></li>
            <li><strong>{t('Play Snipd audio through a source you may use.')}</strong><p>{t('Choose a Snipd-exported local file or paste the episode’s actual public media URL. A Snipd share webpage is not an audio direct link. The site never asks for a Snipd password and cannot read private subscriptions, queues, or snips.')}</p></li>
            <li><strong>{t('Resolve a public Snipd share link when available.')}</strong><p>{t('Sign in with Kimi, choose Public RSS or direct audio URL, and paste a link shaped like https://share.snipd.com/episode/… under Resolve a Snipd share link. Choose Resolve. The server checks only the public share page, public podcast metadata, and the show feed, then places the matched audio address in Direct public audio URL. Review the returned title, show, duration, warnings, and URL before creating the desk; resolution alone saves nothing.')}</p></li>
            <li><strong>{t('Use the explicit fallback when resolution fails.')}</strong><p>{t('Anti-bot protection, rate limits, an unreachable directory, or an episode that has aged out of RSS can prevent resolution without making your link invalid. Retry a temporary failure later, or copy the episode’s real public audio address from a podcast app into Direct public audio URL; alternatively choose a local audio file you may use. Never paste Snipd credentials or treat the share webpage itself as audio.')}</p></li>
            <li><strong>{t('Start with audio alone when useful.')}</strong><p>{t('Leave Transcript source empty to create an audio-only desk. Playback and timestamped notes work; import a transcript later for synchronized reading and clickable words.')}</p></li>
            <li><strong>{t('Check the three request fields.')}</strong><p>{t('Provide the episode title, podcast name, and a public audio URL. Choose VTT or SRT when you need timestamps. Never include account tokens or private feed credentials.')}</p></li>
            <li><strong>{t('Copy, share, or download the request.')}</strong><p>{t('Open KimiClaw and paste or upload it. These actions mean only that a request was prepared or shared—not that KimiClaw received, processed, or transcribed anything.')}</p></li>
            <li><strong>{t('Confirm the returned file yourself.')}</strong><p>{t('KimiClaw supports sending and receiving files through conversations and its workspace. Download the returned transcript, then import or paste it under Transcript source and choose Create listening desk.')}</p></li>
            <li><strong>{t('Or transcribe on-device, free.')}</strong><p>{t('With a local English or German audio file chosen, Transcript source offers an experimental on-device transcriber: a small open model (~40 MB, bundled with the site) runs entirely in the browser — the audio never leaves the device and no AI quota is used. Stereo files are auditioned as mix, left, and right channels and the cleanest is transcribed; a larger ~80 MB model is bundled as an optional quality tier for difficult audio. Automatic detection checks each passage independently and subdivides mixed or uncertain windows, so German and English can coexist without one file-wide language vote. It produces a rough draft VTT to review before saving; long episodes can take several minutes.')}</p></li>
          </ol>
          <div className="guide-callout"><Share2 size={18} /><p>{t('The audio host or transcription workflow may reject a link. If KimiClaw cannot access or process it, use a transcript you already have; do not treat an invented or unverified text as a transcript.')}</p></div>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('study')}>{t('Open transcript setup')}</button><a className="btn btn-ghost" href="https://www.kimi.com/help/kimi-claw/file-transfer" target="_blank" rel="noreferrer">{t('KimiClaw file-transfer help')}<ExternalLink size={14} /></a></div>
          </div>
        </details>

        <details id="guide-workflow" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>02A</span><GitBranch size={22} /><div><h2>{t('Move from source material to a finished document')}</h2><p>{t('Material → transcript → summary → draft → export, without losing the original module tools.')}</p></div></summary>
          <div className="guide-fold-body">
            <ol className="guide-steps">
              <li><strong>{t('Keep one episode selected across the five-stage journey.')}</strong><p>{t('Listen & Read, Value Insights, and an episode-linked Notes editor show the same Material → Transcript → Summary → Draft → Export journey. Select any stage to reopen it; the Next button recommends only the first missing stage. Moving between stages does not delete or replace existing content.')}</p></li>
              <li><strong>{t('Preview and confirm every imported file before it changes anything.')}</strong><p>{t('Audio, transcript, summary, and vocabulary pickers show the filename, detected file type, size, content or audio preview, target module, storage boundary, and next action. TXT and Markdown require an explicit content-type choice because their extensions do not prove whether they contain a transcript, summary, or word list. Cancel leaves the workspace unchanged.')}</p></li>
              <li><strong>{t('Separate confirmation from the final save.')}</strong><p>{t('Confirming audio only fills the pending listening-desk setup; confirming a transcript only fills its setup draft. Save the listening desk to store them. In Word Decks, a confirmed file still opens the original entry preview for language, optional episode, duplicate review, and the final Import words action; batches retain the 500-entry limit. Study and Value Insights episode-vocabulary imports attach valid new entries after confirmation and skip duplicates.')}</p></li>
              <li><strong>{t('Use the summary as a working result, not a dead end.')}</strong><p>{t('After generating or importing a summary, choose Save to Notes for an immediate saved note, Continue writing to load an editable unsaved draft, Copy summary, Download Markdown, or Download TXT. Continue writing includes the available transcript opening up to 12,000 characters and labels an excerpt when truncated; the complete original remains in Listen & Read. Review and use the notebook’s own Save action before treating a draft as saved.')}</p></li>
              <li><strong>{t('Compose the finished document in Conversion & export.')}</strong><p>{t('Choose any available combination of original transcript, Kimi summary, notes and finished drafts, vocabulary, source links, and saved Resources reports, then download Markdown or TXT. Empty categories are disabled with directions to the module that creates them. Resources exports retain the saved DOI, database, landing page, evidence scope, retrieval details, caveats, and the explicit metadata-and-abstract limitation; they do not claim a full-text systematic review.')}</p></li>
              <li><strong>{t('Keep the original export routes and repair an incomplete timeline.')}</strong><p>{t('The original KimiClaw Markdown, LinguaCafe TXT, VTT, episode vocabulary CSV, and system sharing remain below the finished-document composer. VTT stays disabled when the timeline is incomplete; use Back to Transcript to add or repair timings instead of exporting invented synchronization. A local download or system share is never an external import receipt.')}</p></li>
            </ol>
            <div className="guide-callout"><GitBranch size={18} /><p>{t('Storage remains explicit: the text workspace is in this browser, signed-in cloud sync is reported separately, and local audio stays in IndexedDB. JSON backups contain no audio. Check Downloads or Files for the actual file and keep original recordings separately.')}</p></div>
            <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('study')}>{t('Open transcript setup')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('insights')}>{t('Open value insights')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('notes')}>{t('Open notebook')}</button></div>
          </div>
        </details>

        <details id="guide-study" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>03</span><AudioLines size={22} /><div><h2>{t('Align sound, text, and attention')}</h2><p>{t('Use the format that matches the evidence you have.')}</p></div></summary>
          <div className="guide-fold-body">
          <div className="guide-format-grid"><article><strong>VTT / SRT</strong><p>{t('Segment timestamps enable active-segment following, timestamp seeking, and exact note or vocabulary locations.')}</p></article><article><strong>TXT / Markdown</strong><p>{t('Read, edit, and click words immediately. Choose Set timeline when you are ready to assign playback boundaries; untimed text is never presented as synchronized.')}</p></article><article><strong>{t('Public / local audio')}</strong><p>{t('Public direct audio streams from its host. You can start without a transcript and add one later. Local audio stays in this browser’s IndexedDB and is excluded from JSON backups.')}</p></article></div>
          <ol className="guide-steps">
            <li><strong>{t('Set or revise an imported transcript timeline.')}</strong><p>{t('In the transcript tab, choose Set timeline or Edit timeline. Enter a start and end for every segment using MM:SS.mmm or HH:MM:SS.mmm. While audio plays, the crosshair buttons capture the current playback position for precise manual correction.')}</p></li>
            <li><strong>{t('Use estimation only as a reviewable draft.')}</strong><p>{t('Estimate from audio duration allocates time proportionally by text length after the audio metadata loads. It does not recognize speech or detect the actual speaker boundaries. Review the generated values, correct overlaps or timing errors, and save; unsaved estimates do not change the transcript.')}</p></li>
            <li><strong>{t('Confirm synchronized playback and export.')}</strong><p>{t('After saving, select a timestamp to seek and enable Auto-follow if desired. A complete timeline also enables VTT export in Conversion & export. Remove timeline requires a second confirmation and preserves all transcript text, vocabulary, and notes.')}</p></li>
            <li><strong>{t('Prepare the KimiClaw handoff document.')}</strong><p>{t('Scroll to Conversion & export below the listening desk. The original Download Markdown provides episode metadata, timestamped transcript, vocabulary, and instructions; Share handoff package provides KimiClaw Markdown, LinguaCafe TXT, and vocabulary CSV together. If multi-file sharing is unsupported, the Markdown downloads instead. Upload it in a KimiClaw conversation or workspace and confirm receipt there; the local export timestamp is not a remote receipt.')}</p></li>
            <li><strong>{t('Import clean text or subtitles into LinguaCafe.')}</strong><p>{t('Download TXT for clean paragraphs. Download VTT only when the source timeline is complete; otherwise its button explains the missing timeline and offers Back to Transcript rather than inventing timestamps. In LinguaCafe Library, choose Import, select plain text or subtitles, upload the matching file, and confirm the resulting entry in LinguaCafe itself. Audio is not included.')}</p></li>
            <li><strong>{t('Export only this episode’s vocabulary.')}</strong><p>{t('Under Episode vocabulary, Download CSV includes Word, Translation, Language, Context, Timestamp, Episode, and Show for the current episode. It stays disabled when no words exist. Confirm the file in Downloads or Files; use the Anki section below for exact desktop field mapping.')}</p></li>
          </ol>
          <p className="guide-paragraph">{t('Use Auto-follow only with a timeline. Select any timestamp to seek. Edit a transcript segment with its pencil icon. Your playback position is restored locally after refresh.')}</p>
          </div>
        </details>

        <details id="guide-language" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>04</span><Languages size={22} /><div><h2>{t('Check language in context')}</h2><p>{t('Machine drafts and external dictionaries are aids; your reviewed wording is what enters the archive.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Click one word in the transcript.')}</strong><p>{t('Only that selected word goes to MyMemory for an online draft—never the whole transcript. Free shared quotas can fail or return HTTP 429, so manual entry is always available.')}</p></li>
            <li><strong>{t('Use an external provider when useful.')}</strong><p>{t('Eudic app receives the selected word through its documented app link. Eudic Web, Youdao, and Google Translate open separately; SkopeinSignal copies the word where clipboard access permits. These are handoffs, not embedded plugins, and no answer is imported automatically.')}</p></li>
            <li><strong>{t('Review and save.')}</strong><p>{t('Edit the translation before saving. The word, sentence, language, and optional timestamp stay in this browser and can be exported as CSV.')}</p></li>
            <li><strong>{t('Review marked words automatically.')}</strong><p>{t('Every saved vocabulary entry appears in Word Decks without another import. Choose a language or episode subdeck, recall the word, reveal its translation and source, then grade Again, Hard, Good, or Easy. Scheduling is browser-local and included in JSON backups; there is no AnkiWeb account or sync.')}</p></li>
            <li><strong>{t('Import a whole word list in one batch.')}</strong><p>{t('In Word Decks, choose Import words. Select a CSV, TSV, or TXT file, confirm the file preview, then review the parsed entries, language, and optional episode before using the final Import words button. Manual paste remains available with one entry per line — “word”, “word = translation”, “word, translation”, or tab-separated. One batch accepts at most 500 valid entries; duplicates are skipped when the final import runs. Files stay in the browser; there is no AI call or cost.')}</p></li>
            <li><strong>{t('Test yourself Quizlet-style.')}</strong><p>{t('Switch Word Decks to Test mode: a written test is built from the English and German cards in the filtered deck — passage-blank Q&A and type-the-word questions lead the mix, with multiple choice and true/false available as add-ons — graded instantly in the browser with a score and an answer review. The local builder is free and offline; the optional AI builder writes longer quoted-passage questions and harder, plausible distractors and is billed to the site owner per test. Results are not saved either way.')}</p></li>
            <li><strong>{t('Write without pausing.')}</strong><p>{t('Notes can include the current playback time or remain untimed. The global Notebook supports quick capture, search, editing, deletion, Markdown export, and exact timestamp return. Send the current filtered selection to Obsidian through its official new-note URI, optionally using a Vault name and folder; opening Obsidian is not an import receipt.')}</p></li>
            <li><strong>{t('Switch to Apple Pencil mode.')}</strong><p>{t('Create a pencil note, optionally link an episode, and draw with pressure-sensitive vector ink. Touch is ignored on the canvas for palm rejection; a mouse works on desktop. Rename pages, choose ink and nib width, undo one stroke, or clear the page. Strokes remain editable and are included in workspace sync and JSON backups.')}</p></li>
            <li><strong>{t('Hand a pencil page to Goodnotes.')}</strong><p>{t('Choose Share PNG to GoodNotes. In the iPad system share sheet, choose Open in Goodnotes → New Document or Current Document → Import. If file sharing is unsupported, download the PNG and use Files → Share → Open in Goodnotes. Goodnotes alone confirms the import; the website receives no import receipt and never asks for Goodnotes credentials.')}</p></li>
            <li><strong>{t('Recognise ink, then confirm the words.')}</strong><p>{t('In Sparks → Apple Pencil mode, Recognise this page sends a PNG of the visible ink to an image-capable site model. Check and edit the transcript before evaluation; changing the ink clears the old transcript so words and drawing cannot drift apart.')}</p></li>
            <li><strong>{t('Practise IELTS Writing Task 2.')}</strong><p>{t('In Notes → IELTS Writing, use saved material, pasted Snipd takeaways, or an AI summary of the episode transcript. Timed exam remains the default; choose Untimed practice before or during the paper to remove the countdown without losing the task or essay. Untimed mode never submits automatically and still provides feedback on request. The unofficial paper has a 250-word minimum and a 40-minute standard exam target; AI feedback covers the four writing criteria and is a practice estimate, not an IELTS result.')}</p></li>
            <li><strong>{t('Generate the paper from material you can inspect.')}</strong><p>{t('Sign in, choose an episode with a transcript or saved summary, then select Saved material, Import from Snipd, or Ask AI to summarise. Snipd text needs at least 80 characters; AI summary needs a transcript excerpt of at least 200 characters and sends at most 8,000 characters. Generate Writing Task 2, then open Inspect the arguments behind this paper before writing. A failed generation is not retried automatically and does not erase the saved source material.')}</p></li>
            <li><strong>{t('Switch timing without resetting your work.')}</strong><p>{t('Use Timed exam or Untimed practice in the setup panel or above the answering paper. Switching during an answer keeps the same task and essay; returning to Timed exam resumes the remaining countdown rather than generating a new paper. In either mode, choose Get band feedback yourself. Review the four criterion estimates, general feedback, and next steps, then optionally create replay, Notes, idea, or retest follow-ups.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('cards')}>{t('Open word decks')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('notes')}><NotebookPen size={15} />{t('Open notebook')}</button></div>
          </div>
        </details>

        <details id="guide-obsidian" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>04A</span><NotebookPen size={22} /><div><h2>{t('Move filtered notes into Obsidian')}</h2><p>{t('This site prepares Markdown and requests Obsidian’s official new-note action. Obsidian, not this site, must confirm the Vault, path, and created note.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('On this site: choose the exact notes first.')}</strong><p>{t('Open Notes → Written notes. Search note text or episode titles and choose a show filter if needed. The counter above Send to Obsidian shows how many of the filtered notes will be included; clearing the filters selects the whole notebook.')}</p></li>
            <li><strong>{t('On this site: identify the destination.')}</strong><p>{t('Enter the exact existing Vault name, or leave Vault blank to ask Obsidian for its current or most recent Vault. The folder defaults to SkopeinSignal; nested paths such as Podcasts/Listening are accepted. The preview shows the dated Markdown filename before anything opens.')}</p></li>
            <li><strong>{t('Choose Send to Obsidian for a normal selection.')}</strong><p>{t('This puts the filtered Markdown directly in the new-note URI. On iPad, install and open Obsidian once beforehand, then allow the browser’s request to open the obsidian:// link. In Obsidian, check the selected Vault, folder, filename, and note body.')}</p></li>
            <li><strong>{t('Choose Copy & open Obsidian when direct transfer is unsuitable.')}</strong><p>{t('This copies the same Markdown to the clipboard and opens Obsidian with clipboard mode. Selections longer than the site’s conservative 7,000-character URI guard switch here automatically. If clipboard permission fails, the site downloads the Markdown instead and does not claim that Obsidian opened.')}</p></li>
            <li><strong>{t('In Obsidian: confirm creation yourself.')}</strong><p>{t('A system open request or a completed toast is not an import receipt. Confirm that the note exists in the intended Vault and folder and that its content is complete. If the URI is blocked, use Export Markdown, move the downloaded .md file into the Vault with Files, and reopen Obsidian.')}</p></li>
            <li><strong>{t('Keep the permission boundary.')}</strong><p>{t('No Obsidian account, Sync credential, plugin, or repository permission is requested. Vault and folder names are saved only as local handoff preferences; the website cannot read the Vault or report Obsidian sync status.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('notes')}>{t('Open Obsidian handoff')}</button><a className="btn btn-ghost" href="https://help.obsidian.md/Extending+Obsidian/Obsidian+URI" target="_blank" rel="noreferrer">{t('Obsidian URI documentation')}<ExternalLink size={14} /></a></div>
          </div>
        </details>

        <details id="guide-anki" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>04B</span><Layers3 size={22} /><div><h2>{t('Import an episode vocabulary deck into Anki')}</h2><p>{t('The reliable route is episode vocabulary CSV from this site, followed by an explicit import in Anki desktop. A downloaded CSV is not an .apkg deck and is not imported merely by exporting it.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('On this site: build or review the word list.')}</strong><p>{t('Words saved in Listen & Read enter Word Decks automatically. For a separate list, open Word Decks → Import words and choose a CSV, TSV, or TXT file; review the preview, select the language and optional episode, then confirm. Manual paste remains available in the same panel. Word and Translation headers are recognized, including the site’s seven-column CSV; duplicates already in the deck are skipped.')}</p></li>
            <li><strong>{t('On this site: distinguish local review from Anki.')}</strong><p>{t('Again, Hard, Good, and Easy on this site use its own browser-local Anki-style scheduler. They do not create an Anki deck, contact AnkiWeb, or reproduce Anki’s scheduling algorithm. Workspace JSON preserves the site’s cards and review state; Anki cannot import that JSON as a deck.')}</p></li>
            <li><strong>{t('On this site: export the episode CSV.')}</strong><p>{t('Open the episode in Listen & Read and find Handoff & export → Episode vocabulary → Download CSV. The button is unavailable when that episode has no saved words. Export is episode-specific, so repeat it for other episodes or combine files deliberately in Anki. Confirm the download in Downloads or Files.')}</p></li>
            <li><strong>{t('Know the seven CSV columns.')}</strong><p>{t('The UTF-8 CSV contains Word, Translation, Language, Context, Timestamp, Episode, and Show, with comma separation, quoted cells, and a BOM for non-Latin text. Timestamp is formatted playback time, not a scheduling value. The file contains vocabulary only—no audio, review history, or Anki deck settings.')}</p></li>
            <li><strong>{t('In Anki desktop: start the import explicitly.')}</strong><p>{t('Open Anki on a computer, choose File → Import, and select the downloaded CSV. Do not use the site’s JSON backup and do not rename .csv to .apkg. Select or create the destination deck in Anki’s import screen; this site cannot select it for you.')}</p></li>
            <li><strong>{t('In Anki: set note type, separator, and field mapping.')}</strong><p>{t('For the simplest two-sided cards, choose the Basic note type and comma as the separator. Map Word → Front and Translation → Back. Leave Language, Context, Timestamp, Episode, and Show unmapped for a Basic note, or first create a note type with enough fields and map them deliberately. Check the preview and ensure the header row is not imported as a card.')}</p></li>
            <li><strong>{t('In Anki: review duplicates and the import result.')}</strong><p>{t('Choose the duplicate handling offered by your Anki version carefully, especially when re-importing an edited episode. Read Anki’s final added, updated, skipped, or error counts rather than assuming success from the file selection. Open Browse, inspect several new notes in the destination deck, and correct any mapping before studying.')}</p></li>
            <li><strong>{t('For mobile study, use Anki’s own route.')}</strong><p>{t('If you use AnkiMobile or AnkiDroid, first confirm the imported deck on desktop, then use your own Anki account and the app’s documented sync/import workflow if desired. This site has no AnkiWeb connection and receives no desktop, mobile, or sync receipt. Direct mobile CSV support varies by app and version; the desktop route above is the dependable fallback.')}</p></li>
          </ol>
          <div className="guide-callout"><Layers3 size={18} /><p>{t('What remains where: CSV carries vocabulary into Anki after you confirm the import; JSON restores this site’s workspace and local review schedule; neither format transfers Again/Hard/Good/Easy history into Anki.')}</p></div>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('study')}>{t('Open episode vocabulary export')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('cards')}>{t('Open local word decks')}</button><a className="btn btn-ghost" href="https://docs.ankiweb.net/importing/text-files.html" target="_blank" rel="noreferrer">{t('Anki text-file import manual')}<ExternalLink size={14} /></a></div>
        </div>
      </details>

        <details id="guide-search" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>04C</span><Search size={22} /><div><h2>{t('Search the whole workspace from one box')}</h2><p>{t('One query covers transcripts, notes, vocabulary, sparks, and saved resource reports.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Open Notes and type at least two characters.')}</strong><p>{t('The search box at the top of Notes is a unified workspace search. Below your matching notes, grouped results appear for transcripts, vocabulary entries, sparks, and resource reports that contain the same text.')}</p></li>
            <li><strong>{t('Read the grouped results.')}</strong><p>{t('Each group is labelled by kind — Transcript, Note, Word, Spark, Resource — with a short snippet around the match. Up to twelve results per kind are shown, so the list stays scannable even in a large workspace.')}</p></li>
            <li><strong>{t('Jump straight to the source.')}</strong><p>{t('Every result carries an Open source button. Transcript matches reopen the episode on the listening desk at the matching second; vocabulary, spark, and resource matches open the episode they belong to. Nothing is copied or moved — the result is a doorway, not a duplicate.')}</p></li>
            <li><strong>{t('Know the honest limits.')}</strong><p>{t('Search matches the literal text saved in your workspace; it does not search inside audio, does not translate between languages, and does not rank by meaning. For fuzzy recollection, search a distinctive word you remember, then follow the Open source button.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('notes')}>{t('Open unified search')}</button></div>
        </div>
      </details>

        <details id="guide-media" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>05</span><Music2 size={22} /><div><h2>{t('Keep recorded media in its proper moment')}</h2><p>{t('Podcast audio and recorded music never compete; artwork never becomes a static decoration.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Choose a performance by instrument or scene.')}</strong><p>{t('Open Performance Room and browse the seven instrument rooms. Select a complete picture-book key to load that recording; the active key, work, performer, format, composer, and licence identify the actual selection. Source recording and License details remain available below the player.')}</p></li>
            <li><strong>{t('Play, pause, seek, and set volume.')}</strong><p>{t('Choose Play recording or Pause performance in the console. Drag Recording position after the duration loads to seek, and adjust Volume independently. The selected recording and position remain visible; starting real podcast audio pauses the performance, and the performance control is disabled while that podcast has priority.')}</p></li>
            <li><strong>{t('Continue in another module without losing control.')}</strong><p>{t('Switch modules while music plays and use the floating controls to pause, return to Performance Room, or stop completely. Returning to the room restores its timeline and volume controls. Recorded music is for browsing and handoff work; historical artworks still appear only during actual episode playback.')}</p></li>
          </ol>
          <div className="guide-format-grid two-columns"><article><strong>{t('While browsing')}</strong><p>{t('The Performance Room offers twenty-two public-domain or reusable-licensed recordings by named performers: two piano solos, four flute solos, five classical-guitar solos, three harp recordings (two Debussy dances with string orchestra and Mozart’s concerto for flute and harp), two cello solos, four bassoon performances (one with piano, one concerto with orchestra, one trio with clarinet and piano, one wind quintet), and two purely instrumental orchestral recordings. Accompaniment is allowed; choral works are excluded, and no accompanied work is labeled as a solo. Music continues across modules with floating pause, return, and stop controls; starting real podcast audio pauses it.')}</p></article><article><strong>{t('While episode audio plays')}</strong><p>{t('The listening desk alone mounts twenty-two historical oil paintings and watercolors with artist, title, date, medium, collection, source, and public-domain rights information. Pause or end playback and the artwork disappears. Works are real reproductions, never images generated from episode content.')}</p></article></div>
          <button type="button" className="btn btn-secondary" onClick={() => onNavigate('gallery')}>{t('Open performance room')}</button>
        </div>
      </details>

        <details id="guide-quiz" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>06</span><Mic size={22} /><div><h2>{t('Test what you actually understood')}</h2><p>{t('Short spoken answers and AI long-form questions are separate exercises, each drawing only on the episode transcript and grading your spoken response.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Finish listening first.')}</strong><p>{t('Only English and German episodes with a listening-desk transcript appear in the picker—the voice pipeline is tuned for those two languages. The quiz measures what stayed with you—set up the desk in Listen & Read before opening the quiz.')}</p></li>
            <li><strong>{t('Choose Short spoken answers for concise recall.')}</strong><p>{t('Generate three to six self-contained questions without long transcript quotations. Answer each in one or two spoken sentences about a main claim, supporting detail, example, or cause. This mode does not ask for a developed paragraph.')}</p></li>
            <li><strong>{t('Choose AI long-form questions for deeper interpretation.')}</strong><p>{t('Generate two to four questions. Each quotes two to four sentences verbatim from the transcript and asks you to interpret the reasoning or connect it to the episode’s broader argument. Answer with a developed spoken paragraph; this mode uses continuous recognition and lets you stop manually.')}</p></li>
            <li><strong>{t('Answer out loud — voice only.')}</strong><p>{t('Tap Answer by voice and speak; browser speech recognition writes your words into the read-only answer box. Typing is intentionally unavailable: the quiz measures what you can say back, not what you can type. Made a mistake? Clear the answer and dictate again. On browsers without speech recognition the quiz shows a notice instead of a keyboard fallback — open it in Chrome, Edge, or Safari on iPad. Comprehension is graded, never pronunciation or grammar.')}</p></li>
            <li><strong>{t('Read the grading.')}</strong><p>{t('Each answer is marked Understood, Partly understood, or Missed, with one short feedback note and the reference answer; the overall score is out of 100. Graded quizzes are saved under Past quizzes and sync with your cloud workspace.')}</p></li>
            <li><strong>{t('Know the cost and the gate.')}</strong><p>{t('Question generation and grading are AI calls billed to the site owner, so the module requires Kimi sign-in and never auto-retries a failed call. If the owner’s AI quota is exhausted, the quiz says so plainly and waits.')}</p></li>
            <li><strong>{t('Switch to unofficial IELTS Speaking practice.')}</strong><p>{t('Choose saved material, pasted Snipd takeaways, or an AI summary of the episode transcript. Answer six questions across Parts 1–3 by voice, then receive criterion-based practice bands. Pronunciation is not banded because only text—not audio—is assessed.')}</p></li>
            <li><strong>{t('Choose timed or untimed IELTS Speaking.')}</strong><p>{t('Timed exam is the default in Speaking setup and above the paper. Each answer has a 30-second Part 1, 120-second Part 2, or 60-second Part 3 recording limit; the countdown runs only while recording, stops the recorder at zero, and keeps the recognised answer without submitting it. Untimed practice has no countdown or automatic stop. Switching modes preserves all six questions, recognised answers, current progress, and each question’s remaining time.')}</p></li>
            <li><strong>{t('Check each recognised answer before grading.')}</strong><p>{t('For each Part 1–3 question, choose Answer by voice or Speak for 1–2 minutes, then Stop recording. Read the recognised text and use Clear and answer again if recognition changed your meaning; do not treat a speech-to-text slip as a comprehension choice. Get band feedback only when ready. Fluency, lexical resource, grammar, individual feedback, and next steps are practice estimates, and no pronunciation band is invented from text.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('quiz')}>{t('Open voice quiz')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('study')}>{t('Open listen & read')}</button></div>
        </div>
      </details>

        <details id="guide-sparks" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>07</span><Lightbulb size={22} /><div><h2>{t('Share the spark an episode leaves behind')}</h2><p>{t('The sparks module captures the idea that surfaced while listening and gets an honest AI evaluation with concrete suggestions.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Capture the raw thought.')}</strong><p>{t('Open Sparks right after an episode and dictate or type the idea as it came—no polishing needed. Stuck? Open the thought-starters: two sharp prompts drawn at random plus five anchored to the linked episode, all local and free. Linking the episode you just heard gives the AI its transcript excerpt as grounding; a free spark without an episode works too.')}</p></li>
            <li><strong>{t('Read the evaluation.')}</strong><p>{t('The AI answers in the episode’s language (or your interface language for free sparks) with an honest evaluation, a short list of what works, concrete suggestions for next steps, and one follow-up question worth answering next.')}</p></li>
            <li><strong>{t('Keep the thread.')}</strong><p>{t('Every spark is saved with its feedback under Your sparks and syncs with your cloud workspace, so a two-second idea on the iPad is waiting on your desk later.')}</p></li>
            <li><strong>{t('Same cost, same gate.')}</strong><p>{t('Spark feedback is an AI call billed to the site owner, requires Kimi sign-in, and is never auto-retried. If the owner’s quota is exhausted, the module says so plainly and keeps your draft.')}</p></li>
            <li><strong>{t('Compare a spark with live scholarly resources.')}</strong><p>{t('Resources plans a search from your idea, queries OpenAlex and Crossref independently, and compares only the titles, metadata, and abstracts actually returned. One available source can still produce a partial report. Expert views are AI paraphrases with real DOI or database links; metadata-only records are labelled, and feasibility remains a cautious hypothesis rather than a conclusion. One comparison uses two billable AI calls.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('sparks')}>{t('Open sparks')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('quiz')}>{t('Open voice quiz')}</button></div>
        </div>
      </details>

        <details id="guide-idea-evolution" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>07A</span><GitBranch size={22} /><div><h2>{t('Watch an idea grow up — and defend itself')}</h2><p>{t('Evolution timeline, current claim, self-defense, and the evidence board around one spark.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Open the dedicated Idea evolution tab.')}</strong><p>{t('In Sparks, choose Idea evolution beside Resources. Choose Start a new idea, write your original claim, and create its timeline directly—no saved spark or AI feedback is required. Existing sparks appear in the idea picker. The original path also remains available: under Write or dictate, expand any saved spark to use the same evolution panel inline. The original text stays untouched, and every later stage is a separate, dated record.')}</p></li>
            <li><strong>{t('Record how the idea changed.')}</strong><p>{t('Add an evolution stage whenever the idea sharpens, pivots, or is challenged — what changed, and why. Stages form a timeline so a month later you can see the path, not just the latest wording.')}</p></li>
            <li><strong>{t('State the current claim.')}</strong><p>{t('The current claim is the idea as you would defend it today. Update it freely; earlier stages remain as the audit trail, so updating never rewrites history.')}</p></li>
            <li><strong>{t('Argue against yourself.')}</strong><p>{t('Self-defense lists the strongest objections you can think of and your answers to them. An objection left unanswered is not a failure — it marks exactly where the idea is still soft.')}</p></li>
            <li><strong>{t('Pin evidence to the idea.')}</strong><p>{t('The evidence board collects what supports or threatens the idea: transcript passages, notes, and resource reports. Each entry links back to its source, so a claim is always one tap away from its ground.')}</p></li>
            <li><strong>{t('Everything stays yours.')}</strong><p>{t('Evolution stages, the current claim, self-defense, and evidence links live in your workspace JSON and sync with your cloud workspace like every other record.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('sparks')}>{t('Open idea evolution')}</button></div>
        </div>
      </details>

        <details id="guide-resources" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>07B</span><Library size={22} /><div><h2>{t('Compare an idea with live scholarly resources')}</h2><p>{t('Saved research reports with real DOIs, honest evidence scope, and a path into notes and idea evolution.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Plan the search from your idea.')}</strong><p>{t('In Sparks, ask Resources to compare an idea with current scholarship. The AI plans search queries — this is the first of two billable calls — and the site then queries OpenAlex and Crossref independently. A single healthy source can still return a partial report instead of the whole search failing.')}</p></li>
            <li><strong>{t('Read only what was actually returned.')}</strong><p>{t('The comparison — the second billable call — works strictly on the titles, metadata, and abstracts the databases returned. Expert views are AI paraphrases anchored to those records, each with a real DOI or database link you can open and check.')}</p></li>
            <li><strong>{t('Read the verification badge and source time.')}</strong><p>{t('When the same canonical DOI appears in both indexes, Resources merges the records, fills a missing abstract from the other source, and compares normalized titles and years. Cross-source metadata matched means bibliographic consistency only. Metadata needs review identifies conflicting fields; Single-source means no cross-check was possible. Source retrieval distinguishes live responses, fresh validated cache, and time-limited cached snapshots with their original retrieval times.')}</p></li>
            <li><strong>{t('Respect the evidence scope.')}</strong><p>{t('Every report declares its scope: abstract-level comparison, not a full-text systematic review. Metadata-only records are labelled as such, and feasibility statements stay cautious hypotheses rather than conclusions. Even matching DOI, title, and year metadata does not prove that the paper’s findings are true.')}</p></li>
            <li><strong>{t('Reports persist like any other record.')}</strong><p>{t('A finished comparison is saved into your workspace and syncs with the cloud. Reopen it any time from the spark or the episode; deleting a report never deletes notes, sparks, or idea stages already created from it.')}</p></li>
            <li><strong>{t('Download the generated report as a file.')}</strong><p>{t('After a report appears, choose Save complete report beside the search controls, or Download Markdown in the report details bar. Both save the complete .md file with the query, search receipt, evidence limitations, source URLs, comparisons, and synthesis. A started download is not proof of a saved location, so confirm the file in Downloads or Files; Save details remains the separate workspace-and-cloud save action.')}</p></li>
            <li><strong>{t('Let temporary database faults recover safely.')}</strong><p>{t('Scholarly searches use independent per-provider timeouts, pacing, bounded retries for temporary network or rate-limit failures, short-lived success caching, circuit breaking, and a six-hour stale-cache fallback containing only previously validated successful responses. Stale snapshots are always labelled with their source time and are never presented as live confirmation. Malformed records are skipped while valid records from the same response remain usable; HTML error pages, oversized responses, invalid links, and untrusted hosts are rejected. Rate limits are respected. CAPTCHA, bot challenges, access blocks, and exhausted quotas pause that provider; the site never rotates identity, disguises automation, or bypasses an access control. If both indexes and valid cache entries remain unavailable, Resources reports the outage and preserves your idea rather than inventing results.')}</p></li>
            <li><strong>{t('Carry evidence onward.')}</strong><p>{t('From a saved report, send promising sources into Notes or pin them to the idea’s evidence board, so a scholarly link becomes part of the idea’s audit trail rather than a lost browser tab.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('sparks')}>{t('Open resources')}</button></div>
        </div>
      </details>

        <details id="guide-loop" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>07C</span><ListChecks size={22} /><div><h2>{t('Close the loop: four features, one memory')}</h2><p>{t('Word Decks remember, Voice Quiz tests, Sparks think, Notes settle — and each hands its result to the next.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Word Decks = remember.')}</strong><p>{t('The deck owns vocabulary: every marked or imported word becomes a card with a local Anki-style schedule. Its job is long-term memory of words, nothing else.')}</p></li>
            <li><strong>{t('Voice Quiz = test.')}</strong><p>{t('The quiz owns comprehension: it measures what you can say back about an episode, never pronunciation. A card test measures words; an episode quiz measures understanding.')}</p></li>
            <li><strong>{t('Sparks = think.')}</strong><p>{t('Sparks own ideas: the thought an episode leaves behind, plus AI evaluation, evolution stages, self-defense, and scholarly comparison. Its job is sharpening judgement, not storage.')}</p></li>
            <li><strong>{t('Notes = settle.')}</strong><p>{t('Notes own sediment: timestamped listening notes, IELTS writing practice, and the handoff to Obsidian or Goodnotes. Its job is the durable record you can reread in five years.')}</p></li>
            <li><strong>{t('Test results flow back into the deck.')}</strong><p>{t('Finishing a card test updates each answered card’s schedule locally — correct advances it, wrong requeues it for today. In an episode quiz, expand any missed or partly understood question to save the word that tripped you into the deck; nothing is auto-captured.')}</p></li>
            <li><strong>{t('See the whole loop in the sidebar.')}</strong><p>{t('Under the module list, the Learning footprint entry expands into the four learning modules, each showing its count and latest output, so the loop you closed this week is visible at a glance. It is a read-only summary — open a module to work in it.')}</p></li>
          </ol>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('cards')}>{t('Open word decks')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('quiz')}>{t('Open voice quiz')}</button></div>
        </div>
      </details>

        <details id="guide-data" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>08</span><Database size={22} /><div><h2>{t('Know what syncs, what stays local, and what sharing means')}</h2><p>{t('Private account sync for workspace JSON; a shareable site without shared data; no audio upload.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Sign in, step by step.')}</strong><p>{t('Open My Account in the sidebar, choose Sign in with Kimi, and complete the sign-in on the Kimi page. Back on this site, the account card shows your Kimi email and creates your private cloud workspace on first sign-in—no separate password is invented or stored. Sign out anytime from the same panel.')}</p></li>
            <li><strong>{t('Decide the first sync direction.')}</strong><p>{t('If this device already holds work, the first sign-in asks whether to upload this device’s workspace to the cloud or start fresh. On your second iPad, sign in with the same Kimi account and the cloud workspace loads; revision checks stop an older device from silently overwriting a newer one.')}</p></li>
            <li><strong>{t('Make the first migration choice deliberately.')}</strong><p>{t('When Migration needed appears, Sync this device workspace uploads the current browser JSON to an account that has no cloud workspace yet. Start fresh in cloud instead creates a fresh cloud workspace after confirmation; export this device first if its current work matters. Wait for Cloud synced and check the revision and last-save time before moving to another device.')}</p></li>
            <li><strong>{t('Resolve a revision conflict without silent loss.')}</strong><p>{t('If another device saved a newer revision, automatic overwriting stops. Export a backup first when unsure. Use cloud version loads the cloud workspace and preserves a pre-replacement device snapshot when browser storage allows; Keep this device version saves the current device JSON as the next cloud revision. Read the choice carefully, then confirm Cloud synced on both devices.')}</p></li>
            <li><strong>{t('Watch the 12 MB JSON capacity.')}</strong><p>{t('The account panel shows current workspace size and browser storage. Near the 12 MB private-cloud limit, export JSON, then remove unneeded transcripts, notes, or research reports before syncing again. Local audio does not consume this JSON allowance because it is stored separately in IndexedDB; it is never uploaded or included in backups, so keep original audio files for each device.')}</p></li>
            <li><strong>{t('Export and restore a manual backup safely.')}</strong><p>{t('In Settings → Cloud sync, backup & restore, choose Export JSON (no audio) and confirm the dated file in Downloads or Files; the same backup is also available in Conversion & export. Its receipt says that the text workspace—not local audio—was prepared for download. To restore, choose Import JSON and select a SkopeinSignal backup; read the success or validation message and inspect your episodes and notes afterward. Import replaces the current browser workspace with the validated backup, so export the present state first. Reset to initial workspace requires confirmation and can also affect the synced account—never use it as a routine repair.')}</p></li>
            <li><strong>{t('Share the site freely.')}</strong><p>{t('Once the site is published, its public link can be shared with anyone. A visitor opens a fresh local workspace with the default catalogue only—none of your episodes, transcripts, vocabulary, notes, or quiz history is included. To use cloud sync or the voice quiz, a visitor signs in with their own Kimi account, which creates a separate workspace bound to that account.')}</p></li>
            <li><strong>{t('Sharing never touches your cloud data.')}</strong><p>{t('Cloud workspace requests are authenticated and isolated per Kimi account: visitors cannot see, read, or overwrite your cloud workspace, and sign-out on any device leaves your cloud copy intact. Keep one billing caveat in mind—the voice quiz and sparks AI calls are billed to the site owner, whoever clicks the button.')}</p></li>
          </ol>
          <div className="guide-data-grid"><article><Database size={18} /><h3>{t('Included in JSON')}</h3><p>{t('Shows, episodes, value categories, imported Kimi summaries, transcripts, vocabulary, card schedules, written notes, editable Apple Pencil strokes, quiz history, sparks with their AI feedback, playback positions, interface language, and settings.')}</p></article><article><AudioLines size={18} /><h3>{t('Kept separately')}</h3><p>{t('Local audio is in IndexedDB, not in JSON. Keep original files before clearing browser data or moving devices.')}</p></article><article><Settings size={18} /><h3>{t('Cloud sync & manual backup')}</h3><p>{t('Open My Account to create your private cloud workspace through Kimi sign-in; no separate local password is created. Use the same Kimi account on both iPads, choose whether to migrate the current device workspace on first sign-in, and let revision checks prevent an older device from silently overwriting newer work. JSON export and import remain available as manual backups.')}</p></article><article><BookOpenCheck size={18} /><h3>{t('External boundaries')}</h3><p>{t('Downloads and shares are not import receipts. Confirm KimiClaw files, LinguaCafe imports, Obsidian notes, and Goodnotes pages in those apps themselves.')}</p></article></div>
          <p className="guide-paragraph">{t('The app shell can reopen offline. Cloud sync, RSS refresh, online draft translation, public audio streaming, and external providers still require connectivity. The interface language is independent of the podcast’s own language and can be changed in Settings.')}</p>
          <p className="guide-paragraph">{t('The first visit opens with a click-to-enter curtain. Replay it in Settings. The animation never starts sound and respects reduced-motion preferences.')}</p>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('account')}>{t('Open My Account')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('settings')}>{t('Open settings & backup')}</button><a className="btn btn-ghost" href="https://support.goodnotes.com/hc/en-us/articles/7353717816463-Import-files-into-Goodnotes" target="_blank" rel="noreferrer">{t('Goodnotes import help')}<ExternalLink size={14} /></a></div>
        </div>
      </details>

        <details id="guide-settings" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>08A</span><Settings size={22} /><div><h2>{t('Configure, diagnose, repair, and recover safely')}</h2><p>{t('Settings controls, offline checks, feed recovery, installation, and the unstyled-page fallback—in one operating checklist.')}</p></div></summary>
          <div className="guide-fold-body">
            <ol className="guide-steps">
              <li><strong>{t('Change interface language without translating your sources.')}</strong><p>{t('Settings → Interface language switches controls, guidance, dialogs, and notifications among English, 中文, and Deutsch immediately. Podcast titles, transcripts, notes, show languages, and your own source material stay unchanged; the interface locale and speech-recognition language are separate decisions.')}</p></li>
              <li><strong>{t('Set attention caps and daily RSS behavior.')}</strong><p>{t('Under Weekly quotas, set long, medium, and micro caps within the offered ranges. Duration boundaries are shown beneath the fields. Check RSS automatically each day runs on the first opening of a day; manual Refresh buttons remain available whether the switch is on or off.')}</p></li>
              <li><strong>{t('Read offline diagnostics before replacing a workflow.')}</strong><p>{t('Under Reliability, offline state & dependencies, check Network, Offline app shell, Local audio, Web Speech, AI & cloud sync, and OpenAlex / Crossref. Copy reliability diagnostics copies only status, browser, sign-in, and proxy-configuration facts—not passwords, workspace content, or account tokens. Imported transcripts and saved records remain readable offline; RSS, cloud, public audio, online translation, and scholarly search still need connectivity.')}</p></li>
              <li><strong>{t('Keep long on-device transcription recoverable.')}</strong><p>{t('Bundled transcription models are deliberately excluded from the offline shell cache to protect iPadOS quotas. Load the setup once while online and keep the tab in the foreground during long recognition. If iPadOS suspends or reloads the page, the application job retains progress where possible and restores the unfinished setup draft; imported VTT, SRT, TXT, or Markdown remains the dependable fallback.')}</p></li>
              <li><strong>{t('Use the advanced proxy only for persistent feed failures.')}</strong><p>{t('Open RSS networking (advanced), edit the public CORS proxy prefix, and Save; leave it empty for direct requests plus built-in fallbacks. Every refresh already tries direct, configured and backup proxies, the alternate address, and JSON recovery in sequence. Never put account names, passwords, tokens, or private subscription parameters into a feed or proxy URL.')}</p></li>
              <li><strong>{t('Distinguish routine refresh from full repair.')}</strong><p>{t('Refresh all feeds and each row’s Refresh keep the normal single-pass route. Repair all failed appears only for failed feeds and retries just those rows through up to three complete routing rounds. Watch Repair round {round}/{rounds} and the current show; success stops that feed immediately, temporary network failures pause between rounds, and permanent address or RSS errors stop early. If anything still fails, use its Repair link to correct the address in Show Tiers or add the episode manually.')}</p></li>
              <li><strong>{t('Recover an unstyled page without erasing your workspace.')}</strong><p>{t('After an update, if the page briefly resembles plain HTML, reconnect and reload once while keeping the tab open. The app shell now revalidates HTML, JavaScript, and CSS responses, refuses HTML or error pages masquerading as bundles, replaces invalid cached assets online, and uses only a previously verified shell offline. Do not clear site data as a first response: export JSON and preserve original local audio before any browser-data reset.')}</p></li>
              <li><strong>{t('Install on iPad or replay the entrance.')}</strong><p>{t('For a standalone window, open the preview or published address in Safari, tap Share → Add to Home Screen, name it SkopeinSignal, and launch it from the Home Screen. Replay entrance shows the first-visit curtain again; it never starts audio and respects reduced motion. Neither action resets the workspace.')}</p></li>
            </ol>
            <div className="guide-callout"><Settings size={18} /><p>{t('Safe recovery order: preserve a JSON backup and original audio → check network and diagnostics → reload online → repair only failed feeds or correct their addresses → resolve cloud conflicts explicitly. Reset to initial workspace is a destructive last resort, not a cache-repair button.')}</p></div>
            <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('settings')}>{t('Open settings & backup')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('account')}>{t('Open My Account')}</button></div>
          </div>
        </details>

        <details id="guide-ai" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>09</span><GraduationCap size={22} /><div><h2>{t('AI calls, step by step — and common questions')}</h2><p>{t('Exactly which buttons spend AI quota, what is sent, and the answers to the most asked account questions.')}</p></div></summary>
          <div className="guide-fold-body">
          <ol className="guide-steps">
            <li><strong>{t('Know which actions call AI.')}</strong><p>{t('Value Insights → Generate with Kimi, source-linked understanding and theme maps, voice quiz generation and grading, IELTS paper generation and band feedback, Spark evaluation and self-defense, handwriting recognition, Resources search planning and comparison, and Word Decks → Test → AI builder use the managed site AI. Triage, dedupe, lenses, decks, local tests, notes, and playback remain local and free.')}</p></li>
            <li><strong>{t('Know what leaves the device.')}</strong><p>{t('One-click summary sends the episode title and saved transcript; understanding sends the selected transcript scope. Quiz and IELTS calls send the episode title, relevant material or transcript excerpt, and your answers when grading. Spark evaluation sends your confirmed idea and optional episode excerpt; handwriting recognition sends a PNG of the page; Resources sends your idea to plan a search, retrieves public scholarly records, then sends those records for comparison. Your whole workspace and audio files are never attached.')}</p></li>
            <li><strong>{t('Know the billing and the gate.')}</strong><p>{t('AI calls are billed to the site owner, which is why these buttons require Kimi sign-in. A failed call is never retried automatically; when the owner’s quota is exhausted, the module says so plainly and keeps your draft or answers untouched.')}</p></li>
          </ol>
          <div className="guide-format-grid guide-faq-grid">
            <article><strong>{t('Can the site call a DeepSeek API key instead — or any other API I bring?')}</strong><p>{t('No. AI features run through the site’s own managed AI gateway; its key stays on the server and is never handed to the browser or swapped for a third-party key. The site will not ask you for a DeepSeek (or any other) private API key — that is a deliberate security choice, not a missing feature. The call paths that do exist: the managed gateway behind the AI actions listed above, and the free local paths — local test builder and grading, browser speech recognition, the on-device transcript drafter, and per-word MyMemory drafts. KimiClaw handles transcripts as a file round trip, and the help center below can hand a question to Kimi directly.')}</p></article>
            <article><strong>{t('Can I get a transcript without spending AI quota?')}</strong><p>{t('Yes, for English or German audio you already have as a local file: in Listen & Read setup, choose the file, then use the on-device transcriber under Transcript source. A small open Whisper model (~40 MB, bundled with the site) runs entirely in your browser — the audio never leaves the device and nothing is billed. Stereo files are auditioned on the mix, left, and right channels and the cleanest wins; a larger ~80 MB model is bundled as an optional quality tier when the standard one struggles. The result is a rough draft VTT to review before saving; for Chinese audio or publication-grade text, use the KimiClaw round trip instead.')}</p></article>
            <article><strong>{t('Can I bind another email to my account?')}</strong><p>{t('There is no separate email to bind: your account is your Kimi sign-in, and the email shown in My Account is the one on that Kimi account. To work under a different email, sign out and sign in with the other Kimi account; move your workspace across with Settings → JSON export and import.')}</p></article>
            <article><strong>{t('Can I share privately without publishing the site?')}</strong><p>{t('Yes. A saved version opens through an unlisted preview link — the site appears in no public directory, and sending the link to a specific person is the private share. Anyone holding the link can open it (there is no password layer), and every visitor gets a fresh local workspace: your episodes, transcripts, and cloud data stay bound to your own sign-in and are never included.')}</p></article>
            <article><strong>{t('Does the AI remember my earlier quizzes or sparks between visits?')}</strong><p>{t('No. Each AI request is self-contained: it carries only the payload described above — an excerpt, your answers, a spark text, or tested word pairs — and the gateway keeps no conversation history between calls. What does persist is your own saved work: graded quizzes, spark feedback, and decks live in your workspace (and cloud copy when signed in) until you delete them yourself.')}</p></article>
            <article><strong>{t('Which AI model answers, and can I choose a different one?')}</strong><p>{t('The AI actions call the site’s managed gateway, which resolves its configured default model on the server side; the model name is never hardcoded into the page or exposed to the browser. There is no model picker by design — it keeps every answer on one audited, quota-controlled path. The free local paths (local test builder, on-device transcriber, browser speech recognition) use no remote model at all.')}</p></article>
          </div>
          <div className="guide-actions"><button type="button" className="btn btn-secondary" onClick={() => onNavigate('quiz')}>{t('Open voice quiz')}</button><button type="button" className="btn btn-ghost" onClick={() => onNavigate('sparks')}>{t('Open sparks')}</button></div>
        </div>
      </details>

        <details id="guide-help" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>10</span><MessageCircleQuestion size={22} /><div><h2>{t('Help center — ask Kimi, replay, and why things are where they are')}</h2><p>{t('Answers the guide does not cover, one tap from a real conversation.')}</p></div></summary>
          <div className="guide-fold-body">

          <div className="guide-kimi panel">
            <h3>{t('Ask Kimi directly')}</h3>
            <p>{t('Pick a starter question or write your own, then copy it and open Kimi in a new tab — paste it there to continue the conversation. Kimi answers in its own window; nothing you ask is sent from or stored by this site.')}</p>
            <div className="guide-kimi-presets">
              {kimiPresets.map((preset) => <button type="button" key={preset} className="guide-kimi-chip" onClick={() => setKimiQuestion(preset)}>{preset}</button>)}
            </div>
            <textarea className="guide-kimi-input" rows={3} maxLength={600} value={kimiQuestion} onChange={(event) => setKimiQuestion(event.target.value)} placeholder={t('Type your question for Kimi…')} aria-label={t('Question for Kimi')} />
            <button type="button" className="btn btn-primary" onClick={() => void askKimi()}><Copy size={15} />{t('Copy question & open Kimi')}<ExternalLink size={14} /></button>
          </div>

          <div className="guide-format-grid guide-faq-grid">
            <article><strong>{t('The entrance theatre never plays when I open the site — broken?')}</strong><p>{t('No. The paper theatre is a first-visit ceremony: once you click Enter the atelier, this browser remembers and skips straight to your workspace on later visits. To watch it again, use Settings → Replay entrance — or the button right below. If your device has Reduce Motion switched on, the ceremony is intentionally shortened to a quick fade.')}</p><button type="button" className="btn btn-secondary guide-faq-action" onClick={() => window.dispatchEvent(new Event(REPLAY_ENTRANCE_EVENT))}><RotateCcw size={15} />{t('Replay entrance now')}</button></article>
            <article><strong>{t('Why is an episode like “Süß und salzig” labelled a reference candidate?')}</strong><p>{t('It inherits the label from its show, not from a judgement of the episode. Shows sit in four tiers — Signal Radar, Core Threads, Selective Listening, Reference Library — and Treibholz is an archive-tier reference library for oceanography. Reference episodes wait in the inbox and never claim a weekly queue slot on their own; you can still select any of them into the week manually whenever its content earns it.')}</p></article>
            <article><strong>{t('How does the dedupe scan actually work?')}</strong><p>{t('The scan compares every pair of episodes still in your inbox or this week’s queue and surfaces a pair when any of four signals fires: an identical feed dedupe key, an identical normalised title, the same guest hinted by the title prefix, or a title-token overlap of at least two shared keywords with a Jaccard similarity of 0.34 or more. Pairs are sorted by score with the shared evidence shown; you can also mark a pair the rules missed, dismiss a pair you have judged, and restore dismissed pairs later. The scan never deletes or skips anything by itself — every outcome stays your decision.')}</p></article>
            <article><strong>{t('How can I tell which environment actually answered me?')}</strong><p>{t('Three honest signals. Local answers (local test builder, deck grading, dedupe, lenses) arrive instantly and keep working with the network off — no sign-in asked. The four AI buttons answer only after Kimi sign-in, are billed to the site owner, and say so plainly when the owner’s quota is exhausted. The on-device transcriber labels its output as a draft generated on this device and works without any account. If you want hard proof, open the browser’s network panel: local answers produce no /api/ call at all, while an AI answer always travels as one /api/trpc request.')}</p></article>
            <article><strong>{t('How do I install and run new plugins?')}</strong><p>{t('Not here — this site has no plugin slot to install into, and it will never ask for plugin credentials. Plugins belong to the Kimi client: install them from its plugin marketplace, and they run inside Kimi’s own sandboxed environment, never inside this page. What this site does use are documented handoffs you trigger yourself: KimiClaw file round trips, the official Obsidian new-note URI, the iPad share sheet into Goodnotes, and dictionary lookups by app link or clipboard. If a feature claims to be a plugin running inside this website, treat it as bogus.')}</p></article>
            <article><strong>{t('What does the “word family” badge on some cards mean?')}</strong><p>{t('Word Decks groups cards by an approximate lemma — the dictionary stem of a word — so forms like “run”, “runs”, and “running” (or German “machen”, “machst”, “macht”) are flagged as one family with a small badge. Grouping is computed locally in your browser, never deletes or merges cards, and never touches scheduling. Use the “One card per word family” toggle above the deck to review just one representative per family, and open the family line under a card to jump between its forms. Chinese words and multi-word phrases group only on exact form.')}</p></article>
          </div>
        </div>
      </details>

        <details id="guide-credits" className="guide-section guide-fold">
          <summary className="guide-section-title"><span>11</span><BookOpenCheck size={22} /><div><h2>{t('Credits & sources')}</h2><p>{t('Every recording, artwork, and illustration on the site, with its origin and license.')}</p></div></summary>
          <div className="guide-fold-body">
          <p className="guide-paragraph guide-credits-note">{t('Five folded lists keep this section short — open a group to browse every entry with its license and source link.')}</p>

          <details className="guide-credits-fold">
            <summary><span className="guide-credits-name">{t('Module picture-book vignettes')}</span><span className="guide-credits-count">{t('{count} entries', { count: Object.keys(MODULE_ILLUSTRATIONS).length })}</span></summary>
          <div className="guide-credits-block">
            <p className="guide-paragraph">{t('Each of the fourteen modules carries its own complete digital Holly Hobbie interior page or scene from the Toot & Puddle series, chosen for that module’s meaning — scenes are never shared between modules or with performance and artwork-guide illustrations. No covers, photographed books, Chinese text, or in-image Chinese watermarks are used. The entrance theatre separately stages four hand-traced transparent figures. These copyrighted reproductions are not public domain or openly licensed; review the relevant rights before publishing the site publicly. No endorsement by Holly Hobbie or the publishers is implied.')}</p>
            <ul className="guide-credits-list">
              {(Object.keys(MODULE_ILLUSTRATIONS) as ViewKey[]).flatMap((view) => {
                const illustration = MODULE_ILLUSTRATIONS[view]
                if (!illustration) return []
                return [
                  <li key={view}>
                    <strong>{t(MODULE_LABELS[view])}</strong>
                    <span>{t(illustration.book)}{illustration.bookYear ? ` (${illustration.bookYear})` : ''} — {t(illustration.scene)}</span>
                    <a href={illustration.source} target="_blank" rel="noreferrer">{t('Source')}<ExternalLink size={12} /></a>
                  </li>,
                ]
              })}
            </ul>
          </div>
          </details>

          <details className="guide-credits-fold">
            <summary><span className="guide-credits-name">{t('Performance recordings')}</span><span className="guide-credits-count">{t('{count} entries', { count: PERFORMANCE_RECORDINGS.length })}</span></summary>
          <div className="guide-credits-block">
            <p className="guide-paragraph">{t('Twenty-two real performer and ensemble recordings — never synthesized or AI-generated. Fourteen source files come from Wikimedia Commons, including the United States Marine Chamber Orchestra’s two Debussy harp dances and Michael Laucke’s Bach guitar performance; seven performances come from IMSLP, the Petrucci Music Library — two classical-guitar solos and five chamber, concerto, orchestral and solo recordings (Glinka, Reicha, Mozart, Schubert, Liszt); the Open Goldberg Variations recording came from its official open project. Local copies were converted to stereo MP3 at 160 kbps; the items marked as excerpts contain only the opening minutes. No endorsement by any performer or ensemble is implied.')}</p>
            <ul className="guide-credits-list">
              {PERFORMANCE_RECORDINGS.map((recording) => (
                <li key={recording.id}>
                  <strong>{recording.composer} — {recording.work}</strong>
                  <span>{recording.performer} · {t(recording.modification)}</span>
                  <a href={recording.licenseUrl} target="_blank" rel="noreferrer">{recording.license}</a>
                  <a href={recording.sourceUrl} target="_blank" rel="noreferrer">{t('Source')}<ExternalLink size={12} /></a>
                </li>
              ))}
            </ul>
          </div>
          </details>

          <details className="guide-credits-fold">
            <summary><span className="guide-credits-name">{t('Performance picture-book illustrations')}</span><span className="guide-credits-count">{t('{count} entries', { count: RECORDING_ILLUSTRATIONS.length })}</span></summary>
          <div className="guide-credits-block">
            <p className="guide-paragraph">{t('Twenty-two complete digital Holly Hobbie interior pages and scenes — one per performance and none shared with module or artwork-guide illustrations. No covers, photographed books, Chinese text, or in-image Chinese watermarks are used. Compositions remain complete; where page-external text or margins were removed, the illustration itself was not cropped. These copyrighted picture-book reproductions are not public domain or openly licensed; review the relevant rights before publishing the site publicly. No endorsement by Holly Hobbie or the publishers is implied.')}</p>
            <ul className="guide-credits-list">
              {RECORDING_ILLUSTRATIONS.map((illustration) => (
                <li key={illustration.recordingId}>
                  <strong>{illustration.book}{illustration.bookYear ? ` (${illustration.bookYear})` : ''}</strong>
                  <span>{t(illustration.scene)} · Holly Hobbie</span>
                  <a href={illustration.sourceUrl} target="_blank" rel="noreferrer">{t(illustration.sourceLabel)}<ExternalLink size={12} /></a>
                </li>
              ))}
            </ul>
          </div>
          </details>

          <details className="guide-credits-fold">
            <summary><span className="guide-credits-name">{t('Picture-book artwork guides')}</span><span className="guide-credits-count">{t('{count} entries', { count: ART_GUIDES.length })}</span></summary>
          <div className="guide-credits-block">
            <p className="guide-paragraph">{t('Twenty-two additional complete digital Holly Hobbie interior pages and scenes form a fixed one-to-one visual dialogue with the historical artworks. No covers, photographed books, Chinese text, or in-image Chinese watermarks are used. None is shared with the performance keys or module vignettes, and no original or AI-generated guide character is used. Compositions remain complete; where page-external text or margins were removed, the illustration itself was not cropped. These copyrighted picture-book reproductions are not public domain or openly licensed; review the relevant rights before publishing the site publicly. No endorsement by Holly Hobbie or the publishers is implied.')}</p>
            <ul className="guide-credits-list">
              {ART_GUIDES.map((guide) => (
                <li key={guide.artworkId}>
                  <strong>{guide.book}{guide.bookYear ? ` (${guide.bookYear})` : ''}</strong>
                  <span>{t(guide.scene)} · Holly Hobbie</span>
                  <a href={guide.sourceUrl} target="_blank" rel="noreferrer">{t(guide.sourceLabel)}<ExternalLink size={12} /></a>
                </li>
              ))}
            </ul>
          </div>
          </details>

          <details className="guide-credits-fold">
            <summary><span className="guide-credits-name">{t('Historical artworks')}</span><span className="guide-credits-count">{t('{count} entries', { count: HISTORICAL_ARTWORKS.length })}</span></summary>
          <div className="guide-credits-block">
            <p className="guide-paragraph">{t('Twenty-two historical oil paintings and watercolors, shown only while episode audio plays. The underlying works are in the public domain; local WebP files are resized reproductions, never generated from episode content.')}</p>
            <ul className="guide-credits-list">
              {HISTORICAL_ARTWORKS.map((artwork) => (
                <li key={artwork.id}>
                  <strong>{artwork.artist} — {artwork.title}, {artwork.date}</strong>
                  <span>{artwork.collection}</span>
                  <a href={artwork.licenseUrl} target="_blank" rel="noreferrer">{t(artwork.license)}</a>
                  <a href={artwork.sourceUrl} target="_blank" rel="noreferrer">{t('Source')}<ExternalLink size={12} /></a>
                </li>
              ))}
            </ul>
          </div>
          </details>
        </div>
      </details>
      </div>
    </div>
  )
}
