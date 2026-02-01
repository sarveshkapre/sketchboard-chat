import { describe, expect, it } from 'vitest'

import { strokesToSvg } from '../src/svg'

describe('svg export', () => {
  it('renders a valid svg wrapper', () => {
    const svg = strokesToSvg({
      strokes: [],
      width: 320,
      height: 200,
      background: '#000',
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0 320 200"')
    expect(svg).toContain('<rect')
  })

  it('renders paths and supports eraser strokes', () => {
    const svg = strokesToSvg({
      strokes: [
        {
          id: 's1',
          tool: 'pen',
          color: '#fff',
          size: 4,
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ],
        },
        {
          id: 's2',
          tool: 'eraser',
          color: '#f00',
          size: 6,
          points: [
            { x: 10, y: 10 },
            { x: 20, y: 20 },
          ],
        },
      ],
      width: 100,
      height: 100,
      background: '#0b0b13',
    })

    expect(svg).toContain('<path')
    expect(svg).toContain('stroke="#fff"')
    expect(svg).toContain('stroke="#0b0b13"')
    expect(svg).toContain('stroke-width="6"')
  })
})

