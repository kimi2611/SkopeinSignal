import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from './useAuth'
import { trpc } from '../providers/trpc'
import type { WorkspaceState } from '../types'
import type { WorkspacePayload } from '@contracts/workspace'

export type CloudSyncStatus = 'disabled' | 'loading' | 'migration' | 'saving' | 'synced' | 'error' | 'conflict'

interface RemoteWorkspace {
  payload: unknown
  revision: number
  updatedAt: string | null
}

export interface CloudWorkspaceControls {
  status: CloudSyncStatus
  revision: number
  lastSyncedAt: string | null
  error: string
  isAuthenticated: boolean
  connectLocalToCloud: () => Promise<boolean>
  startFreshCloud: () => Promise<boolean>
  retryCloud: () => Promise<boolean>
  useCloudVersion: () => boolean
  keepDeviceVersion: () => Promise<boolean>
  saveNow: () => Promise<boolean>
}

interface CloudWorkspaceOptions {
  state: WorkspaceState
  setState: Dispatch<SetStateAction<WorkspaceState>>
  createInitialState: () => WorkspaceState
  isWorkspaceState: (value: unknown) => value is WorkspaceState
  migrateSavedState: (value: WorkspaceState) => WorkspaceState
}

const PRECLOUD_BACKUP_KEY = 'tingwen.workspace.precloud.v1'

export function useCloudWorkspace({
  state,
  setState,
  createInitialState,
  isWorkspaceState,
  migrateSavedState,
}: CloudWorkspaceOptions): CloudWorkspaceControls {
  const { user, isAuthenticated } = useAuth()
  const [status, setStatus] = useState<CloudSyncStatus>(isAuthenticated ? 'loading' : 'disabled')
  const [revision, setRevision] = useState(0)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [conflictRemote, setConflictRemote] = useState<RemoteWorkspace | null>(null)
  const [saveTick, setSaveTick] = useState(0)
  const stateRef = useRef(state)
  const revisionRef = useRef(0)
  const readyRef = useRef(false)
  const savingRef = useRef(false)
  const skipNextSaveRef = useRef(false)
  const loadedUserRef = useRef<number | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const activeUserRef = useRef<number | null>(user?.id ?? null)
  activeUserRef.current = user?.id ?? null

  const workspaceQuery = trpc.workspace.get.useQuery(
    { ownerId: user?.id ?? 0 },
    {
      enabled: isAuthenticated && Boolean(user),
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: 0,
    },
  )
  const saveMutation = trpc.workspace.save.useMutation()
  const { mutateAsync } = saveMutation

  useEffect(() => { stateRef.current = state }, [state])

  const preserveDeviceCopy = useCallback(() => {
    try {
      localStorage.setItem(PRECLOUD_BACKUP_KEY, JSON.stringify(stateRef.current))
    } catch {
      // The ordinary local backup remains available even if this extra snapshot
      // cannot be written; cloud replacement is never the only exported copy.
    }
  }, [])

  useEffect(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    readyRef.current = false
    loadedUserRef.current = null
    skipNextSaveRef.current = false
    revisionRef.current = 0
    setRevision(0)
    setLastSyncedAt(null)
    setConflictRemote(null)
    setError('')
    setStatus(isAuthenticated ? 'loading' : 'disabled')
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    const remote = workspaceQuery.data
    if (
      !isAuthenticated ||
      !user ||
      !remote ||
      remote.ownerId !== user.id ||
      loadedUserRef.current === user.id
    ) return
    const cloudPayload = remote.payload
    if (cloudPayload && !isWorkspaceState(cloudPayload)) {
      readyRef.current = false
      setError('The cloud workspace is not a valid SkopeinSignal backup. Your device copy has not been replaced.')
      setStatus('error')
      return
    }
    loadedUserRef.current = user.id
    revisionRef.current = remote.revision
    setRevision(remote.revision)
    setLastSyncedAt(remote.updatedAt)
    if (!cloudPayload) {
      readyRef.current = false
      setStatus('migration')
      return
    }
    preserveDeviceCopy()
    skipNextSaveRef.current = true
    setState(migrateSavedState(cloudPayload as WorkspaceState))
    readyRef.current = true
    setError('')
    setStatus('synced')
  }, [isAuthenticated, isWorkspaceState, migrateSavedState, preserveDeviceCopy, setState, user, workspaceQuery.data])

  useEffect(() => {
    if (!workspaceQuery.error || !isAuthenticated) return
    readyRef.current = false
    setError('Cloud sync could not be reached. Your changes remain on this device; retry when the connection is available.')
    setStatus('error')
  }, [isAuthenticated, workspaceQuery.error])

  const persist = useCallback(async (payload: WorkspaceState): Promise<boolean> => {
    const userId = user?.id
    if (!isAuthenticated || !userId || savingRef.current) return false
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    savingRef.current = true
    setStatus('saving')
    setError('')
    try {
      const result = await mutateAsync({ expectedRevision: revisionRef.current, payload: payload as unknown as WorkspacePayload })
      if (activeUserRef.current !== userId) return false
      if (result.ok) {
        revisionRef.current = result.revision
        setRevision(result.revision)
        setLastSyncedAt(result.updatedAt)
        setConflictRemote(null)
        readyRef.current = true
        setStatus('synced')
        if (stateRef.current !== payload) setSaveTick((tick) => tick + 1)
        return true
      }
      setConflictRemote({ payload: result.payload, revision: result.revision, updatedAt: result.updatedAt })
      readyRef.current = false
      setError('Another device saved a newer cloud revision. Choose which workspace to keep; nothing has been overwritten automatically.')
      setStatus('conflict')
      return false
    } catch {
      if (activeUserRef.current === userId) {
        setError('Changes are saved on this device but have not reached the cloud. Check your connection and retry.')
        setStatus('error')
      }
      return false
    } finally {
      savingRef.current = false
    }
  }, [isAuthenticated, mutateAsync, user?.id])

  useEffect(() => {
    if (!isAuthenticated) return
    const reconnect = () => {
      if (readyRef.current) void persist(stateRef.current)
      else void workspaceQuery.refetch()
    }
    window.addEventListener('online', reconnect)
    return () => window.removeEventListener('online', reconnect)
  }, [isAuthenticated, persist, workspaceQuery])

  useEffect(() => {
    if (!isAuthenticated || !readyRef.current) return
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false
      return
    }
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      void persist(stateRef.current)
    }, 800)
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [isAuthenticated, persist, saveTick, state])

  useEffect(() => () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
  }, [])

  const connectLocalToCloud = useCallback(() => persist(stateRef.current), [persist])

  const startFreshCloud = useCallback(() => {
    const fresh = createInitialState()
    skipNextSaveRef.current = true
    setState(fresh)
    return persist(fresh)
  }, [createInitialState, persist, setState])

  const retryCloud = useCallback(async () => {
    if (!isAuthenticated) return false
    if (readyRef.current) return persist(stateRef.current)
    const result = await workspaceQuery.refetch()
    if (result.error) {
      setError('Cloud sync is still unavailable. Your device copy is unchanged.')
      setStatus('error')
      return false
    }
    return true
  }, [isAuthenticated, persist, workspaceQuery])

  const useCloudVersion = useCallback(() => {
    if (!conflictRemote || !isWorkspaceState(conflictRemote.payload)) return false
    preserveDeviceCopy()
    skipNextSaveRef.current = true
    setState(migrateSavedState(conflictRemote.payload))
    revisionRef.current = conflictRemote.revision
    setRevision(conflictRemote.revision)
    setLastSyncedAt(conflictRemote.updatedAt)
    setConflictRemote(null)
    setError('')
    readyRef.current = true
    setStatus('synced')
    return true
  }, [conflictRemote, isWorkspaceState, migrateSavedState, preserveDeviceCopy, setState])

  const keepDeviceVersion = useCallback(() => {
    if (!conflictRemote) return Promise.resolve(false)
    revisionRef.current = conflictRemote.revision
    setRevision(conflictRemote.revision)
    setConflictRemote(null)
    readyRef.current = true
    return persist(stateRef.current)
  }, [conflictRemote, persist])

  const saveNow = useCallback(() => {
    if (!isAuthenticated) return Promise.resolve(false)
    return persist(stateRef.current)
  }, [isAuthenticated, persist])

  return {
    status,
    revision,
    lastSyncedAt,
    error,
    isAuthenticated,
    connectLocalToCloud,
    startFreshCloud,
    retryCloud,
    useCloudVersion,
    keepDeviceVersion,
    saveNow,
  }
}
