import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

interface Props {
  /** Changing this resets the boundary — a nav switch is not a broken module. */
  resetKey: string
  /**
   * In-place retry. Returns false when the module cannot be re-imported in this
   * document, in which case the card reloads instead of lying about it.
   */
  onRetry?: () => boolean
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Split out so the failure copy goes through t() and stays in the i18n
 * dictionary.
 *
 * "Try again" is honest rather than decorative: a timed-out load is re-awaited
 * on the same promise, and a rejected one is re-imported under a cache-busting
 * query because the module map is keyed by URL (`?route-retry=N` is a new key,
 * a bare re-import re-throws the cached failure). Reload stays visible as the
 * fallback for the case where neither applies.
 */
// eslint-disable-next-line react-refresh/only-export-components -- internal card, not a module export
function RouteErrorCard({ message, onRetry, onReload }: { message: string; onRetry: () => void; onReload: () => void }) {
  const { t } = useI18n()
  return (
    <div className="route-error" role="alert" data-route-error>
      <h2>{t('This module did not finish loading')}</h2>
      <p>{t('The connection dropped or the file was still on its way. Nothing in your workspace was changed.')}</p>
      <div className="route-error-actions">
        <button type="button" className="btn btn-primary" data-route-retry onClick={onRetry}>{t('Try again')}</button>
        <button type="button" className="btn btn-ghost" data-route-reload onClick={onReload}>{t('Reload the page')}</button>
      </div>
      <small>{message}</small>
    </div>
  )
}

/**
 * Catches a route that failed to load (chunk rejected, or the deadline in
 * loadWithRetry expired) and renders something actionable instead of an
 * endlessly spinning placeholder. A rejected lazy chunk with no boundary takes
 * the whole workspace down; with one, only the module area is affected and the
 * sidebar keeps working.
 */
export class RouteBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[route] module failed to load', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  private attemptRetry = () => {
    const accepted = this.props.onRetry?.() ?? false
    if (accepted) this.setState({ error: null })
    else window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <RouteErrorCard
        message={String(error.message || error)}
        onRetry={this.attemptRetry}
        onReload={() => window.location.reload()}
      />
    )
  }
}
