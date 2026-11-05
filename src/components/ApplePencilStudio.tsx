import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Download, FileUp, Hand, Lightbulb, Loader2, PencilLine, Plus, ScanText, Share2, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '../providers/trpc'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { uid } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { transcriptToText } from '../lib/transcript'
import type { PencilDrawing, PencilPoint, PencilStroke, SparkReply } from '../types'

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 800
const INK_COLORS = ['#263c35', '#9c2f45', '#315f82', '#b0782d']

function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>): PencilPoint {
  const rect = event.currentTarget.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    pressure: event.pointerType === 'pen' && event.pressure > 0 ? event.pressure : 0.5,
  }
}

function prepareCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d')
  if (!context) return null
  context.fillStyle = '#fffdf7'
  context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
  context.strokeStyle = 'rgba(68, 105, 114, .12)'
  context.lineWidth = 1
  for (let y = 64; y < CANVAS_HEIGHT; y += 64) {
    context.beginPath()
    context.moveTo(0, y + 0.5)
    context.lineTo(CANVAS_WIDTH, y + 0.5)
    context.stroke()
  }
  context.strokeStyle = 'rgba(156, 47, 69, .16)'
  context.beginPath()
  context.moveTo(88.5, 0)
  context.lineTo(88.5, CANVAS_HEIGHT)
  context.stroke()
  return context
}

function drawSegment(context: CanvasRenderingContext2D, stroke: PencilStroke, from: PencilPoint, to: PencilPoint) {
  context.strokeStyle = stroke.color
  context.lineWidth = Math.max(1, stroke.width * (0.65 + ((from.pressure + to.pressure) / 2) * 0.7))
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.beginPath()
  context.moveTo(from.x * CANVAS_WIDTH, from.y * CANVAS_HEIGHT)
  context.lineTo(to.x * CANVAS_WIDTH, to.y * CANVAS_HEIGHT)
  context.stroke()
}

function drawStroke(context: CanvasRenderingContext2D, stroke: PencilStroke) {
  if (!stroke.points.length) return
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    context.fillStyle = stroke.color
    context.beginPath()
    context.arc(point.x * CANVAS_WIDTH, point.y * CANVAS_HEIGHT, Math.max(1, stroke.width * 0.55), 0, Math.PI * 2)
    context.fill()
    return
  }
  for (let index = 1; index < stroke.points.length; index += 1) drawSegment(context, stroke, stroke.points[index - 1], stroke.points[index])
}

function renderDrawing(canvas: HTMLCanvasElement, strokes: PencilStroke[]) {
  const context = prepareCanvas(canvas)
  if (!context) return
  strokes.forEach((stroke) => drawStroke(context, stroke))
}

function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'SkopeinSignal pencil note'
}

export function ApplePencilStudio({ variant = 'notes' }: { variant?: 'notes' | 'sparks' }) {
  const { state, savePencilDrawing, removePencilDrawing, saveSpark } = useWorkspace()
  const { t, locale } = useI18n()
  const { isAuthenticated } = useAuth()
  const [selectedId, setSelectedId] = useState(state.pencilDrawings[0]?.id ?? '')
  const [color, setColor] = useState(INK_COLORS[0])
  const [width, setWidth] = useState(4)
  const [sharing, setSharing] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [feedback, setFeedback] = useState<SparkReply | null>(null)
  const [aiError, setAiError] = useState('')
  const recognizeMutation = trpc.sparks.recognize.useMutation()
  const respondMutation = trpc.sparks.respond.useMutation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const activeStrokeRef = useRef<PencilStroke | null>(null)
  const selected = useMemo(() => state.pencilDrawings.find((drawing) => drawing.id === selectedId) ?? state.pencilDrawings[0], [selectedId, state.pencilDrawings])

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id)
    if (!selected && selectedId) setSelectedId('')
  }, [selected, selectedId])

  useEffect(() => {
    activeStrokeRef.current = null
    if (canvasRef.current) renderDrawing(canvasRef.current, selected?.strokes ?? [])
  }, [selected])

  useEffect(() => {
    setRecognizedText(selected?.recognizedText ?? '')
    setFeedback(null)
    setAiError('')
    // OCR results belong to one paper, not to every stroke render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const createDrawing = () => {
    const now = new Date().toISOString()
    const drawing: PencilDrawing = {
      id: uid('pencil'),
      title: t('Pencil note {date}', { date: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(new Date()) }),
      episodeId: null,
      strokes: [],
      createdAt: now,
      updatedAt: now,
    }
    savePencilDrawing(drawing)
    setSelectedId(drawing.id)
  }

  const updateSelected = (patch: Partial<PencilDrawing>) => {
    if (!selected) return
    savePencilDrawing({ ...selected, ...patch, updatedAt: new Date().toISOString() })
  }

  const updateInk = (strokes: PencilStroke[]) => {
    updateSelected({ strokes, recognizedText: undefined, recognitionConfidence: undefined })
    setRecognizedText('')
    setFeedback(null)
    setAiError('')
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!selected || activeStrokeRef.current || event.button !== 0) return
    if (event.pointerType === 'touch') return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: PencilStroke = { id: uid('stroke'), color, width, points: [pointFromEvent(event)] }
    activeStrokeRef.current = stroke
    const context = canvasRef.current?.getContext('2d')
    if (context) drawStroke(context, stroke)
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current
    if (!stroke || event.pointerType === 'touch') return
    event.preventDefault()
    const coalesced = typeof event.nativeEvent.getCoalescedEvents === 'function' ? event.nativeEvent.getCoalescedEvents() : []
    const events = coalesced.length ? coalesced : [event.nativeEvent]
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    events.forEach((nativeEvent) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const next: PencilPoint = {
        x: Math.min(1, Math.max(0, (nativeEvent.clientX - rect.left) / rect.width)),
        y: Math.min(1, Math.max(0, (nativeEvent.clientY - rect.top) / rect.height)),
        pressure: nativeEvent.pointerType === 'pen' && nativeEvent.pressure > 0 ? nativeEvent.pressure : 0.5,
      }
      const previous = stroke.points[stroke.points.length - 1]
      if (Math.hypot(next.x - previous.x, next.y - previous.y) < 0.0012) return
      drawSegment(context, stroke, previous, next)
      stroke.points.push(next)
    })
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current
    if (!stroke) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    activeStrokeRef.current = null
    if (!selected) return
    updateInk([...selected.strokes, stroke])
  }

  const exportBlob = async (): Promise<Blob> => {
    const exportCanvas = document.createElement('canvas')
    exportCanvas.width = CANVAS_WIDTH
    exportCanvas.height = CANVAS_HEIGHT
    renderDrawing(exportCanvas, selected?.strokes ?? [])
    const context = exportCanvas.getContext('2d')
    if (context && selected) {
      context.fillStyle = '#6f7771'
      context.font = '24px ui-monospace, monospace'
      context.fillText(selected.title.slice(0, 80), 32, 38)
    }
    return new Promise((resolve, reject) => exportCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'))
  }

  const downloadPng = async () => {
    if (!selected) return
    try {
      const blob = await exportBlob()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${safeFilename(selected.title)}.png`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success(t('PNG downloaded. In Files, choose Share → Open in Goodnotes, then confirm Import.'))
    } catch {
      toast.error(t('The PNG could not be created. Your editable strokes are still saved in the workspace.'))
    }
  }

  const shareToGoodNotes = async () => {
    if (!selected || sharing) return
    setSharing(true)
    try {
      let blob: Blob
      try {
        blob = await exportBlob()
      } catch {
        toast.error(t('The PNG could not be created. Your editable strokes are still saved in the workspace.'))
        return
      }
      const file = new File([blob], `${safeFilename(selected.title)}.png`, { type: 'image/png' })
      if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: selected.title, text: t('Choose Open in Goodnotes, then New Document or Current Document and confirm Import.') })
        toast.message(t('File handoff finished in the system share sheet. Confirm Import in Goodnotes; this website receives no import receipt.'))
      } else {
        await downloadPng()
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') toast.message(t('Share cancelled. No file was sent.'))
      else toast.error(t('The system file share could not open. Download the PNG and use Files → Share → Open in Goodnotes instead.'))
    } finally {
      setSharing(false)
    }
  }

  const showAiError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    const code = message.match(/AI_[A-Z_]+|UNAUTHORIZED/)?.[0] ?? 'AI_UNKNOWN'
    const copy: Record<string, string> = {
      AI_QUOTA_EXHAUSTED: t('The site owner’s AI quota is exhausted. Your drawing remains saved.'),
      AI_VISION_UNAVAILABLE: t('No handwriting-capable vision model is available on this site yet. Your drawing remains saved.'),
      AI_CONTENT_REJECTED: t('The image could not be processed. Try a clearer note with fewer decorative marks.'),
      AI_TRANSIENT: t('The AI service is busy. Nothing was retried automatically; your drawing remains saved.'),
      AI_EMPTY_RESULT: t('No legible handwriting was returned. Add contrast or write more clearly, then try again.'),
      AI_INVALID_REQUEST: t('The AI request could not be prepared. Your drawing remains saved; please try a smaller page.'),
      UNAUTHORIZED: t('Sign in with your Kimi account to use handwriting recognition.'),
      AI_MISCONFIGURED: t('AI is not configured for this site yet. Publish (or reopen) the site once, then retry.'),
      AI_UNKNOWN: t('The AI request failed. Nothing was retried automatically; your drawing remains saved.'),
    }
    setAiError(copy[code] ?? copy.AI_UNKNOWN)
  }

  const recognize = async () => {
    if (!selected || !selected.strokes.length || !isAuthenticated || recognizeMutation.isPending) return
    setAiError('')
    setFeedback(null)
    try {
      const blob = await exportBlob()
      const imageData = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image encoding failed'))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(blob)
      })
      const linkedEpisode = state.episodes.find((episode) => episode.id === selected.episodeId)
      const linkedShow = state.shows.find((show) => show.id === linkedEpisode?.showId)
      const language = linkedShow?.language ?? (locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English')
      const result = await recognizeMutation.mutateAsync({ language, imageData })
      setRecognizedText(result.transcript)
      updateSelected({ recognizedText: result.transcript, recognitionConfidence: result.confidence })
      toast.success(t('Handwriting recognised. Check the editable text before using it.'))
    } catch (error) {
      showAiError(error)
    }
  }

  const evaluate = async () => {
    const spark = recognizedText.trim()
    if (!selected || spark.length < 4 || respondMutation.isPending || !isAuthenticated) return
    setAiError('')
    try {
      const linkedEpisode = state.episodes.find((episode) => episode.id === selected.episodeId)
      const linkedShow = state.shows.find((show) => show.id === linkedEpisode?.showId)
      const session = state.studySessions.find((item) => item.episodeId === linkedEpisode?.id)
      const excerpt = session?.segments.length ? transcriptToText(session.segments).slice(0, 6000) : undefined
      const reply = await respondMutation.mutateAsync({
        language: linkedShow?.language ?? (locale === 'zh-CN' ? 'Chinese' : locale === 'de' ? 'Deutsch' : 'English'),
        spark,
        episodeTitle: linkedEpisode?.title,
        excerpt: excerpt && excerpt.length >= 200 ? excerpt : undefined,
      })
      updateSelected({ recognizedText: spark })
      saveSpark({ id: uid('spark'), episodeId: linkedEpisode?.id ?? null, text: spark, reply, createdAt: new Date().toISOString() })
      setFeedback(reply)
      toast.success(t('Recognised idea evaluated and saved to your sparks.'))
    } catch (error) {
      showAiError(error)
    }
  }

  return (
    <section className="pencil-studio" aria-labelledby="pencil-studio-title">
      <div className="pencil-studio-heading">
        <div><span className="section-index">{variant === 'sparks' ? t('APPLE PENCIL / IDEA SKETCHBOOK') : t('APPLE PENCIL / VECTOR NOTEBOOK')}</span><h2 id="pencil-studio-title">{variant === 'sparks' ? t('Sketch the idea before you explain it.') : t('Draw, annotate, and keep every stroke.')}</h2><p>{variant === 'sparks' ? t('Write or diagram with Apple Pencil, send the page to Goodnotes, then recognise the handwriting into editable text for AI feedback. You confirm the text before evaluation.') : t('Apple Pencil pressure shapes the line. Touch input is ignored on the canvas for palm rejection; a mouse remains available for desktop editing.')}</p></div>
        <button type="button" className="btn btn-primary" onClick={createDrawing}><Plus size={16} />{t('New pencil note')}</button>
      </div>

      {!selected ? <div className="empty-state pencil-empty"><PencilLine size={30} /><h3>{t('Your pencil paper is ready')}</h3><p>{t('Create a pencil note to draw with Apple Pencil. Strokes are saved as editable vectors in your workspace and included in cloud sync and JSON backup.')}</p><button type="button" className="btn btn-primary" onClick={createDrawing}><Plus size={16} />{t('Create pencil note')}</button></div> : <>
        <div className="pencil-document-bar">
          <label><span className="field-label">{t('Pencil note')}</span><select className="field" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>{state.pencilDrawings.map((drawing) => <option key={drawing.id} value={drawing.id}>{drawing.title}</option>)}</select></label>
          <label className="pencil-title-field"><span className="field-label">{t('Title')}</span><input className="field" value={selected.title} maxLength={160} onChange={(event) => updateSelected({ title: event.target.value })} /></label>
          <label><span className="field-label">{t('Linked episode (optional)')}</span><select className="field" value={selected.episodeId ?? ''} onChange={(event) => updateSelected({ episodeId: event.target.value || null })}><option value="">{t('No linked episode')}</option>{state.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.title}</option>)}</select></label>
        </div>

        <div className="pencil-toolbar" aria-label={t('Pencil tools')}>
          <div className="pencil-inks" role="group" aria-label={t('Ink color')}>{INK_COLORS.map((ink) => <button key={ink} type="button" className={color === ink ? 'active' : ''} style={{ '--ink': ink } as CSSProperties} onClick={() => setColor(ink)} aria-label={t('Use ink {color}', { color: ink })} aria-pressed={color === ink} />)}</div>
          <label className="pencil-width"><span>{t('Nib')}</span><input type="range" min="2" max="12" step="1" value={width} onChange={(event) => setWidth(Number(event.target.value))} /><output>{width}</output></label>
          <span className="pencil-palm"><Hand size={15} />{t('Palm rejection on')}</span>
          <div className="pencil-history"><button type="button" className="btn btn-secondary btn-small" disabled={!selected.strokes.length} onClick={() => updateInk(selected.strokes.slice(0, -1))}><Undo2 size={15} />{t('Undo stroke')}</button><button type="button" className="btn btn-ghost btn-small" disabled={!selected.strokes.length} onClick={() => { if (window.confirm(t('Clear every stroke on this page?'))) updateInk([]) }}>{t('Clear page')}</button></div>
        </div>

        <div className="pencil-paper-wrap">
          <canvas
            ref={canvasRef}
            className="pencil-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            role="img"
            aria-label={t('Apple Pencil drawing canvas. Use a pen or mouse; touch is ignored.')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onContextMenu={(event) => event.preventDefault()}
          />
          <span className="pencil-saved-meta">{t('{count} strokes · editable vector ink', { count: selected.strokes.length })}</span>
        </div>

        <div className="goodnotes-handoff">
          <div className="goodnotes-handoff-copy"><FileUp size={23} /><div><span className="section-index">{t('GOODNOTES / SYSTEM FILE HANDOFF')}</span><h3>{t('Send this page as a PNG')}</h3><p>{t('Tap Share PNG to GoodNotes. In the iPad share sheet, choose Open in Goodnotes → New Document or Current Document → Import. Goodnotes alone confirms the import; SkopeinSignal receives no receipt.')}</p><a href="https://support.goodnotes.com/hc/en-us/articles/7353717816463-Import-files-into-Goodnotes" target="_blank" rel="noreferrer">{t('Read Goodnotes’ official import instructions')}</a></div></div>
          <div className="goodnotes-actions"><button type="button" className="btn btn-primary" disabled={sharing} onClick={() => void shareToGoodNotes()}><Share2 size={16} />{sharing ? t('Preparing PNG') : t('Share PNG to GoodNotes')}</button><button type="button" className="btn btn-secondary" onClick={() => void downloadPng()}><Download size={16} />{t('Download PNG')}</button></div>
        </div>

        <section className="pencil-recognition" aria-labelledby="pencil-recognition-title">
          <div className="pencil-recognition-heading"><ScanText size={22} /><div><span className="section-index">{t('AI HANDWRITING / EDITABLE TRANSCRIPT')}</span><h3 id="pencil-recognition-title">{t('Recognise first. You stay the editor.')}</h3><p>{t('A PNG of this page is sent to an image-capable site model. The model transcribes visible ink only; it does not complete or correct your idea. Editing the page clears an old transcript so text and ink cannot drift apart.')}</p></div></div>
          {aiError && <div className="ai-degraded pencil-ai-error" role="alert"><p>{aiError}</p></div>}
          <div className="pencil-recognition-actions"><button type="button" className="btn btn-secondary" disabled={!selected.strokes.length || !isAuthenticated || recognizeMutation.isPending || respondMutation.isPending} onClick={() => void recognize()}>{recognizeMutation.isPending ? <><Loader2 size={16} className="spin" />{t('Recognising handwriting…')}</> : <><ScanText size={16} />{t('Recognise this page')}</>}</button>{selected.recognitionConfidence && <span>{selected.recognitionConfidence === 'high' ? t('High recognition confidence') : selected.recognitionConfidence === 'medium' ? t('Medium recognition confidence') : t('Low recognition confidence — check every word')}</span>}{!isAuthenticated && <small>{t('Sign in with Kimi to use handwriting recognition and AI feedback.')}</small>}</div>
          {(recognizedText || selected.recognizedText) && <label className="form-stack pencil-transcript-field"><span className="field-label">{t('Editable recognised text')}</span><textarea className="field textarea" rows={7} maxLength={12000} value={recognizedText} onChange={(event) => setRecognizedText(event.target.value)} onBlur={() => updateSelected({ recognizedText })} placeholder={t('Correct any recognition errors here before asking for feedback…')} /><small className="form-hint">{t('The saved drawing and this transcript sync with your workspace. AI feedback uses only the text you confirm here.')}</small></label>}
          {variant === 'sparks' && (recognizedText || selected.recognizedText) && <div className="pencil-evaluation"><button type="button" className="btn btn-primary" disabled={recognizedText.trim().length < 4 || !isAuthenticated || respondMutation.isPending || recognizeMutation.isPending} onClick={() => void evaluate()}>{respondMutation.isPending ? <><Loader2 size={16} className="spin" />{t('Evaluating your idea…')}</> : <><Lightbulb size={16} />{t('Evaluate confirmed idea')}</>}</button>{feedback && <div className="spark-reply"><p className="spark-evaluation">{feedback.evaluation}</p><div className="spark-block"><em>{t('What works')}</em><ul>{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div className="spark-block"><em>{t('Suggestions')}</em><ul>{feedback.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></div><p className="spark-followup"><em>{t('Go deeper')}</em>{feedback.followUp}</p></div>}</div>}
        </section>

        <div className="pencil-document-footer"><p>{t('No Goodnotes account, private email address, or credential is requested. If file sharing is unavailable, the PNG downloads instead; open it from Files through the same Share → Open in Goodnotes path.')}</p><button type="button" className="text-link danger-text" onClick={() => { if (window.confirm(t('Delete this pencil note and all of its strokes?'))) { removePencilDrawing(selected.id); toast.success(t('Pencil note deleted.')) } }}><Trash2 size={14} />{t('Delete pencil note')}</button></div>
      </>}
    </section>
  )
}
