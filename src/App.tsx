import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import {
  buildRoomUrl,
  buildViewUrl,
  getRoomIdFromUrl,
  isViewOnlyFromUrl,
  normalizeRoomId,
} from './room'
import { addRecentRoom, readRecentRooms } from './recentRooms'
import { strokesToSvg } from './svg'
import { createId, formatTime } from './utils'
import { fetchRoomsMetrics, kickUser, setRoomLock, type RoomMetrics } from './adminRooms'
import { getUserKey } from './userKey'

type Point = { x: number; y: number }

type Stroke = {
  id: string
  color: string
  size: number
  tool: 'pen' | 'eraser'
  points: Point[]
  userId?: string
  userName?: string
  userColor?: string
}

type ChatMessage = {
  id: string
  text: string
  userId: string
  userName: string
  userColor: string
  createdAt: string
}

type AuditEntry = {
  id: string
  at: string
  text: string
  kind?: 'lock' | 'unlock' | 'kick' | 'role' | 'owner'
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
      scope: 'chat' | 'stroke' | 'clear' | 'profile'
      retryAfterMs: number
    }
  | {
      kind: 'info'
      message: string
    }

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#f15bb5']
const SIZES = [2, 4, 6, 10]

const LIMITS = {
  maxStrokePoints: 2000,
  maxMessages: 200,
  maxStrokes: 1000,
}

function isEditableTarget(target: EventTarget | null) {
  if (!target) return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName.toLowerCase()
  return tag === 'input' || tag === 'textarea' || target.isContentEditable
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

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  if (stroke.points.length < 2) return
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = stroke.tool === 'eraser' ? '#0b0b13' : stroke.color
  ctx.lineWidth = stroke.size
  ctx.beginPath()
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y)
  stroke.points.slice(1).forEach((point) => {
    ctx.lineTo(point.x, point.y)
  })
  ctx.stroke()
  ctx.restore()
}

function drawAll(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.fillStyle = '#0b0b13'
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  strokes.forEach((stroke) => drawStroke(ctx, stroke))
}

function App() {
  const initialRoomId = useMemo(() => getRoomIdFromUrl(window.location.href), [])
  const initialViewOnly = useMemo(() => isViewOnlyFromUrl(window.location.href), [])
  const userKey = useMemo(() => getUserKey(), [])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)
  const cursorRafRef = useRef<number | null>(null)
  const pendingCursorRef = useRef<Point | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  const [connected, setConnected] = useState(false)
  const [selfId, setSelfId] = useState('')
  const [roomId, setRoomId] = useState(initialRoomId)
  const [viewOnly, setViewOnly] = useState(initialViewOnly)
  const [roomLocked, setRoomLocked] = useState(false)
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [chatInput, setChatInput] = useState('')
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

  const selfRole = useMemo(
    () => users.find((user) => user.id === selfId)?.role ?? 'member',
    [users, selfId],
  )
  const canModerate = !viewOnly && (selfRole === 'owner' || selfRole === 'mod')
  const canManageRoles = !viewOnly && selfRole === 'owner'
  const canEdit = !viewOnly && !roomLocked
  const recentAudit = useMemo(() => auditEntries.slice(-8).reverse(), [auditEntries])

  const socket = useMemo(() => {
    return io(getSocketUrl(), {
      autoConnect: true,
      auth: { room: initialRoomId, mode: initialViewOnly ? 'view' : 'edit', userKey },
    })
  }, [initialRoomId, initialViewOnly, userKey])

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const ratio = window.devicePixelRatio || 1
    canvas.width = rect.width * ratio
    canvas.height = rect.height * ratio
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    drawAll(ctx, strokesRef.current)
  }, [])

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
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('init', (payload) => {
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
      setUsers(payload.users)
      if (Array.isArray(payload.audit)) {
        setAuditEntries(payload.audit)
      }
      const me = payload.users?.find?.((user: PresenceUser) => user.id === payload.selfId)
      if (me) {
        setProfileName(me.name)
        setProfileColor(me.color)
        profileDirtyRef.current = false
      }
      setMessages(payload.messages.slice(-LIMITS.maxMessages))
      strokesRef.current = payload.strokes.slice(-LIMITS.maxStrokes)
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawAll(ctx, payload.strokes)
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
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawStroke(ctx, stroke)
    })

    socket.on('stroke:remove', (payload: { id: string }) => {
      const id = payload?.id
      if (!id) return
      const next = strokesRef.current.filter((stroke) => stroke.id !== id)
      if (next.length === strokesRef.current.length) return
      strokesRef.current = next
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawAll(ctx, next)
    })

    socket.on('board:clear', () => {
      strokesRef.current = []
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawAll(ctx, [])
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

    socket.on('room:audit', (payload: { entries?: AuditEntry[] }) => {
      if (Array.isArray(payload?.entries)) {
        setAuditEntries(payload.entries)
      }
    })

    socket.on('chat:message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message].slice(-LIMITS.maxMessages))
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
                : 'Profile'
        setToast(`${label} is rate limited — try again in ${Math.ceil(notice.retryAfterMs / 1000)}s.`)
        return
      }
      if (notice.kind === 'info') {
        setToast(notice.message)
      }
    })

    return () => {
      if (cursorRafRef.current !== null) {
        window.cancelAnimationFrame(cursorRafRef.current)
        cursorRafRef.current = null
      }
      socket.disconnect()
    }
  }, [socket, cursorRafRef])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 1600)
    return () => window.clearTimeout(timeout)
  }, [toast])

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

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    const rect = canvas.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const stroke: Stroke = {
      id: createId('stroke'),
      color,
      size,
      tool,
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

    if (!drawingRef.current) return
    if (drawingRef.current.points.length >= LIMITS.maxStrokePoints) return
    drawingRef.current.points.push(point)
    const ctx = canvas.getContext('2d')
    if (ctx) drawStroke(ctx, drawingRef.current)
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEdit) return
    if (!drawingRef.current) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    const stroke = drawingRef.current
    drawingRef.current = null
    strokesRef.current = [...strokesRef.current, stroke].slice(-LIMITS.maxStrokes)
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
      width: rect.width,
      height: rect.height,
      background: '#0b0b13',
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
    const url = buildRoomUrl(window.location.href, roomId)
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
    const url = viewOnly
      ? buildRoomUrl(window.location.href, roomId)
      : buildViewUrl(window.location.href, roomId)
    window.location.assign(url)
  }

  const handleProfileCommit = () => {
    if (!canEdit) return
    profileDirtyRef.current = false
    socketRef.current?.emit('profile:update', {
      name: profileName,
      color: profileColor,
    })
  }

  const handleProfileColor = (nextColor: string) => {
    if (!canEdit) return
    setProfileColor(nextColor)
    socketRef.current?.emit('profile:update', {
      name: profileName,
      color: nextColor,
    })
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

  return (
    <div className="app-shell">
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
              {canModerate ? (
                <button onClick={handleRoomLockToggle}>
                  {roomLocked ? 'Unlock room' : 'Lock room'}
                </button>
              ) : null}
              <button onClick={handleExport}>Export PNG</button>
              <button onClick={handleExportSvg}>Export SVG</button>
            </div>
          </div>

          <div className="board-stage" ref={wrapperRef}>
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
          <div className="panel-block room">
            <h3>Room</h3>
            <form onSubmit={handleJoinRoom}>
              <input
                value={roomInput}
                onChange={(event) => setRoomInput(event.target.value)}
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
                    onClick={() => {
                      const url = buildRoomUrl(window.location.href, value)
                      window.location.assign(url)
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="room-actions">
              <button type="button" onClick={handleCopyLink}>
                {copyStatus === 'copied' ? 'Copied' : 'Copy link'}
              </button>
              <button type="button" onClick={handleCopyViewLink}>
                Copy view link
              </button>
              <p className="muted">Current: {roomId}</p>
            </div>
            <div className="room-actions">
              <button type="button" onClick={handleToggleMode}>
                {viewOnly ? 'Switch to edit' : 'Switch to view'}
              </button>
              <p className="muted">{viewOnly ? 'Read-only mode' : 'Edit mode'}</p>
            </div>
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
                {adminError ? <p className="muted">{adminError}</p> : null}
                <ul className="rooms-list">
                  {roomsMetrics
                    .filter((room) =>
                      roomsFilter.trim()
                        ? room.roomId.toLowerCase().includes(roomsFilter.trim().toLowerCase())
                        : true,
                    )
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
                        <span className="room-name">{room.roomId}</span>
                        <span className="room-meta">
                          {room.usersCount} users · {room.strokesCount} strokes ·{' '}
                          {room.messagesCount} msgs
                        </span>
                        <span className="room-meta">
                          {room.locked ? 'Locked' : 'Unlocked'}
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
          <div className="panel-block">
            <h3>Active crew</h3>
            <ul>
              {users.map((user) => (
                <li key={user.id}>
                  <span className="avatar" style={{ background: user.color }} />
                  <div>
                    <p>{user.name}</p>
                    <p className="muted">
                      {user.id === selfId ? 'You' : 'Guest'}
                      {user.role && user.role !== 'member' ? ` · ${user.role}` : ''}
                    </p>
                  </div>
                  {canManageRoles && user.id !== selfId && user.role !== 'owner' ? (
                    <button
                      type="button"
                      className="role-toggle"
                      onClick={() => handleRoleToggleUser(user.id, user.role)}
                    >
                      {user.role === 'mod' ? 'Remove mod' : 'Make mod'}
                    </button>
                  ) : null}
                  {canModerate && user.id !== selfId && (selfRole === 'owner' || user.role !== 'owner') ? (
                    <button
                      type="button"
                      className="kick"
                      onClick={() => handleKickUser(user.id, user.name)}
                    >
                      Kick
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
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
          <div className="panel-block chat">
            <h3>Chat</h3>
            <div className="messages">
              {messages.map((message) => (
                <div key={message.id} className="message">
                  <div className="bubble">
                    <p className="meta">
                      <span
                        className="badge"
                        style={{ background: message.userColor }}
                      />
                      {message.userName}
                    </p>
                    <p>{message.text}</p>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                </div>
              ))}
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
    </div>
  )
}

export default App
