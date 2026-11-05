import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '../lib/i18n'

// Minimal structural typing for the Web Speech API (not in the TS DOM lib).
export type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
  start: () => void
  stop: () => void
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/** One-shot dictation into a text value. Keeps any text already present. */
export function useSpeechInput(lang: string, onTranscript: (combined: string) => void, currentValue: () => string) {
  const { t } = useI18n()
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const baseRef = useRef('')

  const stop = () => {
    try { recognitionRef.current?.stop() } catch { /* already stopped */ }
    recognitionRef.current = null
    setListening(false)
  }
  useEffect(() => stop, [])

  const start = () => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return
    stop()
    const recognition = new Ctor()
    recognition.lang = lang
    recognition.interimResults = true
    recognition.continuous = false
    recognition.onresult = (event) => {
      let transcript = ''
      for (let index = 0; index < event.results.length; index += 1) transcript += event.results[index][0].transcript
      onTranscript(`${baseRef.current}${transcript}`.trim())
    }
    recognition.onend = () => { recognitionRef.current = null; setListening(false) }
    recognition.onerror = (event) => {
      recognitionRef.current = null
      setListening(false)
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        toast.error(t('Microphone access was blocked. Allow the microphone, or type instead.'))
      } else if (event.error === 'no-speech') {
        toast.message(t('No speech was captured. Nothing was saved as an answer; check the microphone and dictate again.'))
      } else if (event.error === 'audio-capture' || event.error === 'network') {
        toast.error(t('Speech recognition failed before the text could be used. This is a recognition problem, not a learning result; nothing was graded or saved — dictate again when ready.'))
      }
    }
    recognitionRef.current = recognition
    baseRef.current = currentValue() ? `${currentValue()} ` : ''
    setListening(true)
    try { recognition.start() } catch { stop() }
  }

  return { supported: getSpeechRecognitionCtor() !== null, listening, start, stop }
}
