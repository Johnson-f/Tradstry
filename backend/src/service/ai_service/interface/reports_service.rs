use crate::models::ai::reports::{
    TradingReport, ReportRequest, ReportType, ReportSection, 
    AnalyticsData, TradeData, ReportMetadata,
    ReportListResponse
};
use crate::models::stock::stocks::TimeRange;
use crate::models::ai::insights::{Insight, InsightRequest, InsightType};
use crate::service::ai_service::AIInsightsService;
use crate::service::analytics_engine::AnalyticsEngine;
use crate::models::analytics::CoreMetrics;
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
    analytics_engine: Arc<AnalyticsEngine>,
}

impl AiReportsService {
    pub fn new(turso_client: Arc<TursoClient>, ai_insights_service: Arc<AIInsightsService>) -> Self {
        Self { 
            turso_client,
            ai_insights_service,
            analytics_engine: Arc::new(AnalyticsEngine::new()),
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

    /// Convert CoreMetrics from analytics engine to AnalyticsData for reports
    fn map_core_metrics_to_analytics_data(&self, core_metrics: CoreMetrics) -> AnalyticsData {
        AnalyticsData {
            total_pnl: core_metrics.total_pnl,
            win_rate: core_metrics.win_rate,
            profit_factor: core_metrics.profit_factor,
            avg_gain: core_metrics.average_win,
            avg_loss: core_metrics.average_loss,
            biggest_winner: core_metrics.biggest_winner,
            biggest_loser: core_metrics.biggest_loser,
            avg_hold_time_winners: 0.0, // Not provided by CoreMetrics, needs separate calculation
            avg_hold_time_losers: 0.0,  // Not provided by CoreMetrics, needs separate calculation
            risk_reward_ratio: core_metrics.win_loss_ratio,
            trade_expectancy: if core_metrics.total_trades > 0 {
                core_metrics.total_pnl / core_metrics.total_trades as f64
            } else {
                0.0
            },
            avg_position_size: core_metrics.average_position_size,
            net_pnl: core_metrics.net_profit_loss,
            total_trades: core_metrics.total_trades,
            winning_trades: core_metrics.winning_trades,
            losing_trades: core_metrics.losing_trades,
            break_even_trades: core_metrics.break_even_trades,
        }
    }

    /// Generate analytics data using the analytics engine
    async fn generate_analytics_data(
        &self,
        conn: &Connection,
        _user_id: &str,
        time_range: &TimeRange,
    ) -> AnyhowResult<AnalyticsData> {
        log::info!("Generating analytics data using AnalyticsEngine");
        
        // Use the analytics engine to calculate core metrics
        let core_metrics = self.analytics_engine
            .calculate_core_metrics(conn, time_range)
            .await?;
        
        log::info!("Successfully calculated core metrics: {} trades", core_metrics.total_trades);
        
        // Convert CoreMetrics to AnalyticsData
        let analytics_data = self.map_core_metrics_to_analytics_data(core_metrics);
        
        Ok(analytics_data)
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
        SELECT id, symbol, number_shares, entry_price, exit_price, 
               created_at, exit_date
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
        // ID is INTEGER in the schema, convert to String
        let id: i64 = row.get(0)?;
        let id = id.to_string();
        let symbol: String = row.get(1)?;
        
        // Handle numeric types carefully - libsql might return different types
        let number_shares: f64 = match row.get::<libsql::Value>(2)? {
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Real(f) => f,
            _ => 0.0,
        };
        
        let entry_price: f64 = match row.get::<libsql::Value>(3)? {
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Real(f) => f,
            _ => 0.0,
        };
        
        let exit_price: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Real(f) => Some(f),
            _ => None,
        };
        
        let created_at: String = row.get(5)?;
        
        let exit_date: Option<String> = match row.get::<libsql::Value>(6)? {
            libsql::Value::Null => None,
            libsql::Value::Text(s) => Some(s),
            _ => None,
        };
        
        // Calculate PNL if we have exit price
        let pnl = exit_price.map(|exit| (exit - entry_price) * number_shares);
        
        trades.push(TradeData {
            id,
            symbol,
            trade_type: "stock".to_string(),
            quantity: number_shares as i32,
            entry_price,
            exit_price,
            pnl,
            entry_date: DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            exit_date: exit_date.and_then(|s| 
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            ),
            notes: None,
        });
    }

    // Get options trades
    let options_query = "
        SELECT id, symbol, total_quantity, entry_price, exit_price, 
               created_at, exit_date
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
        // ID is INTEGER in the schema, convert to String
        let id: i64 = row.get(0)?;
        let id = id.to_string();
        let symbol: String = row.get(1)?;
        
        // Handle numeric types carefully
        let quantity: f64 = match row.get::<libsql::Value>(2)? {
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Real(f) => f,
            _ => 0.0,
        };
        
        let entry_price: f64 = match row.get::<libsql::Value>(3)? {
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Real(f) => f,
            _ => 0.0,
        };
        
        let exit_price: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Real(f) => Some(f),
            _ => None,
        };
        
        let created_at: String = row.get(5)?;
        
        let exit_date: Option<String> = match row.get::<libsql::Value>(6)? {
            libsql::Value::Null => None,
            libsql::Value::Text(s) => Some(s),
            _ => None,
        };
        
        // Calculate PNL if we have exit price (for options, 1 contract = 100 shares)
        let pnl = exit_price.map(|exit| (exit - entry_price) * quantity * 100.0);
        
        trades.push(TradeData {
            id,
            symbol,
            trade_type: "option".to_string(),
            quantity: quantity as i32,
            entry_price,
            exit_price,
            pnl,
            entry_date: DateTime::parse_from_rfc3339(&created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
            exit_date: exit_date.and_then(|s| 
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            ),
            notes: None,
        });
    }

    log::info!("Successfully generated {} trade records", trades.len());
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
                expires_at, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
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
            &chrono::Utc::now().to_rfc3339(), // created_at
        ]).await?;

        Ok(())
    }

    /// Deserialize a report from a database row
    fn deserialize_report_from_row(&self, row: libsql::Row) -> AnyhowResult<TradingReport> {
        log::info!("Starting report deserialization");
        
        let id: String = row.get(0)?;
        log::info!("Deserialized id: {}", id);
        
        let time_range: TimeRange = serde_json::from_str(&row.get::<String>(1)?)?;
        log::info!("Deserialized time_range");
        
        let report_type: ReportType = serde_json::from_str(&row.get::<String>(2)?)?;
        log::info!("Deserialized report_type");
        
        let title: String = row.get(3)?;
        log::info!("Deserialized title: {}", title);
        
        let summary: String = row.get(4)?;
        log::info!("Deserialized summary");
        
        let analytics: AnalyticsData = serde_json::from_str(&row.get::<String>(5)?)?;
        log::info!("Deserialized analytics");
        
        let insights: Vec<Insight> = serde_json::from_str(&row.get::<String>(6)?)?;
        log::info!("Deserialized insights");
        
        let trades: Vec<TradeData> = serde_json::from_str(&row.get::<String>(7)?)?;
        log::info!("Deserialized trades");
        
        let recommendations: Vec<String> = serde_json::from_str(&row.get::<String>(8)?)?;
        log::info!("Deserialized recommendations");
        
        // Handle nullable fields with detailed logging
        log::info!("Attempting to deserialize patterns (column 9)");
        let patterns: Vec<crate::models::ai::reports::TradingPattern> = 
            match row.get::<Option<String>>(9)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Patterns data found, deserializing JSON");
                    serde_json::from_str(&s)?
                },
                Some(_s) => {
                    log::info!("Patterns data is empty string");
                    Vec::new()
                },
                None => {
                    log::info!("Patterns data is NULL");
                    Vec::new()
                },
            };
        log::info!("Successfully deserialized patterns");
        
        log::info!("Attempting to deserialize risk_metrics (column 10)");
        let risk_metrics: crate::models::ai::reports::RiskMetrics = 
            match row.get::<Option<String>>(10)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Risk metrics data found, deserializing JSON");
                    serde_json::from_str(&s)?
                },
                Some(_s) => {
                    log::info!("Risk metrics data is empty string");
                    crate::models::ai::reports::RiskMetrics {
                        max_drawdown: 0.0,
                        sharpe_ratio: 0.0,
                        volatility: 0.0,
                        var_95: 0.0,
                        var_99: 0.0,
                        risk_score: 0.0,
                        concentration_risk: 0.0,
                        leverage_risk: 0.0,
                    }
                },
                None => {
                    log::info!("Risk metrics data is NULL");
                    crate::models::ai::reports::RiskMetrics {
                        max_drawdown: 0.0,
                        sharpe_ratio: 0.0,
                        volatility: 0.0,
                        var_95: 0.0,
                        var_99: 0.0,
                        risk_score: 0.0,
                        concentration_risk: 0.0,
                        leverage_risk: 0.0,
                    }
                },
            };
        log::info!("Successfully deserialized risk_metrics");
        
        log::info!("Attempting to deserialize performance_metrics (column 11)");
        let performance_metrics: crate::models::ai::reports::PerformanceMetrics = 
            match row.get::<Option<String>>(11)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Performance metrics data found, deserializing JSON");
                    serde_json::from_str(&s)?
                },
                Some(_s) => {
                    log::info!("Performance metrics data is empty string");
                    crate::models::ai::reports::PerformanceMetrics {
                        monthly_returns: Vec::new(),
                        quarterly_returns: Vec::new(),
                        yearly_returns: Vec::new(),
                        best_month: 0.0,
                        worst_month: 0.0,
                        consistency_score: 0.0,
                        trend_direction: "neutral".to_string(),
                        momentum_score: 0.0,
                    }
                },
                None => {
                    log::info!("Performance metrics data is NULL");
                    crate::models::ai::reports::PerformanceMetrics {
                        monthly_returns: Vec::new(),
                        quarterly_returns: Vec::new(),
                        yearly_returns: Vec::new(),
                        best_month: 0.0,
                        worst_month: 0.0,
                        consistency_score: 0.0,
                        trend_direction: "neutral".to_string(),
                        momentum_score: 0.0,
                    }
                },
            };
        log::info!("Successfully deserialized performance_metrics");
        
        log::info!("Attempting to deserialize behavioral_insights (column 12)");
        let behavioral_insights: Vec<crate::models::ai::reports::BehavioralInsight> = 
            match row.get::<Option<String>>(12)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Behavioral insights data found, deserializing JSON");
                    serde_json::from_str(&s)?
                },
                Some(_s) => {
                    log::info!("Behavioral insights data is empty string");
                    Vec::new()
                },
                None => {
                    log::info!("Behavioral insights data is NULL");
                    Vec::new()
                },
            };
        log::info!("Successfully deserialized behavioral_insights");
        
        log::info!("Attempting to deserialize market_analysis (column 13)");
        let market_analysis: Option<crate::models::ai::reports::MarketAnalysis> = 
            match row.get::<Option<String>>(13)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Market analysis data found, deserializing JSON");
                    serde_json::from_str(&s).ok()
                },
                Some(_s) => {
                    log::info!("Market analysis data is empty string");
                    None
                },
                None => {
                    log::info!("Market analysis data is NULL");
                    None
                },
            };
        log::info!("Successfully deserialized market_analysis");
        
        log::info!("Attempting to deserialize generated_at (column 14)");
        let generated_at: DateTime<Utc> = DateTime::parse_from_rfc3339(&row.get::<String>(14)?)?.with_timezone(&Utc);
        log::info!("Successfully deserialized generated_at");
        
        log::info!("Attempting to deserialize expires_at (column 15)");
        let expires_at: Option<DateTime<Utc>> = {
            let expires_str: String = row.get(15)?;
            if expires_str.is_empty() {
                log::info!("Expires_at is empty string");
                None
            } else {
                log::info!("Expires_at data found, parsing");
                Some(DateTime::parse_from_rfc3339(&expires_str)?.with_timezone(&Utc))
            }
        };
        log::info!("Successfully deserialized expires_at");
        
        log::info!("Attempting to deserialize metadata (column 16)");
        let metadata: ReportMetadata = 
            match row.get::<Option<String>>(16)? {
                Some(s) if !s.is_empty() => {
                    log::info!("Metadata data found, deserializing JSON");
                    serde_json::from_str(&s)?
                },
                Some(_s) => {
                    log::info!("Metadata data is empty string");
                    ReportMetadata {
                        trade_count: 0,
                        analysis_period_days: 0,
                        model_version: "1.0".to_string(),
                        processing_time_ms: 0,
                        data_quality_score: 0.0,
                        sections_included: Vec::new(),
                        charts_generated: 0,
                    }
                },
                None => {
                    log::info!("Metadata data is NULL");
                    ReportMetadata {
                        trade_count: 0,
                        analysis_period_days: 0,
                        model_version: "1.0".to_string(),
                        processing_time_ms: 0,
                        data_quality_score: 0.0,
                        sections_included: Vec::new(),
                        charts_generated: 0,
                    }
                },
            };
        log::info!("Successfully deserialized metadata");

        log::info!("Creating TradingReport struct");
        let report = TradingReport {
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
        };
        
        log::info!("Successfully created TradingReport with id: {}", report.id);
        Ok(report)
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
