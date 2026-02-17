import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import {
  buildRoomUrl,
  buildInviteUrl,
  buildViewUrl,
  getInviteFromUrl,
  getRoomIdFromUrl,
  isViewOnlyFromUrl,
  normalizeRoomId,
} from './room'
import { addRecentRoom, readRecentRooms } from './recentRooms'
import { strokesToSvg } from './svg'
import { createId, formatBytes, formatTime } from './utils'
import { fetchRoomsMetrics, kickUser, setRoomLock, type RoomMetrics } from './adminRooms'
import { getUserKey } from './userKey'
import { loadLocalProfile, saveLocalProfile } from './profileStorage'
import { loadLocalAuthToken, saveLocalAuthToken } from './authStorage'

type Point = { x: number; y: number }

type Stroke = {
  id: string
  batchId?: string
  color: string
  size: number
  tool: 'pen' | 'eraser'
  points: Point[]
  userId?: string
  userName?: string
  userColor?: string
}

type BoardImage = {
  id: string
  dataUrl: string
  x: number
  y: number
  w: number
  h: number
  userId?: string
  userName?: string
  userColor?: string
  createdAt?: string
}

type ChatMessage = {
  id: string
  text: string
  userId: string
  userName: string
  userColor: string
  createdAt: string
  reactions?: Record<string, string[]>
}

type AuditEntry = {
  id: string
  at: string
  text: string
  kind?: 'lock' | 'unlock' | 'kick' | 'role' | 'owner' | 'privacy' | 'invite'
}

type PresenceUser = {
  id: string
  name: string
  color: string
  cursor: Point
  active: boolean
  role?: 'owner' | 'mod' | 'member'
}

type PresenceCursorUpdate = {
  id: string
  cursor: Point
}

type Notice =
  | {
      kind: 'rate_limited'
      scope: 'chat' | 'stroke' | 'clear' | 'profile' | 'reaction' | 'image'
      retryAfterMs: number
    }
  | {
      kind: 'info'
      message: string
    }

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#f15bb5']
const SIZES = [2, 4, 6, 10]
const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀']

const LIMITS = {
  maxStrokePoints: 2000,
  maxMessages: 200,
  maxStrokes: 1000,
}
const STROKE_BATCH_WINDOW_MS = 900
const BOARD_BACKGROUND = '#0b0b13'

const IMAGE_LIMITS = {
  maxBytes: 1_000_000,
  allowedMime: ['image/png', 'image/jpeg', 'image/webp'],
}

function isEditableTarget(target: EventTarget | null) {
  if (!target) return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
}

function isNearBottom(element: HTMLElement, threshold = 24) {
  const distance = element.scrollHeight - element.scrollTop - element.clientHeight
  return distance <= threshold
}

function getSocketUrl() {
  const envUrl = import.meta.env.VITE_SERVER_URL as string | undefined
  if (envUrl) return envUrl
  const { protocol, hostname, port } = window.location
  if (port === '5173') {
    return `${protocol}//${hostname}:4000`
  }
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`
}

function extractInviteToken(input: string) {
  const trimmed = (input || '').trim()
  if (!trimmed) return ''
  if (trimmed.length > 2048) return ''

  // Accept a full invite URL (we'll extract ?invite=...).
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      const invite = (parsed.searchParams.get('invite') || '').trim()
      return invite.length > 1024 ? '' : invite
    } catch {
      // fall through and treat as raw token
    }
  }

  // Otherwise treat as the raw token.
  if (trimmed.length > 1024) return ''
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) return ''
  return trimmed
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.tool === 'eraser' ? BOARD_BACKGROUND : stroke.color
  ctx.lineWidth = stroke.size
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  stroke.points.slice(1).forEach((point) => {
    ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()
  ctx.restore()
}

function drawStrokeSegment(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  const count = stroke.points.length
  if (count < 2) return
  const from = stroke.points[count - 2]
  const to = stroke.points[count - 1]

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.tool === 'eraser' ? BOARD_BACKGROUND : stroke.color
  ctx.lineWidth = stroke.size
  ctx.beginPath()
  ctx.moveTo(from.x, from.y)
  ctx.lineTo(to.x, to.y)
  ctx.stroke()
  ctx.restore()
}

function setCanvasSize(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number; ratio: number },
  options?: { setStyle?: boolean },
) {
  const width = Math.max(1, Math.floor(size.width))
  const height = Math.max(1, Math.floor(size.height))
  const ratio = Number.isFinite(size.ratio) && size.ratio > 0 ? size.ratio : 1

  canvas.width = Math.max(1, Math.floor(width * ratio))
  canvas.height = Math.max(1, Math.floor(height * ratio))
  if (options?.setStyle) {
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  return ctx
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

async function decodeDataUrlImage(dataUrl: string): Promise<{ width: number; height: number } | null> {
  if (!dataUrl) return null
  const img = new Image()
  img.src = dataUrl
  try {
    // `decode()` is supported in modern browsers; fall back to `onload` if needed.
    if (typeof img.decode === 'function') {
      await img.decode()
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to decode image'))
      })
    }
  } catch {
    return null
  }
  if (!img.naturalWidth || !img.naturalHeight) return null
  return { width: img.naturalWidth, height: img.naturalHeight }
}

function RoomSettingsDrawer({
  open,
  onClose,
  roomId,
  roomInput,
  onRoomInputChange,
  onJoinRoom,
  recentRooms,
  onJoinRecentRoom,
  copyStatus,
  onCopyLink,
  onCopyViewLink,
  viewOnly,
  onToggleMode,
  roomLocked,
  roomPrivate,
  canTogglePrivacy,
  onPrivacyToggle,
  canCreateInvites,
  onCreateInvite,
  inviteTtlMs,
  onInviteTtlMs,
  onRevokeInvites,
  inviteLink,
  inviteExpiresAt,
  onCopyInviteLink,
  canModerate,
  canManageRoles,
  users,
  selfId,
  selfRole,
  recentAudit,
  onRoomLockToggle,
  onRoleToggleUser,
  onKickUser,
}: {
  open: boolean
  onClose: () => void
  roomId: string
  roomInput: string
  onRoomInputChange: (next: string) => void
  onJoinRoom: (event: React.FormEvent) => void
  recentRooms: string[]
  onJoinRecentRoom: (roomId: string) => void
  copyStatus: 'idle' | 'copied'
  onCopyLink: () => void
  onCopyViewLink: () => void
  viewOnly: boolean
  onToggleMode: () => void
  roomLocked: boolean
  roomPrivate: boolean
  canTogglePrivacy: boolean
  onPrivacyToggle: () => void
  canCreateInvites: boolean
  onCreateInvite: () => void
  inviteTtlMs: number
  onInviteTtlMs: (next: number) => void
  onRevokeInvites: () => void
  inviteLink: string | null
  inviteExpiresAt: string | null
  onCopyInviteLink: () => void
  canModerate: boolean
  canManageRoles: boolean
  users: PresenceUser[]
  selfId: string
  selfRole: PresenceUser['role'] | string
  recentAudit: AuditEntry[]
  onRoomLockToggle: () => void
  onRoleToggleUser: (userId: string, role?: string) => void
  onKickUser: (userId: string, userName: string) => void
}) {
  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="drawer-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Room settings"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <p className="drawer-title">Room settings</p>
            <p className="drawer-sub">
              {roomId} · {viewOnly ? 'view' : 'edit'}
              {roomLocked ? ' · locked' : ''}
              {roomPrivate ? ' · invite-only' : ''}
              {selfRole && selfRole !== 'member' ? ` · ${selfRole}` : ''}
            </p>
          </div>
          <button type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="drawer-body">
          <div className="panel-block room">
            <h3>Room</h3>
            <form onSubmit={onJoinRoom}>
              <input
                value={roomInput}
                onChange={(event) => onRoomInputChange(event.target.value)}
                placeholder="e.g. team-1"
                aria-label="Room id"
              />
              <button type="submit">Join</button>
            </form>
            {recentRooms.length > 0 ? (
              <div className="recent-rooms" aria-label="Recent rooms">
                {recentRooms.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={value === roomId ? 'recent active' : 'recent'}
                    onClick={() => onJoinRecentRoom(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="room-actions">
              <button type="button" onClick={onCopyLink}>
                {copyStatus === 'copied' ? 'Copied' : roomPrivate ? 'Copy invite link' : 'Copy link'}
              </button>
              <button type="button" onClick={onCopyViewLink}>
                Copy view link
              </button>
              <p className="muted">Current: {roomId}</p>
            </div>
            <div className="room-actions">
              <button type="button" onClick={onToggleMode}>
                {viewOnly ? 'Switch to edit' : 'Switch to view'}
              </button>
              <p className="muted">{viewOnly ? 'Read-only mode' : 'Edit mode'}</p>
            </div>
            <div className="drawer-invites">
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={roomPrivate}
                  onChange={onPrivacyToggle}
                  disabled={!canTogglePrivacy}
                />
                Invite-only
              </label>
              <label className="invite-ttl">
                TTL
                <select
                  value={String(inviteTtlMs)}
                  onChange={(event) => onInviteTtlMs(Number(event.target.value))}
                  disabled={!canCreateInvites || !roomPrivate}
                >
                  <option value={String(5 * 60 * 1000)}>5m</option>
                  <option value={String(15 * 60 * 1000)}>15m</option>
                  <option value={String(60 * 60 * 1000)}>1h</option>
                  <option value={String(24 * 60 * 60 * 1000)}>24h</option>
                </select>
              </label>
              <button
                type="button"
                className="lock-toggle"
                onClick={onCreateInvite}
                disabled={!canCreateInvites || !roomPrivate}
              >
                {inviteLink ? 'Regenerate invite link' : 'Create invite link'}
              </button>
              <button
                type="button"
                className="room-mini-action"
                onClick={onRevokeInvites}
                disabled={!canCreateInvites || !roomPrivate}
              >
                Revoke invites
              </button>
              {inviteLink ? (
                <div className="invite-preview">
                  <p className="muted">
                    Last invite {inviteExpiresAt ? `expires at ${formatTime(inviteExpiresAt)}` : 'created'}
                  </p>
                  <button type="button" className="room-mini-action" onClick={onCopyInviteLink}>
                    Copy last invite
                  </button>
                </div>
              ) : null}
              <p className="muted">Invite-only rooms require a valid invite link to join.</p>
            </div>
          </div>

          <div className="panel-block">
            <h3>People</h3>
            <ul>
              {users.map((user) => (
                <li key={user.id} className="drawer-user">
                  <span className="avatar" style={{ background: user.color }} aria-hidden="true" />
                  <div>
                    <p>
                      {user.name} {user.id === selfId ? <span className="muted">(you)</span> : null}
                    </p>
                    <p className="muted">
                      {user.role && user.role !== 'member' ? user.role : 'member'}
                    </p>
                  </div>
                  {canManageRoles && user.id !== selfId && user.role !== 'owner' ? (
                    <button
                      type="button"
                      className="role-toggle"
                      onClick={() => onRoleToggleUser(user.id, user.role)}
                    >
                      {user.role === 'mod' ? 'Remove mod' : 'Make mod'}
                    </button>
                  ) : null}
                  {canModerate &&
                  user.id !== selfId &&
                  (selfRole === 'owner' || user.role !== 'owner') ? (
                    <button
                      type="button"
                      className="kick"
                      onClick={() => onKickUser(user.id, user.name)}
                    >
                      Kick
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canModerate ? (
              <div className="drawer-moderation">
                <button type="button" className="lock-toggle" onClick={onRoomLockToggle}>
                  {roomLocked ? 'Unlock room' : 'Lock room'}
                </button>
                <p className="muted">
                  Locking disables drawing and chat for everyone (moderators can still unlock).
                </p>
              </div>
            ) : (
              <p className="muted">Moderation controls are available to the owner/mods.</p>
            )}
          </div>

          <div className="panel-block audit">
            <h3>Room activity</h3>
            {recentAudit.length === 0 ? (
              <p className="muted">No moderation activity yet.</p>
            ) : (
              <ul className="audit-list">
                {recentAudit.map((entry) => (
                  <li key={entry.id} className="audit-item">
                    <div>
                      <p>{entry.text}</p>
                      <p className="muted">{formatTime(entry.at)}</p>
                    </div>
                    {entry.kind ? <span className={`audit-kind ${entry.kind}`}>{entry.kind}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const initialRoomId = useMemo(() => getRoomIdFromUrl(window.location.href), [])
  const initialViewOnly = useMemo(() => isViewOnlyFromUrl(window.location.href), [])
  const initialInvite = useMemo(() => getInviteFromUrl(window.location.href), [])
  const userKey = useMemo(() => getUserKey(), [])
  const initialAuthToken = useMemo(() => loadLocalAuthToken(), [])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const imagesRef = useRef<BoardImage[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const strokeBatchRef = useRef<{
    id: string
    tool: Stroke['tool']
    color: string
    size: number
    endedAt: number
  } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const layersRef = useRef<{
    width: number
    height: number
    ratio: number
    base: HTMLCanvasElement
    strokes: HTMLCanvasElement
    baseCtx: CanvasRenderingContext2D
    strokesCtx: CanvasRenderingContext2D
  } | null>(null)
  const visibleCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const imageCacheRef = useRef<
    Map<string, { img: HTMLImageElement; status: 'loading' | 'ready' | 'error' }>
  >(new Map())
  const renderRafRef = useRef<number | null>(null)
  const pendingRenderRef = useRef<'none' | 'base' | 'all'>('none')
  const enqueueRenderRef = useRef<(kind: 'base' | 'all') => void>(() => {})
  const pendingSelectImageIdRef = useRef<string | null>(null)
  const imageDragRef = useRef<{
    id: string
    start: Point
    origin: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const cursorRafRef = useRef<number | null>(null)
  const pendingCursorRef = useRef<Point | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesListRef = useRef<HTMLDivElement | null>(null)
  const chatAtBottomRef = useRef(true)

  const [connected, setConnected] = useState(false)
  const [selfId, setSelfId] = useState('')
  const [roomId, setRoomId] = useState(initialRoomId)
  const [viewOnly, setViewOnly] = useState(initialViewOnly)
  const [roomLocked, setRoomLocked] = useState(false)
  const [roomPrivate, setRoomPrivate] = useState(false)
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null)
  const [inviteTtlMs, setInviteTtlMs] = useState(15 * 60 * 1000)
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [tool, setTool] = useState<'pen' | 'eraser' | 'select'>('pen')
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const selectedImageIdRef = useRef<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [chatFilter, setChatFilter] = useState('')
  const [chatAtBottom, setChatAtBottom] = useState(true)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [roomInput, setRoomInput] = useState(initialRoomId)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')
  const [toast, setToast] = useState<string | null>(null)
  const [recentRooms, setRecentRooms] = useState<string[]>(() => readRecentRooms())
  const [profileName, setProfileName] = useState('')
  const [profileColor, setProfileColor] = useState(COLORS[0])
  const profileDirtyRef = useRef(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [adminToken, setAdminToken] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState<string | null>(null)
  const [roomsMetrics, setRoomsMetrics] = useState<RoomMetrics[]>([])
  const [roomsFilter, setRoomsFilter] = useState('')
  const [roomsAutoRefresh, setRoomsAutoRefresh] = useState(true)
  const [roomsOnlyLocked, setRoomsOnlyLocked] = useState(false)
  const [roomsOnlyInviteOnly, setRoomsOnlyInviteOnly] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [accessBlock, setAccessBlock] = useState<{ kind: 'invite' | 'auth'; message: string } | null>(
    null,
  )
  const [accessInput, setAccessInput] = useState('')
  const [accessError, setAccessError] = useState<string | null>(null)

  const selfRole = useMemo(
    () => users.find((user) => user.id === selfId)?.role ?? 'member',
    [users, selfId],
  )
  const canModerate = !viewOnly && (selfRole === 'owner' || selfRole === 'mod')
  const canManageRoles = !viewOnly && selfRole === 'owner'
  const canEdit = !viewOnly && !roomLocked
  const recentAudit = useMemo(() => auditEntries.slice(-8).reverse(), [auditEntries])
  const pinnedMessage = useMemo(
    () => (pinnedId ? messages.find((message) => message.id === pinnedId) ?? null : null),
    [messages, pinnedId],
  )
  const filteredMessages = useMemo(() => {
    const needle = chatFilter.trim().toLowerCase()
    if (!needle) return messages
    return messages.filter((message) => {
      return (
        message.text.toLowerCase().includes(needle) || message.userName.toLowerCase().includes(needle)
      )
    })
  }, [messages, chatFilter])

  const socket = useMemo(() => {
    return io(getSocketUrl(), {
      autoConnect: true,
      auth: {
        room: initialRoomId,
        mode: initialViewOnly ? 'view' : 'edit',
        userKey,
        invite: initialInvite ?? undefined,
        authToken: initialAuthToken ?? undefined,
      },
    })
  }, [initialRoomId, initialViewOnly, initialInvite, initialAuthToken, userKey])

  const compositeLayers = useCallback(() => {
    const layers = layersRef.current
    const ctx = visibleCtxRef.current
    if (!layers || !ctx) return
    ctx.clearRect(0, 0, layers.width, layers.height)
    ctx.drawImage(layers.base, 0, 0, layers.width, layers.height)
    ctx.drawImage(layers.strokes, 0, 0, layers.width, layers.height)

    if (tool === 'select') {
      const selected = selectedImageIdRef.current
      if (selected) {
        const image = imagesRef.current.find((img) => img.id === selected)
        if (image) {
          ctx.save()
          ctx.strokeStyle = '#ffd93d'
          ctx.lineWidth = 2
          ctx.setLineDash([6, 4])
          ctx.strokeRect(image.x, image.y, image.w, image.h)
          ctx.restore()
        }
      }
    }
  }, [tool])

  const rebuildStrokesLayer = useCallback(() => {
    const layers = layersRef.current
    if (!layers) return
    const ctx = layers.strokesCtx
    ctx.clearRect(0, 0, layers.width, layers.height)
    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke))
  }, [])

  const getCachedImage = useCallback((dataUrl: string) => {
    const cache = imageCacheRef.current
    const existing = cache.get(dataUrl)
    if (existing) return existing

    const img = new Image()
    const entry = { img, status: 'loading' as const }
    cache.set(dataUrl, entry)

    const mark = (status: 'ready' | 'error') => {
      const current = cache.get(dataUrl)
      if (!current) return
      current.status = status
      enqueueRenderRef.current('base')
    }

    img.onload = () => mark('ready')
    img.onerror = () => mark('error')
    img.src = dataUrl
    return entry
  }, [])

  const rebuildBaseLayer = useCallback(() => {
    const layers = layersRef.current
    if (!layers) return
    const ctx = layers.baseCtx
    ctx.clearRect(0, 0, layers.width, layers.height)
    ctx.fillStyle = BOARD_BACKGROUND
    ctx.fillRect(0, 0, layers.width, layers.height)

    for (const boardImage of imagesRef.current) {
      if (!boardImage?.dataUrl) continue
      const cached = getCachedImage(boardImage.dataUrl)
      if (cached.status !== 'ready') continue
      ctx.drawImage(cached.img, boardImage.x, boardImage.y, boardImage.w, boardImage.h)
    }
  }, [getCachedImage])

  const scheduleRender = useCallback(
    (kind: 'base' | 'all') => {
      pendingRenderRef.current =
        kind === 'all' ? 'all' : pendingRenderRef.current === 'all' ? 'all' : 'base'
      if (renderRafRef.current !== null) return
      renderRafRef.current = window.requestAnimationFrame(() => {
        renderRafRef.current = null
        const next = pendingRenderRef.current
        pendingRenderRef.current = 'none'
        if (next === 'none') return

        if (next === 'all') {
          rebuildBaseLayer()
          rebuildStrokesLayer()
          compositeLayers()
          return
        }

        rebuildBaseLayer()
        compositeLayers()
      })
    },
    [rebuildBaseLayer, rebuildStrokesLayer, compositeLayers],
  )

  useEffect(() => {
    enqueueRenderRef.current = scheduleRender
  }, [scheduleRender])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1

    const visibleCtx = setCanvasSize(canvas, { width: rect.width, height: rect.height, ratio }, { setStyle: true })
    if (!visibleCtx) return
    visibleCtxRef.current = visibleCtx

    const base = layersRef.current?.base ?? document.createElement('canvas')
    const strokes = layersRef.current?.strokes ?? document.createElement('canvas')
    const baseCtx = setCanvasSize(base, { width: rect.width, height: rect.height, ratio })
    const strokesCtx = setCanvasSize(strokes, { width: rect.width, height: rect.height, ratio })
    if (!baseCtx || !strokesCtx) return

    layersRef.current = {
      width: rect.width,
      height: rect.height,
      ratio,
      base,
      strokes,
      baseCtx,
      strokesCtx,
    }

    scheduleRender('all')
  }, [scheduleRender])

  const scheduleCursorEmit = useCallback(
    (point: Point) => {
      pendingCursorRef.current = point
      if (cursorRafRef.current !== null) return
      cursorRafRef.current = window.requestAnimationFrame(() => {
        cursorRafRef.current = null
        const latest = pendingCursorRef.current
        if (!latest) return
        if (!socketRef.current?.connected) return
        socketRef.current.emit('presence:cursor', latest)
      })
    },
    [cursorRafRef, pendingCursorRef, socketRef],
  )

  useEffect(() => {
    chatAtBottomRef.current = chatAtBottom
  }, [chatAtBottom])

  useEffect(() => {
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('init', (payload) => {
      setAccessBlock(null)
      setAccessError(null)
      setSelfId(payload.selfId)
      if (payload.roomId) {
        setRoomId(payload.roomId)
        setRoomInput(payload.roomId)
      }
      if (typeof payload.viewOnly === 'boolean') {
        setViewOnly(payload.viewOnly)
      } else {
        setViewOnly(isViewOnlyFromUrl(window.location.href))
      }
      if (typeof payload.locked === 'boolean') {
        setRoomLocked(payload.locked)
      }
      if (typeof payload.private === 'boolean') {
        setRoomPrivate(payload.private)
        if (!payload.private) {
          setInviteLink(null)
          setInviteExpiresAt(null)
        } else {
          const invite = getInviteFromUrl(window.location.href)
          if (invite) {
            const currentRoom =
              typeof payload.roomId === 'string'
                ? normalizeRoomId(payload.roomId)
                : getRoomIdFromUrl(window.location.href)
            setInviteLink(buildInviteUrl(window.location.href, currentRoom, invite))
            setInviteExpiresAt(null)
          }
        }
      }
      setUsers(payload.users)
      if (Array.isArray(payload.audit)) {
        setAuditEntries(payload.audit)
      }
      if (typeof payload.pinnedId === 'string' || payload.pinnedId === null) {
        setPinnedId(payload.pinnedId ?? null)
      }
      const me = payload.users?.find?.((user: PresenceUser) => user.id === payload.selfId)
      if (me) {
        const saved = loadLocalProfile()
        const canApplySaved =
          !payload.locked && (payload.viewOnly === false || payload.viewOnly === undefined)
        const nextName = canApplySaved && saved?.name ? saved.name : me.name
        const nextColor = canApplySaved && saved?.color ? saved.color : me.color

        setProfileName(nextName)
        setProfileColor(nextColor)
        profileDirtyRef.current = false

        if (canApplySaved && (nextName !== me.name || nextColor !== me.color)) {
          socket.emit('profile:update', { name: nextName, color: nextColor })
        }

        if (nextName || nextColor) {
          saveLocalProfile({ name: nextName, color: nextColor })
        }
      }
      setMessages(payload.messages.slice(-LIMITS.maxMessages))
      setUnreadMessages(0)
      setChatAtBottom(true)
      strokesRef.current = payload.strokes.slice(-LIMITS.maxStrokes)
      imagesRef.current = Array.isArray(payload.images) ? payload.images : []
      setSelectedImageId(null)
      resizeCanvas()
    })

    socket.on('presence:update', (nextUsers) => {
      setUsers(nextUsers)
    })

    socket.on('presence:cursor', (update: PresenceCursorUpdate) => {
      setUsers((prev) => {
        const index = prev.findIndex((user) => user.id === update.id)
        if (index === -1) return prev
        const next = prev.slice()
        next[index] = { ...next[index], cursor: update.cursor }
        return next
      })
    })

    socket.on('stroke:add', (stroke: Stroke) => {
      strokesRef.current = [...strokesRef.current, stroke].slice(-LIMITS.maxStrokes)
      const layers = layersRef.current
      if (layers) {
        drawStroke(layers.strokesCtx, stroke)
      }
      const ctx = visibleCtxRef.current ?? canvasRef.current?.getContext('2d')
      if (ctx) drawStroke(ctx, stroke)
    })

    socket.on('stroke:remove', (payload: { id: string }) => {
      const id = payload?.id
      if (!id) return
      const next = strokesRef.current.filter((stroke) => stroke.id !== id)
      if (next.length === strokesRef.current.length) return
      strokesRef.current = next
      scheduleRender('all')
    })

    socket.on('board:clear', () => {
      strokesRef.current = []
      imagesRef.current = []
      setSelectedImageId(null)
      scheduleRender('all')
    })

    socket.on('image:add', (image: BoardImage) => {
      if (!image?.id) return
      const next = imagesRef.current.slice()
      const index = next.findIndex((entry) => entry.id === image.id)
      if (index >= 0) {
        next[index] = { ...next[index], ...image }
      } else {
        next.push(image)
      }
      imagesRef.current = next
      if (pendingSelectImageIdRef.current === image.id) {
        pendingSelectImageIdRef.current = null
        setTool('select')
        setSelectedImageId(image.id)
      }
      scheduleRender('base')
    })

    socket.on('image:update', (payload: { id?: string; x?: number; y?: number; w?: number; h?: number }) => {
      const id = String(payload?.id || '').trim()
      if (!id) return
      const index = imagesRef.current.findIndex((img) => img.id === id)
      if (index < 0) return
      const current = imagesRef.current[index]
      if (!current) return
      const next = imagesRef.current.slice()
      next[index] = {
        ...current,
        x: Number(payload.x),
        y: Number(payload.y),
        w: Number(payload.w),
        h: Number(payload.h),
      }
      imagesRef.current = next
      scheduleRender('base')
    })

    socket.on('image:remove', (payload: { id?: string }) => {
      const id = String(payload?.id || '').trim()
      if (!id) return
      const next = imagesRef.current.filter((img) => img.id !== id)
      if (next.length === imagesRef.current.length) return
      imagesRef.current = next
      if (selectedImageIdRef.current === id) {
        setSelectedImageId(null)
      }
      scheduleRender('base')
    })

    socket.on('room:lock', (payload: { locked: boolean }) => {
      if (typeof payload?.locked === 'boolean') {
        setRoomLocked(payload.locked)
        if (payload.locked) {
          setToast('Room locked.')
        } else {
          setToast('Room unlocked.')
        }
      }
    })

    socket.on('room:privacy', (payload: { private?: boolean }) => {
      if (typeof payload?.private === 'boolean') {
        setRoomPrivate(payload.private)
        if (!payload.private) {
          setInviteLink(null)
          setInviteExpiresAt(null)
        }
        setToast(payload.private ? 'Room is invite-only.' : 'Room is public.')
      }
    })

    socket.on('invite:created', async (payload: { token?: string; expiresAt?: string }) => {
      if (!payload?.token) return
      const currentRoom = getRoomIdFromUrl(window.location.href)
      const link = buildInviteUrl(window.location.href, currentRoom, payload.token)
      setInviteLink(link)
      setInviteExpiresAt(typeof payload.expiresAt === 'string' ? payload.expiresAt : null)
      try {
        await navigator.clipboard.writeText(link)
        setToast('Invite link copied.')
      } catch {
        window.prompt('Copy this invite link', link)
      }
    })

    socket.on('invite:revoked', () => {
      setInviteLink(null)
      setInviteExpiresAt(null)
      setToast('Invites revoked.')
    })

    socket.on('room:audit', (payload: { entries?: AuditEntry[] }) => {
      if (Array.isArray(payload?.entries)) {
        setAuditEntries(payload.entries)
      }
    })

    socket.on('chat:message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message].slice(-LIMITS.maxMessages))
      if (!chatAtBottomRef.current && message.userId !== selfId) {
        setUnreadMessages((prev) => prev + 1)
      }
    })

    socket.on('chat:reaction', (payload: { id?: string; reactions?: Record<string, string[]> }) => {
      if (!payload?.id) return
      setMessages((prev) =>
        prev.map((message) =>
          message.id === payload.id ? { ...message, reactions: payload.reactions ?? {} } : message,
        ),
      )
    })

    socket.on('chat:pin', (payload: { pinnedId?: string | null }) => {
      if (typeof payload?.pinnedId === 'string' || payload?.pinnedId === null) {
        setPinnedId(payload.pinnedId ?? null)
      }
    })

    socket.on('notice', (notice: Notice) => {
      if (notice.kind === 'rate_limited') {
        const label =
          notice.scope === 'chat'
            ? 'Chat'
            : notice.scope === 'stroke'
              ? 'Drawing'
              : notice.scope === 'clear'
                ? 'Clear'
                : notice.scope === 'reaction'
                  ? 'Reactions'
                  : notice.scope === 'image'
                    ? 'Images'
                  : 'Profile'
        setToast(`${label} is rate limited — try again in ${Math.ceil(notice.retryAfterMs / 1000)}s.`)
        return
      }
      if (notice.kind === 'info') {
        const message = String(notice.message || '')
        if (/invalid image|too many images|storage limit/i.test(message)) {
          pendingSelectImageIdRef.current = null
        }
        if (/invite link required/i.test(message)) {
          setAccessBlock({ kind: 'invite', message })
          setAccessInput('')
          setAccessError(null)
        } else if (/access token required|invalid access token/i.test(message)) {
          setAccessBlock({ kind: 'auth', message })
          setAccessInput('')
          setAccessError(null)
        }
        setToast(message)
      }
    })

    return () => {
      if (cursorRafRef.current !== null) {
        window.cancelAnimationFrame(cursorRafRef.current)
        cursorRafRef.current = null
      }
      socket.disconnect()
    }
  }, [socket, resizeCanvas, scheduleRender, selfId])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  useEffect(() => {
    if (!chatAtBottomRef.current) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, chatAtBottom])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(timeout)
  }, [toast])

  useEffect(() => {
    selectedImageIdRef.current = selectedImageId
  }, [selectedImageId])

  useEffect(() => {
    if (tool !== 'select') return
    scheduleRender('base')
  }, [tool, selectedImageId, scheduleRender])

  useEffect(() => {
    if (!selfId) return
    if (profileDirtyRef.current) return
    const me = users.find((user) => user.id === selfId)
    if (!me) return
    setProfileName(me.name)
    setProfileColor(me.color)
  }, [users, selfId])

  useEffect(() => {
    setRecentRooms(addRecentRoom(roomId))
  }, [roomId])

  const refreshRooms = useCallback(async () => {
    setAdminLoading(true)
    setAdminError(null)
    try {
      const rooms = await fetchRoomsMetrics({ token: adminToken.trim() || undefined })
      setRoomsMetrics(rooms)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Failed to load rooms')
    } finally {
      setAdminLoading(false)
    }
  }, [adminToken])

  const handleKick = useCallback(
    async (roomId: string, userId: string, userName: string) => {
      const token = adminToken.trim()
      if (!token) {
        setAdminError('Admin token required to kick.')
        return
      }
      const ok = window.confirm(`Remove ${userName || userId} from ${roomId}?`)
      if (!ok) return

      setAdminLoading(true)
      setAdminError(null)
      try {
        await kickUser({ roomId, userId, token })
        await refreshRooms()
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : 'Kick failed')
      } finally {
        setAdminLoading(false)
      }
    },
    [adminToken, refreshRooms],
  )

  const handleLockToggle = useCallback(
    async (roomId: string, locked: boolean) => {
      const token = adminToken.trim()
      if (!token) {
        setAdminError('Admin token required to lock rooms.')
        return
      }

      setAdminLoading(true)
      setAdminError(null)
      try {
        await setRoomLock({ roomId, locked, token })
        await refreshRooms()
      } catch (error) {
        setAdminError(error instanceof Error ? error.message : 'Lock update failed')
      } finally {
        setAdminLoading(false)
      }
    },
    [adminToken, refreshRooms],
  )

  useEffect(() => {
    if (!adminOpen) return
    void refreshRooms()
  }, [adminOpen, refreshRooms])

  useEffect(() => {
    if (!adminOpen) return
    if (!roomsAutoRefresh) return
    const interval = window.setInterval(() => {
      void refreshRooms()
    }, 5000)
    return () => window.clearInterval(interval)
  }, [adminOpen, roomsAutoRefresh, refreshRooms])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (!socketRef.current?.connected) return
      if (!canEdit) return

      const isUndo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z'
      const isRedo =
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === 'y' ||
          (event.shiftKey && event.key.toLowerCase() === 'z'))

      if (!isUndo && !isRedo) return
      event.preventDefault()
      if (drawingRef.current) return

      if (isRedo) {
        socketRef.current.emit('stroke:redo')
      } else {
        socketRef.current.emit('stroke:undo')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (!canEdit) return
      if (tool !== 'select') return
      if (event.key !== 'Backspace' && event.key !== 'Delete') return
      const id = selectedImageIdRef.current
      if (!id) return
      event.preventDefault()
      socketRef.current?.emit('image:remove', { id })
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit, tool])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.repeat) return

      const key = event.key.toLowerCase()
      if (key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (!canEdit) return
      if (key === 'p') {
        event.preventDefault()
        setTool('pen')
        return
      }
      if (key === 'e') {
        event.preventDefault()
        setTool('eraser')
        return
      }
      if (key === 'v') {
        event.preventDefault()
        setTool('select')
        return
      }
      if (key === '[' || key === ']') {
        event.preventDefault()
        const currentIndex = SIZES.indexOf(size)
        const safeIndex = currentIndex >= 0 ? currentIndex : 0
        const offset = key === '[' ? -1 : 1
        const nextIndex = Math.max(0, Math.min(SIZES.length - 1, safeIndex + offset))
        const nextSize = SIZES[nextIndex]
        if (nextSize !== size) {
          setSize(nextSize)
          setToast(`Brush size ${nextSize}px`)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit, size])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    const rect = canvas.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }

    if (tool === 'select') {
      const images = imagesRef.current
      for (let i = images.length - 1; i >= 0; i -= 1) {
        const img = images[i]
        if (!img) continue
        if (point.x < img.x || point.y < img.y) continue
        if (point.x > img.x + img.w || point.y > img.y + img.h) continue
        setSelectedImageId(img.id)
        imageDragRef.current = {
          id: img.id,
          start: point,
          origin: { x: img.x, y: img.y, w: img.w, h: img.h },
        }
        return
      }
      setSelectedImageId(null)
      imageDragRef.current = null
      return
    }

    const now = Date.now()
    const previousBatch = strokeBatchRef.current
    const canReuseBatch =
      previousBatch &&
      now - previousBatch.endedAt <= STROKE_BATCH_WINDOW_MS &&
      previousBatch.tool === (tool === 'eraser' ? 'eraser' : 'pen') &&
      previousBatch.color === color &&
      previousBatch.size === size
    const batchId = canReuseBatch ? previousBatch.id : createId('batch')
    const stroke: Stroke = {
      id: createId('stroke'),
      batchId,
      color,
      size,
      tool: tool === 'eraser' ? 'eraser' : 'pen',
      points: [point],
    }
    drawingRef.current = stroke
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    scheduleCursorEmit(point)

    if (tool === 'select' && imageDragRef.current) {
      const drag = imageDragRef.current
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y
      const index = imagesRef.current.findIndex((img) => img.id === drag.id)
      if (index < 0) return
      const current = imagesRef.current[index]
      if (!current) return
      const next = imagesRef.current.slice()
      next[index] = { ...current, x: drag.origin.x + dx, y: drag.origin.y + dy }
      imagesRef.current = next
      scheduleRender('base')
      return
    }

    if (!drawingRef.current) return
    if (drawingRef.current.points.length >= LIMITS.maxStrokePoints) return
    drawingRef.current.points.push(point)
    const ctx = visibleCtxRef.current ?? canvas.getContext('2d')
    if (ctx) drawStrokeSegment(ctx, drawingRef.current)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return
    if (tool === 'select') {
      event.currentTarget.releasePointerCapture(event.pointerId)
      const drag = imageDragRef.current
      imageDragRef.current = null
      if (drag) {
        const image = imagesRef.current.find((img) => img.id === drag.id)
        if (image) {
          socketRef.current?.emit('image:update', {
            id: image.id,
            x: image.x,
            y: image.y,
            w: image.w,
            h: image.h,
          })
        }
      }
      return
    }
    if (!drawingRef.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const stroke = drawingRef.current
    drawingRef.current = null
    strokeBatchRef.current = {
      id: stroke.batchId || createId('batch'),
      tool: stroke.tool,
      color: stroke.color,
      size: stroke.size,
      endedAt: Date.now(),
    }
    strokesRef.current = [...strokesRef.current, stroke].slice(-LIMITS.maxStrokes)
    const layers = layersRef.current
    if (layers) {
      drawStroke(layers.strokesCtx, stroke)
    }
    socketRef.current?.emit('stroke:add', stroke)
  }

  const handleClear = () => {
    if (!canEdit) return
    socketRef.current?.emit('board:clear')
  }

  const handleUndo = () => {
    if (!canEdit) return
    if (drawingRef.current) return
    socketRef.current?.emit('stroke:undo')
  }

  const handleRedo = () => {
    if (!canEdit) return
    if (drawingRef.current) return
    socketRef.current?.emit('stroke:redo')
  }

  const handleRoomLockToggle = () => {
    if (!canModerate) return
    socketRef.current?.emit(roomLocked ? 'room:unlock' : 'room:lock')
  }

  const canTogglePrivacy = !viewOnly && selfRole === 'owner'
  const canCreateInvites = !viewOnly && canModerate

  const handlePrivacyToggle = () => {
    if (!canTogglePrivacy) return
    socketRef.current?.emit('room:privacy', { private: !roomPrivate })
  }

  const handleCreateInvite = () => {
    if (!canCreateInvites) return
    const rotate = Boolean(inviteLink)
    socketRef.current?.emit('invite:create', { ttlMs: inviteTtlMs, rotate })
  }

  const handleRevokeInvites = () => {
    if (!canCreateInvites) return
    socketRef.current?.emit('invite:revoke')
  }

  const handleCopyInviteLink = async () => {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setToast('Invite link copied.')
    } catch {
      window.prompt('Copy this invite link', inviteLink)
    }
  }

  const handleKickUser = (userId: string, userName: string) => {
    if (!canModerate) return
    if (userId === selfId) return
    const ok = window.confirm(`Remove ${userName || 'this user'} from the room?`)
    if (!ok) return
    socketRef.current?.emit('room:kick', { userId })
  }

  const handleRoleToggleUser = (userId: string, role?: string) => {
    if (!canManageRoles) return
    if (userId === selfId) return
    const nextRole = role === 'mod' ? 'member' : 'mod'
    socketRef.current?.emit('role:set', { userId, role: nextRole })
  }

  const importImageFile = useCallback(
    async (file: File) => {
      if (!canEdit) return
      if (!file) return
      if (!IMAGE_LIMITS.allowedMime.includes(file.type)) {
        setToast('Unsupported image type (use PNG/JPEG/WebP).')
        return
      }
      if (file.size > IMAGE_LIMITS.maxBytes) {
        setToast(`Image too large (max ${Math.floor(IMAGE_LIMITS.maxBytes / 1024)}KB).`)
        return
      }
      if (!socketRef.current?.connected) {
        setToast('Offline: cannot send images.')
        return
      }

      let dataUrl = ''
      try {
        dataUrl = await readFileAsDataUrl(file)
      } catch {
        setToast('Failed to read image.')
        return
      }
      if (!dataUrl.startsWith('data:image/')) {
        setToast('Invalid image data.')
        return
      }

      const decoded = await decodeDataUrlImage(dataUrl)
      if (!decoded) {
        setToast('Failed to decode image.')
        return
      }

      const wrapper = wrapperRef.current
      if (!wrapper) return
      const rect = wrapper.getBoundingClientRect()

      const maxW = rect.width * 0.7
      const maxH = rect.height * 0.7
      const scale = Math.min(maxW / decoded.width, maxH / decoded.height, 1)
      const w = Math.max(8, decoded.width * scale)
      const h = Math.max(8, decoded.height * scale)
      const x = (rect.width - w) / 2
      const y = (rect.height - h) / 2

      const id = createId('img')
      pendingSelectImageIdRef.current = id
      socketRef.current.emit('image:add', { id, dataUrl, x, y, w, h })
      setToast('Image added.')
    },
    [canEdit],
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!canEdit) return
      if (isEditableTarget(event.target)) return
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (!item) continue
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        event.preventDefault()
        void importImageFile(file)
        break
      }
    }

    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canEdit, importImageFile])

  const handlePickImage = () => {
    if (!canEdit) return
    fileInputRef.current?.click()
  }

  const handleFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''
    if (!file) return
    await importImageFile(file)
  }

  const handleBoardDragOver = (event: React.DragEvent) => {
    if (!canEdit) return
    event.preventDefault()
  }

  const handleBoardDrop = (event: React.DragEvent) => {
    if (!canEdit) return
    event.preventDefault()
    const file = event.dataTransfer.files?.[0] ?? null
    if (!file) return
    void importImageFile(file)
  }

  const handleRemoveSelectedImage = () => {
    if (!canEdit) return
    const id = selectedImageIdRef.current
    if (!id) return
    socketRef.current?.emit('image:remove', { id })
  }

  const handleExport = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `sketchboard-${roomId}-${Date.now()}.png`
    link.click()
  }

  const handleExportSvg = () => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()

    const svg = strokesToSvg({
      strokes: strokesRef.current,
      images: imagesRef.current,
      width: rect.width,
      height: rect.height,
      background: BOARD_BACKGROUND,
    })

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `sketchboard-${roomId}-${Date.now()}.svg`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const handleJoinRoom = (event: React.FormEvent) => {
    event.preventDefault()
    const nextRoom = normalizeRoomId(roomInput)
    const url = viewOnly
      ? buildViewUrl(window.location.href, nextRoom)
      : buildRoomUrl(window.location.href, nextRoom)
    window.location.assign(url)
  }

  const handleCopyLink = async () => {
    const inviteFromUrl = getInviteFromUrl(window.location.href)
    const url = roomPrivate
      ? inviteLink ??
        (inviteFromUrl ? buildInviteUrl(window.location.href, roomId, inviteFromUrl) : null)
      : buildRoomUrl(window.location.href, roomId)
    if (!url) {
      if (canCreateInvites) {
        handleCreateInvite()
      } else {
        setToast('Invite-only room: ask a moderator for an invite link.')
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  const handleCopyViewLink = async () => {
    const url = buildViewUrl(window.location.href, roomId)
    try {
      await navigator.clipboard.writeText(url)
      setToast('View link copied.')
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  const handleToggleMode = () => {
    const current = new URL(window.location.href)
    const invite = current.searchParams.get('invite')
    const base = viewOnly
      ? buildRoomUrl(window.location.href, roomId)
      : buildViewUrl(window.location.href, roomId)
    const url = new URL(base)
    if (invite) {
      url.searchParams.set('invite', invite)
    }
    window.location.assign(url.toString())
  }

  const handleAccessSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!accessBlock) return

    if (accessBlock.kind === 'invite') {
      const token = extractInviteToken(accessInput)
      if (!token) {
        setAccessError('Paste a valid invite link or token.')
        return
      }
      setAccessError(null)
      try {
        const nextUrl = new URL(window.location.href)
        nextUrl.searchParams.set('invite', token)
        window.history.replaceState(null, '', nextUrl.toString())
      } catch {
        // ignore URL write failures
      }
      socket.auth = { ...(socket.auth as Record<string, unknown>), invite: token }
      socket.connect()
      setToast('Reconnecting...')
      setAccessBlock(null)
      return
    }

    const token = (accessInput || '').trim()
    if (!token) {
      setAccessError('Enter your access token.')
      return
    }
    setAccessError(null)
    saveLocalAuthToken(token)
    socket.auth = { ...(socket.auth as Record<string, unknown>), authToken: token }
    socket.connect()
    setToast('Reconnecting...')
    setAccessBlock(null)
  }

  const handleProfileCommit = () => {
    if (!canEdit) return
    profileDirtyRef.current = false
    socketRef.current?.emit('profile:update', {
      name: profileName,
      color: profileColor,
    })
    saveLocalProfile({ name: profileName, color: profileColor })
  }

  const handleProfileColor = (nextColor: string) => {
    if (!canEdit) return
    setProfileColor(nextColor)
    socketRef.current?.emit('profile:update', {
      name: profileName,
      color: nextColor,
    })
    saveLocalProfile({ name: profileName, color: nextColor })
  }

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault()
    if (!canEdit) return
    if (!chatInput.trim()) return
    socketRef.current?.emit('chat:message', {
      id: createId('msg'),
      text: chatInput,
    })
    setChatInput('')
  }

  const handleMessagesScroll = () => {
    const element = messagesListRef.current
    if (!element) return
    const nextAtBottom = isNearBottom(element)
    setChatAtBottom(nextAtBottom)
    if (nextAtBottom) {
      setUnreadMessages(0)
    }
  }

  const handleJumpToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setChatAtBottom(true)
    setUnreadMessages(0)
  }

  const handleReact = (messageId: string, reaction: string) => {
    if (!canEdit) return
    socketRef.current?.emit('chat:react', { id: messageId, reaction })
  }

  const handlePin = (messageId: string) => {
    if (!canModerate) return
    socketRef.current?.emit('chat:pin', { id: messageId })
  }

  const handleCopyMessage = async (text: string) => {
    const value = String(text || '')
    if (!value.trim()) return
    try {
      await navigator.clipboard.writeText(value)
      setToast('Message copied.')
    } catch {
      window.prompt('Copy this message', value)
    }
  }

  return (
    <div className="app-shell">
      {accessBlock ? (
        <div
          className="access-overlay"
          onMouseDown={() => {
            setAccessBlock(null)
            setAccessError(null)
          }}
          role="presentation"
        >
          <div
            className="access-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Access required"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>Access required</h2>
            <p className="muted">
              {accessBlock.kind === 'invite'
                ? 'This room is invite-only. Paste an invite link or token to join.'
                : 'This server requires an access token. Paste it to connect.'}
            </p>
            <form onSubmit={handleAccessSubmit} className="access-form">
              <input
                value={accessInput}
                onChange={(event) => setAccessInput(event.target.value)}
                placeholder={accessBlock.kind === 'invite' ? 'Invite link or token' : 'Access token'}
                aria-label={accessBlock.kind === 'invite' ? 'Invite link or token' : 'Access token'}
                autoFocus
              />
              <button type="submit">Connect</button>
            </form>
            {accessError ? <p className="access-error">{accessError}</p> : null}
            <p className="muted">{accessBlock.message}</p>
          </div>
        </div>
      ) : null}
      <header className="top-bar">
        <div>
          <p className="brand">Sketchboard Chat</p>
          <p className="sub">Realtime sketch + chat + presence</p>
        </div>
        <div className="status">
          <span className={connected ? 'dot on' : 'dot off'} />
          {connected ? 'Live' : 'Offline'}
        </div>
      </header>

      <div className="layout">
        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}
        <section className="board">
          <div className="toolbar">
            {viewOnly ? (
              <div className="mode-pill" aria-label="View only">
                View only
              </div>
            ) : null}
            {roomLocked ? (
              <div className="mode-pill warning" aria-label="Room locked">
                Locked
              </div>
            ) : null}
            {roomPrivate ? (
              <div className="mode-pill privacy" aria-label="Invite-only room">
                Invite-only
              </div>
            ) : null}
            <div className="tool-group">
              <button type="button" onClick={() => setSettingsOpen(true)}>
                Room settings
              </button>
            </div>
            <div className="tool-group">
              <button
                className={tool === 'pen' ? 'active' : ''}
                onClick={() => setTool('pen')}
                disabled={!canEdit}
              >
                Pen
              </button>
              <button
                className={tool === 'eraser' ? 'active' : ''}
                onClick={() => setTool('eraser')}
                disabled={!canEdit}
              >
                Eraser
              </button>
              <button
                className={tool === 'select' ? 'active' : ''}
                onClick={() => setTool('select')}
                disabled={!canEdit}
                title="Select/move images"
              >
                Select
              </button>
            </div>
            <div className="tool-group">
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  className={`swatch ${color === swatch ? 'active' : ''}`}
                  style={{ background: swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Color ${swatch}`}
                  disabled={!canEdit}
                />
              ))}
            </div>
            <div className="tool-group">
              {SIZES.map((value) => (
                <button
                  key={value}
                  className={size === value ? 'active' : ''}
                  onClick={() => setSize(value)}
                  disabled={!canEdit}
                >
                  {value}px
                </button>
              ))}
            </div>
            <div className="tool-group actions">
              <button onClick={handleUndo} title="Undo (⌘/Ctrl+Z)" disabled={!canEdit}>
                Undo
              </button>
              <button onClick={handleRedo} title="Redo (⇧⌘Z / Ctrl+Y)" disabled={!canEdit}>
                Redo
              </button>
              <button onClick={handleClear} disabled={!canEdit}>
                Clear
              </button>
              <button onClick={handlePickImage} disabled={!canEdit} title="Add image (or paste/drag/drop)">
                Image
              </button>
              <button onClick={handleRemoveSelectedImage} disabled={!canEdit || !selectedImageId}>
                Delete image
              </button>
              <button onClick={handleExport}>Export PNG</button>
              <button onClick={handleExportSvg}>Export SVG</button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_LIMITS.allowedMime.join(',')}
            style={{ display: 'none' }}
            onChange={handleFilePicked}
          />

          <div className="board-stage" ref={wrapperRef} onDragOver={handleBoardDragOver} onDrop={handleBoardDrop}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <div className="presence-layer">
              {users
                .filter((user) => user.id !== selfId)
                .map((user) => (
                  <div
                    key={user.id}
                    className="cursor"
                    style={{
                      transform: `translate(${user.cursor.x}px, ${user.cursor.y}px)`,
                      borderColor: user.color,
                    }}
                  >
                    <span style={{ background: user.color }}>{user.name}</span>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <div className="panel-block room-mini">
            <div className="room-mini-header">
              <h3>Room</h3>
              <button type="button" className="room-mini-action" onClick={() => setSettingsOpen(true)}>
                Settings
              </button>
            </div>
            <p className="room-mini-id">{roomId}</p>
            <p className="muted">
              {viewOnly ? 'View-only mode' : roomLocked ? 'Locked (no edits)' : 'Edit mode'}
              {roomPrivate ? ' · Invite-only' : ''}
            </p>
          </div>
          <div className="panel-block profile">
            <h3>Profile</h3>
            <div className="profile-field">
              <label htmlFor="profile-name" className="muted">
                Display name
              </label>
              <input
                id="profile-name"
                value={profileName}
                onChange={(event) => {
                  profileDirtyRef.current = true
                  setProfileName(event.target.value)
                }}
                onBlur={handleProfileCommit}
                placeholder="Your name"
                disabled={!canEdit}
              />
            </div>
            <div className="profile-colors">
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={profileColor === swatch ? 'swatch active' : 'swatch'}
                  style={{ background: swatch }}
                  onClick={() => handleProfileColor(swatch)}
                  aria-label={`Profile color ${swatch}`}
                  disabled={!canEdit}
                />
              ))}
            </div>
          </div>
          <div className="panel-block admin">
            <div className="admin-header">
              <h3>Rooms</h3>
              <button type="button" onClick={() => setAdminOpen((value) => !value)}>
                {adminOpen ? 'Hide' : 'Show'}
              </button>
            </div>
            {adminOpen ? (
              <div className="admin-body">
                <div className="admin-controls">
                  <input
                    value={adminToken}
                    onChange={(event) => setAdminToken(event.target.value)}
                    placeholder="Admin token (optional)"
                    aria-label="Admin token"
                  />
                  <input
                    value={roomsFilter}
                    onChange={(event) => setRoomsFilter(event.target.value)}
                    placeholder="Filter rooms…"
                    aria-label="Filter rooms"
                  />
                  <button type="button" onClick={refreshRooms} disabled={adminLoading}>
                    {adminLoading ? 'Loading…' : 'Refresh'}
                  </button>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={roomsAutoRefresh}
                    onChange={(event) => setRoomsAutoRefresh(event.target.checked)}
                  />
                  Auto refresh
                </label>
                <div className="rooms-quick-filters" aria-label="Room quick filters">
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={roomsOnlyLocked}
                      onChange={(event) => setRoomsOnlyLocked(event.target.checked)}
                    />
                    Locked only
                  </label>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={roomsOnlyInviteOnly}
                      onChange={(event) => setRoomsOnlyInviteOnly(event.target.checked)}
                    />
                    Invite-only only
                  </label>
                </div>
                {adminError ? <p className="muted">{adminError}</p> : null}
                <ul className="rooms-list">
                  {roomsMetrics
                    .filter((room) =>
                      roomsFilter.trim()
                        ? room.roomId.toLowerCase().includes(roomsFilter.trim().toLowerCase())
                        : true,
                    )
                    .filter((room) => (!roomsOnlyLocked ? true : Boolean(room.locked)))
                    .filter((room) => (!roomsOnlyInviteOnly ? true : Boolean(room.private)))
                    .map((room) => (
                      <li key={room.roomId}>
                        <button
                          type="button"
                          className={room.roomId === roomId ? 'room-link active' : 'room-link'}
                          onClick={() => {
                            const url = viewOnly
                              ? buildViewUrl(window.location.href, room.roomId)
                              : buildRoomUrl(window.location.href, room.roomId)
                            window.location.assign(url)
                          }}
                        >
                          <span className="room-line">
                            <span className="room-name">{room.roomId}</span>
                            <span className="room-badges" aria-label="Room badges">
                              {room.locked ? (
                                <span className="room-badge locked">Locked</span>
                              ) : null}
                              {room.private ? (
                                <span className="room-badge private">Invite-only</span>
                              ) : null}
                            </span>
                          </span>
                          <span className="room-meta">
                            {room.usersCount} users · {room.strokesCount} strokes ·{' '}
                            {room.imagesCount ?? 0} imgs ({formatBytes(room.imagesBytes)}) ·{' '}
                            {room.messagesCount} msgs · state ~{formatBytes(room.stateBytesEstimate)}
                          </span>
                        </button>
                        {adminToken.trim() ? (
                          <div className="room-admin-actions">
                            <button
                              type="button"
                              className="lock-toggle"
                              onClick={() => handleLockToggle(room.roomId, !room.locked)}
                              disabled={adminLoading}
                            >
                              {room.locked ? 'Unlock' : 'Lock'}
                            </button>
                          </div>
                        ) : null}
                        {room.users && room.users.length > 0 ? (
                          <ul className="room-users" aria-label={`Users in ${room.roomId}`}>
                            {room.users.map((user) => (
                              <li key={user.id} className="room-user">
                                <span
                                  className="badge"
                                  style={{ background: user.color }}
                                  aria-hidden="true"
                                />
                                <span className="room-user-name">{user.name}</span>
                                {user.role ? (
                                  <span className="room-user-role">{user.role}</span>
                                ) : null}
                                <button
                                  type="button"
                                  className="kick"
                                  onClick={() => handleKick(room.roomId, user.id, user.name)}
                                  disabled={adminLoading}
                                >
                                  Kick
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  {roomsMetrics.length === 0 && !adminLoading ? (
                    <li className="muted">No active rooms.</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
          <div className="panel-block chat">
            <h3>Chat</h3>
            <input
              className="chat-filter"
              value={chatFilter}
              onChange={(event) => setChatFilter(event.target.value)}
              placeholder="Search messages..."
              aria-label="Search chat messages"
            />
            {pinnedMessage ? (
              <div className="pinned">
                <div className="pinned-meta">
                  <span className="pinned-label">Pinned</span>
                  <div className="pinned-author">
                    <span className="badge" style={{ background: pinnedMessage.userColor }} />
                    <span>{pinnedMessage.userName}</span>
                  </div>
                  <span className="muted">{formatTime(pinnedMessage.createdAt)}</span>
                </div>
                <p>{pinnedMessage.text}</p>
                {canModerate ? (
                  <button type="button" className="pin-toggle" onClick={() => handlePin(pinnedMessage.id)}>
                    Unpin
                  </button>
                ) : null}
              </div>
            ) : null}
            {unreadMessages > 0 && !chatAtBottom ? (
              <button type="button" className="chat-jump" onClick={handleJumpToLatest}>
                Jump to latest ({unreadMessages})
              </button>
            ) : null}
            <div className="messages" ref={messagesListRef} onScroll={handleMessagesScroll}>
              {filteredMessages.map((message) => (
                <div key={message.id} className="message">
                  <div className="bubble">
                    <p className="meta">
                      <span
                        className="badge"
                        style={{ background: message.userColor }}
                      />
                      {message.userName}
                      {message.id === pinnedId ? <span className="pin-badge">Pinned</span> : null}
                    </p>
                    <p>{message.text}</p>
                    <div className="message-actions">
                      <div className="reactions">
                        {REACTIONS.map((emoji) => {
                          const list = message.reactions?.[emoji] ?? []
                          const count = list.length
                          const active = list.includes(selfId)
                          return (
                            <button
                              key={`${message.id}-${emoji}`}
                              type="button"
                              className={active ? 'reaction active' : 'reaction'}
                              onClick={() => handleReact(message.id, emoji)}
                              aria-pressed={active}
                              disabled={!canEdit}
                            >
                              <span>{emoji}</span>
                              {count > 0 ? <span>{count}</span> : null}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        className="message-copy"
                        onClick={() => void handleCopyMessage(message.text)}
                      >
                        Copy
                      </button>
                      {canModerate ? (
                        <button
                          type="button"
                          className="pin-toggle"
                          onClick={() => handlePin(message.id)}
                        >
                          {message.id === pinnedId ? 'Unpin' : 'Pin'}
                        </button>
                      ) : null}
                    </div>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                </div>
              ))}
              {filteredMessages.length === 0 ? (
                <p className="muted">No messages match this search.</p>
              ) : null}
              <div ref={messagesEndRef} />
            </div>
            <form onSubmit={handleSend}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Say something..."
                disabled={!canEdit}
              />
              <button type="submit" disabled={!canEdit}>
                Send
              </button>
            </form>
          </div>
        </aside>
      </div>

      <RoomSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        roomId={roomId}
        roomInput={roomInput}
        onRoomInputChange={(next) => setRoomInput(next)}
        onJoinRoom={handleJoinRoom}
        recentRooms={recentRooms}
        onJoinRecentRoom={(value) => {
          const url = viewOnly
            ? buildViewUrl(window.location.href, value)
            : buildRoomUrl(window.location.href, value)
          window.location.assign(url)
        }}
        copyStatus={copyStatus}
        onCopyLink={handleCopyLink}
        onCopyViewLink={handleCopyViewLink}
        viewOnly={viewOnly}
        onToggleMode={handleToggleMode}
        roomLocked={roomLocked}
        roomPrivate={roomPrivate}
        canTogglePrivacy={canTogglePrivacy}
        onPrivacyToggle={handlePrivacyToggle}
        canCreateInvites={canCreateInvites}
        onCreateInvite={handleCreateInvite}
        inviteTtlMs={inviteTtlMs}
        onInviteTtlMs={(next) => setInviteTtlMs(next)}
        onRevokeInvites={handleRevokeInvites}
        inviteLink={inviteLink}
        inviteExpiresAt={inviteExpiresAt}
        onCopyInviteLink={handleCopyInviteLink}
        canModerate={canModerate}
        canManageRoles={canManageRoles}
        users={users}
        selfId={selfId}
        selfRole={selfRole}
        recentAudit={recentAudit}
        onRoomLockToggle={handleRoomLockToggle}
        onRoleToggleUser={handleRoleToggleUser}
        onKickUser={handleKickUser}
      />
    </div>
  )
}

export default App
