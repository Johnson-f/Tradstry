// 'use client';

// import React, { useMemo } from 'react';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { useCombinedTradeMetrics } from '@/hooks/use-analytics';
// import { CombinedTradeMetric } from '@/lib/types/analytics';

// interface TradingHeatmapProps {
//   periodType?: '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';
//   customStartDate?: string;
//   customEndDate?: string;
// }

// interface HeatmapDay {
//   date: string;
//   value: number;
//   trades: number;
//   pnl: number;
//   dayOfWeek: number;
//   weekOfYear: number;
// }

// export function TradingHeatmap({
//   periodType = '90d',
//   customStartDate,
//   customEndDate
// }: TradingHeatmapProps) {
//   // Only include custom dates when periodType is 'custom'
//   const queryParams = {
//     period_type: periodType,
//     ...(periodType === 'custom' && customStartDate && customEndDate ? {
//       custom_start_date: customStartDate,
//       custom_end_date: customEndDate,
//     } : {})
//   };

//   const { data: metricsData, isLoading, error } = useCombinedTradeMetrics(queryParams);

//   const getWeekOfYear = (date: Date): number => {
//     const start = new Date(date.getFullYear(), 0, 1);
//     const diff = date.getTime() - start.getTime();
//     return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
//   };

//   const heatmapData = useMemo(() => {
//     if (!metricsData) return [];

//     // Transform the data for heatmap visualization
//     return metricsData.map((metric: CombinedTradeMetric) => {
//       const date = new Date(metric.trade_date);
//       const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
//       const weekOfYear = getWeekOfYear(date);

//       return {
//         date: metric.trade_date,
//         value: metric.activity_level,
//         trades: metric.total_trades,
//         pnl: metric.net_pnl,
//         dayOfWeek,
//         weekOfYear,
//       };
//     });
//   }, [metricsData]);

//   // Group data by weeks and days
//   const weeks = useMemo(() => {
//     const weekMap = new Map<number, HeatmapDay[]>();

//     heatmapData.forEach(day => {
//       if (!weekMap.has(day.weekOfYear)) {
//         weekMap.set(day.weekOfYear, []);
//       }
//       weekMap.get(day.weekOfYear)!.push(day);
//     });

//     return Array.from(weekMap.entries())
//       .sort(([a], [b]) => a - b)
//       .map(([weekNum, days]) => ({
//         weekNum,
//         days: days.sort((a, b) => a.dayOfWeek - b.dayOfWeek)
//       }));
//   }, [heatmapData]);

//   const getIntensityColor = (value: number, pnl: number): string => {
//     if (value === 0) return 'bg-gray-100';

//     // Color based on P&L performance
//     if (pnl > 0) {
//       // Green shades for profitable days
//       if (value >= 4) return 'bg-green-600';
//       if (value >= 3) return 'bg-green-500';
//       if (value >= 2) return 'bg-green-400';
//       return 'bg-green-300';
//     } else if (pnl < 0) {
//       // Red shades for losing days
//       if (value >= 4) return 'bg-red-600';
//       if (value >= 3) return 'bg-red-500';
//       if (value >= 2) return 'bg-red-400';
//       return 'bg-red-300';
//     } else {
//       // Blue shades for breakeven days
//       if (value >= 4) return 'bg-blue-600';
//       if (value >= 3) return 'bg-blue-500';
//       if (value >= 2) return 'bg-blue-400';
//       return 'bg-blue-300';
//     }
//   };

//   const formatCurrency = (amount: number): string => {
//     return new Intl.NumberFormat('en-US', {
//       style: 'currency',
//       currency: 'USD',
//       minimumFractionDigits: 0,
//       maximumFractionDigits: 0,
//     }).format(amount);
//   };

//   const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

//   if (isLoading) {
//     return (
//       <Card>
//         <CardHeader>
//           <CardTitle>Trading Activity Heatmap</CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="flex items-center justify-center h-48">
//             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   if (error) {
//     return (
//       <Card>
//         <CardHeader>
//           <CardTitle>Trading Activity Heatmap</CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="text-red-500 text-center py-8">
//             Error loading heatmap data
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle className="flex items-center justify-between">
//           Trading Activity Heatmap
//           <span className="text-sm font-normal text-gray-500">
//             {heatmapData.length} days
//           </span>
//         </CardTitle>
//       </CardHeader>
//       <CardContent>
//         <div className="space-y-4">
//           {/* Day labels */}
//           <div className="grid grid-cols-8 gap-1 text-xs text-gray-500">
//             <div></div>
//             {dayLabels.map(day => (
//               <div key={day} className="text-center font-medium">
//                 {day}
//               </div>
//             ))}
//           </div>

//           {/* Heatmap grid */}
//           <div className="space-y-1">
//             {weeks.map(({ weekNum, days }) => (
//               <div key={weekNum} className="grid grid-cols-8 gap-1">
//                 <div className="text-xs text-gray-400 pr-2 text-right flex items-center">
//                   W{weekNum}
//                 </div>
//                 {Array.from({ length: 7 }, (_, dayIndex) => {
//                   const dayData = days.find(d => d.dayOfWeek === dayIndex);

//                   if (!dayData) {
//                     return (
//                       <div
//                         key={dayIndex}
//                         className="w-3 h-3 bg-gray-50 rounded-sm"
//                       />
//                     );
//                   }

//                   return (
//                     <div
//                       key={dayData.date}
//                       className={`w-3 h-3 rounded-sm cursor-pointer transition-all hover:scale-110 ${getIntensityColor(dayData.value, dayData.pnl)}`}
//                       title={`${dayData.date}: ${dayData.trades} trades, ${formatCurrency(dayData.pnl)} P&L`}
//                     />
//                   );
//                 })}
//               </div>
//             ))}
//           </div>

//           {/* Legend */}
//           <div className="flex items-center justify-between text-xs text-gray-500 pt-4 border-t">
//             <div className="flex items-center space-x-2">
//               <span>Less</span>
//               <div className="flex space-x-1">
//                 <div className="w-3 h-3 bg-gray-100 rounded-sm"></div>
//                 <div className="w-3 h-3 bg-green-300 rounded-sm"></div>
//                 <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
//                 <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
//                 <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
//               </div>
//               <span>More</span>
//             </div>
//             <div className="text-right">
//               <div className="flex items-center space-x-4">
//                 <div className="flex items-center space-x-1">
//                   <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
//                   <span>Profit</span>
//                 </div>
//                 <div className="flex items-center space-x-1">
//                   <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
//                   <span>Loss</span>
//                 </div>
//                 <div className="flex items-center space-x-1">
//                   <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
//                   <span>Breakeven</span>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </div>
//       </CardContent>
//     </Card>
//   );
// }
