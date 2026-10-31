import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { TradeFill } from '@/lib/client/trades/trades'
import { FILL_ROLE_LABEL, price, quantity, toNumber } from '@/lib/client/trades/trades-model'
import { formatDateTime } from '@/lib/format'

const HEIGHT = 280
const MARGIN = { top: 24, right: 70, bottom: 32, left: 12 }

export function TradeExecutionChart({ fills }: { fills: TradeFill[] }) {
  const id = useId()
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const element = frame.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const series = useMemo(
    () =>
      fills
        .flatMap((fill) => {
          const value = toNumber(fill.price)
          const time = new Date(fill.executedAt).getTime()
          return value === null || !Number.isFinite(time) ? [] : [{ ...fill, value, time }]
        })
        .sort((a, b) => a.time - b.time),
    [fills],
  )

  if (series.length === 0) {
    return <p className="py-12 text-sm text-muted-foreground">No execution prices available.</p>
  }

  const first = series[0]
  const last = series[series.length - 1]
  const current = active === null ? last : series[Math.min(active, series.length - 1)]
  const low = Math.min(...series.map((point) => point.value))
  const high = Math.max(...series.map((point) => point.value))
  const padding = Math.max(high - low, Math.abs(high) * 0.02, 0.01) * 0.2
  const yMin = low - padding
  const yMax = high + padding
  const plotWidth = width - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom
  const x = (time: number) =>
    MARGIN.left +
    (last.time === first.time ? plotWidth / 2 : ((time - first.time) / (last.time - first.time)) * plotWidth)
  const y = (value: number) => MARGIN.top + ((yMax - value) / (yMax - yMin)) * plotHeight
  const path = series.map((point, index) => `${index ? 'L' : 'M'}${x(point.time)},${y(point.value)}`).join(' ')
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4)
  const sameDay = new Date(first.time).toDateString() === new Date(last.time).toDateString()
  const timeLabel = (time: number) =>
    sameDay
      ? new Date(time).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      : new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <figure aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="space-y-1">
        <figcaption id={`${id}-title`} className="text-[13px] text-muted-foreground">
          Execution prices
        </figcaption>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{price(current.price)}</p>
        <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
          {FILL_ROLE_LABEL[current.role] ?? current.role} · {quantity(current.quantity)} units ·{' '}
          {formatDateTime(current.executedAt)}
          {current.derived && ' · Added fill'}
        </p>
      </div>
      <div ref={frame}>
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          width="100%"
          height={HEIGHT}
          role="img"
          tabIndex={0}
          aria-label={`${series.length} recorded fills, from ${price(first.price)} to ${price(last.price)}. Use left and right arrow keys to inspect each fill.`}
          className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onPointerMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const pointerX = ((event.clientX - rect.left) / rect.width) * width
            let nearest = 0
            for (let i = 1; i < series.length; i++) {
              if (Math.abs(x(series[i].time) - pointerX) < Math.abs(x(series[nearest].time) - pointerX)) nearest = i
            }
            setActive(nearest)
          }}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const step = event.key === 'ArrowRight' ? 1 : -1
            setActive((index) =>
              Math.min(series.length - 1, Math.max(0, (index ?? (step > 0 ? -1 : series.length)) + step)),
            )
          }}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                strokeDasharray="2 4"
                className="stroke-border/60"
              />
              <text
                x={width - MARGIN.right + 10}
                y={y(tick)}
                dominantBaseline="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {price(String(tick))}
              </text>
            </g>
          ))}
          <path d={path} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-foreground/35" />
          {series.map((point, index) => (
            <circle
              key={`${point.key}-${index}`}
              cx={x(point.time)}
              cy={y(point.value)}
              r={3.5}
              className="fill-foreground stroke-background"
              strokeWidth={1.5}
            >
              <title>{`${FILL_ROLE_LABEL[point.role] ?? point.role}: ${price(point.price)} · ${formatDateTime(point.executedAt)}`}</title>
            </circle>
          ))}
          {active !== null && (
            <g aria-hidden>
              <line
                x1={x(current.time)}
                x2={x(current.time)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
                strokeDasharray="3 3"
                className="stroke-muted-foreground/50"
              />
              <circle
                cx={x(current.time)}
                cy={y(current.value)}
                r={5}
                className="fill-foreground stroke-background"
                strokeWidth={2}
              />
            </g>
          )}
          <text x={MARGIN.left} y={HEIGHT - 6} textAnchor="start" className="fill-muted-foreground text-[11px]">
            {timeLabel(first.time)}
          </text>
          {last.time !== first.time && (
            <text
              x={width - MARGIN.right}
              y={HEIGHT - 6}
              textAnchor="end"
              className="fill-muted-foreground text-[11px]"
            >
              {timeLabel(last.time)}
            </text>
          )}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">Recorded fill prices · {series.length} fills</p>
    </figure>
  )
}
