import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

interface Props {
  /** Changing this resets the boundary — a nav switch is not a broken module. */
  resetKey: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Split out so the failure copy goes through t() and stays in the i18n
 * dictionary.
 *
 * Only one action, and it is a reload on purpose: once a chunk import has
 * rejected, the browser pins that failure in its module map for the lifetime of
 * the document. A "try again" that re-imports the same URL is guaranteed to
 * fail — measured: fetch 200, import still throws.
 */
// eslint-disable-next-line react-refresh/only-export-components -- internal card, not a module export
function RouteErrorCard({ message }: { message: string }) {
  const { t } = useI18n()
  return (
    <div className="route-error" role="alert" data-route-error>
      <h2>{t('This module did not finish loading')}</h2>
      <p>{t('The connection dropped or the file was still on its way. Nothing in your workspace was changed.')}</p>
      <div className="route-error-actions">
        <button type="button" className="btn btn-primary" data-route-reload onClick={() => window.location.reload()}>{t('Reload the page')}</button>
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

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return <RouteErrorCard message={String(error.message || error)} />
  }
}
