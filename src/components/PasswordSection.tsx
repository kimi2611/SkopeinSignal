import { useEffect, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { ti, useI18n } from '../lib/i18n'
import { LOGIN_PATH } from '../const'
import { PASSWORD_MIN, passwordStrength, validateNewPassword, type PasswordErrorCode } from '@contracts/password'

const ERROR_KEYS: Record<PasswordErrorCode | 'wrong_current' | 'rate_limited' | 'not_signed_in' | 'no_password', string> = {
  missing_current: ti('Enter your current password first.'),
  too_short: ti('New password must be at least 8 characters.'),
  too_long: ti('New password must be 200 characters or fewer.'),
  same_as_current: ti('New password must differ from the current one.'),
  wrong_current: ti('Current password is incorrect.'),
  no_password: ti('This account has no local password to change.'),
  rate_limited: ti('Too many attempts. Wait a few minutes and try again.'),
  not_signed_in: ti('Your session has ended. Sign in again.'),
}

const STRENGTH_KEYS = [
  ti('Too weak — use 8+ characters.'),
  ti('Fair — add a capital letter or a digit.'),
  ti('Good — add a symbol to reach strong.'),
  ti('Strong.'),
]

/** Change password, live strength hint, and a full sign-out on success:
 * the server rotates the password hash, which invalidates the session version
 * baked into every token minted before the change. */
export function PasswordSection() {
  const { t } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const strength = passwordStrength(next)
  const mismatch = confirm.length > 0 && confirm !== next

  useEffect(() => {
    if (!error) return
    setError('')
  }, [current, next, confirm]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    const checked = validateNewPassword(current, next)
    if (!checked.ok) { setError(t(ERROR_KEYS[checked.code])); return }
    if (next !== confirm) { setError(t('The two new passwords do not match.')); return }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/local/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const code = typeof data?.code === 'string' ? (data.code as keyof typeof ERROR_KEYS) : null
        setError(code && ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : t('Could not update the password. Try again.'))
        return
      }
      toast.success(t('Password updated. Every device was signed out.'))
      window.location.assign(LOGIN_PATH)
    } catch {
      setError(t('Could not update the password. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="password-form" onSubmit={submit} noValidate>
      <div className="password-fields">
        <label>
          <span>{t('Current password')}</span>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          <span>{t('New password')}</span>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="password-strength" />
        </label>
        <label>
          <span>{t('Repeat new password')}</span>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
      </div>

      <div className="password-strength" id="password-strength" data-level={next ? strength : 0}>
        <div className="password-strength-bars" aria-hidden>
          {[0, 1, 2, 3].map((step) => <i key={step} className={next && step < Math.max(1, strength) ? 'on' : ''} />)}
        </div>
        <p>
          {next ? t(STRENGTH_KEYS[strength]) : t('Use {min}+ characters, mixing letters with digits or symbols.', { min: PASSWORD_MIN })}
          {mismatch && <em> · {t('The two new passwords do not match.')}</em>}
        </p>
      </div>

      {error && <p className="password-error" role="alert">{error}</p>}

      <div className="password-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !current || !next || !confirm}>
          <KeyRound size={15} />{busy ? t('Updating…') : t('Update password')}
        </button>
        <small>{t('Stored only as a bcrypt hash. Updating it signs out every device, this one included.')}</small>
      </div>
    </form>
  )
}
