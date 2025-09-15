/**
 * Supabase Edge Function: Earnings Data Multi-Provider Fetcher
 * 
 * This Edge Function fetches detailed earnings data from 12 different market data providers,
 * combines the data to create comprehensive earnings reports with financial metrics,
 * and saves them to the database.
 * 
 * Providers used:
 * 1. Financial Modeling Prep (FMP)
 * 2. Alpha Vantage
 * 3. Finnhub
 * 4. Polygon
 * 5. Twelve Data
 * 6. Tiingo
 * 7. Yahoo Finance
 * 8. API Ninjas
 * 9. Fiscal AI
 * 10. FRED (Federal Reserve Economic Data)
 * 11. Currents API
 * 12. NewsAPI
 */ // TODO: Create a trigger logic, that fetches earnings data dynamically based on user request on the frontend 
 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
 // CORS headers for handling cross-origin requests
 const corsHeaders = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
   'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
 };
 // Provider configurations for earnings data
 const PROVIDERS = {
   fmp: {
     name: 'Financial Modeling Prep',
     apiKey: Deno.env.get('FMP_API_KEY') || '',
     baseUrl: 'https://financialmodelingprep.com/api/v3',
     endpoints: {
       earnings: '/income-statement',
       incomeStatement: '/income-statement'
     }
   },
   alpha_vantage: {
     name: 'Alpha Vantage',
     apiKey: Deno.env.get('ALPHA_VANTAGE_API_KEY') || '',
     baseUrl: 'https://www.alphavantage.co/query',
     endpoints: {
       earnings: '?function=EARNINGS'
     }
   },
   finnhub: {
     name: 'Finnhub',
     apiKey: Deno.env.get('FINNHUB_API_KEY') || '',
     baseUrl: 'https://finnhub.io/api/v1',
     endpoints: {
       earnings: '/stock/earnings',
       financials: '/stock/financials-reported'
     }
   },
   polygon: {
     name: 'Polygon',
     apiKey: Deno.env.get('POLYGON_API_KEY') || '',
     baseUrl: 'https://api.polygon.io/vX',
     endpoints: {
       financials: '/reference/financials'
     }
   },
   twelve_data: {
     name: 'Twelve Data',
     apiKey: Deno.env.get('TWELVE_DATA_API_KEY') || '',
     baseUrl: 'https://api.twelvedata.com',
     endpoints: {
       earnings: '/earnings',
       financials: '/income_statement'
     }
   },
   tiingo: {
     name: 'Tiingo',
     apiKey: Deno.env.get('TIINGO_API_KEY') || '',
     baseUrl: 'https://api.tiingo.com/tiingo/fundamentals',
     endpoints: {
       earnings: '/statements'
     }
   }
 };
 /**
  * Fetch earnings data from Financial Modeling Prep
  */ async function fetchFromFMP(symbol) {
   const config = PROVIDERS.fmp;
   if (!config.apiKey) return null;
   try {
     // Fetch both income statement and earnings calendar data
     const [incomeResponse, earningsResponse] = await Promise.all([
       fetch(`${config.baseUrl}/income-statement/${symbol}?period=quarter&limit=8&apikey=${config.apiKey}`),
       fetch(`${config.baseUrl}/earnings-calendar?from=2020-01-01&to=2025-12-31&symbol=${symbol}&apikey=${config.apiKey}`)
     ]);
     const incomeData = incomeResponse.ok ? await incomeResponse.json() : null;
     const earningsCalendarData = earningsResponse.ok ? await earningsResponse.json() : null;
     const results = [];
     // Process income statement data
     if (incomeData && Array.isArray(incomeData)) {
       incomeData.forEach((earning)=>{
         const reportedDate = new Date(earning.date);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         results.push({
           symbol: symbol,
           fiscal_year: fiscalYear,
           fiscal_quarter: fiscalQuarter,
           reported_date: earning.date,
           report_type: 'quarterly',
           // Financial metrics from FMP
           revenue: earning.revenue ? parseInt(earning.revenue) : undefined,
           net_income: earning.netIncome ? parseInt(earning.netIncome) : undefined,
           gross_profit: earning.grossProfit ? parseInt(earning.grossProfit) : undefined,
           operating_income: earning.operatingIncome ? parseInt(earning.operatingIncome) : undefined,
           ebitda: earning.ebitda ? parseInt(earning.ebitda) : undefined,
           // Calculate margins
           operating_margin: earning.revenue && earning.operatingIncome ? parseInt(earning.operatingIncome) / parseInt(earning.revenue) : undefined,
           net_margin: earning.revenue && earning.netIncome ? parseInt(earning.netIncome) / parseInt(earning.revenue) : undefined,
           // EPS calculation (basic)
           eps: earning.eps ? parseFloat(earning.eps) : undefined,
           data_provider: 'fmp'
         });
       });
     }
     // Process earnings calendar data for estimates and surprises
     if (earningsCalendarData && Array.isArray(earningsCalendarData)) {
       earningsCalendarData.forEach((earning)=>{
         const reportedDate = new Date(earning.date);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         // Find matching income statement record or create new one
         let existingRecord = results.find((r)=>r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter);
         if (!existingRecord) {
           existingRecord = {
             symbol: symbol,
             fiscal_year: fiscalYear,
             fiscal_quarter: fiscalQuarter,
             reported_date: earning.date,
             report_type: 'quarterly',
             data_provider: 'fmp'
           };
           results.push(existingRecord);
         }
         // Add earnings estimates and actuals
         if (earning.eps) existingRecord.eps = parseFloat(earning.eps);
         if (earning.epsEstimated) existingRecord.eps_estimated = parseFloat(earning.epsEstimated);
         if (earning.revenue) existingRecord.revenue = parseInt(earning.revenue);
         if (earning.revenueEstimated) existingRecord.revenue_estimated = parseInt(earning.revenueEstimated);
         // Add guidance data if available
         if (earning.guidance) existingRecord.guidance = earning.guidance;
         if (earning.nextYearEpsGuidance) existingRecord.next_year_eps_guidance = parseFloat(earning.nextYearEpsGuidance);
         if (earning.nextYearRevenueGuidance) existingRecord.next_year_revenue_guidance = parseInt(earning.nextYearRevenueGuidance);
         // Calculate surprises
         if (existingRecord.eps && existingRecord.eps_estimated) {
           existingRecord.eps_surprise = existingRecord.eps - existingRecord.eps_estimated;
           if (existingRecord.eps_estimated !== 0) {
             existingRecord.eps_surprise_percent = existingRecord.eps_surprise / existingRecord.eps_estimated * 100;
           }
         }
         if (existingRecord.revenue && existingRecord.revenue_estimated) {
           existingRecord.revenue_surprise = existingRecord.revenue - existingRecord.revenue_estimated;
           if (existingRecord.revenue_estimated !== 0) {
             existingRecord.revenue_surprise_percent = existingRecord.revenue_surprise / existingRecord.revenue_estimated * 100;
           }
         }
       });
     }
     return results.length > 0 ? results : null;
   } catch (error) {
     console.error(`FMP earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Fetch earnings data from Alpha Vantage
  */ async function fetchFromAlphaVantage(symbol) {
   const config = PROVIDERS.alpha_vantage;
   if (!config.apiKey) return null;
   try {
     const url = `${config.baseUrl}${config.endpoints.earnings}&symbol=${symbol}&apikey=${config.apiKey}`;
     const response = await fetch(url);
     if (!response.ok) return null;
     const data = await response.json();
     if (data.Note || data['Error Message'] || !data.quarterlyEarnings) return null;
     return data.quarterlyEarnings.slice(0, 8).map((earning)=>{
       const reportedDate = new Date(earning.reportedDate);
       const fiscalDate = new Date(earning.fiscalDateEnding);
       const fiscalYear = fiscalDate.getFullYear();
       const fiscalQuarter = Math.ceil((fiscalDate.getMonth() + 1) / 3);
       return {
         symbol: symbol,
         fiscal_year: fiscalYear,
         fiscal_quarter: fiscalQuarter,
         reported_date: earning.reportedDate,
         report_type: 'quarterly',
         eps: earning.reportedEPS ? parseFloat(earning.reportedEPS) : undefined,
         eps_estimated: earning.estimatedEPS ? parseFloat(earning.estimatedEPS) : undefined,
         eps_surprise: earning.surprise ? parseFloat(earning.surprise) : undefined,
         eps_surprise_percent: earning.surprisePercentage ? parseFloat(earning.surprisePercentage) : undefined,
         // Determine beat/miss/met status for EPS
         eps_beat_miss_met: earning.surprise && earning.surprise !== '0' ? parseFloat(earning.surprise) > 0 ? 'beat' : 'miss' : 'met',
         data_provider: 'alpha_vantage'
       };
     });
   } catch (error) {
     console.error(`Alpha Vantage earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Fetch earnings data from Finnhub
  */ async function fetchFromFinnhub(symbol) {
   const config = PROVIDERS.finnhub;
   if (!config.apiKey) return null;
   try {
     // Fetch earnings, financials, and earnings calendar data
     const [earningsResponse, financialsResponse, calendarResponse] = await Promise.all([
       fetch(`${config.baseUrl}${config.endpoints.earnings}?symbol=${symbol}&token=${config.apiKey}`),
       fetch(`${config.baseUrl}${config.endpoints.financials}?symbol=${symbol}&freq=quarterly&token=${config.apiKey}`),
       fetch(`${config.baseUrl}/calendar/earnings?from=2020-01-01&to=2025-12-31&symbol=${symbol}&token=${config.apiKey}`)
     ]);
     const earningsData = earningsResponse.ok ? await earningsResponse.json() : null;
     const financialsData = financialsResponse.ok ? await financialsResponse.json() : null;
     const calendarData = calendarResponse.ok ? await calendarResponse.json() : null;
     const results = [];
     // Process earnings data
     if (earningsData && Array.isArray(earningsData)) {
       earningsData.slice(0, 8).forEach((earning)=>{
         const reportedDate = new Date(earning.period);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         const eps = earning.actual ? parseFloat(earning.actual) : undefined;
         const eps_estimated = earning.estimate ? parseFloat(earning.estimate) : undefined;
         results.push({
           symbol: symbol,
           fiscal_year: fiscalYear,
           fiscal_quarter: fiscalQuarter,
           reported_date: earning.period,
           report_type: 'quarterly',
           eps: eps,
           eps_estimated: eps_estimated,
           eps_surprise: eps && eps_estimated ? eps - eps_estimated : undefined,
           eps_surprise_percent: eps && eps_estimated && eps_estimated !== 0 ? (eps - eps_estimated) / eps_estimated * 100 : undefined,
           data_provider: 'finnhub'
         });
       });
     }
     // Process earnings calendar data for additional estimates and conference call info
     if (calendarData && calendarData.earningsCalendar && Array.isArray(calendarData.earningsCalendar)) {
       calendarData.earningsCalendar.forEach((calendarEvent)=>{
         const reportedDate = new Date(calendarEvent.date);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         // Find matching earnings record or create new one
         let existingRecord = results.find((r)=>r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter);
         if (!existingRecord) {
           existingRecord = {
             symbol: symbol,
             fiscal_year: fiscalYear,
             fiscal_quarter: fiscalQuarter,
             reported_date: calendarEvent.date,
             report_type: 'quarterly',
             data_provider: 'finnhub'
           };
           results.push(existingRecord);
         }
         // Add earnings estimates and conference call data
         if (calendarEvent.epsEstimate) existingRecord.eps_estimated = parseFloat(calendarEvent.epsEstimate);
         if (calendarEvent.epsActual) existingRecord.eps = parseFloat(calendarEvent.epsActual);
         if (calendarEvent.revenueEstimate) existingRecord.revenue_estimated = parseInt(calendarEvent.revenueEstimate);
         if (calendarEvent.revenueActual) existingRecord.revenue = parseInt(calendarEvent.revenueActual);
         if (calendarEvent.hour) existingRecord.conference_call_date = `${calendarEvent.date} ${calendarEvent.hour}`;
         if (calendarEvent.time) existingRecord.conference_call_date = `${calendarEvent.date} ${calendarEvent.time}`;
         // Calculate surprises if we have both actual and estimate
         if (existingRecord.eps && existingRecord.eps_estimated) {
           existingRecord.eps_surprise = existingRecord.eps - existingRecord.eps_estimated;
           if (existingRecord.eps_estimated !== 0) {
             existingRecord.eps_surprise_percent = existingRecord.eps_surprise / existingRecord.eps_estimated * 100;
           }
         }
         if (existingRecord.revenue && existingRecord.revenue_estimated) {
           existingRecord.revenue_surprise = existingRecord.revenue - existingRecord.revenue_estimated;
           if (existingRecord.revenue_estimated !== 0) {
             existingRecord.revenue_surprise_percent = existingRecord.revenue_surprise / existingRecord.revenue_estimated * 100;
           }
         }
       });
     }
     // Process financials data
     if (financialsData && financialsData.data && Array.isArray(financialsData.data)) {
       financialsData.data.slice(0, 8).forEach((financial)=>{
         if (financial.report && financial.report.ic) {
           const ic = financial.report.ic;
           const reportedDate = financial.endDate;
           const fiscalYear = new Date(reportedDate).getFullYear();
           const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
           // Find matching earnings record or create new one
           let existingRecord = results.find((r)=>r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter);
           if (!existingRecord) {
             existingRecord = {
               symbol: symbol,
               fiscal_year: fiscalYear,
               fiscal_quarter: fiscalQuarter,
               reported_date: reportedDate,
               report_type: 'quarterly',
               data_provider: 'finnhub'
             };
             results.push(existingRecord);
           }
           // Add financial data
           const revenue = ic.find((item)=>item.concept === 'Revenues')?.value;
           const netIncome = ic.find((item)=>item.concept === 'NetIncomeLoss')?.value;
           const grossProfit = ic.find((item)=>item.concept === 'GrossProfit')?.value;
           const operatingIncome = ic.find((item)=>item.concept === 'OperatingIncomeLoss')?.value;
           if (revenue) existingRecord.revenue = revenue;
           if (netIncome) existingRecord.net_income = netIncome;
           if (grossProfit) existingRecord.gross_profit = grossProfit;
           if (operatingIncome) existingRecord.operating_income = operatingIncome;
         }
       });
     }
     return results.length > 0 ? results : null;
   } catch (error) {
     console.error(`Finnhub earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Fetch earnings data from Twelve Data
  */ async function fetchFromTwelveData(symbol) {
   const config = PROVIDERS.twelve_data;
   if (!config.apiKey) return null;
   try {
     // Fetch earnings, income statement, and earnings calendar data
     const [earningsResponse, incomeResponse, calendarResponse] = await Promise.all([
       fetch(`${config.baseUrl}${config.endpoints.earnings}?symbol=${symbol}&apikey=${config.apiKey}`),
       fetch(`${config.baseUrl}${config.endpoints.financials}?symbol=${symbol}&period=quarterly&apikey=${config.apiKey}`),
       fetch(`${config.baseUrl}/earnings_calendar?symbol=${symbol}&apikey=${config.apiKey}`)
     ]);
     const earningsData = earningsResponse.ok ? await earningsResponse.json() : null;
     const incomeData = incomeResponse.ok ? await incomeResponse.json() : null;
     const calendarData = calendarResponse.ok ? await calendarResponse.json() : null;
     const results = [];
     // Process earnings data
     if (earningsData && earningsData.earnings && Array.isArray(earningsData.earnings)) {
       earningsData.earnings.slice(0, 8).forEach((earning)=>{
         const reportedDate = new Date(earning.date);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         const eps = earning.eps ? parseFloat(earning.eps) : undefined;
         const eps_estimated = earning.eps_estimate ? parseFloat(earning.eps_estimate) : undefined;
         results.push({
           symbol: symbol,
           fiscal_year: fiscalYear,
           fiscal_quarter: fiscalQuarter,
           reported_date: earning.date,
           report_type: 'quarterly',
           eps: eps,
           eps_estimated: eps_estimated,
           eps_surprise: eps && eps_estimated ? eps - eps_estimated : undefined,
           eps_surprise_percent: eps && eps_estimated && eps_estimated !== 0 ? (eps - eps_estimated) / eps_estimated * 100 : undefined,
           // Revenue estimates if available
           revenue_estimated: earning.revenue_estimate ? parseInt(earning.revenue_estimate) : undefined,
           data_provider: 'twelve_data'
         });
       });
     }
     // Process earnings calendar data for additional estimates
     if (calendarData && calendarData.earnings_calendar && Array.isArray(calendarData.earnings_calendar)) {
       calendarData.earnings_calendar.forEach((calendarEvent)=>{
         const reportedDate = new Date(calendarEvent.date);
         const fiscalYear = reportedDate.getFullYear();
         const fiscalQuarter = Math.ceil((reportedDate.getMonth() + 1) / 3);
         // Find matching earnings record or create new one
         let existingRecord = results.find((r)=>r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter);
         if (!existingRecord) {
           existingRecord = {
             symbol: symbol,
             fiscal_year: fiscalYear,
             fiscal_quarter: fiscalQuarter,
             reported_date: calendarEvent.date,
             report_type: 'quarterly',
             data_provider: 'twelve_data'
           };
           results.push(existingRecord);
         }
         // Add earnings estimates and actuals from calendar
         if (calendarEvent.eps_estimate) existingRecord.eps_estimated = parseFloat(calendarEvent.eps_estimate);
         if (calendarEvent.eps_actual) existingRecord.eps = parseFloat(calendarEvent.eps_actual);
         if (calendarEvent.revenue_estimate) existingRecord.revenue_estimated = parseInt(calendarEvent.revenue_estimate);
         if (calendarEvent.revenue_actual) existingRecord.revenue = parseInt(calendarEvent.revenue_actual);
         // Calculate surprises
         if (existingRecord.eps && existingRecord.eps_estimated) {
           existingRecord.eps_surprise = existingRecord.eps - existingRecord.eps_estimated;
           if (existingRecord.eps_estimated !== 0) {
             existingRecord.eps_surprise_percent = existingRecord.eps_surprise / existingRecord.eps_estimated * 100;
           }
         }
         if (existingRecord.revenue && existingRecord.revenue_estimated) {
           existingRecord.revenue_surprise = existingRecord.revenue - existingRecord.revenue_estimated;
           if (existingRecord.revenue_estimated !== 0) {
             existingRecord.revenue_surprise_percent = existingRecord.revenue_surprise / existingRecord.revenue_estimated * 100;
           }
         }
       });
     }
     // Process income statement data
     if (incomeData && incomeData.income_statement && Array.isArray(incomeData.income_statement)) {
       incomeData.income_statement.slice(0, 8).forEach((income)=>{
         const reportedDate = income.fiscal_date;
         const fiscalYear = new Date(reportedDate).getFullYear();
         const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
         // Find matching earnings record or create new one
         let existingRecord = results.find((r)=>r.fiscal_year === fiscalYear && r.fiscal_quarter === fiscalQuarter);
         if (!existingRecord) {
           existingRecord = {
             symbol: symbol,
             fiscal_year: fiscalYear,
             fiscal_quarter: fiscalQuarter,
             reported_date: reportedDate,
             report_type: 'quarterly',
             data_provider: 'twelve_data'
           };
           results.push(existingRecord);
         }
         // Add financial metrics
         if (income.revenues) existingRecord.revenue = parseInt(income.revenues);
         if (income.net_income) existingRecord.net_income = parseInt(income.net_income);
         if (income.gross_profit) existingRecord.gross_profit = parseInt(income.gross_profit);
         if (income.operating_income) existingRecord.operating_income = parseInt(income.operating_income);
         if (income.ebitda) existingRecord.ebitda = parseInt(income.ebitda);
       });
     }
     return results.length > 0 ? results : null;
   } catch (error) {
     console.error(`Twelve Data earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Fetch earnings data from Tiingo
  */ async function fetchFromTiingo(symbol) {
   const config = PROVIDERS.tiingo;
   if (!config.apiKey) return null;
   try {
     const url = `${config.baseUrl}/${symbol}${config.endpoints.earnings}?token=${config.apiKey}`;
     const response = await fetch(url);
     if (!response.ok) return null;
     const data = await response.json();
     if (!Array.isArray(data) || data.length === 0) return null;
     return data.slice(0, 8).map((earning)=>{
       const reportedDate = earning.date;
       const fiscalYear = new Date(reportedDate).getFullYear();
       const fiscalQuarter = Math.ceil((new Date(reportedDate).getMonth() + 1) / 3);
       return {
         symbol: symbol,
         fiscal_year: fiscalYear,
         fiscal_quarter: fiscalQuarter,
         reported_date: reportedDate,
         report_type: 'quarterly',
         revenue: earning.revenue ? parseInt(earning.revenue) : undefined,
         net_income: earning.netIncome ? parseInt(earning.netIncome) : undefined,
         gross_profit: earning.grossProfit ? parseInt(earning.grossProfit) : undefined,
         operating_income: earning.operatingIncome ? parseInt(earning.operatingIncome) : undefined,
         // EPS data if available
         eps: earning.eps ? parseFloat(earning.eps) : undefined,
         eps_estimated: earning.epsEstimate ? parseFloat(earning.epsEstimate) : undefined,
         // Revenue estimates if available
         revenue_estimated: earning.revenueEstimate ? parseInt(earning.revenueEstimate) : undefined,
         data_provider: 'tiingo'
       };
     });
   } catch (error) {
     console.error(`Tiingo earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Fetch earnings data from Polygon
  */ async function fetchFromPolygon(symbol) {
   const config = PROVIDERS.polygon;
   if (!config.apiKey) return null;
   try {
     const url = `${config.baseUrl}${config.endpoints.financials}?ticker=${symbol}&timeframe=quarterly&apikey=${config.apiKey}`;
     const response = await fetch(url);
     if (!response.ok) return null;
     const data = await response.json();
     if (!data.results || !Array.isArray(data.results)) return null;
     return data.results.slice(0, 8).map((financial)=>{
       const fiscalYear = financial.fiscal_year;
       const fiscalQuarter = financial.fiscal_period;
       const reportedDate = financial.end_date;
       const financials = financial.financials;
       const incomeStatement = financials?.income_statement;
       return {
         symbol: symbol,
         fiscal_year: fiscalYear,
         fiscal_quarter: fiscalQuarter === 'FY' ? undefined : parseInt(fiscalQuarter.replace('Q', '')),
         reported_date: reportedDate,
         report_type: fiscalQuarter === 'FY' ? 'annual' : 'quarterly',
         revenue: incomeStatement?.revenues ? incomeStatement.revenues.value : undefined,
         net_income: incomeStatement?.net_income_loss ? incomeStatement.net_income_loss.value : undefined,
         gross_profit: incomeStatement?.gross_profit ? incomeStatement.gross_profit.value : undefined,
         operating_income: incomeStatement?.operating_income_loss ? incomeStatement.operating_income_loss.value : undefined,
         data_provider: 'polygon'
       };
     });
   } catch (error) {
     console.error(`Polygon earnings data fetch error for ${symbol}:`, error);
     return null;
   }
 }
 /**
  * Combine earnings data from multiple providers
  */ function combineEarningsData(dataArrays) {
   const validData = dataArrays.filter((data)=>data !== null);
   if (validData.length === 0) return [];
   // Flatten all earnings records
   const allEarnings = validData.flat();
   // Group by symbol, fiscal_year, and fiscal_quarter to merge duplicates
   const earningsMap = new Map();
   for (const earning of allEarnings){
     if (!earning.symbol || !earning.fiscal_year || !earning.reported_date) continue;
     const key = `${earning.symbol}-${earning.fiscal_year}-${earning.fiscal_quarter || 'annual'}`;
     if (earningsMap.has(key)) {
       // Merge with existing record, preferring non-null values
       const existing = earningsMap.get(key);
       const merged = {
         symbol: earning.symbol,
         fiscal_year: earning.fiscal_year,
         reported_date: earning.reported_date,
         data_provider: `${existing.data_provider}, ${earning.data_provider}`
       };
       // Merge other fields, preferring non-null/non-empty values
       for (const [key, value] of Object.entries(earning)){
         if (value !== null && value !== undefined && value !== '') {
           if (key !== 'data_provider' && !merged[key]) {
             merged[key] = value;
           }
         }
       }
       // Calculate surprise percentages and beat/miss/met status
       if (merged.eps && merged.eps_estimated) {
         if (!merged.eps_surprise) {
           merged.eps_surprise = merged.eps - merged.eps_estimated;
         }
         if (!merged.eps_surprise_percent && merged.eps_estimated !== 0) {
           merged.eps_surprise_percent = merged.eps_surprise / merged.eps_estimated * 100;
         }
         if (!merged.eps_beat_miss_met) {
           merged.eps_beat_miss_met = merged.eps_surprise > 0 ? 'beat' : merged.eps_surprise < 0 ? 'miss' : 'met';
         }
       }
       if (merged.revenue && merged.revenue_estimated) {
         if (!merged.revenue_surprise) {
           merged.revenue_surprise = merged.revenue - merged.revenue_estimated;
         }
         if (!merged.revenue_surprise_percent && merged.revenue_estimated !== 0) {
           merged.revenue_surprise_percent = merged.revenue_surprise / merged.revenue_estimated * 100;
         }
         if (!merged.revenue_beat_miss_met) {
           merged.revenue_beat_miss_met = merged.revenue_surprise > 0 ? 'beat' : merged.revenue_surprise < 0 ? 'miss' : 'met';
         }
       }
       // Calculate margins
       if (merged.revenue) {
         if (merged.operating_income && !merged.operating_margin) {
           merged.operating_margin = merged.operating_income / merged.revenue;
         }
         if (merged.net_income && !merged.net_margin) {
           merged.net_margin = merged.net_income / merged.revenue;
         }
       }
       earningsMap.set(key, merged);
     } else {
       // Create new record
       const newEarning = {
         symbol: earning.symbol,
         exchange_id: earning.exchange_id,
         fiscal_year: earning.fiscal_year,
         fiscal_quarter: earning.fiscal_quarter,
         reported_date: earning.reported_date,
         report_type: earning.report_type || 'quarterly',
         eps: earning.eps,
         eps_estimated: earning.eps_estimated,
         eps_surprise: earning.eps_surprise,
         eps_surprise_percent: earning.eps_surprise_percent,
         revenue: earning.revenue,
         revenue_estimated: earning.revenue_estimated,
         revenue_surprise: earning.revenue_surprise,
         revenue_surprise_percent: earning.revenue_surprise_percent,
         net_income: earning.net_income,
         gross_profit: earning.gross_profit,
         operating_income: earning.operating_income,
         ebitda: earning.ebitda,
         operating_margin: earning.operating_margin,
         net_margin: earning.net_margin,
         year_over_year_eps_growth: earning.year_over_year_eps_growth,
         year_over_year_revenue_growth: earning.year_over_year_revenue_growth,
         guidance: earning.guidance,
         next_year_eps_guidance: earning.next_year_eps_guidance,
         next_year_revenue_guidance: earning.next_year_revenue_guidance,
         conference_call_date: earning.conference_call_date,
         transcript_url: earning.transcript_url,
         audio_url: earning.audio_url,
         eps_beat_miss_met: earning.eps_beat_miss_met,
         revenue_beat_miss_met: earning.revenue_beat_miss_met,
         data_provider: earning.data_provider || 'unknown'
       };
       // Calculate derived metrics
       if (newEarning.eps && newEarning.eps_estimated) {
         if (!newEarning.eps_surprise) {
           newEarning.eps_surprise = newEarning.eps - newEarning.eps_estimated;
         }
         if (!newEarning.eps_surprise_percent && newEarning.eps_estimated !== 0) {
           newEarning.eps_surprise_percent = newEarning.eps_surprise / newEarning.eps_estimated * 100;
         }
         if (!newEarning.eps_beat_miss_met) {
           newEarning.eps_beat_miss_met = newEarning.eps_surprise > 0 ? 'beat' : newEarning.eps_surprise < 0 ? 'miss' : 'met';
         }
       }
       if (newEarning.revenue && newEarning.revenue_estimated) {
         if (!newEarning.revenue_surprise) {
           newEarning.revenue_surprise = newEarning.revenue - newEarning.revenue_estimated;
         }
         if (!newEarning.revenue_surprise_percent && newEarning.revenue_estimated !== 0) {
           newEarning.revenue_surprise_percent = newEarning.revenue_surprise / newEarning.revenue_estimated * 100;
         }
         if (!newEarning.revenue_beat_miss_met) {
           newEarning.revenue_beat_miss_met = newEarning.revenue_surprise > 0 ? 'beat' : newEarning.revenue_surprise < 0 ? 'miss' : 'met';
         }
       }
       // Calculate margins
       if (newEarning.revenue) {
         if (newEarning.operating_income && !newEarning.operating_margin) {
           newEarning.operating_margin = newEarning.operating_income / newEarning.revenue;
         }
         if (newEarning.net_income && !newEarning.net_margin) {
           newEarning.net_margin = newEarning.net_income / newEarning.revenue;
         }
       }
       earningsMap.set(key, newEarning);
     }
   }
   return Array.from(earningsMap.values());
 }
 /**
  * Fetch existing symbols from the database
  */ async function getExistingSymbols(supabase) {
   try {
     const { data, error } = await supabase.from('stock_quotes').select('symbol').order('symbol');
     if (error) {
       console.error('Error fetching existing symbols:', error);
       return [];
     }
     // Get unique symbols
     const uniqueSymbols = [
       ...new Set(data.map((row)=>row.symbol))
     ];
     return uniqueSymbols;
   } catch (error) {
     console.error('Error in getExistingSymbols:', error);
     return [];
   }
 }
 /**
  * Save earnings data to the database
  */ async function saveEarningsData(supabase, earningsData) {
   if (earningsData.length === 0) return true;
   try {
     const { error } = await supabase.from('earnings_data').upsert(earningsData, {
       onConflict: 'symbol,fiscal_year,fiscal_quarter,data_provider'
     });
     if (error) {
       console.error(`Error saving earnings data:`, error);
       return false;
     }
     return true;
   } catch (error) {
     console.error(`Error in saveEarningsData:`, error);
     return false;
   }
 }
 /**
  * Main Edge Function handler
  */ Deno.serve(async (req)=>{
   // Handle CORS preflight requests
   if (req.method === 'OPTIONS') {
     return new Response('ok', {
       headers: corsHeaders
     });
   }
   try {
     // Initialize Supabase client
     const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
     console.log('Starting earnings data multi-provider fetch...');
     // Get existing symbols from the database
     const existingSymbols = await getExistingSymbols(supabaseClient);
     if (existingSymbols.length === 0) {
       return new Response(JSON.stringify({
         success: false,
         message: 'No existing symbols found in database',
         processed: 0
       }), {
         headers: {
           ...corsHeaders,
           'Content-Type': 'application/json'
         },
         status: 404
       });
     }
     console.log(`Found ${existingSymbols.length} existing symbols to process`);
     let processedCount = 0;
     let successCount = 0;
     let errorCount = 0;
     let totalEarnings = 0;
     // Process symbols in batches
     const batchSize = 5; // Smaller batches for financial data
     const results = [];
     for(let i = 0; i < existingSymbols.length; i += batchSize){
       const batch = existingSymbols.slice(i, i + batchSize);
       try {
         console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(existingSymbols.length / batchSize)}`);
         // Process each symbol individually (most earnings APIs are symbol-specific)
         for (const symbol of batch){
           try {
             console.log(`Fetching earnings data for ${symbol}...`);
             // Fetch data from all providers for this symbol
             const providerPromises = [
               fetchFromFMP(symbol),
               fetchFromAlphaVantage(symbol),
               fetchFromFinnhub(symbol),
               fetchFromTwelveData(symbol),
               fetchFromTiingo(symbol),
               fetchFromPolygon(symbol)
             ];
             const providerResults = await Promise.allSettled(providerPromises);
             // Filter successful results
             const validResults = providerResults.map((result)=>result.status === 'fulfilled' ? result.value : null).filter((result)=>result !== null);
             if (validResults.length > 0) {
               const combinedData = combineEarningsData(validResults);
               if (combinedData.length > 0) {
                 const saved = await saveEarningsData(supabaseClient, combinedData);
                 if (saved) {
                   successCount++;
                   totalEarnings += combinedData.length;
                   results.push({
                     symbol,
                     status: 'success',
                     earnings_records: combinedData.length,
                     providers: validResults.length
                   });
                 } else {
                   errorCount++;
                   results.push({
                     symbol,
                     status: 'error',
                     message: 'Failed to save to database'
                   });
                 }
               } else {
                 errorCount++;
                 results.push({
                   symbol,
                   status: 'error',
                   message: 'No valid earnings data found'
                 });
               }
             } else {
               errorCount++;
               results.push({
                 symbol,
                 status: 'error',
                 message: 'No data from any provider'
               });
             }
             processedCount++;
             // Small delay between symbols to be respectful to APIs
             await new Promise((resolve)=>setTimeout(resolve, 500));
           } catch (symbolError) {
             errorCount++;
             console.error(`Error processing symbol ${symbol}:`, symbolError);
             results.push({
               symbol,
               status: 'error',
               message: symbolError.message
             });
           }
         }
       } catch (error) {
         errorCount += batch.length;
         console.error(`Error processing batch:`, error);
         for (const symbol of batch){
           results.push({
             symbol,
             status: 'error',
             message: error.message
           });
         }
       }
       // Delay between batches to respect rate limits
       if (i + batchSize < existingSymbols.length) {
         await new Promise((resolve)=>setTimeout(resolve, 3000));
       }
     }
     const response = {
       success: true,
       message: 'Earnings data multi-provider fetch completed',
       summary: {
         total_symbols: existingSymbols.length,
         processed: processedCount,
         successful: successCount,
         errors: errorCount,
         total_earnings_records: totalEarnings
       },
       results: results.slice(0, 50) // Limit response size
     };
     return new Response(JSON.stringify(response), {
       headers: {
         ...corsHeaders,
         'Content-Type': 'application/json'
       },
       status: 200
     });
   } catch (error) {
     console.error('Edge function error:', error);
     return new Response(JSON.stringify({
       success: false,
       error: error.message,
       message: 'Internal server error'
     }), {
       headers: {
         ...corsHeaders,
         'Content-Type': 'application/json'
       },
       status: 500
     });
   }
 });
 