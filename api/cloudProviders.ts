/**
 * Cloud transcription providers, ordered by whether they actually work from
 * mainland China. The order is the point: the first three are reachable without
 * a VPN, OpenAI is last because this host cannot even open a TCP connection to
 * api.openai.com (measured: 10 s timeout, curl exit 000).
 *
 * What is deliberately NOT here:
 *   - DeepSeek: chat/completions only, no audio endpoint accepts a file.
 *   - Kimi (Moonshot): same, no speech-to-text API.
 *   - Claude / Anthropic: its own model overview says text + image input only;
 *     it never accepted audio, so a "transcribe" button would be a lie.
 *
 * Every provider is BYOK: the browser holds the key and sends it per request.
 * That means the deployment's own server sees the key in flight. The UI says so
 * out loud instead of pretending otherwise.
 *
 * Strings are written in English because English source text is the i18n key:
 * `ti()` marks data-table strings for the dictionary sync, and the client
 * translates them at render. Nothing here is Chinese, so an English UI cannot
 * end up with a Chinese paragraph in the middle of it.
 */

/** Identity marker for the i18n dictionary sync; keeps this file free of React. */
const ti = (text: string): string => text

export type CloudProviderKind = 'openai-compatible' | 'url-subtitle' | 'manual'

export interface CloudProvider {
  id: string
  label: string
  /** Reachable from mainland China without a VPN. Drives the sort order. */
  domestic: boolean
  kind: CloudProviderKind
  /** For openai-compatible: the /v1 root that gets `/audio/transcriptions`. */
  baseUrl?: string
  /** Suggested model. Editable in the UI because vendors rename these often. */
  suggestedModel?: string
  /** BibiGPT takes a URL, not bytes, so the user needs a public link. */
  needsPublicUrl?: boolean
  docsUrl: string
  note: string
}

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: 'bibigpt',
    label: 'BibiGPT',
    domestic: true,
    kind: 'url-subtitle',
    needsPublicUrl: true,
    docsUrl: 'https://docs.bibigpt.co/api-reference/introduction',
    note: ti('Direct from mainland China. It takes a publicly reachable audio or video link and refuses file uploads, so a local file has to go to object storage first. The subtitle endpoint is cheaper than the summary one — it does not spend an extra LLM call.'),
  },
  {
    id: 'siliconflow',
    label: ti('SiliconFlow'),
    domestic: true,
    kind: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    suggestedModel: 'FunAudioLLM/SenseVoiceSmall',
    docsUrl: 'https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions',
    note: ti('Direct from mainland China. OpenAI-compatible /audio/transcriptions; the SenseVoice models are cheap and handle Chinese, English and German.'),
  },
  {
    id: 'dashscope',
    label: ti('Alibaba Cloud Model Studio (DashScope)'),
    domestic: true,
    kind: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    suggestedModel: 'qwen3-asr-flash',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/audio-transcription',
    note: ti('Direct from mainland China. /audio/transcriptions in compatibility mode; the model name must match what you enabled in the console, and you can edit it below.'),
  },
  {
    id: 'openai',
    label: 'OpenAI',
    domestic: false,
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    suggestedModel: 'whisper-1',
    docsUrl: 'https://platform.openai.com/docs/api-reference/audio/createTranscription',
    note: ti('Last because this host times out connecting to api.openai.com. It would only work with an outbound proxy in front of the server, and there is none — so expect it to fail. The entry stays so the shape of the API is documented, not to pretend it runs.'),
  },
]

export const MANUAL_PROVIDER = {
  id: 'kimiclaw',
  label: ti('Send it to Kimi Claw'),
  note: ti('Drop the audio file in the group chat and our faster-whisper box transcribes it, then sends back the text, the subtitles and the word list. Best for long audio and for anyone who would rather not manage a key — the trade-off is waiting for a slot in our queue.'),
} as const

export function findProvider(id: string): CloudProvider | undefined {
  return CLOUD_PROVIDERS.find((p) => p.id === id)
}
