// Refresh the local cached copy of a bundled media asset (recording MP3 or
// artwork WebP). The file itself only changes when the site is republished;
// this evicts any stale cached copy and fetches the current one fresh from
// the network, so a repaired or re-optimized asset reaches the listener
// without clearing the whole site cache. Content and sources never change.

export interface RefreshAssetResult {
  ok: boolean
  bytes: number
}

export async function refreshLocalAssetCopy(src: string): Promise<RefreshAssetResult> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map(async (key) => {
        const cache = await caches.open(key)
        await cache.delete(src)
      }))
    }
    const response = await fetch(src, { cache: 'reload' })
    if (!response.ok) return { ok: false, bytes: 0 }
    const buffer = await response.arrayBuffer()
    return { ok: true, bytes: buffer.byteLength }
  } catch {
    return { ok: false, bytes: 0 }
  }
}

