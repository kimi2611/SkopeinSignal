export interface ObsidianNewNote {
  vault?: string
  file: string
  content?: string
  clipboard?: boolean
}

// Obsidian's official URI action: https://help.obsidian.md/Extending+Obsidian/Obsidian+URI
export function buildObsidianNewUri({ vault, file, content, clipboard }: ObsidianNewNote): string {
  const params: [string, string][] = []
  if (vault?.trim()) params.push(['vault', vault.trim()])
  if (file.trim()) params.push(['file', file.trim()])
  if (clipboard) params.push(['clipboard', 'true'])
  else if (content !== undefined) params.push(['content', content])
  const query = params.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  return `obsidian://new?${query}`
}

// A conservative client-side guard, not an Obsidian-documented protocol limit.
export const OBSIDIAN_DIRECT_URI_MAX = 7000

export function launchObsidianUri(uri: string): void {
  if (!uri.startsWith('obsidian://new?')) throw new Error('Unsupported Obsidian URI')
  const anchor = document.createElement('a')
  anchor.href = uri
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
