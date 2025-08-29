/**
 * AI Summary Types - TypeScript interfaces for AI trading analysis
 */

// Request Types
export interface AnalysisRequest {
  time_range: '7d' | '30d' | '90d' | '1y' | 'ytd' | 'all_time' | 'custom';
  custom_start_date?: string;
  custom_end_date?: string;
}

export interface ChatRequest {
  question: string;
}

export interface SimilarReportsRequest {
  query_text: string;
  similarity_threshold?: number;
  limit?: number;
  search_type?: string;
}

export interface ReportSearchRequest {
  time_period?: string;
  start_date?: string;
  end_date?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  order_by?: string;
  order_direction?: 'asc' | 'desc';
}

// Response Types
export interface AnalysisResponse {
  success: boolean;
  timestamp: string;
  time_period: string;
  report: string;
  chat_enabled: boolean;
  error?: string;
}

export interface ChatResponse {
  question: string;
  answer: string;
  timestamp: string;
}

export interface QuickInsightsResponse {
  success: boolean;
  insights: QuickInsights;
  timestamp: string;
}

export interface QuickInsights {
  performance_summary: {
    win_rate: number;
    profit_factor: number;
    trade_expectancy: number;
    total_trades: number;
  };
  risk_assessment: {
    risk_reward_ratio: number;
    avg_hold_time_hours: number;
    position_consistency: number;
  };
  behavioral_flags: {
    longest_winning_streak: number;
    longest_losing_streak: number;
    directional_bias: 'bullish_bias' | 'bearish_bias' | 'balanced' | 'unknown';
  };
  top_symbols: TopSymbol[];
  time_period: string;
}

export interface TopSymbol {
  symbol: string;
  ranking_type: string;
  net_pnl?: number;
  win_rate?: number;
  total_trades?: number;
}

export interface AIServiceStatus {
  service_status: 'operational' | 'error';
  models?: Record<string, ModelStatus>;
  chat_enabled?: boolean;
  timestamp: string;
  error?: string;
}

export interface ModelStatus {
  loaded: boolean;
  ready: boolean;
}

export interface ResetChatResponse {
  success: boolean;
  message: string;
  timestamp: string;
}

// Report Types
export interface AIReportResponse {
  id: string;
  time_period: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  report_title: string;
  executive_summary: string;
  full_report?: string;
  data_analysis?: string;
  insights?: string;
  win_rate: number;
  profit_factor: number;
  trade_expectancy: number;
  total_trades: number;
  net_pnl: number;
  tags?: string[];
  model_versions?: Record<string, string>;
  processing_time_ms?: number;
  similarity_score?: number;
}

export interface AIReportStats {
  total_reports: number;
  avg_win_rate?: number;
  avg_profit_factor?: number;
  avg_processing_time_ms?: number;
  most_common_tags?: string[];
  best_performing_period?: string;
  reports_this_month: number;
  improvement_trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
}

// Chat History Types
export interface ChatHistoryItem {
  id: string;
  question: string;
  answer: string;
  source_type: string;
  model_used: string;
  usage_count: number;
  similarity_score?: number;
  created_at: string;
  last_used_at: string;
}

export interface SimilarChatResponse {
  query: string;
  similar_questions: SimilarChatItem[];
  total_found: number;
}

export interface SimilarChatItem {
  id: string;
  question: string;
  answer: string;
  similarity_score: number;
  source_type: string;
  model_used: string;
  usage_count: number;
  created_at: string;
}

export interface ChatStats {
  total_qa_pairs: number;
  qa_pairs_this_period: number;
  avg_similarity_score?: number;
  most_used_model?: string;
  total_usage_count: number;
  source_distribution: Record<string, number>;
  learning_efficiency: 'beginner' | 'intermediate' | 'advanced' | 'insufficient_data';
}

export interface DeleteChatResponse {
  success: boolean;
  message: string;
  deleted_id: string;
}

// Health Check
export interface HealthCheckResponse {
  status: 'healthy';
  service: 'ai_summary';
  timestamp: string;
}

// Error Types
export interface AIError {
  detail: string;
  status_code?: number;
}
