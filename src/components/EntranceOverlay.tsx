import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowRight, AudioLines } from 'lucide-react'
import { useI18n } from '../lib/i18n'

const ENTRANCE_KEY = 'skopein.entrance.seen'
export const REPLAY_ENTRANCE_EVENT = 'skopein:entrance'

interface CurtainFold {
  position: string
  width: string
  opacity: number
  delay: string
  drift: number
  tilt: number
}

// Four distinct fold silhouettes: the outer curtain pair and the inner stage
// pair each get their own shapes, and left never mirrors right — no repeated
// curtain or stage forms anywhere in the ceremony.
const CURTAIN_FOLDS_LEFT: CurtainFold[] = [
  { position: '-3%', width: '21%', opacity: 0.82, delay: '0ms', drift: 5, tilt: 0.18 },
  { position: '11%', width: '17%', opacity: 0.62, delay: '35ms', drift: -3, tilt: -0.24 },
  { position: '26%', width: '24%', opacity: 0.9, delay: '70ms', drift: 4, tilt: 0.3 },
  { position: '44%', width: '19%', opacity: 0.68, delay: '25ms', drift: -4, tilt: -0.2 },
  { position: '60%', width: '23%', opacity: 0.92, delay: '85ms', drift: 3, tilt: 0.24 },
  { position: '79%', width: '16%', opacity: 0.7, delay: '45ms', drift: -2, tilt: -0.16 },
  { position: '92%', width: '14%', opacity: 0.95, delay: '100ms', drift: 2, tilt: 0.2 },
]

const CURTAIN_FOLDS_RIGHT: CurtainFold[] = [
  { position: '-4%', width: '16%', opacity: 0.9, delay: '25ms', drift: -4, tilt: -0.22 },
  { position: '9%', width: '23%', opacity: 0.7, delay: '60ms', drift: 3, tilt: 0.28 },
  { position: '24%', width: '18%', opacity: 0.84, delay: '10ms', drift: -5, tilt: -0.18 },
  { position: '41%', width: '25%', opacity: 0.64, delay: '80ms', drift: 4, tilt: 0.22 },
  { position: '59%', width: '19%', opacity: 0.88, delay: '40ms', drift: -3, tilt: -0.26 },
  { position: '76%', width: '22%', opacity: 0.72, delay: '95ms', drift: 5, tilt: 0.16 },
  { position: '91%', width: '15%', opacity: 0.94, delay: '50ms', drift: -2, tilt: -0.2 },
]

// The inner stage curtain is ONE full-width panel — a stage curtain is a single
// fly, not a pair of doors. Nine folds span the whole width; their delays stagger
// the way gather shadows deepen as the panel is flown upward.
const STAGE_FOLDS: CurtainFold[] = [
  { position: '-3%', width: '14%', opacity: 0.86, delay: '0ms', drift: 0, tilt: 0 },
  { position: '9%', width: '12%', opacity: 0.66, delay: '45ms', drift: 0, tilt: 0 },
  { position: '20%', width: '15%', opacity: 0.9, delay: '90ms', drift: 0, tilt: 0 },
  { position: '33%', width: '11%', opacity: 0.72, delay: '30ms', drift: 0, tilt: 0 },
  { position: '43%', width: '14%', opacity: 0.8, delay: '120ms', drift: 0, tilt: 0 },
  { position: '55%', width: '13%', opacity: 0.92, delay: '60ms', drift: 0, tilt: 0 },
  { position: '66%', width: '10%', opacity: 0.68, delay: '15ms', drift: 0, tilt: 0 },
  { position: '75%', width: '14%', opacity: 0.84, delay: '75ms', drift: 0, tilt: 0 },
  { position: '87%', width: '12%', opacity: 0.96, delay: '105ms', drift: 0, tilt: 0 },
]

// Four individually cropped, visibly distinct piglets — no pig appears twice.
const STAGE_PIGS = [
  { key: 'water', src: '/module-pigs/stage-pig-water.png', width: 161, height: 408 },
  { key: 'main', src: '/module-pigs/entrance-pig.png', width: 375, height: 852 },
  { key: 'tutu', src: '/module-pigs/stage-pig-tutu.png', width: 341, height: 405 },
  { key: 'gift', src: '/module-pigs/stage-pig-gift.png', width: 161, height: 272 },
] as const

function Curtain({ side }: { side: 'left' | 'right' }) {
  const direction = side === 'left' ? -1 : 1
  const folds = side === 'left' ? CURTAIN_FOLDS_LEFT : CURTAIN_FOLDS_RIGHT
  return (
    <div className={`entrance-curtain entrance-curtain-${side}`} aria-hidden="true">
      <div className="entrance-fabric">
        <div className="entrance-fabric-light" />
        <div className="entrance-folds">
          {folds.map((fold, index) => (
            <span
              className="entrance-fold"
              key={`${side}-${index}`}
              style={{
                '--fold-position': fold.position,
                '--fold-width': fold.width,
                '--fold-opacity': fold.opacity,
                '--fold-delay': fold.delay,
                '--fold-drift': `${fold.drift * direction}px`,
                '--fold-tilt': `${fold.tilt * direction}deg`,
              } as CSSProperties}
            />
          ))}
        </div>
        <div className="entrance-weave" />
        <div className="entrance-top-seam" />
        <div className="entrance-leading-edge"><span /></div>
        <div className="entrance-bottom-hem"><span /></div>
        <div className="entrance-cast-shadow" />
      </div>
    </div>
  )
}

function StageCurtain() {
  return (
    <div className="entrance-stage-curtain" aria-hidden="true">
      <div className="entrance-stage-fabric">
        <div className="entrance-stage-folds">
          {STAGE_FOLDS.map((fold, index) => (
            <span
              className="entrance-stage-fold"
              key={`stage-${index}`}
              style={{
                '--fold-position': fold.position,
                '--fold-width': fold.width,
                '--fold-opacity': fold.opacity,
                '--fold-delay': fold.delay,
              } as CSSProperties}
            />
          ))}
        </div>
        <div className="entrance-stage-weave" />
      </div>
    </div>
  )
}

export function EntranceOverlay() {
  const { t } = useI18n()
  const [present, setPresent] = useState(() => {
    try { return localStorage.getItem(ENTRANCE_KEY) !== '1' } catch { return true }
  })
  const [opening, setOpening] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    const replay = () => { setOpening(false); setPresent(true) }
    window.addEventListener(REPLAY_ENTRANCE_EVENT, replay)
    return () => window.removeEventListener(REPLAY_ENTRANCE_EVENT, replay)
  }, [])

  useEffect(() => {
    if (!present) return
    const previousOverflow = document.body.style.overflow
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-shell, .music-mini-player')).map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }))
    background.forEach(({ element }) => { element.inert = true; element.setAttribute('aria-hidden', 'true') })
    document.body.style.overflow = 'hidden'
    buttonRef.current?.focus()
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key === 'Tab') { event.preventDefault(); buttonRef.current?.focus() }
    }
    window.addEventListener('keydown', keepFocus)
    return () => {
      document.body.style.overflow = previousOverflow
      background.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert
        if (ariaHidden === null) element.removeAttribute('aria-hidden')
        else element.setAttribute('aria-hidden', ariaHidden)
      })
      window.removeEventListener('keydown', keepFocus)
    }
  }, [present])

  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current) }, [])

  if (!present) return null

  const enter = () => {
    if (opening) return
    setOpening(true)
    try { localStorage.setItem(ENTRANCE_KEY, '1') } catch { /* The entrance still works without persistence. */ }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    timerRef.current = window.setTimeout(() => setPresent(false), reduced ? 320 : 4200)
  }

  return (
    <div className={`entrance-overlay ${opening ? 'is-opening' : ''}`} role="dialog" aria-modal="true" aria-labelledby="entrance-title" aria-describedby="entrance-copy">
      <div className="entrance-stage" aria-hidden="true">
        <div className="entrance-stage-wash" />
        <div className="entrance-stage-light" />
        <div className="entrance-dust"><span /><span /><span /><span /><span /><span /></div>
        <figure className="entrance-paper-theatre">
          <div className="entrance-theatre-frame">
            <div className="entrance-theatre-valance"><span /><span /><span /><span /><span /></div>
            <div className="entrance-theatre-opening">
              <div className="entrance-theatre-backdrop"><span /><span /><span /></div>
              <div className="entrance-pig-troupe">
                {STAGE_PIGS.map((pig) => (
                  <div className={`stage-pig stage-pig--${pig.key}`} key={pig.key}>
                    <span className="stage-pig-shadow" />
                    <img className="stage-pig-character" src={pig.src} alt="" width={pig.width} height={pig.height} decoding="async" draggable="false" />
                  </div>
                ))}
              </div>
              <div className="entrance-stage-floor"><span /><span /><span /><span /><span /></div>
              <StageCurtain />
            </div>
          </div>
          <figcaption><span>{t('A Present for Toot')}</span><small>Holly Hobbie</small></figcaption>
        </figure>
      </div>
      <Curtain side="left" />
      <Curtain side="right" />
      <div className="entrance-grain" />
      <div className="entrance-content">
        <div className="entrance-mark"><AudioLines size={27} /><span /></div>
        <span className="entrance-kicker">{t('A PRIVATE PODCAST LEARNING ATELIER')}</span>
        <h1 id="entrance-title">{t('SkopeinSignal')}</h1>
        <p id="entrance-copy">{t('Tune the signal. Read the argument. Keep what rewards a second listen.')}</p>
        <button ref={buttonRef} type="button" className="entrance-enter" onClick={enter} disabled={opening}><span>{opening ? t('Opening the atelier') : t('Enter the atelier')}</span><ArrowRight size={18} /></button>
        <small>{t('Cloud sync available · Local audio stays yours')}</small>
      </div>
    </div>
  )
}
