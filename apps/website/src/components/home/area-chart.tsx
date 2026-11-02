import { useEffect, useId, useRef, useState } from 'react'
import { dayLabel } from '@/lib/client/home/home-model'
import { compactMoney, niceTicks } from '@/lib/client/trades/trades-model'

const MARGIN = { top: 10, right: 12, bottom: 26, left: 56 }

const TONE = {
  gain: 'text-emerald-500',
  loss: 'text-rose-500',
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * A daily series as a line over a soft fill down to zero, with a hairline grid,
 * a zero line and a crosshair readout on hover or arrow keys.
 */
export function AreaChart({
  points,
  tone,
  height,
  label,
  readout,
}: {
  points: Array<{ day: string; value: number }>
  tone: keyof typeof TONE
  height: number
  label: string
  readout: (index: number) => React.ReactNode
}) {
  const gradient = useId()
  const [frame, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const values = points.map((point) => point.value)
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4)
  const low = ticks[0]
  const high = ticks[ticks.length - 1]
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const x = (index: number) =>
    MARGIN.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth)
  const y = (value: number) => MARGIN.top + (1 - (value - low) / (high - low || 1)) * plotHeight
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index)},${y(point.value)}`).join('')
  const area = points.length ? `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(plotWidth / 90))))

  const pick = (clientX: number, element: Element) => {
    const rect = element.getBoundingClientRect()
    const ratio = (clientX - rect.left - MARGIN.left) / Math.max(1, plotWidth)
    setActive(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))))
  }

  return (
    <div ref={frame} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          role="img"
          aria-label={label}
          width={width}
          height={height}
          tabIndex={0}
          className={`block touch-none outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 ${TONE[tone]}`}
          onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            setActive((current) =>
              Math.min(points.length - 1, Math.max(0, (current ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))),
            )
          }}
        >
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="95%" stopColor="currentColor" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                strokeWidth={1}
                className={tick === 0 ? 'stroke-foreground/25' : 'stroke-border/70'}
              />
              <text
                x={MARGIN.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {compactMoney(tick)}
              </text>
            </g>
          ))}
          {points.map((point, index) =>
            index % labelEvery === 0 || index === points.length - 1 ? (
              <text
                key={point.day}
                x={x(index)}
                y={height - 6}
                textAnchor={index === 0 && points.length > 1 ? 'start' : index === points.length - 1 && points.length > 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[11px]"
              >
                {dayLabel(point.day)}
              </text>
            ) : null,
          )}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <>
              <line
                x1={x(active)}
                x2={x(active)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotHeight}
                strokeWidth={1}
                className="stroke-foreground/30"
              />
              <circle cx={x(active)} cy={y(points[active].value)} r={4} fill="currentColor" className="stroke-card" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-44 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-md"
          style={{ left: Math.min(width - 96, Math.max(96, x(active))) }}
        >
          <p className="mb-1 font-medium">{dayLabel(points[active].day, 'year')}</p>
          {readout(active)}
        </div>
      )}
    </div>
  )
}

/** One label–value row inside a chart readout. */
export function ReadoutRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="opacity-70">{label}</span>
      <span className="font-mono tabular-nums">{value}</span>
    </p>
  )
}
