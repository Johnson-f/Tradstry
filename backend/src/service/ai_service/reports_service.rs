use crate::models::ai::reports::{
    TradingReport, ReportRequest, ReportType, ReportSection, 
    AnalyticsData, TradeData, ReportMetadata,
    ReportListResponse
};
use crate::models::stock::stocks::TimeRange;
use crate::models::ai::insights::{Insight, InsightRequest, InsightType};
use crate::service::ai_service::AIInsightsService;
use crate::turso::TursoClient;
use anyhow::Result as AnyhowResult;
use chrono::{DateTime, Utc, Datelike, TimeZone};
use libsql::Connection;
use log::info;
use serde::Serialize;
use serde_json;
use std::sync::Arc;

/// AI Reports Service for generating comprehensive trading reports
pub struct AiReportsService {
    #[allow(dead_code)]
    turso_client: Arc<TursoClient>,
    ai_insights_service: Arc<AIInsightsService>,
}

impl AiReportsService {
    pub fn new(turso_client: Arc<TursoClient>, ai_insights_service: Arc<AIInsightsService>) -> Self {
        Self { 
            turso_client,
            ai_insights_service,
        }
    }

    /// Generate a comprehensive trading report
    pub async fn generate_report(
        &self,
        conn: &Connection,
        user_id: &str,
        request: ReportRequest,
    ) -> AnyhowResult<TradingReport> {
        info!("Generating {} report for user: {}", request.report_type, user_id);

        let start_time = Utc::now();
        
        // Create base report
        let mut report = TradingReport::new(
            user_id.to_string(),
            request.time_range.clone(),
            request.report_type.clone(),
            self.generate_report_title(&request.report_type, &request.time_range),
        );

        // Generate analytics data
        let analytics = self.generate_analytics_data(conn, user_id, &request.time_range).await?;
        report = report.with_analytics(analytics);

        // Generate insights
        let insights = self.generate_insights(conn, user_id, &request.time_range).await?;
        report = report.with_insights(insights);

        // Generate trade data
        let trades = self.generate_trade_data(conn, user_id, &request.time_range).await?;
        report = report.with_trades(trades);

        // Generate recommendations
        let recommendations = self.generate_recommendations(&report).await?;
        report = report.with_recommendations(recommendations);

        // Generate metadata
        let processing_time = Utc::now().signed_duration_since(start_time).num_milliseconds() as u64;
        let metadata = ReportMetadata {
            trade_count: report.analytics.total_trades,
            analysis_period_days: self.get_time_range_days(&request.time_range),
            model_version: "1.0".to_string(),
            processing_time_ms: processing_time,
            data_quality_score: self.calculate_data_quality_score(&report),
            sections_included: request.include_sections.unwrap_or_else(|| vec![
                ReportSection::Summary,
                ReportSection::Analytics,
                ReportSection::Insights,
                ReportSection::Recommendations,
            ]),
            charts_generated: if request.include_charts.unwrap_or(true) { 3 } else { 0 },
        };
        report = report.with_metadata(metadata);

        // Set expiration (24 hours by default)
        report.set_expiration(24);

        // Store the report in the database
        self.store_report(conn, &report).await?;

        info!("Successfully generated report {} for user: {}", report.id, user_id);
        Ok(report)
    }

    /// Generate analytics data from user's trading data
    async fn generate_analytics_data(
        &self,
        conn: &Connection,
        _user_id: &str,
        time_range: &TimeRange,
    ) -> AnyhowResult<AnalyticsData> {
        let (start_date, end_date) = self.get_date_range(time_range);
        
        // Query stock trades
        let stock_query = "
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
                SUM(CASE WHEN pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
                SUM(pnl) as total_pnl,
                AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_gain,
                AVG(CASE WHEN pnl < 0 THEN pnl END) as avg_loss,
                MAX(pnl) as biggest_winner,
                MIN(pnl) as biggest_loser,
                AVG(position_size) as avg_position_size
            FROM stocks 
            WHERE created_at >= ? AND created_at <= ?
        ";

        let stock_stmt = conn.prepare(stock_query).await?;
        let mut stock_rows = stock_stmt.query([
            start_date.as_str(),
            end_date.as_str(),
        ]).await?;

        let mut analytics = AnalyticsData {
            total_pnl: 0.0,
            win_rate: 0.0,
            profit_factor: 0.0,
            avg_gain: 0.0,
            avg_loss: 0.0,
            biggest_winner: 0.0,
            biggest_loser: 0.0,
            avg_hold_time_winners: 0.0,
            avg_hold_time_losers: 0.0,
            risk_reward_ratio: 0.0,
            trade_expectancy: 0.0,
            avg_position_size: 0.0,
            net_pnl: 0.0,
            total_trades: 0,
            winning_trades: 0,
            losing_trades: 0,
            break_even_trades: 0,
        };

        if let Some(row) = stock_rows.next().await? {
            analytics.total_trades = row.get::<i64>(0).unwrap_or(0) as u32;
            analytics.winning_trades = row.get::<i64>(1).unwrap_or(0) as u32;
            analytics.losing_trades = row.get::<i64>(2).unwrap_or(0) as u32;
            analytics.break_even_trades = row.get::<i64>(3).unwrap_or(0) as u32;
            analytics.total_pnl = row.get::<f64>(4).unwrap_or(0.0);
            analytics.avg_gain = row.get::<f64>(5).unwrap_or(0.0);
            analytics.avg_loss = row.get::<f64>(6).unwrap_or(0.0);
            analytics.biggest_winner = row.get::<f64>(7).unwrap_or(0.0);
            analytics.biggest_loser = row.get::<f64>(8).unwrap_or(0.0);
            analytics.avg_position_size = row.get::<f64>(9).unwrap_or(0.0);
        }

        // Query options trades
        let options_query = "
            SELECT 
                COUNT(*) as total_trades,
                SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
                SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
                SUM(CASE WHEN pnl = 0 THEN 1 ELSE 0 END) as break_even_trades,
                SUM(pnl) as total_pnl,
                AVG(CASE WHEN pnl > 0 THEN pnl END) as avg_gain,
                AVG(CASE WHEN pnl < 0 THEN pnl END) as avg_loss,
                MAX(pnl) as biggest_winner,
                MIN(pnl) as biggest_loser,
                AVG(position_size) as avg_position_size
            FROM options 
            WHERE created_at >= ? AND created_at <= ?
        ";

        let options_stmt = conn.prepare(options_query).await?;
        let mut options_rows = options_stmt.query([
            start_date.as_str(),
            end_date.as_str(),
        ]).await?;

        if let Some(row) = options_rows.next().await? {
            let options_total_trades = row.get::<i64>(0).unwrap_or(0) as u32;
            let options_winning_trades = row.get::<i64>(1).unwrap_or(0) as u32;
            let options_losing_trades = row.get::<i64>(2).unwrap_or(0) as u32;
            let options_break_even_trades = row.get::<i64>(3).unwrap_or(0) as u32;
            let options_total_pnl = row.get::<f64>(4).unwrap_or(0.0);
            let options_avg_gain = row.get::<f64>(5).unwrap_or(0.0);
            let options_avg_loss = row.get::<f64>(6).unwrap_or(0.0);
            let options_biggest_winner = row.get::<f64>(7).unwrap_or(0.0);
            let options_biggest_loser = row.get::<f64>(8).unwrap_or(0.0);
            let options_avg_position_size = row.get::<f64>(9).unwrap_or(0.0);

            // Combine stock and options data
            analytics.total_trades += options_total_trades;
            analytics.winning_trades += options_winning_trades;
            analytics.losing_trades += options_losing_trades;
            analytics.break_even_trades += options_break_even_trades;
            analytics.total_pnl += options_total_pnl;
            analytics.net_pnl = analytics.total_pnl;

            // Update averages (weighted)
            if analytics.total_trades > 0 {
                let stock_weight = (analytics.total_trades - options_total_trades) as f64 / analytics.total_trades as f64;
                let options_weight = options_total_trades as f64 / analytics.total_trades as f64;
                
                analytics.avg_gain = analytics.avg_gain * stock_weight + options_avg_gain * options_weight;
                analytics.avg_loss = analytics.avg_loss * stock_weight + options_avg_loss * options_weight;
                analytics.avg_position_size = analytics.avg_position_size * stock_weight + options_avg_position_size * options_weight;
            }

            // Update biggest winner/loser
            analytics.biggest_winner = analytics.biggest_winner.max(options_biggest_winner);
            analytics.biggest_loser = analytics.biggest_loser.min(options_biggest_loser);
        }

        // Calculate derived metrics
        if analytics.total_trades > 0 {
            analytics.win_rate = (analytics.winning_trades as f64 / analytics.total_trades as f64) * 100.0;
            
            if analytics.avg_loss != 0.0 {
                analytics.profit_factor = analytics.avg_gain.abs() / analytics.avg_loss.abs();
                analytics.risk_reward_ratio = analytics.avg_gain.abs() / analytics.avg_loss.abs();
            }
            
            analytics.trade_expectancy = analytics.total_pnl / analytics.total_trades as f64;
        }

        Ok(analytics)
    }

    /// Generate insights for the report
    async fn generate_insights(
        &self,
        conn: &Connection,
        user_id: &str,
        time_range: &TimeRange,
    ) -> AnyhowResult<Vec<Insight>> {
        let mut insights = Vec::new();

        // Generate different types of insights based on the report
        let insight_types = vec![
            InsightType::TradingPatterns,
            InsightType::PerformanceAnalysis,
            InsightType::RiskAssessment,
            InsightType::BehavioralAnalysis,
        ];

        for insight_type in insight_types {
            let insight_request = InsightRequest {
                time_range: time_range.clone(),
                insight_type: insight_type.clone(),
                include_predictions: Some(true),
                force_regenerate: Some(false), // Use cached insights if available
            };

            match self.ai_insights_service.generate_insights(user_id, insight_request, conn).await {
                Ok(insight) => {
                    info!("Generated {} insight for user: {}", insight_type, user_id);
                    insights.push(insight);
                }
                Err(e) => {
                    log::warn!("Failed to generate {} insight for user {}: {}", insight_type, user_id, e);
                    // Continue with other insights even if one fails
                }
            }
        }

        info!("Generated {} insights for user: {}", insights.len(), user_id);
        Ok(insights)
    }

    /// Generate trade data for the report
    async fn generate_trade_data(
        &self,
        conn: &Connection,
        _user_id: &str,
        time_range: &TimeRange,
    ) -> AnyhowResult<Vec<TradeData>> {
        let (start_date, end_date) = self.get_date_range(time_range);
        let mut trades = Vec::new();

        // Get stock trades
        let stock_query = "
            SELECT id, symbol, quantity, entry_price, exit_price, pnl, 
                   created_at, updated_at, notes
            FROM stocks 
            WHERE created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC
        ";

        let stock_stmt = conn.prepare(stock_query).await?;
        let mut stock_rows = stock_stmt.query([
            start_date.as_str(),
            end_date.as_str(),
        ]).await?;

        while let Some(row) = stock_rows.next().await? {
            trades.push(TradeData {
                id: row.get::<String>(0)?,
                symbol: row.get::<String>(1)?,
                trade_type: "stock".to_string(),
                quantity: row.get::<i32>(2)?,
                entry_price: row.get::<f64>(3)?,
                exit_price: row.get::<Option<f64>>(4)?,
                pnl: row.get::<Option<f64>>(5)?,
                entry_date: DateTime::parse_from_rfc3339(&row.get::<String>(6)?)?.with_timezone(&Utc),
                exit_date: row.get::<Option<String>>(7)?.map(|s: String| 
                    DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)
                ),
                notes: row.get::<Option<String>>(8)?,
            });
        }

        // Get options trades
        let options_query = "
            SELECT id, symbol, quantity, entry_price, exit_price, pnl, 
                   created_at, updated_at, notes
            FROM options 
            WHERE created_at >= ? AND created_at <= ?
            ORDER BY created_at DESC
        ";

        let options_stmt = conn.prepare(options_query).await?;
        let mut options_rows = options_stmt.query([
            start_date.as_str(),
            end_date.as_str(),
        ]).await?;

        while let Some(row) = options_rows.next().await? {
            trades.push(TradeData {
                id: row.get::<String>(0)?,
                symbol: row.get::<String>(1)?,
                trade_type: "option".to_string(),
                quantity: row.get::<i32>(2)?,
                entry_price: row.get::<f64>(3)?,
                exit_price: row.get::<Option<f64>>(4)?,
                pnl: row.get::<Option<f64>>(5)?,
                entry_date: DateTime::parse_from_rfc3339(&row.get::<String>(6)?)?.with_timezone(&Utc),
                exit_date: row.get::<Option<String>>(7)?.map(|s: String| 
                    DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)
                ),
                notes: row.get::<Option<String>>(8)?,
            });
        }

        Ok(trades)
    }

    /// Generate recommendations based on the report data
    async fn generate_recommendations(&self, report: &TradingReport) -> AnyhowResult<Vec<String>> {
        let mut recommendations = Vec::new();

        // Performance-based recommendations
        if report.analytics.win_rate < 50.0 {
            recommendations.push("Consider reviewing your entry and exit strategies to improve win rate".to_string());
        }

        if report.analytics.profit_factor < 1.0 {
            recommendations.push("Focus on risk management to improve profit factor".to_string());
        }

        if report.analytics.avg_loss.abs() > report.analytics.avg_gain {
            recommendations.push("Implement better stop-loss strategies to limit losses".to_string());
        }

        // Volume-based recommendations
        if report.analytics.total_trades < 10 {
            recommendations.push("Consider increasing trading frequency for better statistical significance".to_string());
        }

        // Risk-based recommendations
        if report.analytics.biggest_loser.abs() > report.analytics.avg_position_size * 2.0 {
            recommendations.push("Review position sizing to prevent large losses".to_string());
        }

        Ok(recommendations)
    }

    /// Get reports for a user
    pub async fn get_reports(
        &self,
        conn: &Connection,
        limit: Option<i32>,
        offset: Option<i32>,
    ) -> AnyhowResult<ReportListResponse> {
        let limit = limit.unwrap_or(10).min(100);
        let offset = offset.unwrap_or(0);

        // Get total count
        let count_stmt = conn.prepare("SELECT COUNT(*) FROM ai_reports").await?;
        let mut count_rows = count_stmt.query(Vec::<&str>::new()).await?;
        let total_count = if let Some(row) = count_rows.next().await? {
            row.get::<i64>(0).unwrap_or(0) as u32
        } else {
            0
        };

        // Get reports with pagination
        let reports_stmt = conn.prepare(
            "SELECT id, time_range, report_type, title, summary,
                    analytics, insights, trades, recommendations,
                    patterns, risk_metrics, performance_metrics,
                    behavioral_insights, market_analysis, generated_at,
                    expires_at, metadata
             FROM ai_reports 
             ORDER BY generated_at DESC 
             LIMIT ? OFFSET ?"
        ).await?;

        let mut reports_rows = reports_stmt.query([limit.to_string(), offset.to_string()]).await?;
        let mut reports = Vec::new();

        while let Some(row) = reports_rows.next().await? {
            let report = self.deserialize_report_from_row(row)?;
            reports.push(report.into()); // Convert TradingReport to ReportSummary
        }

        let has_more = (offset + limit) < total_count as i32;

        Ok(ReportListResponse {
            reports,
            total_count,
            has_more,
        })
    }

    /// Get a specific report by ID
    pub async fn get_report(
        &self,
        conn: &Connection,
        report_id: &str,
    ) -> AnyhowResult<Option<TradingReport>> {
        let stmt = conn.prepare(
            "SELECT id, time_range, report_type, title, summary,
                    analytics, insights, trades, recommendations,
                    patterns, risk_metrics, performance_metrics,
                    behavioral_insights, market_analysis, generated_at,
                    expires_at, metadata
             FROM ai_reports 
             WHERE id = ?"
        ).await?;

        let mut rows = stmt.query([report_id]).await?;
        
        if let Some(row) = rows.next().await? {
            let report = self.deserialize_report_from_row(row)?;
            Ok(Some(report))
        } else {
            Ok(None)
        }
    }

    /// Delete a report
    pub async fn delete_report(
        &self,
        conn: &Connection,
        report_id: &str,
    ) -> AnyhowResult<bool> {
        let stmt = conn.prepare("DELETE FROM ai_reports WHERE id = ?").await?;
        let result = stmt.execute([report_id]).await?;
        Ok(result > 0)
    }

    /// Generate a report title based on type and time range
    fn generate_report_title(&self, report_type: &ReportType, time_range: &TimeRange) -> String {
        let time_range_str = match time_range {
            TimeRange::SevenDays => "Weekly",
            TimeRange::ThirtyDays => "Monthly",
            TimeRange::NinetyDays => "Quarterly",
            TimeRange::YearToDate => "Year-to-Date",
            TimeRange::OneYear => "Annual",
            TimeRange::Custom { .. } => "Custom",
            TimeRange::AllTime => "All Time",
        };

        let report_type_str = match report_type {
            ReportType::Comprehensive => "Comprehensive",
            ReportType::Performance => "Performance",
            ReportType::Risk => "Risk",
            ReportType::Trading => "Trading",
            ReportType::Behavioral => "Behavioral",
            ReportType::Market => "Market",
        };

        format!("{} {} Trading Report", time_range_str, report_type_str)
    }

    /// Get date range for a time range
    fn get_date_range(&self, time_range: &TimeRange) -> (String, String) {
        let now = Utc::now();
        let start_date = match time_range {
            TimeRange::SevenDays => now - chrono::Duration::days(7),
            TimeRange::ThirtyDays => now - chrono::Duration::days(30),
            TimeRange::NinetyDays => now - chrono::Duration::days(90),
            TimeRange::YearToDate => {
                let year = now.year();
                Utc.with_ymd_and_hms(year, 1, 1, 0, 0, 0).unwrap()
            },
            TimeRange::OneYear => now - chrono::Duration::days(365),
            TimeRange::Custom { start_date: Some(start), .. } => *start,
            TimeRange::Custom { start_date: None, .. } => now - chrono::Duration::days(30),
            TimeRange::AllTime => now - chrono::Duration::days(365 * 10), // 10 years ago
        };

        (start_date.to_rfc3339(), now.to_rfc3339())
    }

    /// Get number of days for a time range
    fn get_time_range_days(&self, time_range: &TimeRange) -> u32 {
        match time_range {
            TimeRange::SevenDays => 7,
            TimeRange::ThirtyDays => 30,
            TimeRange::NinetyDays => 90,
            TimeRange::YearToDate => {
                let now = Utc::now();
                let year_start = Utc.with_ymd_and_hms(now.year(), 1, 1, 0, 0, 0).unwrap();
                now.signed_duration_since(year_start).num_days() as u32
            },
            TimeRange::OneYear => 365,
            TimeRange::Custom { start_date: Some(start), end_date: Some(end) } => {
                end.signed_duration_since(*start).num_days() as u32
            },
            TimeRange::Custom { start_date: Some(start), end_date: None } => {
                Utc::now().signed_duration_since(*start).num_days() as u32
            },
            TimeRange::Custom { start_date: None, .. } => 30,
            TimeRange::AllTime => 365 * 10, // 10 years
        }
    }

    /// Calculate data quality score
    fn calculate_data_quality_score(&self, report: &TradingReport) -> f32 {
        let mut score = 0.0;
        
        // Base score for having trades
        if report.analytics.total_trades > 0 {
            score += 0.3;
        }
        
        // Score for trade volume
        if report.analytics.total_trades >= 10 {
            score += 0.2;
        } else if report.analytics.total_trades >= 5 {
            score += 0.1;
        }
        
        // Score for having notes
        let trades_with_notes = report.trades.iter().filter(|t| t.notes.is_some()).count();
        if trades_with_notes > 0 {
            score += 0.2 * (trades_with_notes as f32 / report.trades.len() as f32);
        }
        
        // Score for having exit prices
        let trades_with_exits = report.trades.iter().filter(|t| t.exit_price.is_some()).count();
        if trades_with_exits > 0 {
            score += 0.3 * (trades_with_exits as f32 / report.trades.len() as f32);
        }
        
        score.min(1.0)
    }

    /// Store a report in the database
    async fn store_report(&self, conn: &Connection, report: &TradingReport) -> AnyhowResult<()> {
        let stmt = conn.prepare(
            "INSERT INTO ai_reports (
                id, time_range, report_type, title, summary,
                analytics, insights, trades, recommendations,
                patterns, risk_metrics, performance_metrics,
                behavioral_insights, market_analysis, generated_at,
                expires_at, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).await?;

        stmt.execute([
            report.id.as_str(),
            &serde_json::to_string(&report.time_range)?,
            &serde_json::to_string(&report.report_type)?,
            report.title.as_str(),
            report.summary.as_str(),
            &serde_json::to_string(&report.analytics)?,
            &serde_json::to_string(&report.insights)?,
            &serde_json::to_string(&report.trades)?,
            &serde_json::to_string(&report.recommendations)?,
            &serde_json::to_string(&report.patterns)?,
            &serde_json::to_string(&report.risk_metrics)?,
            &serde_json::to_string(&report.performance_metrics)?,
            &serde_json::to_string(&report.behavioral_insights)?,
            &serde_json::to_string(&report.market_analysis)?,
            &report.generated_at.to_rfc3339(),
            &report.expires_at.map(|dt| dt.to_rfc3339()).unwrap_or_default(),
            &serde_json::to_string(&report.metadata)?,
        ]).await?;

        Ok(())
    }

    /// Deserialize a report from a database row
    fn deserialize_report_from_row(&self, row: libsql::Row) -> AnyhowResult<TradingReport> {
        let id: String = row.get(0)?;
        let time_range: TimeRange = serde_json::from_str(&row.get::<String>(1)?)?;
        let report_type: ReportType = serde_json::from_str(&row.get::<String>(2)?)?;
        let title: String = row.get(3)?;
        let summary: String = row.get(4)?;
        let analytics: AnalyticsData = serde_json::from_str(&row.get::<String>(5)?)?;
        let insights: Vec<Insight> = serde_json::from_str(&row.get::<String>(6)?)?;
        let trades: Vec<TradeData> = serde_json::from_str(&row.get::<String>(7)?)?; 
        let recommendations: Vec<String> = serde_json::from_str(&row.get::<String>(8)?)?;
        let patterns: Vec<crate::models::ai::reports::TradingPattern> = serde_json::from_str(&row.get::<String>(9)?)?;
        let risk_metrics: crate::models::ai::reports::RiskMetrics = serde_json::from_str(&row.get::<String>(10)?)?;
        let performance_metrics: crate::models::ai::reports::PerformanceMetrics = serde_json::from_str(&row.get::<String>(11)?)?;
        let behavioral_insights: Vec<crate::models::ai::reports::BehavioralInsight> = serde_json::from_str(&row.get::<String>(12)?)?;
        let market_analysis: Option<crate::models::ai::reports::MarketAnalysis> = serde_json::from_str(&row.get::<String>(13)?)?;
        let generated_at: DateTime<Utc> = DateTime::parse_from_rfc3339(&row.get::<String>(14)?)?.with_timezone(&Utc);
        let expires_at: Option<DateTime<Utc>> = {
            let expires_str: String = row.get(15)?;
            if expires_str.is_empty() {
                None
            } else {
                Some(DateTime::parse_from_rfc3339(&expires_str)?.with_timezone(&Utc))
            }
        };
        let metadata: ReportMetadata = serde_json::from_str(&row.get::<String>(16)?)?;

        Ok(TradingReport {
            id,
            user_id: "default".to_string(), // Since each user has their own database, we don't need user_id
            time_range,
            report_type,
            title,
            summary,
            analytics,
            insights,
            trades,
            recommendations,
            patterns,
            risk_metrics,
            performance_metrics,
            behavioral_insights,
            market_analysis,
            generated_at,
            expires_at,
            metadata,
        })
    }
}

/// API Response wrapper
#[derive(Serialize)]
#[allow(dead_code)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

impl<T> ApiResponse<T> {
    #[allow(dead_code)]
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            message: None,
        }
    }

    #[allow(dead_code)]
    pub fn error(message: String) -> ApiResponse<()> {
        ApiResponse {
            success: false,
            data: None,
            message: Some(message),
        }
    }
}
