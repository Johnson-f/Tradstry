// "use client";

// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import { useQuery } from "@tanstack/react-query";
// import { analyticsService } from "@/lib/services/analytics-service";
// import { TrendingUp, TrendingDown, Target, Award, BarChart3 } from "lucide-react";
// import { format } from "date-fns";
// import type { CombinedAnalytics, AnalyticsQuery } from "@/lib/types/analytics";

// interface MetricsCardsProps {
//   timeRange?: string;
//   customStartDate?: Date;
//   customEndDate?: Date;
// }

// export function MetricsCards({ timeRange = '30d', customStartDate, customEndDate }: MetricsCardsProps) {
//   // Convert props to API query parameters
//   const getApiQueryParams = (): AnalyticsQuery => {
//     const params: AnalyticsQuery = {
//       periodType: timeRange || '30d'
//     };

//     // Add custom date range if provided
//     if (timeRange === 'custom' && customStartDate && customEndDate) {
//       params.customStartDate = format(customStartDate, 'yyyy-MM-dd');
//       params.customEndDate = format(customEndDate, 'yyyy-MM-dd');
//     }

//     return params;
//   };

//   const apiParams = getApiQueryParams();

//   const { data: combinedData, isLoading, error } = useQuery<CombinedAnalytics, Error>({
//     queryKey: ['combinedPortfolioAnalytics', apiParams],
//     queryFn: async () => {
//       console.log('[MetricsCards] Starting API call with params:', apiParams);
//       try {
//         const result = await analyticsService.getCombinedPortfolioAnalytics(apiParams);
//         console.log('[MetricsCards] API response:', result);

//         // Transform snake_case to camelCase and map to CombinedAnalytics interface
//         const transformedData = {
//           // The API returns win_rate as a percentage (e.g., 100 for 100%)
//           // So we divide by 100 to get a decimal for proper formatting
//           winRate: (result.win_rate || 0) / 100,
//           averageGain: result.average_gain || 0,
//           averageLoss: result.average_loss || 0,
//           riskRewardRatio: result.risk_reward_ratio || 0,
//           tradeExpectancy: result.trade_expectancy || 0,
//           netPnl: result.net_pnl || 0,
//           profitFactor: result.profit_factor || 0,
//           avgHoldTimeWinners: result.avg_hold_time_winners || 0,
//           avgHoldTimeLosers: result.avg_hold_time_losers || 0,
//           biggestWinner: result.biggest_winner || 0,
//           biggestLoser: result.biggest_loser || 0,
//           periodInfo: {
//             periodType: apiParams.periodType || '30d'
//           }
//         };

//         console.log('[MetricsCards] Transformed data:', transformedData);
//         return transformedData;
//       } catch (err) {
//         console.error('[MetricsCards] API error:', err);
//         throw err;
//       }
//     },
//     staleTime: 5 * 60 * 1000, // 5 minutes
//     gcTime: 10 * 60 * 1000, // 10 minutes
//     retry: 1,
//     refetchOnWindowFocus: false,
//   });

//   // Debug logging
//   console.log('[MetricsCards] Current state:', {
//     isLoading,
//     error: error?.message,
//     combinedData,
//     apiParams
//   });

//   if (error) {
//     return (
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
//         {Array.from({ length: 5 }).map((_, i) => (
//           <Card key={i} className="border-destructive/20">
//             <CardContent className="p-6">
//               <p className="text-sm text-destructive">Error loading data</p>
//             </CardContent>
//           </Card>
//         ))}
//       </div>
//     );
//   }

//   const formatCurrency = (value: number | null) => {
//     if (value === null || value === undefined) return "$0.00";
//     return new Intl.NumberFormat('en-US', {
//       style: 'currency',
//       currency: 'USD',
//     }).format(value);
//   };

//   const formatPercentage = (value: number | null) => {
//     if (value === null || value === undefined) return "0.00%";
//     return `${(value * 100).toFixed(2)}%`;
//   };

//   const formatRatio = (value: number | null) => {
//     if (value === null || value === undefined) return "0.00";
//     return value.toFixed(2);
//   };

//   const getValueColor = (value: number | null, isPositiveGood: boolean = true) => {
//     if (value === null || value === undefined) return "text-muted-foreground";
//     if (isPositiveGood) {
//       return value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-muted-foreground";
//     } else {
//       return value < 0 ? "text-green-600" : value > 0 ? "text-red-600" : "text-muted-foreground";
//     }
//   };

//   const getTrendIcon = (value: number | null, isPositiveGood: boolean = true) => {
//     if (value === null || value === undefined) return null;
//     if (isPositiveGood) {
//       return value > 0 ? <TrendingUp className="h-4 w-4" /> : value < 0 ? <TrendingDown className="h-4 w-4" /> : null;
//     } else {
//       return value < 0 ? <TrendingUp className="h-4 w-4" /> : value > 0 ? <TrendingDown className="h-4 w-4" /> : null;
//     }
//   };

//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
//       {/* Net P&L Card */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//           <CardTitle className="text-sm font-medium">Net P&L</CardTitle>
//           <BarChart3 className="h-4 w-4 text-muted-foreground" />
//         </CardHeader>
//         <CardContent>
//           {isLoading ? (
//             <div className="space-y-2">
//               <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
//               <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
//             </div>
//           ) : (
//             <div className="space-y-1">
//               <div className={`text-2xl font-bold flex items-center gap-2 ${getValueColor(combinedData?.netPnl)}`}>
//                 {combinedData?.netPnl !== undefined ? formatCurrency(combinedData.netPnl) : 'No data'}
//                 {getTrendIcon(combinedData?.netPnl)}
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 Total portfolio performance
//               </p>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* Trade Expectancy Card */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//           <CardTitle className="text-sm font-medium">Trade Expectancy</CardTitle>
//           <Target className="h-4 w-4 text-muted-foreground" />
//         </CardHeader>
//         <CardContent>
//           {isLoading ? (
//             <div className="space-y-2">
//               <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
//               <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
//             </div>
//           ) : (
//             <div className="space-y-1">
//               <div className={`text-2xl font-bold flex items-center gap-2 ${getValueColor(combinedData?.tradeExpectancy)}`}>
//                 {combinedData?.tradeExpectancy !== undefined ? formatCurrency(combinedData.tradeExpectancy) : 'No data'}
//                 {getTrendIcon(combinedData?.tradeExpectancy)}
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 Expected value per trade
//               </p>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* Profit Factor Card */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//           <CardTitle className="text-sm font-medium">Profit Factor</CardTitle>
//           <Award className="h-4 w-4 text-muted-foreground" />
//         </CardHeader>
//         <CardContent>
//           {isLoading ? (
//             <div className="space-y-2">
//               <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
//               <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
//             </div>
//           ) : (
//             <div className="space-y-1">
//               <div className={`text-2xl font-bold flex items-center gap-2 ${getValueColor(combinedData?.profitFactor)}`}>
//                 {combinedData?.profitFactor !== undefined ? formatRatio(combinedData.profitFactor) : 'No data'}
//                 {getTrendIcon(combinedData?.profitFactor)}
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 Gross profit ÷ gross loss
//               </p>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* Win Rate Card */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//           <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
//           <TrendingUp className="h-4 w-4 text-muted-foreground" />
//         </CardHeader>
//         <CardContent>
//           {isLoading ? (
//             <div className="space-y-2">
//               <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
//               <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
//             </div>
//           ) : (
//             <div className="space-y-1">
//               <div className={`text-2xl font-bold flex items-center gap-2 ${getValueColor(combinedData?.winRate)}`}>
//                 {combinedData?.winRate !== undefined ? formatPercentage(combinedData.winRate) : 'No data'}
//                 {getTrendIcon(combinedData?.winRate)}
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 Percentage of winning trades
//               </p>
//             </div>
//           )}
//         </CardContent>
//       </Card>

//       {/* Risk to Reward Card */}
//       <Card>
//         <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//           <CardTitle className="text-sm font-medium">Risk to Reward</CardTitle>
//           <Target className="h-4 w-4 text-muted-foreground" />
//         </CardHeader>
//         <CardContent>
//           {isLoading ? (
//             <div className="space-y-2">
//               <div className="h-8 w-20 bg-muted rounded animate-pulse"></div>
//               <div className="h-4 w-16 bg-muted rounded animate-pulse"></div>
//             </div>
//           ) : (
//             <div className="space-y-1">
//               <div className={`text-2xl font-bold flex items-center gap-2 ${getValueColor(combinedData?.riskRewardRatio)}`}>
//                 {combinedData?.riskRewardRatio !== undefined ? `1:${formatRatio(combinedData.riskRewardRatio)}` : 'No data'}
//                 {getTrendIcon(combinedData?.riskRewardRatio)}
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 Average gain ÷ average loss
//               </p>
//             </div>
//           )}
//         </CardContent>
//       </Card>
//     </div>
//   );
// }
