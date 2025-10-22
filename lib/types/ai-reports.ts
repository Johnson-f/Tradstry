// AI Reports Types
// Based on backend models from src/models/ai/reports.rs

export type TimeRange = 
  | '7d' 
  | '30d' 
  | '90d' 
  | '1y' 
  | 'ytd' 
  | 'custom' 
  | 'all_time';

export type ReportType = 
  | 'comprehensive'
  | 'performance'
  | 'risk'
  | 'trading'
  | 'behavioral'
  | 'market';

export type ReportSection = 
  | 'summary'
  | 'analytics'
  | 'insights'
  | 'trades'
  | 'patterns'
  | 'recommendations'
  | 'risk_analysis'
  | 'performance_metrics'
  | 'behavioral_analysis'
  | 'market_analysis';

export type ReportGenerationStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired';

// Request types
export interface ReportRequest {
  time_range: TimeRange;
  report_type: ReportType;
  sections?: ReportSection[];
  include_predictions?: boolean;
  force_regenerate?: boolean;
}

export interface CustomTimeRange {
  start_date?: string; // ISO 8601 format
  end_date?: string; // ISO 8601 format
}

export interface ReportRequestWithCustom extends Omit<ReportRequest, 'time_range'> {
  time_range: TimeRange | CustomTimeRange;
}

// Analytics and metrics types
export interface AnalyticsData {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  break_even_trades: number;
  total_pnl: number;
  win_rate: number;
  loss_rate: number;
  profit_factor: number;
  average_gain: number;
  average_loss: number;
  biggest_winner: number;
  biggest_loser: number;
  sharpe_ratio: number;
  max_drawdown: number;
  volatility: number;
}

export interface RiskMetrics {
  max_drawdown: number;
  sharpe_ratio: number;
  volatility: number;
  var_95: number; // Value at Risk 95%
  var_99: number; // Value at Risk 99%
  risk_score: number;
  concentration_risk: number;
  leverage_risk: number;
}

export interface PerformanceMetrics {
  total_return: number;
  annualized_return: number;
  monthly_return: number;
  daily_return: number;
  win_rate: number;
  profit_factor: number;
  average_win: number;
  average_loss: number;
  largest_win: number;
  largest_loss: number;
  consecutive_wins: number;
  consecutive_losses: number;
  avg_trade_duration: number; // in days
  avg_winning_trade_duration: number;
  avg_losing_trade_duration: number;
}

export interface TradingPattern {
  id: string;
  name: string;
  description: string;
  frequency: number;
  success_rate: number;
  avg_return: number;
  confidence_score: number;
  examples: string[];
}

export interface TradeData {
  id: string;
  symbol: string;
  trade_type: string;
  quantity: number;
  entry_price: number;
  exit_price?: number;
  pnl?: number;
  entry_date: string; // ISO 8601 format
  exit_date?: string; // ISO 8601 format
  notes?: string;
}

export interface BehavioralInsight {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'low' | 'medium' | 'high';
  impact: string;
  recommendations: string[];
  examples: string[];
  confidence_score: number;
}

export interface MarketAnalysis {
  market_condition: string;
  volatility_level: 'low' | 'medium' | 'high';
  trend_direction: 'bullish' | 'bearish' | 'sideways';
  sector_performance: Record<string, number>;
  key_events: string[];
  market_outlook: string;
  recommendations: string[];
}

export interface ReportMetadata {
  generation_time_ms: number;
  data_quality_score: number;
  trade_count: number;
  analysis_period_days: number;
  model_version: string;
  sections_included: ReportSection[];
  processing_details: {
    analytics_processing_time: number;
    insights_generation_time: number;
    pattern_analysis_time: number;
    risk_calculation_time: number;
  };
}

// Main report structure
export interface TradingReport {
  id: string;
  user_id: string;
  time_range: TimeRange;
  report_type: ReportType;
  title: string;
  summary: string;
  analytics: AnalyticsData;
  insights: string[]; // Array of insight IDs or content
  trades: TradeData[];
  recommendations: string[];
  patterns: TradingPattern[];
  risk_metrics: RiskMetrics;
  performance_metrics: PerformanceMetrics;
  behavioral_insights: BehavioralInsight[];
  market_analysis?: MarketAnalysis;
  generated_at: string; // ISO 8601 format
  expires_at?: string; // ISO 8601 format
  metadata: ReportMetadata;
}

// Report summary for list view
export interface ReportSummary {
  id: string;
  report_type: ReportType;
  title: string;
  time_range: TimeRange;
  summary: string;
  generated_at: string; // ISO 8601 format
  expires_at?: string; // ISO 8601 format
  trade_count: number;
  total_pnl: number;
  win_rate: number;
  risk_score: number;
  sections_count: number;
}

export interface ReportListResponse {
  reports: ReportSummary[];
  total_count: number;
  has_more: boolean;
}

export interface ReportGenerationTask {
  task_id: string;
  user_id: string;
  report_request: ReportRequest;
  status: ReportGenerationStatus;
  progress_percentage: number;
  created_at: string; // ISO 8601 format
  started_at?: string; // ISO 8601 format
  completed_at?: string; // ISO 8601 format
  error_message?: string;
  result_report_id?: string;
}

export interface ReportAnalytics {
  total_reports: number;
  reports_by_type: Record<string, number>;
  avg_generation_time_ms: number;
  most_common_patterns: string[];
  most_common_recommendations: string[];
  generation_frequency: number; // reports per day
  avg_risk_score: number;
  avg_performance_score: number;
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Service method types
export interface AIReportsServiceInterface {
  generateReport(request: ReportRequest): Promise<TradingReport>;
  generateReportAsync(request: ReportRequest): Promise<string>; // Returns task_id
  getReports(filters?: ReportFilters): Promise<ReportListResponse>;
  getReport(reportId: string): Promise<TradingReport>;
  getGenerationTask(taskId: string): Promise<ReportGenerationTask>;
  deleteReport(reportId: string): Promise<void>;
}

export interface ReportFilters {
  time_range?: TimeRange;
  report_type?: ReportType;
  limit?: number;
  offset?: number;
}

// Hook return types
export interface UseAIReportsReturn {
  // State
  reports: ReportSummary[];
  currentReport: TradingReport | null;
  loading: boolean;
  generating: boolean;
  error: Error | null;
  
  // Actions
  generateReport: (request: ReportRequest) => Promise<void>;
  generateReportAsync: (request: ReportRequest) => Promise<string>;
  getReports: (filters?: ReportFilters) => Promise<void>;
  getReport: (reportId: string) => Promise<void>;
  deleteReport: (reportId: string) => Promise<void>;
  refreshReports: () => Promise<void>;
  
  // Task management
  getTaskStatus: (taskId: string) => Promise<ReportGenerationTask>;
  pollTaskStatus: (taskId: string, onComplete?: (report: TradingReport) => void) => Promise<void>;
  
  // Utilities
  clearError: () => void;
  clearCurrentReport: () => void;
}

// Error types
export class AIReportsError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIReportsError';
  }
}

export class ValidationError extends AIReportsError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
  }
}

export class GenerationError extends AIReportsError {
  constructor(message: string, taskId?: string) {
    super(message, 'GENERATION_ERROR', { taskId });
  }
}

// Constants
export const REPORT_TYPES: Record<ReportType, string> = {
  comprehensive: 'Comprehensive Report',
  performance: 'Performance Report',
  risk: 'Risk Assessment Report',
  trading: 'Trading Analysis Report',
  behavioral: 'Behavioral Analysis Report',
  market: 'Market Analysis Report',
};

export const REPORT_SECTIONS: Record<ReportSection, string> = {
  summary: 'Executive Summary',
  analytics: 'Analytics Overview',
  insights: 'Key Insights',
  trades: 'Trade Analysis',
  patterns: 'Trading Patterns',
  recommendations: 'Recommendations',
  risk_analysis: 'Risk Analysis',
  performance_metrics: 'Performance Metrics',
  behavioral_analysis: 'Behavioral Analysis',
  market_analysis: 'Market Analysis',
};

export const TIME_RANGES: Record<TimeRange, string> = {
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  '1y': 'Last Year',
  'ytd': 'Year to Date',
  'custom': 'Custom Range',
  'all_time': 'All Time',
};

export const DEFAULT_REPORT_FILTERS: ReportFilters = {
  limit: 10,
  offset: 0,
};

export const POLLING_INTERVAL = 3000; // 3 seconds for reports (longer than insights)
export const MAX_POLLING_ATTEMPTS = 40; // 2 minutes max for reports

