import type { PodcastShow } from '../types'

interface MyMemoryResponse {
  responseData?: { translatedText?: string }
  responseStatus?: number | string
  responseDetails?: string
  quotaFinished?: boolean
}

export async function translateWord(text: string, language: PodcastShow['language'], signal?: AbortSignal): Promise<string> {
  const source = language === 'English' ? 'en' : language === 'Deutsch' ? 'de' : 'zh'
  const target = language === 'Chinese' ? 'en' : 'zh-CN'
  const query = new URLSearchParams({ q: text, langpair: `${source}|${target}` })
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 9000)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?${query.toString()}`, { signal: controller.signal })
    if (!response.ok) throw new Error(`Translation service returned ${response.status}`)
    const payload = await response.json() as MyMemoryResponse
    if (payload.quotaFinished || Number(payload.responseStatus) !== 200 || !payload.responseData?.translatedText) {
      throw new Error(payload.responseDetails || 'Translation service is temporarily unavailable')
    }
    return decodeEntities(payload.responseData.translatedText).trim()
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
}

function decodeEntities(value: string): string {
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}
