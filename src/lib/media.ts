const DB_NAME = 'tingwen.media.v1'
const STORE_NAME = 'audio'

interface StoredAudio {
  episodeId: string
  blob: Blob
  name: string
  updatedAt: string
}

function openMediaDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser does not support local audio storage')); return }
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'episodeId' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open local audio storage'))
    request.onblocked = () => reject(new Error('Local audio storage is blocked by another page'))
  })
}

export async function saveLocalAudio(episodeId: string, file: File): Promise<void> {
  const database = await openMediaDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const record: StoredAudio = { episodeId, blob: file, name: file.name, updatedAt: new Date().toISOString() }
      transaction.objectStore(STORE_NAME).put(record)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Audio could not be saved'))
      transaction.onabort = () => reject(transaction.error ?? new Error('Audio save was aborted'))
    })
  } finally {
    database.close()
  }
}

export async function loadLocalAudio(episodeId: string): Promise<Blob | null> {
  const database = await openMediaDatabase()
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).get(episodeId)
      request.onsuccess = () => resolve((request.result as StoredAudio | undefined)?.blob ?? null)
      request.onerror = () => reject(request.error ?? new Error('Audio could not be read'))
    })
  } finally {
    database.close()
  }
}

export async function deleteLocalAudio(episodeId: string): Promise<void> {
  const database = await openMediaDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(episodeId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Audio could not be deleted'))
    })
  } finally {
    database.close()
  }
}

export async function clearLocalAudio(): Promise<void> {
  const database = await openMediaDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).clear()
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error('Audio storage could not be cleared'))
    })
  } finally {
    database.close()
  }
}
