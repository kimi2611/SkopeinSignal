# SkopeinSignal（调频中） · Private Podcast Learning Atelier

An iPad-friendly private podcast learning atelier for deliberate listening, semantic triage, episode-value classification, source-linked understanding, imported Kimi research notes, language study, historical playback artwork, licensed performance recordings, vocabulary review, idea evolution, scholarly Resources, and notes. English, Chinese, and German interfaces are available; English remains the default. The Chinese display names are **调频中** for SkopeinSignal, **对焦中** for AithraScope, and **锚定中** for DikeLens. Internal IDs and storage keys remain stable. Snipd remains a separate app: SkopeinSignal never reads a private Snipd account or stores its password.

## Run locally with Docker

From the extracted source directory, this single command builds the image and starts the complete React + Hono/tRPC app:

```bash
docker build -t skopein-signal:local . && docker run --rm -p 3000:3000 skopein-signal:local
```

Open **http://localhost:3000**. No database, `.env`, or separate `npm install` is required for this local mode. The ZIP deliberately excludes `.env`, `node_modules`, `dist`, logs, and VCS metadata; the Docker build context excludes them too. `.env.example` contains blank variable names only.

Local mode keeps workspace text and progress in the current browser and local audio in that browser’s IndexedDB. Kimi OAuth, cloud workspace sync, and managed AI remain disabled unless you supply your own compatible platform services and credentials; those hosted capabilities and their accounts do not travel with a source export. Do not mistake a browser-local save for cloud sync.

For source development without Docker:

```bash
npm ci
npm run dev
```

For a production build without Docker:

```bash
npm run build
npm start
```

The production output is in `dist/`. The dynamic app serves the React client and its Hono/tRPC API from one Dockerfile build; `.env` never travels with a code export. In Safari, use **Share → Add to Home Screen** for a standalone window. The application shell can reopen offline. RSS refresh, AI calls, cloud sync, and online draft translation require a connection; saved local audio, transcripts, vocabulary, summaries, understanding records, research reports, idea evolutions, review schedules, and notes remain available offline. Artwork and Performance Room recordings use runtime caching and are not precached in bulk during service-worker installation.

## Account, cloud workspace, and sync

- Kimi OAuth sign-in creates one private cloud workspace per account. Shows, episodes, value categories, transcripts, vocabulary, card schedules, notes, pencil strokes, summaries, quiz attempts, sparks, learning follow-up tasks, saved research reports, understanding records, claim reviews, theme maps, and idea evolutions sync as one JSON workspace (12 MB save limit).
- Expected-revision checks stop an older device from silently overwriting newer work; conflicts are surfaced for the user to resolve. JSON export and import remain as manual backups. Conversion & export explains disabled, loading, migration, saving, synced, error, and conflict states and links to the relevant Account or Settings recovery action instead of reporting browser-local work as cloud-synced.
- Local audio stays in the device’s IndexedDB and is never uploaded or included in JSON. On another device, re-link the original file in Listen & Read; the synced transcript, notes, and playback position are preserved. JSON backup buttons and receipts explicitly say **no audio**; a started download must still be confirmed in Downloads or Files.

## Podcast workflow and research value

- Twenty-four shows are organized into four listening tiers; TOE retains its record of 41 existing snips.
- New episodes enter the inbox and need at least two selection reasons before joining the weekly queue.
- The default weekly budget and seed queue contain **four long interviews, seven medium episodes, and three micro discussions**. Micro is ≤ 30 minutes, medium is > 30 and ≤ 60 minutes, and long is > 60 minutes. Unknown durations are treated as long until verified. The three caps are adjustable in Settings.
- Existing workspaces migrate only their original seed queue when it is untouched; custom queue decisions and non-seed episodes are preserved.
- **AithraScope（对焦中）** groups natural-world, scientific, technological, AI, and business-model inquiry. **DikeLens（锚定中）** groups society, institutions, history, ethics, philosophy, arts, culture, and public-life judgment.
- Semantic lenses are deterministic local content classifications, not selection or skip states. Manual choices survive queue, completion, skip, and restore actions.
- **Value Insights** separately classifies each episode as **Strong timeliness** or **Long replay value**. This category is independent of duration, semantic lens, and queue status.
- A Kimi summary can be attached only when the user explicitly pastes text or chooses a JSON, Markdown, or TXT file. The importer recognizes theme, core arguments, evidence/materials, and expert perspectives and renders imported content as plain text. JSON summaries retain the 120 KB limit; the shared TXT/Markdown route accepts up to 5 MB because the user may explicitly reclassify one as a transcript or vocabulary list. The site cannot and does not claim to read private Kimi conversations.
- Audio, transcript, summary, and vocabulary file selection now opens one **preview and confirmation dialog** with file facts, content/audio preview, target module, storage boundary, and next action. TXT/Markdown type is never inferred from the extension alone. Cancel makes no workspace change; audio and transcript confirmation only fill setup drafts. Word Decks retains its separate parsed-entry review, language/episode selection, 500-entry cap, deduplication, and final Import words button.
- A saved summary offers **Save to Notes, Continue writing, Copy summary, Download Markdown, and Download TXT**. Continue writing opens an unsaved notebook draft containing the summary and at most the opening 12,000 transcript characters, explicitly labelled when excerpted; the full source remains in Listen & Read.
- Value Insights also generates **source-linked understanding records**: the full imported transcript is analyzed in bounded chunks (never only an opening excerpt), every claim carries a verbatim evidence passage and segment timestamp, and the coverage receipt reports exactly how much of the transcript was read. Claims can be marked Agree / Unsure / Verify, and understanding records from at least two episodes can be compared into cross-episode theme maps.
- Repeated skips create downgrade signals; completing an episode clears the streak. Skipping for redundancy does not penalize a show. Deduplication always requires human confirmation.
- RSS requests try the public feed directly and can then use a configurable CORS proxy. Never put credentials, account tokens, or private subscription parameters into public RSS URLs.

## Transcript request, on-device drafting, listen, read, and retain

- For a transcript round trip, SkopeinSignal prepares a portable KimiClaw request containing an episode title, podcast name, and public audio URL. Copy, share, or download that request, then confirm access, processing, and file receipt in KimiClaw yourself. A local download or share is never reported as an external processing receipt.
- For English or German local audio, an experimental **on-device transcriber** (a small open Whisper-class model bundled with the site) drafts a reviewable VTT entirely in the browser — audio never leaves the device and no AI quota is used. Automatic detection evaluates passages independently, so German and English can coexist in one file without a file-wide language vote. It is a draft to review, not publication-grade text; model files are deliberately kept out of the offline cache, and a first offline launch is not promised.
- Download the returned VTT, SRT, TXT, or Markdown transcript and import or paste it locally. Only audio the user is allowed to share should be supplied.
- Play a public RSS or direct audio URL, or import a browser-compatible local file such as MP3, M4A, or WAV. For Snipd, use an exported audio file or the episode’s actual public media URL; a Snipd share webpage is not an audio direct link. The site has no Snipd login, private-subscription access, or unofficial account API.
- Audio-only playback is supported without a transcript; notes and playback position remain available, and a transcript can be added later.
- Imported TXT/Markdown transcripts can receive a **manual timeline**: set segment boundaries with playback crosshairs, review length-based estimates as drafts, then save to enable synchronized playback, auto-follow, and VTT export. Removing a timeline requires a second confirmation and preserves text, vocabulary, and notes.
- VTT and SRT provide segment synchronization, active-segment highlighting, timestamp seeking, playback-position restoration, and segment editing. TXT and Markdown support reading and clickable words without pretending to have a timeline.
- Click a word to request a free online draft translation, review it, and save it with its sentence and timestamp. Only the selected word is sent to the translation service, never the whole transcript. Free translation quotas are not guaranteed; manual translation remains available.
- Eudic app, Eudic Web, Youdao, and Google Translate are external handoffs, not embedded plugins. No provider answer is imported automatically.
- A shared five-stage **Material → Transcript → Summary → Draft → Export** journey connects Listen & Read, Value Insights, and episode-linked Notes while retaining the original module tabs and actions. Its Next button targets the first missing stage for the same episode.
- **Conversion & export** can compose one finished Markdown or TXT document from any available combination of transcript, Kimi summary, notes/drafts, vocabulary, source links, and saved Resources reports. Empty categories are disabled with recovery directions. Resources content preserves real saved DOI, database, URL, evidence scope, retrieval provenance, caveats, and the metadata-and-abstract limitation.
- Completion marks the original handoff package ready. KimiClaw Markdown, LinguaCafe TXT/VTT, vocabulary CSV, and system sharing remain available alongside the new composer. VTT remains disabled without a complete timeline and links back to Transcript for repair.
- The site has no private KimiClaw or LinguaCafe authorization. Confirm receipt and import in each target app itself; a download or system share is not a remote import receipt.

## Learning record and error-to-learning loop

- Every episode carries an **Episode learning record** in Listen & Read: playback position, timeline state, saved words, notes, latest quiz score, sparks, research reports, and open follow-up tasks, with a Continue listening action. This Week surfaces the same threads as a Continue Learning entry.
- Quiz and IELTS feedback can be turned — only by explicit user choice — into four follow-up task kinds: replay the related transcript passage, rewrite the argument in Notes, develop a new idea, or add a later retest. Duplicate tasks are prevented by stable source IDs; review intervals and card schedules are never adjusted automatically from one AI verdict.
- Transcript matching for replay uses positive lexical overlap only; when no reliable passage match exists, the task honestly opens the episode without claiming a precise timestamp.
- Speech-recognition failures (blocked microphone, no speech captured, capture or network errors) are reported as recognition problems, never recorded as comprehension errors.

## Ideas, evolution, and scholarly Resources

- Sparks capture a raw thought by typing or dictation; AI feedback gives an honest evaluation, strengths, suggestions, and one follow-up question.
- Each spark carries an **idea evolution record**: origin, AI question, research stage, revisions with a current claim, and spoken or written self-defense. An AI challenge plus the evidence board show support, counterpoints, and unknowns — no invented probabilities.
- **Resources** plans a scholarly search from an idea, tries OpenAlex then Crossref, and compares only the titles, metadata, and abstracts actually returned. Reports persist with their real DOI, database name, landing page, search date, and evidence scope; metadata-only records are labelled, and the analysis is never presented as a full-text systematic review.
- Research reports can be reopened, retitled, linked to episodes and idea evolutions, deleted, and their evidence can flow into Notes or an idea evolution stage.

## Historical artwork and real performance recordings

- The playback viewer contains **twenty-two historical public-domain works**: fifteen oil paintings and seven watercolors. Each records its artist, title, date, medium, collection, source, and rights information in `src/data/artworks.ts` and `CREDITS.md`.
- Artwork mounts only inside Listen & Read while real episode audio is playing. Pause or end playback and it disappears. These are historical reproductions, not images generated from episode content and not static page decoration.
- The **Performance Room** offers **twenty-two real recordings**: two piano solos, four flute solos, five classical-guitar solos, three harp recordings, two cello solos, four bassoon performances, and two purely instrumental orchestral recordings, plus chamber works. No track is duplicated to inflate the catalogue.
- Every recording names its performer, work, source, license, and modification. Excerpts are explicitly labeled. Local MP3 copies provide browser/iPad-compatible playback. See `CREDITS.md` and `src/data/recordings.ts` for the attribution ledger. No paid media assets or generative-media service are required.
- Recorded music is for browsing, notes, and handoff work only. Its player lives outside route rendering, so switching modules does not interrupt playback. Floating controls pause, return to the room, or stop; starting real podcast audio pauses it, and it cannot start while episode audio is playing.

## Word Decks

- Every saved vocabulary entry automatically becomes a card; there is no separate vocabulary import step. Whole word lists can also be pasted in one batch.
- Build decks by language or episode and filter new, due, learned, or all cards.
- The front shows the word and context. The back shows the reviewed translation, show, episode, language, and optional timestamp.
- Again, Hard, Good, and Easy update a local spaced-repetition schedule. Progress is included in JSON backups.
- A Quizlet-style Test mode builds written tests locally and offline; an optional AI builder is billed to the site owner per test.
- This is an **Anki-style local review mode**, not an AnkiWeb client. It has no AnkiWeb login, API, account synchronization, or claim of external review receipts. Episode vocabulary CSV imports into Anki desktop through Anki’s own explicit import flow.

## Notes, search, and Obsidian

- Save timestamped or untimed notes while audio continues playing. Edit, delete, search, filter, and export notes in the global notebook.
- The notebook search is a **unified workspace search**: one query covers transcripts, notes, vocabulary, sparks, and saved Resources reports, each with its source episode and timestamp where one exists.
- A notebook timestamp reopens the episode at that audio position.
- Send the current filtered selection to Obsidian through the official `obsidian://new` URI. An optional Vault name and Vault-relative folder are stored locally without credentials. Short notebooks use URI content; longer notebooks use clipboard mode. Clipboard failure falls back to a Markdown download.
- Requesting Obsidian to open is **not** a receipt or confirmation of import. Confirm the new note in Obsidian itself.
- Apple Pencil mode keeps editable pressure-sensitive strokes, hands a page to Goodnotes through the iPad share sheet (Goodnotes alone confirms import), and can recognize ink with an image-capable site model — the learner confirms the transcript before any AI feedback.

## Entrance, brand, and data boundaries

- The first visit presents a click-to-open curtain. It never autoplays sound and respects reduced-motion preferences. Settings can replay it; the preference key is `skopein.entrance.seen`.
- The visible product name is **SkopeinSignal · Private Podcast Learning Atelier**. User-visible build/version labels are omitted; the internal backup schema remains `version: 1` for compatibility.
- AI actions (voice quiz, IELTS papers and band feedback, spark feedback, handwriting recognition, Resources planning and comparison, understanding and theme maps, Word Decks AI test builder) run through the managed site AI gateway behind Kimi sign-in, are billed to the site owner, and are never automatically retried. Triage, dedupe, lenses, decks, local tests, notes, timeline editing, and playback remain local and free.
- Local audio is stored separately in `IndexedDB` and is **not** included in JSON backups or cloud sync. Keep original audio files.
- Clearing browser data can remove local stores. A JSON backup cannot restore deleted local audio.
- Legacy `tingwen.*` storage keys and event names are intentionally retained so existing local workspaces migrate without losing user data.

## Source map

- `src/hooks/useWorkspace.tsx`: compatible state migration, persistence, episode flow, notes, summaries, learning collections, review progress, and RSS merging.
- `src/hooks/useCloudWorkspace.ts`: authenticated JSON workspace sync with revision conflict protection.
- `src/hooks/useMusicPlayer.tsx` and `src/components/MusicMiniPlayer.tsx`: route-persistent recording playback, floating controls, and podcast-media exclusion.
- `src/data/`: shows, seed queue, historical artwork catalogue, and licensed recording catalogue.
- `src/lib/lenses.ts`: transparent AithraScope/DikeLens content rules.
- `src/lib/kimiSummary.ts`: bounded JSON/Markdown/TXT summary import.
- `src/lib/cards.ts`: local spaced-repetition scheduling.
- `src/lib/learningData.ts`: migration and sanitization for learning tasks, research reports, understanding records, claim reviews, theme maps, and idea evolutions.
- `src/lib/feedbackMatch.ts`: positive-overlap transcript matching for feedback follow-up tasks.
- `src/components/UnifiedSearch.tsx`: unified search across transcripts, notes, vocabulary, sparks, and Resources.
- `src/components/study/ArtworkViewer.tsx`: playback-only historical artwork.
- `src/components/EntranceOverlay.tsx`: click-to-open, reduced-motion-aware curtain.
- `src/components/learning/`: episode dossier, continue-learning, feedback follow-up, understanding studio, and idea evolution panels.
- `src/lib/transcript.ts` and `src/lib/transcriptTimeline.ts`: VTT/SRT timelines, manual timeline editing, and TXT/Markdown cleanup.
- `src/lib/media.ts`: local-audio IndexedDB storage.
- `src/lib/handoff.ts`: legacy KimiClaw/LinguaCafe/vocabulary files plus selectable finished-document Markdown/TXT generation.
- `src/lib/summaryOutput.ts` and `src/lib/studyNavigation.ts`: summary follow-up outputs, bounded writing drafts, and same-episode cross-module staging.
- `src/components/ImportPreviewDialog.tsx`: shared import preview, explicit TXT/Markdown classification, destination, and storage explanation.
- `src/components/learning/WorkflowJourney.tsx`: five-stage same-episode content workflow.
- `src/lib/obsidian.ts`: official Obsidian new-note URI construction and launch.
- `api/`: Hono/tRPC server — auth, workspace sync, quiz, IELTS, sparks, resources, understanding, Snipd resolution, and media routes.
- `src/pages/`: Week, Inbox, Listen & Read, Value Insights, Notes, Voice Quiz, Word Decks, Sparks, Performance Room, Show Tiers, Dedupe, Guide, My Account, and Settings.
- `public/artworks/`: optimized local historical-work reproductions.
- `public/recordings/`: locally bundled, licensed performer and ensemble MP3s.
- `public/sw.js`: offline application-shell and runtime cache.
