import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { User } from '../../types'

interface Props {
  users: User[]
  avatarStyles: string[]
  onSelect: (id: string) => void
}

// Honeycomb geometry constants
const COL_W = 100                             // horizontal gap between node centers
const ROW_H = Math.round(COL_W * Math.sqrt(3) / 2)  // = 87 — equidistant hex spacing
const R = 28       // avatar circle radius (w-14 = 56px)
const EDGE_THRESHOLD = 102  // max distance to draw a connecting edge

// Build a balanced row plan for any user count.
// Alternates narrow (3) and wide (4) rows; last row takes whatever remains — always centered.
function buildRowPlan(count: number): number[] {
  if (count <= 0) return []
  const rows: number[] = []
  let remaining = count
  let narrow = true
  while (remaining > 0) {
    const size = Math.min(narrow ? 3 : 4, remaining)
    rows.push(size)
    remaining -= size
    narrow = !narrow
  }
  return rows
}

interface NodeData {
  x: number
  y: number
  user: User
  idx: number
}

function buildNodes(users: User[]): NodeData[] {
  const nodes: NodeData[] = []
  const rowPlan = buildRowPlan(users.length)
  let ui = 0
  for (let r = 0; r < rowPlan.length && ui < users.length; r++) {
    const count = rowPlan[r]
    const y = r * ROW_H
    for (let c = 0; c < count && ui < users.length; c++) {
      // (c - (count-1)/2) centers each row; alternating counts create the hex offset
      const x = (c - (count - 1) / 2) * COL_W
      nodes.push({ x, y, user: users[ui], idx: ui })
      ui++
    }
  }
  return nodes
}

function buildEdges(nodes: NodeData[]): [number, number][] {
  const edges: [number, number][] = []
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x
      const dy = nodes[i].y - nodes[j].y
      if (Math.sqrt(dx * dx + dy * dy) <= EDGE_THRESHOLD) {
        edges.push([i, j])
      }
    }
  }
  return edges
}

export function HoneycombGrid({ users, avatarStyles, onSelect }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [scale, setScale] = useState(1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodes = buildNodes(users)
  const edges = buildEdges(nodes)

  // Compute SVG bounds with padding
  const pad = 14
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const minX = Math.min(...xs) - R - pad
  const maxX = Math.max(...xs) + R + pad
  const minY = Math.min(...ys) - R - pad
  const maxY = Math.max(...ys) + R + pad + 24 // extra for name text
  const W = maxX - minX
  const H = maxY - minY
  const ox = -minX // logical → SVG coordinate offset
  const oy = -minY

  // Scale down to fit container — re-fires on orientation change / resize
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const update = (width: number) => setScale(width < W ? width / W : 1)
    update(el.offsetWidth)
    const ro = new ResizeObserver(([entry]) => update(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [W])

  return (
    // Outer div fills available width and sets the scaled height; overflow-hidden prevents scroll-track line on mobile
    <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: H * scale }}>
    <div className="relative origin-top-left mx-auto" style={{ width: W, height: H, transform: `scale(${scale})` }}>
      {/* ── Network SVG ─────────────────────────────── */}
      <svg
        width={W}
        height={H}
        className="absolute inset-0 pointer-events-none"
      >
        <defs>
          {/* Edge paths for animateMotion */}
          {edges.map(([i, j], ei) => (
            <path
              key={ei}
              id={`ep-${ei}`}
              d={`M ${nodes[i].x + ox} ${nodes[i].y + oy} L ${nodes[j].x + ox} ${nodes[j].y + oy}`}
            />
          ))}
        </defs>

        {/* ── Edges ── */}
        {edges.map(([i, j], ei) => {
          const lit = hoveredIdx === i || hoveredIdx === j
          return (
            <line
              key={ei}
              x1={nodes[i].x + ox}
              y1={nodes[i].y + oy}
              x2={nodes[j].x + ox}
              y2={nodes[j].y + oy}
              stroke="rgb(var(--primary))"
              strokeWidth={lit ? 1.5 : 1}
              strokeOpacity={lit ? 0.7 : 0.3}
              strokeDasharray="5 7"
              style={{
                animation: `flowDash ${1.8 + (ei % 5) * 0.35}s linear infinite`,
                transition: 'stroke-opacity 0.3s ease, stroke-width 0.3s ease',
              }}
            />
          )
        })}

        {/* ── Travelling particles ── */}
        {edges.map(([, ], ei) => {
          const dur = `${2.2 + (ei % 6) * 0.38}s`
          const delay = `${(ei % 4) * 0.55}s`
          return (
            <g key={ei}>
              <circle r={3} fill="rgb(var(--primary))" opacity={0.9}>
                <animateMotion dur={dur} begin={delay} repeatCount="indefinite">
                  <mpath href={`#ep-${ei}`} />
                </animateMotion>
              </circle>
              {/* second particle going in reverse direction */}
              <circle r={1.8} fill="rgb(var(--primary))" opacity={0.45}>
                <animateMotion
                  dur={`${3 + (ei % 4) * 0.4}s`}
                  begin={`${(ei % 3) * 0.7 + 1}s`}
                  keyPoints="1;0"
                  keyTimes="0;1"
                  calcMode="linear"
                  repeatCount="indefinite"
                >
                  <mpath href={`#ep-${ei}`} />
                </animateMotion>
              </circle>
            </g>
          )
        })}

        {/* ── Node glow rings (behind avatars) — opacity-only animation is GPU composited ── */}
        {nodes.map(({ x, y, idx }) => (
          <circle
            key={idx}
            cx={x + ox}
            cy={y + oy}
            r={R + 4}
            fill="none"
            stroke="rgb(var(--primary))"
            strokeWidth={1.5}
            style={{
              opacity: hoveredIdx === idx ? 0.6 : undefined,
              animation: `nodePulse ${2 + (idx % 4) * 0.5}s ${idx * 0.18}s ease-in-out infinite`,
              transition: 'opacity 0.25s ease',
            }}
          />
        ))}
      </svg>

      {/* ── Avatar buttons ── */}
      {nodes.map(({ x, y, user, idx }) => (
        <button
          key={user.id}
          onClick={() => onSelect(user.id)}
          onMouseEnter={() => setHoveredIdx(idx)}
          onMouseLeave={() => setHoveredIdx(null)}
          className="group absolute flex flex-col items-center focus:outline-none touch-manipulation"
          style={{
            left: x + ox - R,
            top: y + oy - R,
            width: R * 2,
          }}
        >
          <span
            className={clsx(
              'w-14 h-14 rounded-full bg-gradient-to-br flex items-center justify-center shadow-md',
              'ring-2 ring-transparent transition-all duration-200 active:scale-95',
              hoveredIdx === idx
                ? 'ring-primary/60 scale-110 -translate-y-0.5 shadow-glow'
                : 'group-hover:ring-primary/50 group-hover:scale-105',
              avatarStyles[idx % avatarStyles.length],
            )}
          >
            <span className="text-xl font-bold text-white/95 drop-shadow">
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
          </span>
          <span
            className="mt-1.5 text-[11px] font-bold text-fg truncate text-center leading-tight drop-shadow-sm"
            style={{ width: 68 }}
          >
            {user.name}
          </span>
        </button>
      ))}
    </div>
    </div>
  )
}
