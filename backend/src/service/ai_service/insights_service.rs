#![allow(dead_code)]

use crate::models::ai::insights::{
    Insight, InsightRequest, InsightType, InsightListResponse, InsightSummary,
    InsightGenerationTask, InsightTemplate, InsightMetadata
};
use crate::models::stock::stocks::TimeRange;
use crate::service::ai_service::vectorization_service::VectorizationService;
use crate::service::ai_service::openrouter_client::{OpenRouterClient, MessageRole as OpenRouterMessageRole};
use crate::service::ai_service::upstash_vector_client::DataType;
use crate::turso::client::TursoClient;
use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use serde_json;
use std::sync::Arc;

/// AI Insights Service for generating trading insights
pub struct AIInsightsService {
    vectorization_service: Arc<VectorizationService>,
    openrouter_client: Arc<OpenRouterClient>,
    turso_client: Arc<TursoClient>,
    max_context_vectors: usize,
}

impl AIInsightsService {
    pub fn new(
        vectorization_service: Arc<VectorizationService>,
        openrouter_client: Arc<OpenRouterClient>,
        turso_client: Arc<TursoClient>,
        max_context_vectors: usize,
    ) -> Self {
        Self {
            vectorization_service,
            openrouter_client,
            turso_client,
            max_context_vectors,
        }
    }

    /// Generate insights for a user
    pub async fn generate_insights(
        &self,
        user_id: &str,
        request: InsightRequest,
        conn: &Connection,
    ) -> Result<Insight> {
        let start_time = std::time::Instant::now();

        // Check if recent insight exists and force_regenerate is false
        if !request.force_regenerate.unwrap_or(false) {
            if let Some(existing_insight) = self.get_recent_insight(conn, user_id, &request.time_range, &request.insight_type).await? {
                if !existing_insight.is_expired() {
                    return Ok(existing_insight);
                }
            }
        }

        // Create generation task
        let mut task = InsightGenerationTask::new(user_id.to_string(), request.clone());
        self.store_generation_task(conn, &task).await?;
        task.start();
        self.update_generation_task(conn, &task).await?;

        // Retrieve relevant trading data
        let trading_data = self.retrieve_trading_data(user_id, &request.time_range, &request.insight_type).await?;

        // Generate insight using AI
        let insight_content = self.generate_insight_content(&request, &trading_data).await?;

        // Create insight
        let mut insight = Insight::new(
            user_id.to_string(),
            request.time_range.clone(),
            request.insight_type,
            insight_content.title,
            insight_content.content,
        )
        .with_findings(insight_content.key_findings)
        .with_recommendations(insight_content.recommendations)
        .with_confidence(insight_content.confidence_score);

        // Set metadata
        let processing_time = start_time.elapsed().as_millis() as u64;
        let metadata = InsightMetadata {
            trade_count: trading_data.trade_count,
            analysis_period_days: self.get_period_days(&request.time_range),
            model_version: "1.0".to_string(),
            processing_time_ms: processing_time,
            data_quality_score: trading_data.data_quality_score,
        };
        insight = insight.with_metadata(metadata);

        // Set expiration (24 hours for most insights)
        insight.set_expiration(24);

        // Store insight
        self.store_insight(conn, &insight).await?;

        // Complete task
        task.complete(insight.id.clone());
        self.update_generation_task(conn, &task).await?;

        Ok(insight)
    }

    /// Generate insights asynchronously
    pub async fn generate_insights_async(
        &self,
        user_id: &str,
        request: InsightRequest,
        conn: &Connection,
    ) -> Result<String> {
        let task = InsightGenerationTask::new(user_id.to_string(), request);
        self.store_generation_task(conn, &task).await?;

        // Spawn background task
        let service_clone = self.clone_for_background();
        let task_id = task.task_id.clone();
        let user_id_clone = user_id.to_string();

        tokio::spawn(async move {
            if let Err(e) = service_clone.process_background_insight_generation(&task_id, &user_id_clone).await {
                log::error!("Background insight generation failed for task {}: {}", task_id, e);
            }
        });

        Ok(task.task_id)
    }

    /// Process background insight generation
    async fn process_background_insight_generation(
        &self,
        task_id: &str,
        user_id: &str,
    ) -> Result<()> {
        // Get task from database
        let conn = self.turso_client.get_user_database_connection(user_id).await?
            .ok_or_else(|| anyhow::anyhow!("Database connection not found"))?;
        let task = self.get_generation_task(&conn, task_id).await?;

        // Generate insight
        let insight = self.generate_insights(user_id, task.insight_request, &conn).await?;

        log::info!("Background insight generation completed for task {}: {}", task_id, insight.id);
        Ok(())
    }

    /// Get user's insights
    pub async fn get_user_insights(
        &self,
        conn: &Connection,
        user_id: &str,
        time_range: Option<TimeRange>,
        insight_type: Option<InsightType>,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<InsightListResponse> {
        log::info!("Starting get_user_insights for user: {}, time_range: {:?}, insight_type: {:?}, limit: {:?}, offset: {:?}", 
                  user_id, time_range, insight_type, limit, offset);

        // Ensure table exists
        self.ensure_table_exists(conn).await?;

        let limit = limit.unwrap_or(20);
        let offset = offset.unwrap_or(0);

        // Build query
        let mut query = "SELECT id, user_id, time_range, insight_type, title, content, key_findings, recommendations, data_sources, confidence_score, generated_at, expires_at, metadata FROM ai_insights WHERE user_id = ?".to_string();
        let mut params: Vec<String> = vec![user_id.to_string()];

        if let Some(ref tr) = time_range {
            query.push_str(" AND time_range = ?");
            params.push(serde_json::to_string(&tr)?);
            log::info!("Added time_range filter: {:?}", tr);
        }

        if let Some(ref it) = insight_type {
            query.push_str(" AND insight_type = ?");
            params.push(serde_json::to_string(&it)?);
            log::info!("Added insight_type filter: {:?}", it);
        }

        query.push_str(" ORDER BY generated_at DESC LIMIT ? OFFSET ?");
        params.push(limit.to_string());
        params.push(offset.to_string());

        log::info!("Final query: {}", query);
        log::info!("Query params: {:?}", params);

        // Get total count
        let mut count_query = "SELECT COUNT(*) FROM ai_insights WHERE user_id = ?".to_string();
        let mut count_params: Vec<String> = vec![user_id.to_string()];

        if let Some(tr) = time_range {
            count_query.push_str(" AND time_range = ?");
            count_params.push(serde_json::to_string(&tr)?);
        }

        if let Some(it) = insight_type {
            count_query.push_str(" AND insight_type = ?");
            count_params.push(serde_json::to_string(&it)?);
        }

        log::info!("Count query: {}", count_query);
        log::info!("Count params: {:?}", count_params);

        // Execute count query
        let total_count = match conn.prepare(&count_query).await {
            Ok(mut count_stmt) => {
                match count_stmt.query_row(count_params.iter().map(|s| s.as_str()).collect::<Vec<_>>()).await {
                    Ok(row) => {
                        match row.get::<u32>(0) {
                            Ok(count) => {
                                log::info!("Successfully got total count: {}", count);
                                count
                            }
                            Err(e) => {
                                log::error!("Failed to get count from row: {}", e);
                                return Err(anyhow::anyhow!("Failed to get count from row: {}", e));
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Failed to execute count query: {}", e);
                        return Err(anyhow::anyhow!("Failed to execute count query: {}", e));
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to prepare count statement: {}", e);
                return Err(anyhow::anyhow!("Failed to prepare count statement: {}", e));
            }
        };

        // Get insights
        let stmt = match conn.prepare(&query).await {
            Ok(stmt) => {
                log::info!("Successfully prepared main query");
                stmt
            }
            Err(e) => {
                log::error!("Failed to prepare main query: {}", e);
                return Err(anyhow::anyhow!("Failed to prepare main query: {}", e));
            }
        };

        let mut rows = match stmt.query(params.iter().map(|s| s.as_str()).collect::<Vec<_>>()).await {
            Ok(rows) => {
                log::info!("Successfully executed main query");
                rows
            }
            Err(e) => {
                log::error!("Failed to execute main query: {}", e);
                return Err(anyhow::anyhow!("Failed to execute main query: {}", e));
            }
        };

        let mut insights = Vec::new();
        let mut row_count = 0;
        while let Some(row) = rows.next().await? {
            row_count += 1;
            log::debug!("Processing row {}", row_count);
            
            match self.row_to_insight(&row) {
                Ok(insight) => {
            insights.push(InsightSummary::from(insight));
                    log::debug!("Successfully converted row {} to insight", row_count);
                }
                Err(e) => {
                    log::error!("Failed to convert row {} to insight: {}", row_count, e);
                    return Err(anyhow::anyhow!("Failed to convert row {} to insight: {}", row_count, e));
                }
            }
        }

        log::info!("Successfully processed {} rows, returning {} insights", row_count, insights.len());

        Ok(InsightListResponse {
            insights,
            total_count,
            has_more: (offset + limit) < total_count,
        })
    }

    /// Get specific insight
    pub async fn get_insight(
        &self,
        conn: &Connection,
        insight_id: &str,
        user_id: &str,
    ) -> Result<Insight> {
        let stmt = conn.prepare(
            "SELECT id, user_id, time_range, insight_type, title, content, key_findings, recommendations, data_sources, confidence_score, generated_at, expires_at, metadata FROM ai_insights WHERE id = ? AND user_id = ?"
        ).await?;
        
        let mut rows = stmt.query([insight_id, user_id]).await?;
        
        if let Some(row) = rows.next().await? {
            self.row_to_insight(&row)
        } else {
            Err(anyhow::anyhow!("Insight not found"))
        }
    }

    /// Delete insight
    pub async fn delete_insight(
        &self,
        conn: &Connection,
        insight_id: &str,
        user_id: &str,
    ) -> Result<()> {
        conn.execute(
            "DELETE FROM ai_insights WHERE id = ? AND user_id = ?",
            params![insight_id, user_id],
        ).await?;

        Ok(())
    }

    /// Retrieve trading data for insights
    async fn retrieve_trading_data(
        &self,
        user_id: &str,
        _time_range: &TimeRange,
        insight_type: &InsightType,
    ) -> Result<TradingDataSummary> {
        // Query relevant vectors based on insight type
        let data_types = match insight_type {
            InsightType::TradingPatterns => vec![DataType::Stock, DataType::Option],
            InsightType::PerformanceAnalysis => vec![DataType::Stock, DataType::Option],
            InsightType::RiskAssessment => vec![DataType::Stock, DataType::Option],
            InsightType::BehavioralAnalysis => vec![DataType::Stock, DataType::Option, DataType::TradeNote],
            InsightType::MarketAnalysis => vec![DataType::Stock, DataType::Option],
            InsightType::OpportunityDetection => vec![DataType::Stock, DataType::Option],
        };

        // Query vectors for context
        let query_text = format!("trading data for {} analysis", insight_type);
        let vector_matches = self.vectorization_service
            .query_similar_vectors(user_id, &query_text, self.max_context_vectors, Some(data_types))
            .await?;

        // Count trades in time range
        let trade_count = vector_matches.len() as u32;

        // Calculate data quality score
        let data_quality_score = if trade_count > 10 { 0.9 } else if trade_count > 5 { 0.7 } else { 0.5 };

        Ok(TradingDataSummary {
            trade_count,
            data_quality_score,
            vector_matches,
        })
    }

    /// Generate insight content using AI
    async fn generate_insight_content(
        &self,
        request: &InsightRequest,
        trading_data: &TradingDataSummary,
    ) -> Result<InsightContent> {
        let template = self.get_insight_template(&request.insight_type);
        
        // Build prompt
        let prompt = self.build_insight_prompt(&template, request, trading_data);

        // Generate content using OpenRouter
        let messages = vec![crate::service::ai_service::openrouter_client::ChatMessage {
            role: OpenRouterMessageRole::User,
            content: prompt,
        }];

        let response = self.openrouter_client.generate_chat(messages).await?;

        // Parse response (assuming JSON format)
        let parsed_response: serde_json::Value = serde_json::from_str(&response)?;

        Ok(InsightContent {
            title: parsed_response["title"].as_str().unwrap_or("Trading Insight").to_string(),
            content: parsed_response["content"].as_str().unwrap_or(&response).to_string(),
            key_findings: parsed_response["key_findings"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect())
                .unwrap_or_default(),
            recommendations: parsed_response["recommendations"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).map(|s| s.to_string()).collect())
                .unwrap_or_default(),
            confidence_score: parsed_response["confidence_score"].as_f64().unwrap_or(0.8) as f32,
        })
    }

    /// Build insight prompt
    fn build_insight_prompt(
        &self,
        template: &InsightTemplate,
        request: &InsightRequest,
        trading_data: &TradingDataSummary,
    ) -> String {
        format!(
            "{}",
            template.prompt_template
                .replace("{time_range}", &format!("{:?}", request.time_range))
                .replace("{insight_type}", &format!("{:?}", request.insight_type))
                .replace("{trade_count}", &trading_data.trade_count.to_string())
                .replace("{data_quality}", &trading_data.data_quality_score.to_string())
        )
    }

    /// Get insight template
    fn get_insight_template(&self, insight_type: &InsightType) -> InsightTemplate {
        match insight_type {
            InsightType::TradingPatterns => InsightTemplate::trading_patterns(),
            InsightType::PerformanceAnalysis => InsightTemplate::performance_analysis(),
            InsightType::RiskAssessment => InsightTemplate::risk_assessment(),
            InsightType::BehavioralAnalysis => InsightTemplate::behavioral_analysis(),
            _ => InsightTemplate::trading_patterns(), // Default
        }
    }

    /// Get period days for time range
    fn get_period_days(&self, time_range: &TimeRange) -> u32 {
        match time_range {
            TimeRange::SevenDays => 7,
            TimeRange::ThirtyDays => 30,
            TimeRange::NinetyDays => 90,
            TimeRange::YearToDate => 365, // Approximate
            TimeRange::OneYear => 365,
            TimeRange::Custom { .. } => 30, // Default to 30 days for custom ranges
            TimeRange::AllTime => 365, // Default to 1 year for all time
        }
    }

    /// Get recent insight
    async fn get_recent_insight(
        &self,
        conn: &Connection,
        user_id: &str,
        time_range: &TimeRange,
        insight_type: &InsightType,
    ) -> Result<Option<Insight>> {
        let stmt = conn.prepare(
            "SELECT id, user_id, time_range, insight_type, title, content, key_findings, recommendations, data_sources, confidence_score, generated_at, expires_at, metadata FROM ai_insights WHERE user_id = ? AND time_range = ? AND insight_type = ? ORDER BY generated_at DESC LIMIT 1"
        ).await?;
        
        let mut rows = stmt.query([
            user_id,
            &serde_json::to_string(&time_range)?,
            &serde_json::to_string(&insight_type)?,
        ]).await?;
        
        if let Some(row) = rows.next().await? {
            Ok(Some(self.row_to_insight(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Convert database row to Insight
    fn row_to_insight(&self, row: &libsql::Row) -> Result<Insight> {
        log::debug!("Starting row_to_insight conversion");
        
        // Get raw values first
        let id: String = match row.get(0) {
            Ok(val) => {
                log::debug!("Got id: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get id from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get id from row: {}", e));
            }
        };

        let user_id: String = match row.get(1) {
            Ok(val) => {
                log::debug!("Got user_id: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get user_id from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get user_id from row: {}", e));
            }
        };

        let time_range_str: String = match row.get(2) {
            Ok(val) => {
                log::debug!("Got time_range_str: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get time_range from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get time_range from row: {}", e));
            }
        };

        let insight_type_str: String = match row.get(3) {
            Ok(val) => {
                log::debug!("Got insight_type_str: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get insight_type from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get insight_type from row: {}", e));
            }
        };

        let title: String = match row.get(4) {
            Ok(val) => {
                log::debug!("Got title: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get title from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get title from row: {}", e));
            }
        };

        let content: String = match row.get::<String>(5) {
            Ok(val) => {
                log::debug!("Got content (length: {})", val.len());
                val
            }
            Err(e) => {
                log::error!("Failed to get content from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get content from row: {}", e));
            }
        };

        // Parse JSON fields
        let time_range: TimeRange = match serde_json::from_str(&time_range_str) {
            Ok(tr) => {
                log::debug!("Successfully parsed time_range: {:?}", tr);
                tr
            }
            Err(e) => {
                log::error!("Failed to parse time_range JSON '{}': {}", time_range_str, e);
                return Err(anyhow::anyhow!("Failed to parse time_range JSON: {}", e));
            }
        };

        let insight_type: InsightType = match serde_json::from_str(&insight_type_str) {
            Ok(it) => {
                log::debug!("Successfully parsed insight_type: {:?}", it);
                it
            }
            Err(e) => {
                log::error!("Failed to parse insight_type JSON '{}': {}", insight_type_str, e);
                return Err(anyhow::anyhow!("Failed to parse insight_type JSON: {}", e));
            }
        };

        // Get optional fields
        let key_findings: Option<String> = match row.get(6) {
            Ok(val) => {
                log::debug!("Got key_findings: {:?}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get key_findings from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get key_findings from row: {}", e));
            }
        };

        let recommendations: Option<String> = match row.get(7) {
            Ok(val) => {
                log::debug!("Got recommendations: {:?}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get recommendations from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get recommendations from row: {}", e));
            }
        };

        let data_sources: Option<String> = match row.get(8) {
            Ok(val) => {
                log::debug!("Got data_sources: {:?}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get data_sources from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get data_sources from row: {}", e));
            }
        };

        let confidence_score: f64 = match row.get(9) {
            Ok(val) => {
                log::debug!("Got confidence_score: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get confidence_score from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get confidence_score from row: {}", e));
            }
        };

        let generated_at_str: String = match row.get(10) {
            Ok(val) => {
                log::debug!("Got generated_at_str: {}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get generated_at from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get generated_at from row: {}", e));
            }
        };

        let expires_at_str: Option<String> = match row.get(11) {
            Ok(val) => {
                log::debug!("Got expires_at_str: {:?}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get expires_at from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get expires_at from row: {}", e));
            }
        };

        let metadata_str: Option<String> = match row.get(12) {
            Ok(val) => {
                log::debug!("Got metadata_str: {:?}", val);
                val
            }
            Err(e) => {
                log::error!("Failed to get metadata from row: {}", e);
                return Err(anyhow::anyhow!("Failed to get metadata from row: {}", e));
            }
        };

        // Parse JSON arrays
        let key_findings_vec = if let Some(kf) = key_findings {
            match serde_json::from_str::<Vec<String>>(&kf) {
                Ok(vec) => {
                    log::debug!("Successfully parsed key_findings: {} items", vec.len());
                    vec
                }
                Err(e) => {
                    log::error!("Failed to parse key_findings JSON '{}': {}", kf, e);
                    return Err(anyhow::anyhow!("Failed to parse key_findings JSON: {}", e));
                }
            }
            } else {
            log::debug!("No key_findings, using empty vec");
                Vec::new()
        };

        let recommendations_vec = if let Some(rec) = recommendations {
            match serde_json::from_str::<Vec<String>>(&rec) {
                Ok(vec) => {
                    log::debug!("Successfully parsed recommendations: {} items", vec.len());
                    vec
                }
                Err(e) => {
                    log::error!("Failed to parse recommendations JSON '{}': {}", rec, e);
                    return Err(anyhow::anyhow!("Failed to parse recommendations JSON: {}", e));
                }
            }
            } else {
            log::debug!("No recommendations, using empty vec");
                Vec::new()
        };

        let data_sources_vec = if let Some(ds) = data_sources {
            match serde_json::from_str::<Vec<String>>(&ds) {
                Ok(vec) => {
                    log::debug!("Successfully parsed data_sources: {} items", vec.len());
                    vec
                }
                Err(e) => {
                    log::error!("Failed to parse data_sources JSON '{}': {}", ds, e);
                    return Err(anyhow::anyhow!("Failed to parse data_sources JSON: {}", e));
                }
            }
            } else {
            log::debug!("No data_sources, using empty vec");
                Vec::new()
        };

        // Parse timestamps
        let generated_at = match chrono::DateTime::parse_from_rfc3339(&generated_at_str) {
            Ok(dt) => {
                log::debug!("Successfully parsed generated_at: {}", dt);
                dt.with_timezone(&Utc)
            }
            Err(e) => {
                log::error!("Failed to parse generated_at '{}': {}", generated_at_str, e);
                return Err(anyhow::anyhow!("Failed to parse generated_at: {}", e));
            }
        };

        let expires_at = if let Some(exp_str) = expires_at_str {
            match chrono::DateTime::parse_from_rfc3339(&exp_str) {
                Ok(dt) => {
                    log::debug!("Successfully parsed expires_at: {}", dt);
                    Some(dt.with_timezone(&Utc))
                }
                Err(e) => {
                    log::error!("Failed to parse expires_at '{}': {}", exp_str, e);
                    return Err(anyhow::anyhow!("Failed to parse expires_at: {}", e));
                }
            }
        } else {
            log::debug!("No expires_at");
            None
        };

        // Parse metadata
        let metadata = if let Some(meta_str) = metadata_str {
            match serde_json::from_str::<InsightMetadata>(&meta_str) {
                Ok(meta) => {
                    log::debug!("Successfully parsed metadata");
                    meta
                }
                Err(e) => {
                    log::error!("Failed to parse metadata JSON '{}': {}", meta_str, e);
                    return Err(anyhow::anyhow!("Failed to parse metadata JSON: {}", e));
                }
            }
            } else {
            log::debug!("No metadata, using default");
                InsightMetadata {
                    trade_count: 0,
                    analysis_period_days: 0,
                    model_version: "1.0".to_string(),
                    processing_time_ms: 0,
                    data_quality_score: 0.0,
                }
        };

        log::debug!("Successfully converted row to insight: {}", id);

        Ok(Insight {
            id,
            user_id,
            time_range,
            insight_type,
            title,
            content,
            key_findings: key_findings_vec,
            recommendations: recommendations_vec,
            data_sources: data_sources_vec,
            confidence_score: confidence_score as f32,
            generated_at,
            expires_at,
            metadata,
        })
    }

    /// Store insight
    async fn store_insight(&self, conn: &Connection, insight: &Insight) -> Result<()> {
        conn.execute(
            "INSERT INTO ai_insights (id, user_id, time_range, insight_type, title, content, key_findings, recommendations, data_sources, confidence_score, generated_at, expires_at, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                insight.id.clone(),
                insight.user_id.clone(),
                serde_json::to_string(&insight.time_range)?,
                serde_json::to_string(&insight.insight_type)?,
                insight.title.clone(),
                insight.content.clone(),
                serde_json::to_string(&insight.key_findings)?,
                serde_json::to_string(&insight.recommendations)?,
                serde_json::to_string(&insight.data_sources)?,
                insight.confidence_score,
                insight.generated_at.to_rfc3339(),
                insight.expires_at.map(|d| d.to_rfc3339()),
                serde_json::to_string(&insight.metadata)?,
                Utc::now().to_rfc3339()
            ],
        ).await?;

        Ok(())
    }

    /// Store generation task
    async fn store_generation_task(&self, conn: &Connection, task: &InsightGenerationTask) -> Result<()> {
        conn.execute(
            "INSERT INTO insight_generation_tasks (id, user_id, time_range, insight_type, status, created_at, started_at, completed_at, error_message, result_insight_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            params![
                task.task_id.clone(),
                task.user_id.clone(),
                serde_json::to_string(&task.insight_request.time_range)?,
                serde_json::to_string(&task.insight_request.insight_type)?,
                serde_json::to_string(&task.status)?,
                task.created_at.to_rfc3339(),
                task.started_at.map(|d| d.to_rfc3339()),
                task.completed_at.map(|d| d.to_rfc3339()),
                task.error_message.clone(),
                task.result_insight_id.clone()
            ],
        ).await?;

        Ok(())
    }

    /// Update generation task
    async fn update_generation_task(&self, conn: &Connection, task: &InsightGenerationTask) -> Result<()> {
        conn.execute(
            "UPDATE insight_generation_tasks SET status = ?, started_at = ?, completed_at = ?, error_message = ?, result_insight_id = ? WHERE id = ?",
            params![
                serde_json::to_string(&task.status)?,
                task.started_at.map(|d| d.to_rfc3339()),
                task.completed_at.map(|d| d.to_rfc3339()),
                task.error_message.clone(),
                task.result_insight_id.clone(),
                task.task_id.clone()
            ],
        ).await?;

        Ok(())
    }

    /// Get generation task
    pub async fn get_generation_task(&self, conn: &Connection, task_id: &str) -> Result<InsightGenerationTask> {
        let stmt = conn.prepare(
            "SELECT id, user_id, time_range, insight_type, status, created_at, started_at, completed_at, error_message, result_insight_id FROM insight_generation_tasks WHERE id = ?"
        ).await?;
        
        let mut rows = stmt.query([task_id]).await?;
        
        if let Some(row) = rows.next().await? {
            Ok(InsightGenerationTask {
                task_id: row.get(0)?,
                user_id: row.get(1)?,
                insight_request: InsightRequest {
                    time_range: serde_json::from_str(&row.get::<String>(2)?)?,
                    insight_type: serde_json::from_str(&row.get::<String>(3)?)?,
                    include_predictions: None,
                    force_regenerate: None,
                },
                status: serde_json::from_str(&row.get::<String>(4)?)?,
                created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(5)?)?.with_timezone(&Utc),
                started_at: row.get::<Option<String>>(6)?
                    .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
                completed_at: row.get::<Option<String>>(7)?
                    .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
                error_message: row.get(8)?,
                result_insight_id: row.get(9)?,
            })
        } else {
            Err(anyhow::anyhow!("Generation task not found"))
        }
    }

    /// Ensure ai_insights table exists in user database
    async fn ensure_table_exists(&self, conn: &Connection) -> Result<()> {
        let stmt = conn.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='ai_insights'"
        ).await?;
        
        let mut rows = stmt.query(libsql::params![]).await?;
        
        if rows.next().await?.is_none() {
            return Err(anyhow::anyhow!("ai_insights table does not exist in user database"));
        }
        
        Ok(())
    }

    /// Clone service for background processing
    fn clone_for_background(&self) -> Self {
        Self {
            vectorization_service: self.vectorization_service.clone(),
            openrouter_client: self.openrouter_client.clone(),
            turso_client: self.turso_client.clone(),
            max_context_vectors: self.max_context_vectors,
        }
    }
}

/// Trading data summary for insights
#[derive(Debug)]
struct TradingDataSummary {
    trade_count: u32,
    data_quality_score: f32,
    vector_matches: Vec<crate::service::ai_service::upstash_vector_client::VectorMatch>,
}

/// Insight content generated by AI
#[derive(Debug)]
struct InsightContent {
    title: String,
    content: String,
    key_findings: Vec<String>,
    recommendations: Vec<String>,
    confidence_score: f32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_insight_creation() {
        let insight = Insight::new(
            "user123".to_string(),
            TimeRange::ThirtyDays,
            InsightType::TradingPatterns,
            "Test Insight".to_string(),
            "Test content".to_string(),
        );

        assert_eq!(insight.user_id, "user123");
        assert_eq!(insight.insight_type, InsightType::TradingPatterns);
    }

    #[test]
    fn test_get_period_days() {
        let service = AIInsightsService {
            vectorization_service: Arc::new(VectorizationService::new(
                Arc::new(crate::service::voyager_client::VoyagerClient::new(
                    crate::turso::vector_config::VoyagerConfig::from_env().unwrap()
                ).unwrap()),
                Arc::new(crate::service::upstash_vector_client::UpstashVectorClient::new(
                    crate::turso::vector_config::VectorConfig::from_env().unwrap()
                ).unwrap()),
                crate::turso::vector_config::AIConfig::from_env().unwrap(),
            )),
            openrouter_client: Arc::new(crate::service::openrouter_client::OpenRouterClient::new(
                crate::turso::vector_config::OpenRouterConfig::from_env().unwrap()
            ).unwrap()),
            turso_client: Arc::new(TursoClient::new()),
            max_context_vectors: 10,
        };

        assert_eq!(service.get_period_days(&TimeRange::SevenDays), 7);
        assert_eq!(service.get_period_days(&TimeRange::ThirtyDays), 30);
    }
}
