type Point = { x: number; y: number }

type Stroke = {
  id: string
  color: string
  size: number
  tool: 'pen' | 'eraser'
  points: Point[]
}

type BoardImage = {
  id: string
  dataUrl: string
  x: number
  y: number
  w: number
  h: number
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function strokeToPath(stroke: Stroke) {
  if (!stroke.points || stroke.points.length < 2) return null
  const [first, ...rest] = stroke.points
  const parts = [`M ${round2(first.x)} ${round2(first.y)}`]
  for (const point of rest) {
    parts.push(`L ${round2(point.x)} ${round2(point.y)}`)
  }
  return parts.join(' ')
}

export function strokesToSvg(options: {
  strokes: Stroke[]
  images?: BoardImage[]
  width: number
  height: number
  background: string
}) {
  const width = Number.isFinite(options.width) && options.width > 0 ? options.width : 800
  const height =
    Number.isFinite(options.height) && options.height > 0 ? options.height : 600
  const background = options.background || '#0b0b13'

  const images = (options.images || [])
    .filter((img) => img && typeof img.dataUrl === 'string')
    .map((img) => {
      const x = Number.isFinite(img.x) ? img.x : 0
      const y = Number.isFinite(img.y) ? img.y : 0
      const w = Number.isFinite(img.w) ? Math.max(1, img.w) : 1
      const h = Number.isFinite(img.h) ? Math.max(1, img.h) : 1
      return `<image href="${escapeXml(img.dataUrl)}" x="${round2(x)}" y="${round2(
        y,
      )}" width="${round2(w)}" height="${round2(h)}" />`
    })
    .join('\n')

  const paths = options.strokes
    .map((stroke) => {
      const d = strokeToPath(stroke)
      if (!d) return null
      const color = stroke.tool === 'eraser' ? background : stroke.color
      const size = Number.isFinite(stroke.size) ? Math.max(1, Math.min(50, stroke.size)) : 4
      return `<path d="${escapeXml(d)}" fill="none" stroke="${escapeXml(
        color,
      )}" stroke-width="${size}" stroke-linecap="round" stroke-linejoin="round" />`
    })
    .filter(Boolean)
    .join('\n')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(background)}" />`,
    images,
    paths,
    '</svg>',
    '',
  ].join('\n')
}
