// AI Insights Types
// Based on backend models from src/models/ai/insights.rs

export type TimeRange = 
  | '7d' 
  | '30d' 
  | '90d' 
  | '1y' 
  | 'ytd' 
  | 'custom' 
  | 'all_time';

export type InsightType = 
  | 'trading_patterns'
  | 'performance_analysis'
  | 'risk_assessment'
  | 'behavioral_analysis'
  | 'market_analysis'
  | 'opportunity_detection';

export type InsightGenerationStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'expired';

// Request types
export interface InsightRequest {
  time_range: TimeRange;
  insight_type: InsightType;
  include_predictions?: boolean;
  force_regenerate?: boolean;
}

export interface CustomTimeRange {
  start_date?: string; // ISO 8601 format
  end_date?: string; // ISO 8601 format
}

export interface InsightRequestWithCustom extends Omit<InsightRequest, 'time_range'> {
  time_range: TimeRange | CustomTimeRange;
}

// Response types
export interface InsightMetadata {
  trade_count: number;
  analysis_period_days: number;
  model_version: string;
  processing_time_ms: number;
  data_quality_score: number;
}

export interface Insight {
  id: string;
  user_id: string;
  time_range: TimeRange;
  insight_type: InsightType;
  title: string;
  content: string;
  key_findings: string[];
  recommendations: string[];
  data_sources: string[];
  confidence_score: number;
  generated_at: string; // ISO 8601 format
  expires_at?: string; // ISO 8601 format
  metadata: InsightMetadata;
}

export interface InsightSummary {
  id: string;
  insight_type: InsightType;
  title: string;
  time_range: TimeRange;
  confidence_score: number;
  generated_at: string; // ISO 8601 format
  expires_at?: string; // ISO 8601 format
  key_findings_count: number;
  recommendations_count: number;
}

export interface InsightListResponse {
  insights: InsightSummary[];
  total_count: number;
  has_more: boolean;
}

export interface InsightGenerationTask {
  task_id: string;
  user_id: string;
  insight_request: InsightRequest;
  status: InsightGenerationStatus;
  created_at: string; // ISO 8601 format
  started_at?: string; // ISO 8601 format
  completed_at?: string; // ISO 8601 format
  error_message?: string;
  result_insight_id?: string;
}

export interface InsightAnalytics {
  total_insights: number;
  insights_by_type: Record<string, number>;
  avg_confidence_score: number;
  most_common_findings: string[];
  most_common_recommendations: string[];
  generation_frequency: number; // insights per day
}

// API Response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Service method types
export interface AIInsightsServiceInterface {
  generateInsights(request: InsightRequest): Promise<Insight>;
  generateInsightsAsync(request: InsightRequest): Promise<string>; // Returns task_id
  getInsights(filters?: InsightFilters): Promise<InsightListResponse>;
  getInsight(insightId: string): Promise<Insight>;
  getGenerationTask(taskId: string): Promise<InsightGenerationTask>;
  deleteInsight(insightId: string): Promise<void>;
}

export interface InsightFilters {
  time_range?: TimeRange;
  insight_type?: InsightType;
  limit?: number;
  offset?: number;
}

// Hook return types
export interface UseAIInsightsReturn {
  // State
  insights: InsightSummary[];
  currentInsight: Insight | null;
  loading: boolean;
  generating: boolean;
  error: Error | null;
  
  // Actions
  generateInsights: (request: InsightRequest) => Promise<void>;
  generateInsightsAsync: (request: InsightRequest) => Promise<string>;
  getInsights: (filters?: InsightFilters) => Promise<void>;
  getInsight: (insightId: string) => Promise<void>;
  deleteInsight: (insightId: string) => Promise<void>;
  refreshInsights: () => Promise<void>;
  
  // Task management
  getTaskStatus: (taskId: string) => Promise<InsightGenerationTask>;
  pollTaskStatus: (taskId: string, onComplete?: (insight: Insight) => void) => Promise<void>;
  
  // Utilities
  clearError: () => void;
  clearCurrentInsight: () => void;
}

// Error types
export class AIInsightsError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AIInsightsError';
  }
}

export class ValidationError extends AIInsightsError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
  }
}

export class GenerationError extends AIInsightsError {
  constructor(message: string, taskId?: string) {
    super(message, 'GENERATION_ERROR', { taskId });
  }
}

// Constants
export const INSIGHT_TYPES: Record<InsightType, string> = {
  trading_patterns: 'Trading Patterns',
  performance_analysis: 'Performance Analysis',
  risk_assessment: 'Risk Assessment',
  behavioral_analysis: 'Behavioral Analysis',
  market_analysis: 'Market Analysis',
  opportunity_detection: 'Opportunity Detection',
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

export const DEFAULT_INSIGHT_FILTERS: InsightFilters = {
  limit: 20,
  offset: 0,
};

export const POLLING_INTERVAL = 2000; // 2 seconds
export const MAX_POLLING_ATTEMPTS = 30; // 1 minute max
