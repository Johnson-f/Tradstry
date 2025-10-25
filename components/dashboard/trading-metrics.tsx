// "use client";

// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { Skeleton } from "@/components/ui/skeleton";
// import { useQuery } from "@tanstack/react-query";
// import { analyticsService } from "@/lib/services/analytics-service";
// import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";

// type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all_time' | 'custom';

// interface TradingMetricsProps {
//   timeRange?: TimeRange;
//   className?: string;
// }

// export function TradingMetrics({ timeRange = '30d', className = '' }: TradingMetricsProps) {
//   const { data, isLoading, error } = useQuery({
//     queryKey: ['tradingMetrics', timeRange],
//     queryFn: async () => {
//       console.log('🔍 Starting API call with timeRange:', timeRange);
//       try {
//         const result = await analyticsService.getCombinedPortfolioAnalytics({ periodType: timeRange });
//         console.log('✅ API call successful:', result);
//         return result;
//       } catch (err) {
//         console.error('❌ API call failed:', err);
//         throw err;
//       }
//     },
//     retry: 1, // Only retry once to avoid infinite loading
//     staleTime: 1000 * 60 * 5, // 5 minutes
//     gcTime: 1000 * 60 * 10, // 10 minutes (formerly cacheTime)
//   });


//   if (error) {
//     console.error('🚨 Query Error Details:', {
//       error,
//       message: error?.message,
//       stack: error?.stack,
//       name: error?.name
//     });

//     return (
//       <Card className={`border-destructive ${className}`}>
//         <CardHeader className="pb-2">
//           <CardTitle className="text-sm font-medium text-destructive">
//             Error loading metrics
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <p className="text-xs text-muted-foreground">
//             Failed to load trading metrics: {error?.message || 'Unknown error'}
//           </p>
//           <details className="mt-2">
//             <summary className="cursor-pointer text-xs">Error Details</summary>
//             <pre className="mt-1 text-xs bg-gray-100 p-2 rounded overflow-auto">
//               {JSON.stringify(error, null, 2)}
//             </pre>
//           </details>
//         </CardContent>
//       </Card>
//     );
//   }

//   // Format the data for the chart
//   const chartData = data ? [
//     {
//       period: 'Current',
//       winRate: data.win_rate * 100, // Convert to percentage for display
//       avgWin: data.average_gain,
//       avgLoss: data.average_loss,
//     },
//   ] : [];

//   if (!data) {
//     return (
//       <Card className={className}>
//         <CardHeader className="pb-2">
//           <CardTitle className="text-sm font-medium">No Data Available</CardTitle>
//         </CardHeader>
//         <CardContent>
//           <p className="text-xs text-muted-foreground">
//             No trading metrics available for the selected period.
//           </p>
//         </CardContent>
//       </Card>
//     );
//   }

//   // Debug logging
//  /* console.log('📊 TradingMetrics render:', {
//     isLoading,
//     timeRange,
//     hasData: !!data,
//     rawData: data, // Log the raw data to inspect its structure
//     error: error ? {
//       message: error.message,
//       name: error.name
//     } : null
//   });*/

//   return (
//     <Card className={className}>
//       <CardHeader>
//         <CardTitle className="text-base font-medium flex items-center gap-2">
//           Win % - Avg Win - Avg Loss
//           <span className="text-xs text-muted-foreground ml-auto">ℹ️</span>
//         </CardTitle>
//       </CardHeader>
//       <CardContent>
//         {isLoading ? (
//           <div className="h-80 flex flex-col items-center justify-center">
//             <Skeleton className="h-full w-full" />
//             <div className="absolute text-sm text-muted-foreground">
//               Loading trading metrics...
//               <div className="text-xs mt-1">
//                 Time range: {timeRange}
//               </div>
//             </div>
//           </div>
//         ) : (
//           <div className="h-80">
//             <ResponsiveContainer width="100%" height="100%">
//               <LineChart data={chartData} margin={{ top: 20, right: 60, left: 20, bottom: 20 }}>
//                 <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
//                 <XAxis
//                   dataKey="period"
//                   axisLine={false}
//                   tickLine={false}
//                   tick={{ fontSize: 12, fill: '#666' }}
//                 />
//                 {/* Left Y-axis for dollar values */}
//                 <YAxis
//                   yAxisId="dollar"
//                   orientation="left"
//                   domain={[-200, 200]}
//                   ticks={[-100, 0, 100, 200]}
//                   tickFormatter={(value) => `$${value}`}
//                   axisLine={false}
//                   tickLine={false}
//                   tick={{ fontSize: 12, fill: '#666' }}
//                 />
//                 {/* Right Y-axis for percentage */}
//                 <YAxis
//                   yAxisId="percent"
//                   orientation="right"
//                   domain={[0, 50]}
//                   ticks={[0, 25, 50]}
//                   tickFormatter={(value) => `${value}%`}
//                   axisLine={false}
//                   tickLine={false}
//                   tick={{ fontSize: 12, fill: '#666' }}
//                 />

//                 {/* Win Rate line (percentage - right axis) */}
//                 <Line
//                   yAxisId="percent"
//                   type="monotone"
//                   dataKey="winRate"
//                   stroke="#22c55e"
//                   strokeWidth={2}
//                   dot={{ fill: '#22c55e', strokeWidth: 0, r: 4 }}
//                   activeDot={{ r: 6, stroke: '#22c55e', strokeWidth: 2, fill: '#fff' }}
//                 />

//                 {/* Average Win line (dollar - left axis) */}
//                 <Line
//                   yAxisId="dollar"
//                   type="monotone"
//                   dataKey="avgWin"
//                   stroke="#3b82f6"
//                   strokeWidth={2}
//                   dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
//                   activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2, fill: '#fff' }}
//                 />

//                 {/* Average Loss line (dollar - left axis) */}
//                 <Line
//                   yAxisId="dollar"
//                   type="monotone"
//                   dataKey="avgLoss"
//                   stroke="#ef4444"
//                   strokeWidth={2}
//                   dot={{ fill: '#ef4444', strokeWidth: 0, r: 4 }}
//                   activeDot={{ r: 6, stroke: '#ef4444', strokeWidth: 2, fill: '#fff' }}
//                 />
//               </LineChart>
//             </ResponsiveContainer>
//           </div>
//         )}




//         {/* Legend */}
//         <div className="flex justify-center gap-6 mt-4 text-sm">
//           <div className="flex items-center gap-2">
//             <div className="w-3 h-3 bg-green-500 rounded-full"></div>
//             <span className="text-muted-foreground">Win %</span>
//           </div>
//           <div className="flex items-center gap-2">
//             <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
//             <span className="text-muted-foreground">Avg Win</span>
//           </div>
//           <div className="flex items-center gap-2">
//             <div className="w-3 h-3 bg-red-500 rounded-full"></div>
//             <span className="text-muted-foreground">Avg Loss</span>
//           </div>
//         </div>
//       </CardContent>
//     </Card>
//   );
// }
