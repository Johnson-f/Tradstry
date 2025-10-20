#![allow(dead_code)]

use crate::models::ai::insights::{
    Insight, InsightRequest, InsightType, InsightListResponse, InsightSummary,
    InsightGenerationTask, InsightTemplate, InsightMetadata
};
use crate::models::stock::stocks::TimeRange;
use crate::service::vectorization_service::VectorizationService;
use crate::service::gemini_client::{GeminiClient, MessageRole as GeminiMessageRole};
use crate::service::upstash_vector_client::DataType;
use crate::turso::client::TursoClient;
use anyhow::Result;
use chrono::Utc;
use libsql::{Connection, params};
use serde_json;
use std::sync::Arc;

/// AI Insights Service for generating trading insights
pub struct AIInsightsService {
    vectorization_service: Arc<VectorizationService>,
    gemini_client: Arc<GeminiClient>,
    turso_client: Arc<TursoClient>,
    max_context_vectors: usize,
}

impl AIInsightsService {
    pub fn new(
        vectorization_service: Arc<VectorizationService>,
        gemini_client: Arc<GeminiClient>,
        turso_client: Arc<TursoClient>,
        max_context_vectors: usize,
    ) -> Self {
        Self {
            vectorization_service,
            gemini_client,
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
        let limit = limit.unwrap_or(20);
        let offset = offset.unwrap_or(0);

        // Build query
        let mut query = "SELECT id, user_id, time_range, insight_type, title, content, key_findings, recommendations, data_sources, confidence_score, generated_at, expires_at, metadata FROM ai_insights WHERE user_id = ?".to_string();
        let mut params: Vec<String> = vec![user_id.to_string()];

        if let Some(ref tr) = time_range {
            query.push_str(" AND time_range = ?");
            params.push(format!("{:?}", tr));
        }

        if let Some(ref it) = insight_type {
            query.push_str(" AND insight_type = ?");
            params.push(format!("{:?}", it));
        }

        query.push_str(" ORDER BY generated_at DESC LIMIT ? OFFSET ?");
        params.push(limit.to_string());
        params.push(offset.to_string());

        // Get total count
        let mut count_query = "SELECT COUNT(*) FROM ai_insights WHERE user_id = ?".to_string();
        let mut count_params: Vec<String> = vec![user_id.to_string()];

        if let Some(tr) = time_range {
            count_query.push_str(" AND time_range = ?");
            count_params.push(format!("{:?}", tr));
        }

        if let Some(it) = insight_type {
            count_query.push_str(" AND insight_type = ?");
            count_params.push(format!("{:?}", it));
        }

        let mut count_stmt = conn.prepare(&count_query).await?;
        let row = count_stmt.query_row(count_params.iter().map(|s| s.as_str()).collect::<Vec<_>>()).await?;
        let total_count: u32 = row.get(0)?;

        // Get insights
        let stmt = conn.prepare(&query).await?;
        let mut rows = stmt.query(params.iter().map(|s| s.as_str()).collect::<Vec<_>>()).await?;

        let mut insights = Vec::new();
        while let Some(row) = rows.next().await? {
            let insight = self.row_to_insight(&row)?;
            insights.push(InsightSummary::from(insight));
        }

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

        // Generate content using Gemini
        let messages = vec![crate::service::gemini_client::ChatMessage {
            role: GeminiMessageRole::User,
            content: prompt,
        }];

        let response = self.gemini_client.generate_chat(messages).await?;

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
            &format!("{:?}", time_range),
            &format!("{:?}", insight_type),
        ]).await?;
        
        if let Some(row) = rows.next().await? {
            Ok(Some(self.row_to_insight(&row)?))
        } else {
            Ok(None)
        }
    }

    /// Convert database row to Insight
    fn row_to_insight(&self, row: &libsql::Row) -> Result<Insight> {
        let key_findings: Option<String> = row.get(6)?;
        let recommendations: Option<String> = row.get(7)?;
        let data_sources: Option<String> = row.get(8)?;
        let metadata: Option<String> = row.get(12)?;

        Ok(Insight {
            id: row.get(0)?,
            user_id: row.get(1)?,
            time_range: serde_json::from_str(&row.get::<String>(2)?)?,
            insight_type: serde_json::from_str(&row.get::<String>(3)?)?,
            title: row.get(4)?,
            content: row.get(5)?,
            key_findings: if let Some(kf) = key_findings {
                serde_json::from_str(&kf)?
            } else {
                Vec::new()
            },
            recommendations: if let Some(rec) = recommendations {
                serde_json::from_str(&rec)?
            } else {
                Vec::new()
            },
            data_sources: if let Some(ds) = data_sources {
                serde_json::from_str(&ds)?
            } else {
                Vec::new()
            },
            confidence_score: row.get::<f64>(9)? as f32,
            generated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(10)?)?.with_timezone(&Utc),
            expires_at: row.get::<Option<String>>(11)?
                .map(|s| chrono::DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            metadata: if let Some(meta) = metadata {
                serde_json::from_str(&meta)?
            } else {
                InsightMetadata {
                    trade_count: 0,
                    analysis_period_days: 0,
                    model_version: "1.0".to_string(),
                    processing_time_ms: 0,
                    data_quality_score: 0.0,
                }
            },
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

    /// Clone service for background processing
    fn clone_for_background(&self) -> Self {
        Self {
            vectorization_service: self.vectorization_service.clone(),
            gemini_client: self.gemini_client.clone(),
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
    vector_matches: Vec<crate::service::upstash_vector_client::VectorMatch>,
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
            gemini_client: Arc::new(crate::service::gemini_client::GeminiClient::new(
                crate::turso::vector_config::GeminiConfig::from_env().unwrap()
            ).unwrap()),
            turso_client: Arc::new(TursoClient::new()),
            max_context_vectors: 10,
        };

        assert_eq!(service.get_period_days(&TimeRange::SevenDays), 7);
        assert_eq!(service.get_period_days(&TimeRange::ThirtyDays), 30);
    }
}
