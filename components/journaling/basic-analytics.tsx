'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useAnalyticsTimeSeries, useAnalyticsCore } from '@/lib/hooks/use-analytics';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

type TimeRangeOption = '7d' | '30d' | '90d' | '1y' | 'ytd' | 'all_time';

interface BasicAnalyticsProps {
  initialTimeRange?: TimeRangeOption;
}

export default function BasicAnalytics({ initialTimeRange = '30d' }: BasicAnalyticsProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const { data: timeSeriesData, isLoading: isLoadingTimeSeries, error: timeSeriesError } = useAnalyticsTimeSeries({ 
    time_range: initialTimeRange 
  });

  const { data: coreMetrics, isLoading: isLoadingCore, error: coreError } = useAnalyticsCore({
    time_range: initialTimeRange 
  });

  // Setup responsive dimensions
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: 300,
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Render D3 chart
  useEffect(() => {
    if (!timeSeriesData?.daily_pnl || timeSeriesData.daily_pnl.length === 0 || !svgRef.current || dimensions.width === 0) {
      return;
    }

    const dailyPnl = timeSeriesData.daily_pnl;

    // Clear previous chart
    d3.select(svgRef.current).selectAll('*').remove();

    const svg = d3.select(svgRef.current);
    const margin = { top: 10, right: 10, bottom: 10, left: 10 };
    const width = dimensions.width - margin.left - margin.right;
    const height = dimensions.height - margin.top - margin.bottom;

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(dailyPnl, d => new Date(d.date)) as [Date, Date])
      .range([margin.left, width]);

    const yDomain = d3.extent(dailyPnl, d => d.cumulative_value) as [number, number];
    const yScale = d3.scaleLinear()
      .domain(yDomain)
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Create gradient
    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'pnl-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#d1fae5');

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#0f766e');

    // Create area generator
    const area = d3.area<{ date: string; cumulative_value: number; value: number; trade_count: number }>()
      .x(d => xScale(new Date(d.date)))
      .y0(yScale(Math.max(0, Math.min(...yDomain))))
      .y1(d => yScale(d.cumulative_value))
      .curve(d3.curveMonotoneX);

    // Create line generator
    const line = d3.line<{ date: string; cumulative_value: number; value: number; trade_count: number }>()
      .x(d => xScale(new Date(d.date)))
      .y(d => yScale(d.cumulative_value))
      .curve(d3.curveMonotoneX);

    // Draw area
    svg.append('path')
      .datum(dailyPnl)
      .attr('fill', 'url(#pnl-gradient)')
      .attr('d', area);

    // Draw line
    svg.append('path')
      .datum(dailyPnl)
      .attr('fill', 'none')
      .attr('stroke', '#0891b2')
      .attr('stroke-width', 2)
      .attr('d', line);

    // Add interactive dots for hover
    const dots = svg.selectAll('.dot')
      .data(dailyPnl)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(new Date(d.date)))
      .attr('cy', d => yScale(d.cumulative_value))
      .attr('r', 0)
      .attr('fill', '#0891b2')
      .attr('stroke', '#fff')
      .attr('stroke-width', 2);

    // Add hover interactions
    dots.on('mouseenter', function(event, d) {
        d3.select(this).attr('r', 5);
        
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = '1';
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
          
          const date = new Date(d.date).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          });
          
          tooltipRef.current.innerHTML = `
            <div class="text-xs space-y-1">
              <div class="font-semibold">${date}</div>
              <div>Daily P&L: <span class="font-medium">$${d.value.toFixed(2)}</span></div>
              <div>Cumulative P&L: <span class="font-medium">$${d.cumulative_value.toFixed(2)}</span></div>
              <div>Trades: <span class="font-medium">${d.trade_count}</span></div>
            </div>
          `;
        }
      })
      .on('mousemove', function(event) {
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${event.pageX + 10}px`;
          tooltipRef.current.style.top = `${event.pageY - 10}px`;
        }
      })
      .on('mouseleave', function() {
        d3.select(this).attr('r', 0);
        if (tooltipRef.current) {
          tooltipRef.current.style.opacity = '0';
        }
      });

  }, [timeSeriesData, dimensions.width, dimensions.height]);

  if (timeSeriesError || coreError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-red-600">Error loading analytics: {(timeSeriesError || coreError)?.message}</p>
        </CardContent>
      </Card>
    );
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
    );
  }

  const currentPnl = timeSeriesData.daily_pnl[timeSeriesData.daily_pnl.length - 1]?.cumulative_value || 0;
  const dataPointCount = timeSeriesData.daily_pnl.length;

  return (
    <>
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-gray-900 text-white p-2 rounded shadow-lg pointer-events-none z-50 opacity-0 transition-opacity"
        style={{ fontSize: '12px' }}
      />

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {/* Card 1: Net Cumulative P&L */}
        <Card className="col-span-full">
          <CardHeader>
            <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
                <CardTitle className="text-base font-medium">Net Cumulative P&L</CardTitle>
                <CardDescription className="text-sm font-medium">{dataPointCount}</CardDescription>
        </div>
        <div className="text-4xl font-bold">
          {currentPnl >= 0 ? '+' : ''}${currentPnl.toFixed(2)}
        </div>
      </div>
          </CardHeader>
          <CardContent>
      <div ref={containerRef} className="w-full">
        <svg
          ref={svgRef}
          width={dimensions.width}
          height={dimensions.height}
          className="w-full"
          style={{ overflow: 'visible' }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Profit Factor */}
        <ProfitFactorCard profitFactor={coreMetrics.profit_factor} />

        {/* Card 3: Win Rate */}
        <WinRateCard 
          winRate={coreMetrics.win_rate} 
          losingTrades={coreMetrics.losing_trades}
          winningTrades={coreMetrics.winning_trades}
        />

        {/* Card 4: Avg Win/Loss */}
        <AvgWinLossCard 
          averageWin={coreMetrics.average_win}
          averageLoss={coreMetrics.average_loss}
        />
      </div>
    </>
  );
}

// Profit Factor Card Component
function ProfitFactorCard({ profitFactor }: { profitFactor: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold">{profitFactor.toFixed(2)}</div>
      </CardContent>
    </Card>
  );
}

// Win Rate Card Component with Donut Chart
function WinRateCard({ 
  winRate, 
  losingTrades, 
  winningTrades 
}: { 
  winRate: number; 
  losingTrades: number; 
  winningTrades: number;
}) {
  const donutRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 120, height: 120 });

  useEffect(() => {
    const width = 120;
    const height = 120;
    const radius = Math.min(width, height) / 2 - 10;

    if (!donutRef.current) return;

    const svg = d3.select(donutRef.current);
    svg.selectAll('*').remove();

    const arcGenerator = d3.arc<d3.PieArcDatum<number>>()
      .innerRadius(radius * 0.6)
      .outerRadius(radius);

    const pieGenerator = d3.pie<number>()
      .value(d => d)
      .sort(null);

    // Handle both decimal and percentage formats
    const winRateValue = winRate > 1 ? winRate : winRate * 100;
    const data = [
      winRateValue,
      100 - winRateValue
    ];

    const colorScale = d3.scaleOrdinal<string>()
      .domain(['win', 'loss'])
      .range(['#14b8a6', '#f87171']);

    svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`)
      .selectAll('path')
      .data(pieGenerator(data))
      .enter()
      .append('path')
      .attr('d', arcGenerator)
      .attr('fill', (d, i) => colorScale(i === 0 ? 'win' : 'loss'));

    setDimensions({ width, height });
  }, [winRate]);

  const winRatePercent = winRate > 1 ? winRate : winRate * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Trade Win %</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <svg ref={donutRef} width={dimensions.width} height={dimensions.height} />
          <div className="text-4xl font-bold">{winRatePercent.toFixed(2)}%</div>
        </div>
        <CardDescription className="mt-2 text-xs">
          {winningTrades} wins / {losingTrades} losses
        </CardDescription>
      </CardContent>
    </Card>
  );
}

// Avg Win/Loss Card Component with Bar Chart
function AvgWinLossCard({ 
  averageWin, 
  averageLoss 
}: { 
  averageWin: number; 
  averageLoss: number;
}) {
  const barRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 100 });

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.offsetWidth;
    const barHeight = 20;
    
    setDimensions({ width, height: 100 });

    if (!barRef.current) return;

    const svg = d3.select(barRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 10, bottom: 30, left: 10 };
    const maxVal = Math.max(averageWin, Math.abs(averageLoss));
    const xScale = d3.scaleLinear()
      .domain([-maxVal, maxVal])
      .range([margin.left, width - margin.right]);

    // Win bar
    const winBarWidth = xScale(averageWin) - xScale(0);
    svg.append('rect')
      .attr('x', xScale(0))
      .attr('y', 20)
      .attr('width', winBarWidth)
      .attr('height', barHeight)
      .attr('fill', '#14b8a6');

    svg.append('text')
      .attr('x', xScale(averageWin) + 5)
      .attr('y', 35)
      .attr('fill', '#14b8a6')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(`$${averageWin.toFixed(0)}`);

    // Loss bar
    const lossBarWidth = xScale(0) - xScale(-averageLoss);
    svg.append('rect')
      .attr('x', xScale(-averageLoss))
      .attr('y', 60)
      .attr('width', lossBarWidth)
      .attr('height', barHeight)
      .attr('fill', '#f87171');

    svg.append('text')
      .attr('x', xScale(-averageLoss) + 5)
      .attr('y', 75)
      .attr('fill', '#f87171')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .text(`-$${Math.abs(averageLoss).toFixed(0)}`);
  }, [averageWin, averageLoss]);

  const ratio = averageWin / Math.abs(averageLoss);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Avg win/loss trade</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-2">
          <div className="text-4xl font-bold">{ratio.toFixed(2)}</div>
        </div>
        <div ref={containerRef} className="w-full">
          <svg ref={barRef} width={dimensions.width} height={dimensions.height} />
        </div>
      </CardContent>
    </Card>
  );
}

