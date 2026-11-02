import { useState } from 'react'
import { useWidth } from '@/components/home/use-width'
import { niceTicks } from '@/lib/client/trades/trades-model'

const MARGIN = { top: 10, right: 8, bottom: 28, left: 52 }

export interface Bar {
  key: string
  /** Short label under the bar. */
  label: string
  value: number
  /** Which side of zero the bar means: gains and losses, or a neutral count. */
  tone: 'gain' | 'loss' | 'neutral'
}

const FILL = {
  gain: 'fill-emerald-500',
  loss: 'fill-rose-500',
  neutral: 'fill-foreground/35',
}

/**
 * Vertical bars from a zero baseline with a hairline grid. Hovering or
 * focusing a bar reads it out; the same numbers sit in the table beside it.
 */
export function BarChart({
  bars,
  height,
  label,
  tick,
  readout,
}: {
  bars: Bar[]
  height: number
  label: string
  tick: (value: number) => string
  readout: (index: number) => React.ReactNode
}) {
  const [frame, width] = useWidth<HTMLDivElement>()
  const [active, setActive] = useState<number | null>(null)
  const values = bars.map((bar) => bar.value)
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 4)
  const low = ticks[0]
  const high = ticks[ticks.length - 1]
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right)
  const plotHeight = height - MARGIN.top - MARGIN.bottom
  const slot = bars.length ? plotWidth / bars.length : 0
  const barWidth = Math.max(2, Math.min(48, slot - 4))
  const y = (value: number) => MARGIN.top + (1 - (value - low) / (high - low || 1)) * plotHeight
  const labelEvery = Math.max(1, Math.ceil(bars.length / Math.max(1, Math.floor(plotWidth / 56))))

  return (
    <div ref={frame} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg role="img" aria-label={label} width={width} height={height} className="block">
          {ticks.map((value) => (
            <g key={value}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(value)}
                y2={y(value)}
                strokeWidth={1}
                className={value === 0 ? 'stroke-foreground/25' : 'stroke-border/70'}
              />
              <text
                x={MARGIN.left - 8}
                y={y(value)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {tick(value)}
              </text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const center = MARGIN.left + slot * index + slot / 2
            const top = Math.min(y(bar.value), y(0))
            const size = Math.abs(y(bar.value) - y(0))
            return (
              <g key={bar.key}>
                <rect
                  x={center - barWidth / 2}
                  y={top}
                  width={barWidth}
                  height={Math.max(bar.value === 0 ? 0 : 1, size)}
                  rx={Math.min(4, barWidth / 2)}
                  className={`${FILL[bar.tone]} transition-opacity ${active !== null && active !== index ? 'opacity-50' : ''}`}
                />
                <rect
                  x={MARGIN.left + slot * index}
                  y={MARGIN.top}
                  width={slot}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${bar.label}: ${tick(bar.value)}`}
                  className="outline-none focus-visible:stroke-ring focus-visible:stroke-2"
                  onPointerEnter={() => setActive(index)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                />
                {(index === bars.length - 1 || (index % labelEvery === 0 && bars.length - 1 - index >= labelEvery / 2)) && (
                  <text
                    x={center}
                    y={height - 8}
                    textAnchor="middle"
                    className="pointer-events-none fill-muted-foreground text-[11px]"
                  >
                    {bar.label}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      )}
      {active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 z-10 min-w-40 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-md"
          style={{ left: Math.min(width - 88, Math.max(88, MARGIN.left + slot * active + slot / 2)) }}
        >
          {readout(active)}
        </div>
      )}
    </div>
  )
}
