"use client"

import { useEffect, useRef, useState } from "react"
import * as d3 from "d3"
import { useAnalyticsTimeSeries, useAnalyticsCore } from "@/lib/hooks/use-analytics"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Info } from "lucide-react"

type TimeRangeOption = "7d" | "30d" | "90d" | "1y" | "ytd" | "all_time"

interface BasicAnalyticsProps {
  initialTimeRange?: TimeRangeOption
}

export default function BasicAnalytics({ initialTimeRange = "30d" }: BasicAnalyticsProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  const {
    data: timeSeriesData,
    isLoading: isLoadingTimeSeries,
    error: timeSeriesError,
  } = useAnalyticsTimeSeries({
    time_range: initialTimeRange,
  })

  const {
    data: coreMetrics,
    isLoading: isLoadingCore,
    error: coreError,
  } = useAnalyticsCore({
    time_range: initialTimeRange,
  })

  // Setup responsive dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: 300,
        })
      }
    }

    updateDimensions()
    window.addEventListener("resize", updateDimensions)
    return () => window.removeEventListener("resize", updateDimensions)
  }, [])

  // Render D3 chart
  useEffect(() => {
    if (
      !timeSeriesData?.daily_pnl ||
      timeSeriesData.daily_pnl.length === 0 ||
      !svgRef.current ||
      dimensions.width === 0
    ) {
      return
    }

    const dailyPnl = timeSeriesData.daily_pnl

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove()

    const svg = d3.select(svgRef.current)
    const margin = { top: 10, right: 10, bottom: 10, left: 10 }
    const width = dimensions.width - margin.left - margin.right
    const height = dimensions.height - margin.top - margin.bottom

    // Create scales
    const xScale = d3
      .scaleTime()
      .domain(d3.extent(dailyPnl, (d) => new Date(d.date)) as [Date, Date])
      .range([margin.left, width])

    const yDomain = d3.extent(dailyPnl, (d) => d.cumulative_value) as [number, number]
    const yScale = d3
      .scaleLinear()
      .domain(yDomain)
      .nice()
      .range([height - margin.bottom, margin.top])

    const defs = svg.append("defs")
    const gradient = defs
      .append("linearGradient")
      .attr("id", "pnl-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "0%")
      .attr("y2", "100%")

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(45, 212, 191, 0.3)")

    gradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(45, 212, 191, 0.05)")

    // Create area generator
    const area = d3
      .area<{ date: string; cumulative_value: number; value: number; trade_count: number }>()
      .x((d) => xScale(new Date(d.date)))
      .y0(yScale(Math.max(0, Math.min(...yDomain))))
      .y1((d) => yScale(d.cumulative_value))
      .curve(d3.curveMonotoneX)

    // Create line generator
    const line = d3
      .line<{ date: string; cumulative_value: number; value: number; trade_count: number }>()
      .x((d) => xScale(new Date(d.date)))
      .y((d) => yScale(d.cumulative_value))
      .curve(d3.curveMonotoneX)

    // Draw area
    svg.append("path").datum(dailyPnl).attr("fill", "url(#pnl-gradient)").attr("d", area)

    svg
      .append("path")
      .datum(dailyPnl)
      .attr("fill", "none")
      .attr("stroke", "#2dd4bf")
      .attr("stroke-width", 2)
      .attr("d", line)

    // Add interactive dots for hover
    const dots = svg
      .selectAll(".dot")
      .data(dailyPnl)
      .enter()
      .append("circle")
      .attr("class", "dot")
      .attr("cx", (d) => xScale(new Date(d.date)))
      .attr("cy", (d) => yScale(d.cumulative_value))
      .attr("r", 0)
      .attr("fill", "#0891b2")
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)

    // Add hover interactions
    dots
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", 5)

        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "1"
          tooltipRef.current.style.left = `${event.pageX + 10}px`
          tooltipRef.current.style.top = `${event.pageY - 10}px`

          const date = new Date(d.date).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })

          tooltipRef.current.innerHTML = `
            <div class="text-xs space-y-1">
              <div class="font-semibold">${date}</div>
              <div>Daily P&L: <span class="font-medium">$${d.value.toFixed(2)}</span></div>
              <div>Cumulative P&L: <span class="font-medium">$${d.cumulative_value.toFixed(2)}</span></div>
              <div>Trades: <span class="font-medium">${d.trade_count}</span></div>
            </div>
          `
        }
      })
      .on("mousemove", (event) => {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`
          tooltipRef.current.style.top = `${event.pageY - 10}px`
        }
      })
      .on("mouseleave", function () {
        d3.select(this).attr("r", 0)
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = "0"
        }
      })
  }, [timeSeriesData, dimensions.width, dimensions.height])

  if (timeSeriesError || coreError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-600">Error loading analytics: {(timeSeriesError || coreError)?.message}</p>
        </CardContent>
      </Card>
    )
  }

  if (isLoadingTimeSeries || isLoadingCore || !timeSeriesData || !coreMetrics) {
    return (
      <div className="space-y-4">
        <Card className="col-span-full animate-pulse">
          <CardHeader>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </CardHeader>
          <CardContent>
            <div className="h-64 bg-gray-100 rounded"></div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="h-12 bg-gray-100 rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  const currentPnl = timeSeriesData.daily_pnl[timeSeriesData.daily_pnl.length - 1]?.cumulative_value || 0
  const dataPointCount = timeSeriesData.daily_pnl.length

  return (
    <>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-gray-900 text-white p-2 rounded shadow-lg pointer-events-none z-50 opacity-0 transition-opacity"
        style={{ fontSize: "12px" }}
      />

      <div className="flex gap-4 overflow-x-auto">
        {/* Card 1: Net Cumulative P&L */}
        <Card className="flex-1 min-w-[300px] bg-white">
          <CardHeader className="pb-2">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-normal text-gray-600">Net Cumulative P&L</CardTitle>
                <CardDescription className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-0.5 rounded">
                  {dataPointCount}
                </CardDescription>
              </div>
              <div className="text-3xl font-bold text-gray-900">${currentPnl.toFixed(2)}</div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div ref={containerRef} className="w-full">
              <svg
                ref={svgRef}
                width={dimensions.width}
                height={dimensions.height}
                className="w-full"
                style={{ overflow: "visible" }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Profit Factor */}
        <div className="flex-1 min-w-[250px]">
          <ProfitFactorCard profitFactor={coreMetrics.profit_factor} />
        </div>

        {/* Card 3: Win Rate */}
        <div className="flex-1 min-w-[250px]">
          <WinRateCard
            winRate={coreMetrics.win_rate}
            losingTrades={coreMetrics.losing_trades}
            winningTrades={coreMetrics.winning_trades}
          />
        </div>

        {/* Card 4: Avg Win/Loss */}
        <div className="flex-1 min-w-[250px]">
          <AvgWinLossCard averageWin={coreMetrics.average_win} averageLoss={coreMetrics.average_loss} />
        </div>
      </div>
    </>
  )
}

function ProfitFactorCard({ profitFactor }: { profitFactor: number }) {
  const gaugeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!gaugeRef.current) return

    const width = 120
    const height = 80
    const radius = 50

    const svg = d3.select(gaugeRef.current)
    svg.selectAll("*").remove()

    const g = svg.append("g").attr("transform", `translate(${width / 2}, ${height - 10})`)

    // Background arc
    const backgroundArc = d3
      .arc()
      .innerRadius(radius - 8)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2)

    g.append("path")
      .attr("d", backgroundArc as any)
      .attr("fill", "#e5e7eb")

    // Foreground arc (red for profit factor)
    const normalizedValue = Math.min(profitFactor / 5, 1) // Normalize to 0-1, max at 5
    const foregroundArc = d3
      .arc()
      .innerRadius(radius - 8)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(-Math.PI / 2 + Math.PI * normalizedValue)

    g.append("path")
      .attr("d", foregroundArc as any)
      .attr("fill", "#ef4444")
  }, [profitFactor])

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-normal text-gray-600">Profit Factor</CardTitle>
          <Info className="w-4 h-4 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between pt-0">
        <div className="text-3xl font-bold text-gray-900">{profitFactor.toFixed(2)}</div>
        <svg ref={gaugeRef} width={120} height={80} />
      </CardContent>
    </Card>
  )
}

function WinRateCard({
  winRate,
  losingTrades,
  winningTrades,
}: {
  winRate: number
  losingTrades: number
  winningTrades: number
}) {
  const gaugeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!gaugeRef.current) return

    const width = 120
    const height = 80
    const radius = 50

    const svg = d3.select(gaugeRef.current)
    svg.selectAll("*").remove()

    const g = svg.append("g").attr("transform", `translate(${width / 2}, ${height - 10})`)

    const winRateValue = winRate > 1 ? winRate / 100 : winRate

    // Create gradient for gauge
    const defs = svg.append("defs")
    const gradient = defs
      .append("linearGradient")
      .attr("id", "gauge-gradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "0%")

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#10b981")

    gradient.append("stop").attr("offset", "50%").attr("stop-color", "#3b82f6")

    gradient.append("stop").attr("offset", "100%").attr("stop-color", "#ef4444")

    // Background arc
    const backgroundArc = d3
      .arc()
      .innerRadius(radius - 8)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2)

    g.append("path")
      .attr("d", backgroundArc as any)
      .attr("fill", "#e5e7eb")

    // Foreground arc
    const foregroundArc = d3
      .arc()
      .innerRadius(radius - 8)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(-Math.PI / 2 + Math.PI * winRateValue)

    g.append("path")
      .attr("d", foregroundArc as any)
      .attr("fill", "url(#gauge-gradient)")

    // Add tick marks
    const tickData = [0, 0.5, 1]
    tickData.forEach((tick) => {
      const angle = -Math.PI / 2 + Math.PI * tick
      const x1 = Math.cos(angle) * (radius - 12)
      const y1 = Math.sin(angle) * (radius - 12)
      const x2 = Math.cos(angle) * (radius + 2)
      const y2 = Math.sin(angle) * (radius + 2)

      g.append("line")
        .attr("x1", x1)
        .attr("y1", y1)
        .attr("x2", x2)
        .attr("y2", y2)
        .attr("stroke", "#9ca3af")
        .attr("stroke-width", 1)
    })

    // Add labels
    g.append("text")
      .attr("x", -radius - 5)
      .attr("y", 5)
      .attr("text-anchor", "end")
      .attr("font-size", "10px")
      .attr("fill", "#6b7280")
      .text("0")

    g.append("text")
      .attr("x", 0)
      .attr("y", -radius - 5)
      .attr("text-anchor", "middle")
      .attr("font-size", "10px")
      .attr("fill", "#6b7280")
      .text("50")

    g.append("text")
      .attr("x", radius + 5)
      .attr("y", 5)
      .attr("text-anchor", "start")
      .attr("font-size", "10px")
      .attr("fill", "#6b7280")
      .text("100")
  }, [winRate])

  const winRatePercent = winRate > 1 ? winRate : winRate * 100

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-normal text-gray-600">Trade Win %</CardTitle>
          <Info className="w-4 h-4 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between pt-0">
        <div className="text-3xl font-bold text-gray-900">{winRatePercent.toFixed(2)}%</div>
        <svg ref={gaugeRef} width={120} height={80} />
      </CardContent>
    </Card>
  )
}

function AvgWinLossCard({
  averageWin,
  averageLoss,
}: {
  averageWin: number
  averageLoss: number
}) {
  const barRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 60 })

  useEffect(() => {
    if (!containerRef.current) return

    const width = containerRef.current.offsetWidth
    setDimensions({ width, height: 60 })

    if (!barRef.current || width === 0) return

    const svg = d3.select(barRef.current)
    svg.selectAll("*").remove()

    const barHeight = 24
    const centerY = 30
    const maxVal = Math.max(averageWin, Math.abs(averageLoss))
    const centerX = width / 2
    const maxBarWidth = width / 2 - 40

    // Win bar (right side, green)
    const winBarWidth = (averageWin / maxVal) * maxBarWidth
    svg
      .append("rect")
      .attr("x", centerX)
      .attr("y", centerY - barHeight / 2)
      .attr("width", winBarWidth)
      .attr("height", barHeight)
      .attr("fill", "#10b981")
      .attr("rx", 4)

    // Loss bar (left side, red)
    const lossBarWidth = (Math.abs(averageLoss) / maxVal) * maxBarWidth
    svg
      .append("rect")
      .attr("x", centerX - lossBarWidth)
      .attr("y", centerY - barHeight / 2)
      .attr("width", lossBarWidth)
      .attr("height", barHeight)
      .attr("fill", "#ef4444")
      .attr("rx", 4)

    // Labels
    svg
      .append("text")
      .attr("x", centerX + winBarWidth + 5)
      .attr("y", centerY + 4)
      .attr("fill", "#10b981")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .text(`$${averageWin.toFixed(0)}`)

    svg
      .append("text")
      .attr("x", centerX - lossBarWidth - 5)
      .attr("y", centerY + 4)
      .attr("fill", "#ef4444")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("text-anchor", "end")
      .text(`-$${Math.abs(averageLoss).toFixed(0)}`)
  }, [averageWin, averageLoss, dimensions.width])

  const ratio = averageWin / Math.abs(averageLoss)

  return (
    <Card className="bg-white">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-sm font-normal text-gray-600">Avg win/loss trade</CardTitle>
          <Info className="w-4 h-4 text-gray-400" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-3xl font-bold text-gray-900 mb-2">{ratio.toFixed(2)}</div>
        <div ref={containerRef} className="w-full">
          <svg ref={barRef} width={dimensions.width} height={dimensions.height} />
        </div>
      </CardContent>
    </Card>
  )
}
