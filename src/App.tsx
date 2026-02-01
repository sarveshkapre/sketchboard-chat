import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import './App.css'
import { createId, formatTime } from './utils'

type Point = { x: number; y: number }

type Stroke = {
  id: string
  color: string
  size: number
  tool: 'pen' | 'eraser'
  points: Point[]
}

type ChatMessage = {
  id: string
  text: string
  userId: string
  createdAt: string
}

type PresenceUser = {
  id: string
  name: string
  color: string
  cursor: Point
  active: boolean
}

const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#f15bb5']
const SIZES = [2, 4, 6, 10]

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const drawingRef = useRef<Stroke | null>(null)

  const [connected, setConnected] = useState(false)
  const [selfId, setSelfId] = useState('')
  const [users, setUsers] = useState<PresenceUser[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [color, setColor] = useState(COLORS[0])
  const [size, setSize] = useState(SIZES[1])
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [chatInput, setChatInput] = useState('')

  const socket = useMemo(() => io(getSocketUrl(), { autoConnect: true }), [])

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

  const emitCursor = useCallback(
    (point: Point) => {
      socketRef.current?.emit('presence:cursor', point)
    },
    [socketRef],
  )

  useEffect(() => {
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('init', (payload) => {
      setSelfId(payload.selfId)
      setUsers(payload.users)
      setMessages(payload.messages)
      strokesRef.current = payload.strokes
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawAll(ctx, payload.strokes)
    })

    socket.on('presence:update', (nextUsers) => {
      setUsers(nextUsers)
    })

    socket.on('stroke:add', (stroke: Stroke) => {
      strokesRef.current = [...strokesRef.current, stroke]
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawStroke(ctx, stroke)
    })

    socket.on('board:clear', () => {
      strokesRef.current = []
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) drawAll(ctx, [])
    })

    socket.on('chat:message', (message: ChatMessage) => {
      setMessages((prev) => [...prev, message])
    })

    return () => {
      socket.disconnect()
    }
  }, [socket])

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [resizeCanvas])

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
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
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    emitCursor(point)

    if (!drawingRef.current) return
    drawingRef.current.points.push(point)
    const ctx = canvas.getContext('2d')
    if (ctx) drawStroke(ctx, drawingRef.current)
  }

  const handlePointerUp = () => {
    if (!drawingRef.current) return
    const stroke = drawingRef.current
    drawingRef.current = null
    strokesRef.current = [...strokesRef.current, stroke]
    socketRef.current?.emit('stroke:add', stroke)
  }

  const handleClear = () => {
    socketRef.current?.emit('board:clear')
  }

  const handleExport = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = `sketchboard-${Date.now()}.png`
    link.click()
  }

  const handleSend = (event: React.FormEvent) => {
    event.preventDefault()
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
        <section className="board">
          <div className="toolbar">
            <div className="tool-group">
              <button
                className={tool === 'pen' ? 'active' : ''}
                onClick={() => setTool('pen')}
              >
                Pen
              </button>
              <button
                className={tool === 'eraser' ? 'active' : ''}
                onClick={() => setTool('eraser')}
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
                />
              ))}
            </div>
            <div className="tool-group">
              {SIZES.map((value) => (
                <button
                  key={value}
                  className={size === value ? 'active' : ''}
                  onClick={() => setSize(value)}
                >
                  {value}px
                </button>
              ))}
            </div>
            <div className="tool-group actions">
              <button onClick={handleClear}>Clear</button>
              <button onClick={handleExport}>Export PNG</button>
            </div>
          </div>

          <div className="board-stage" ref={wrapperRef}>
            <canvas
              ref={canvasRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
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
          <div className="panel-block">
            <h3>Active crew</h3>
            <ul>
              {users.map((user) => (
                <li key={user.id}>
                  <span className="avatar" style={{ background: user.color }} />
                  <div>
                    <p>{user.name}</p>
                    <p className="muted">{user.id === selfId ? 'You' : 'Guest'}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel-block chat">
            <h3>Chat</h3>
            <div className="messages">
              {messages.map((message) => (
                <div key={message.id} className="message">
                  <div className="bubble">
                    <p>{message.text}</p>
                    <span>{formatTime(message.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend}>
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Say something..."
              />
              <button type="submit">Send</button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
