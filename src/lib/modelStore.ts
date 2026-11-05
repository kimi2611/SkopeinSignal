/**
 * Model weights, fetched by us instead of by transformers.js.
 *
 * Why this exists: the library's own download path gives a progress number we
 * cannot trust (per-loader aggregates, several of which reach 100% on their
 * own), no way to resume, and no way to say which file died. On a tablet behind
 * a VPN, pulling 43 MB through the public funnel, that produced three days of
 * "it stopped at 2 KB" reports that were each a different lie.
 *
 * So: we stream each shard ourselves, keep the finished ones in the Cache API,
 * keep partial ones in IndexedDB, and hand the result to the pipeline through a
 * custom cache. The pipeline then does no network I/O at all — every `match`
 * hits a Blob we already hold.
 *
 * Resumability is the point, not a bonus. A 43 MB body at 80 KB/s is nine
 * minutes; on a link that drops every few minutes, a downloader without resume
 * can never finish, no matter how good the progress bar is.
 */

export interface ModelFileEntry {
  path: string
  size: number
}

export interface ModelManifest {
  model: string
  files: ModelFileEntry[]
  totalBytes: number
}

export interface DownloadProgress {
  loaded: number
  total: number
  filesDone: number
  filesTotal: number
  /** Bytes per second over the last sampling window, 0 until it can be measured. */
  bytesPerSecond: number
  currentFile: string
}

const STORE_CACHE = 'skopein-asr-files'
const PART_DB = 'skopein-asr-parts'
const PART_STORE = 'chunks'
/** Flush partial bytes to IndexedDB at this granularity — bigger means more lost on a drop. */
const FLUSH_BYTES = 2 * 1024 * 1024
/**
 * Bytes per request. One big stream for a 30 MB shard is the thing that fails:
 * measured on a throttled 125 KB/s link, the body stopped mid-file and the
 * reader never rejected — it just never produced another chunk, forever. Short
 * ranged requests turn that silent death into a normal retry, and every chunk is
 * already on disk when the connection dies.
 */
const CHUNK_BYTES = 2 * 1024 * 1024
/** No byte for this long → assume the stream is dead and resume from the offset. */
const READ_STALL_MS = 45_000
/** Retries per file before giving up; the offset survives all of them. */
const MAX_ATTEMPTS = 8
const RETRY_BASE_MS = 1200

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function cacheKeyFor(modelId: string, path: string): string {
  return `/asr-store/${modelId}/${path}`
}

async function openStore(): Promise<Cache | null> {
  try {
    if (typeof caches === 'undefined') return null
    return await caches.open(STORE_CACHE)
  } catch {
    return null
  }
}

function openPartsDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const request = indexedDB.open(PART_DB, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(PART_STORE)) db.createObjectStore(PART_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

interface PartChunk {
  offset: number
  blob: Blob
}

async function listParts(db: IDBDatabase, key: string): Promise<PartChunk[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PART_STORE, 'readonly')
      const index = tx.objectStore(PART_STORE)
      const prefix = `${key}#`
      const chunks: PartChunk[] = []
      const cursor = index.openCursor()
      cursor.onsuccess = () => {
        const cur = cursor.result
        if (!cur) return resolve(chunks.sort((a, b) => a.offset - b.offset))
        if (typeof cur.key === 'string' && cur.key.startsWith(prefix)) {
          chunks.push(cur.value as PartChunk)
        }
        cur.continue()
      }
      cursor.onerror = () => resolve(chunks)
    } catch {
      resolve([])
    }
  })
}

async function putPart(db: IDBDatabase, key: string, chunk: PartChunk): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PART_STORE, 'readwrite')
      tx.objectStore(PART_STORE).put(chunk, `${key}#${chunk.offset}`)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

async function clearParts(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(PART_STORE, 'readwrite')
      const store = tx.objectStore(PART_STORE)
      const prefix = `${key}#`
      const cursor = store.openCursor()
      cursor.onsuccess = () => {
        const cur = cursor.result
        if (!cur) return
        if (typeof cur.key === 'string' && cur.key.startsWith(prefix)) cur.delete()
        cur.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

export async function loadManifest(modelId: string): Promise<ModelManifest> {
  const res = await fetch(`/models/${modelId}/resolve/main/manifest.json`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`model-manifest-missing:${res.status}`)
  const manifest = (await res.json()) as ModelManifest
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('model-manifest-empty')
  }
  return manifest
}

/**
 * Cached blobs, keyed by path. transformers.js asks by full URL; we only care
 * about the part after /resolve/main/, which is stable across mirrors — that is
 * also what makes a file downloaded from the origin usable when the pipeline is
 * pointed at another host.
 */
export class ModelFileCache {
  private readonly files: Map<string, Blob>
  private readonly modelId: string

  constructor(modelId: string, files: Map<string, Blob>) {
    this.modelId = modelId
    this.files = files
  }

  /**
   * The pipeline asks for the same shard under more than one URL shape —
   * `/models/<model>/config.json` for metadata and
   * `/models/<model>/resolve/main/config.json` for weights. Anything that is not
   * reduced to one key is a cache miss, and a cache miss here means the browser
   * silently downloads the whole shard again, which is the exact failure this
   * module exists to prevent.
   */
  private pathOf(request: string): string {
    const url = String(request)
    const marker = `/${this.modelId}/`
    const at = url.indexOf(marker)
    let rest = at >= 0 ? url.slice(at + marker.length) : url
    rest = rest.replace(/^resolve\/[^/]+\//, '')
    const query = rest.indexOf('?')
    return query >= 0 ? rest.slice(0, query) : rest
  }

  match = async (request: string): Promise<Response | undefined> => {
    const path = this.pathOf(String(request))
    const blob = this.files.get(path)
    // A miss here costs a full re-download of that shard, so it is worth saying
    // out loud rather than debugging it from the outside again.
    if (!blob) {
      console.warn('[asr-store] cache miss:', path)
      return undefined
    }
    return new Response(blob, {
      status: 200,
      headers: { 'content-length': String(blob.size), 'content-type': 'application/octet-stream' },
    })
  }

  put = async (request: string, response: Response): Promise<void> => {
    // Only reached for files the manifest did not list. Record them so a second
    // run does not fetch them again.
    const path = this.pathOf(String(request))
    const blob = await response.clone().blob()
    this.files.set(path, blob)
    const cache = await openStore()
    if (!cache) return
    // Silently swallowing this is how "7/7 files" and "0 files ready" can both
    // be true at once: the download worked, the write did not.
    try {
      await cache.put(cacheKeyFor(this.modelId, path), new Response(blob))
    } catch (err) {
      console.warn('[asr-store] cache write failed:', path, err)
    }
  }
}

interface FetchFileArgs {
  url: string
  size: number
  key: string
  db: IDBDatabase | null
  onBytes: (absoluteBytes: number) => void
  isAborted: () => boolean
}

/** Download one file, resuming from whatever IndexedDB still holds. */
async function fetchFile({ url, size, key, db, onBytes, isAborted }: FetchFileArgs): Promise<Blob> {
  let offset = 0
  const chunks: Blob[] = []
  if (db) {
    const parts = await listParts(db, key)
    let expected = 0
    for (const part of parts) {
      // Only trust a contiguous run from zero; anything else is debris.
      if (part.offset !== expected) break
      chunks.push(part.blob)
      expected += part.blob.size
    }
    offset = expected
  }
  let attempt = 0
  while (offset < size) {
    if (isAborted()) throw new Error('model-download-cancelled')
    const end = Math.min(size, offset + CHUNK_BYTES) - 1
    try {
      const res = await fetch(url, { headers: { Range: `bytes=${offset}-${end}` } })
      if (res.status !== 206 && res.status !== 200) throw new Error(`http-${res.status}`)
      if (!res.body) throw new Error('no-body')
      const reader = res.body.getReader()
      let pending: Uint8Array[] = []
      let pendingBytes = 0
      let lastByteAt = Date.now()
      for (;;) {
        const read = await Promise.race([
          reader.read(),
          sleep(READ_STALL_MS).then(() => 'stalled' as const),
        ])
        if (read === 'stalled') {
          await reader.cancel().catch(() => undefined)
          throw new Error('stream-stalled')
        }
        const { done, value } = read
        if (done) break
        if (!value) continue
        lastByteAt = Date.now()
        pending.push(value)
        pendingBytes += value.byteLength
        offset += value.byteLength
        onBytes(offset)
        if (db && pendingBytes >= FLUSH_BYTES) {
          const start = offset - pendingBytes
          await putPart(db, key, { offset: start, blob: new Blob(pending as BlobPart[]) })
          chunks.push(new Blob(pending as BlobPart[]))
          pending = []
          pendingBytes = 0
        }
        if (isAborted()) {
          await reader.cancel().catch(() => undefined)
          throw new Error('model-download-cancelled')
        }
      }
      if (pendingBytes > 0) {
        chunks.push(new Blob(pending as BlobPart[]))
        if (db) await putPart(db, key, { offset: offset - pendingBytes, blob: new Blob(pending as BlobPart[]) })
        pending = []
        pendingBytes = 0
      }
      if (Date.now() - lastByteAt > READ_STALL_MS) throw new Error('stream-stalled')
      attempt = 0
    } catch (error) {
      if (isAborted()) throw error
      attempt += 1
      if (attempt >= MAX_ATTEMPTS) throw error
      // Back off, then resume from the offset we reached — the whole point.
      await sleep((RETRY_BASE_MS * Math.min(8, 2 ** attempt)) / 2)
      // Our in-memory chunks must match what the retry will start from.
      if (db) {
        const parts = await listParts(db, key)
        let expected = 0
        for (const part of parts) {
          if (part.offset !== expected) break
          expected += part.blob.size
        }
        if (expected !== offset) {
          chunks.length = 0
          for (const part of parts) {
            if (part.offset + part.blob.size > expected) break
            chunks.push(part.blob)
          }
          offset = expected
        }
      }
    }
  }
  const blob = new Blob(chunks)
  if (blob.size !== size) {
    // Let the caller decide: a wrong size is retried from scratch next run.
    throw new Error(`size-mismatch:${blob.size}/${size}`)
  }
  if (db) await clearParts(db, key)
  return blob
}

/**
 * Ensure every file in the manifest is in the browser's Cache API.
 * Progress here is our own accounting — bytes that actually arrived.
 */
export async function ensureModelFiles(
  modelId: string,
  onProgress: (p: DownloadProgress) => void,
  isAborted: () => boolean = () => false,
): Promise<ModelFileCache> {
  const manifest = await loadManifest(modelId)
  const cache = await openStore()
  const db = await openPartsDb()
  const total = manifest.totalBytes
  const blobs = new Map<string, Blob>()
  let completedBytes = 0
  let filesDone = 0
  let sampleAt = performance.now()
  let sampleBytes = 0
  let speed = 0

  for (const entry of manifest.files) {
    const key = cacheKeyFor(modelId, entry.path)
    let blob: Blob | null = null
    if (cache) {
      const hit = await cache.match(key).catch(() => undefined)
      if (hit) {
        const candidate = await hit.blob()
        if (candidate.size === entry.size) blob = candidate
        else await cache.delete(key).catch(() => undefined)
      }
    }
    if (!blob) {
      const url = `/models/${modelId}/resolve/main/${entry.path}`
      const onBytes = (absolute: number) => {
        const loaded = completedBytes + absolute
        const now = performance.now()
        const elapsed = now - sampleAt
        if (elapsed > 900) {
          speed = ((loaded - sampleBytes) / elapsed) * 1000
          sampleAt = now
          sampleBytes = loaded
        }
        onProgress({
          loaded,
          total,
          filesDone,
          filesTotal: manifest.files.length,
          bytesPerSecond: speed,
          currentFile: entry.path,
        })
      }
      blob = await fetchFile({ url, size: entry.size, key, db, onBytes, isAborted })
      await cache?.put(key, new Response(blob)).catch(() => undefined)
    }
    blobs.set(entry.path, blob)
    completedBytes += blob.size
    filesDone += 1
    onProgress({
      loaded: completedBytes,
      total,
      filesDone,
      filesTotal: manifest.files.length,
      bytesPerSecond: speed,
      currentFile: entry.path,
    })
  }
  return new ModelFileCache(modelId, blobs)
}

/** Everything the store holds, for the "clear cached model" button. */
export async function clearModelCache(): Promise<void> {
  try {
    if (typeof caches !== 'undefined' && caches.delete) await caches.delete(STORE_CACHE)
  } catch { /* best effort */ }
  try {
    if (typeof indexedDB !== 'undefined') indexedDB.deleteDatabase(PART_DB)
  } catch { /* best effort */ }
}

/** What is already on disk, for the bench page to show before a run. */
export async function modelCacheStatus(modelId: string): Promise<{ files: number; bytes: number }> {
  const cache = await openStore()
  if (!cache) return { files: 0, bytes: 0 }
  const manifest = await loadManifest(modelId)
  let files = 0
  let bytes = 0
  for (const entry of manifest.files) {
    const hit = await cache.match(cacheKeyFor(modelId, entry.path)).catch(() => undefined)
    if (hit) {
      files += 1
      bytes += entry.size
    }
  }
  return { files, bytes }
}
