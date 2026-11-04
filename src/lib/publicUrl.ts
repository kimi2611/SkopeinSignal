export type PublicUrlIssue = 'invalid' | 'credentials' | 'private-parameters'

const SENSITIVE_QUERY_PARTS = [
  'token',
  'secret',
  'password',
  'passwd',
  'credential',
  'signature',
  'jwt',
  'authorization',
  'apikey',
  'accesskey',
  'sessionid',
  'subscription',
]

export function publicHttpUrlIssue(value: string): PublicUrlIssue | null {
  const trimmed = value.trim()
  if (!trimmed) return 'invalid'
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'invalid'
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return 'invalid'
  if (url.username || url.password) return 'credentials'
  for (const [name] of url.searchParams) {
    const normalized = name.toLocaleLowerCase().replace(/[^a-z0-9]/g, '')
    if (!normalized) continue
    if (normalized === 'auth' || normalized === 'key' || normalized === 'sig' || normalized === 'session') return 'private-parameters'
    if (normalized.startsWith('auth') || normalized.endsWith('auth')) return 'private-parameters'
    if (SENSITIVE_QUERY_PARTS.some((part) => normalized.includes(part))) return 'private-parameters'
  }
  return null
}

export function publicHttpUrlError(value: string, allowEmpty = false): string {
  if (allowEmpty && !value.trim()) return ''
  const issue = publicHttpUrlIssue(value)
  if (!issue) return ''
  if (issue === 'invalid') return 'Enter a complete public http:// or https:// URL.'
  return 'Use a public URL without embedded credentials, tokens, or private subscription parameters.'
}
