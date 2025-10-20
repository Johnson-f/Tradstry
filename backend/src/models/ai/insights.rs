use crate::models::stock::stocks::TimeRange;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Insight type enumeration
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum InsightType {
    TradingPatterns,
    PerformanceAnalysis,
    RiskAssessment,
    BehavioralAnalysis,
    MarketAnalysis,
    OpportunityDetection,
}

impl std::fmt::Display for InsightType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InsightType::TradingPatterns => write!(f, "trading_patterns"),
            InsightType::PerformanceAnalysis => write!(f, "performance_analysis"),
            InsightType::RiskAssessment => write!(f, "risk_assessment"),
            InsightType::BehavioralAnalysis => write!(f, "behavioral_analysis"),
            InsightType::MarketAnalysis => write!(f, "market_analysis"),
            InsightType::OpportunityDetection => write!(f, "opportunity_detection"),
        }
    }
}

/// Insight request structure
#[derive(Debug, Clone, Deserialize)]
pub struct InsightRequest {
    pub time_range: TimeRange,
    pub insight_type: InsightType,
    pub include_predictions: Option<bool>,
    pub force_regenerate: Option<bool>,
}

/// Insight structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Insight {
    pub id: String,
    pub user_id: String,
    pub time_range: TimeRange,
    pub insight_type: InsightType,
    pub title: String,
    pub content: String,
    pub key_findings: Vec<String>,
    pub recommendations: Vec<String>,
    pub data_sources: Vec<String>, // Which trades/data informed this
    pub confidence_score: f32,
    pub generated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub metadata: InsightMetadata,
}

/// Insight metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightMetadata {
    pub trade_count: u32,
    pub analysis_period_days: u32,
    pub model_version: String,
    pub processing_time_ms: u64,
    pub data_quality_score: f32,
}

impl Insight {
    pub fn new(
        user_id: String,
        time_range: TimeRange,
        insight_type: InsightType,
        title: String,
        content: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            user_id,
            time_range,
            insight_type,
            title,
            content,
            key_findings: Vec::new(),
            recommendations: Vec::new(),
            data_sources: Vec::new(),
            confidence_score: 0.0,
            generated_at: Utc::now(),
            expires_at: None,
            metadata: InsightMetadata {
                trade_count: 0,
                analysis_period_days: 0,
                model_version: "1.0".to_string(),
                processing_time_ms: 0,
                data_quality_score: 0.0,
            },
        }
    }

    pub fn with_findings(mut self, findings: Vec<String>) -> Self {
        self.key_findings = findings;
        self
    }

    pub fn with_recommendations(mut self, recommendations: Vec<String>) -> Self {
        self.recommendations = recommendations;
        self
    }

    pub fn with_confidence(mut self, confidence: f32) -> Self {
        self.confidence_score = confidence;
        self
    }

    pub fn with_metadata(mut self, metadata: InsightMetadata) -> Self {
        self.metadata = metadata;
        self
    }

    pub fn is_expired(&self) -> bool {
        if let Some(expires_at) = self.expires_at {
            Utc::now() > expires_at
        } else {
            false
        }
    }

    pub fn set_expiration(&mut self, hours_from_now: u32) {
        self.expires_at = Some(Utc::now() + chrono::Duration::hours(hours_from_now as i64));
    }
}

/// Insight list response
#[derive(Debug, Serialize)]
pub struct InsightListResponse {
    pub insights: Vec<InsightSummary>,
    pub total_count: u32,
    pub has_more: bool,
}

/// Insight summary for list view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightSummary {
    pub id: String,
    pub insight_type: InsightType,
    pub title: String,
    pub time_range: TimeRange,
    pub confidence_score: f32,
    pub generated_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub key_findings_count: u32,
    pub recommendations_count: u32,
}

impl From<Insight> for InsightSummary {
    fn from(insight: Insight) -> Self {
        Self {
            id: insight.id,
            insight_type: insight.insight_type,
            title: insight.title,
            time_range: insight.time_range,
            confidence_score: insight.confidence_score,
            generated_at: insight.generated_at,
            expires_at: insight.expires_at,
            key_findings_count: insight.key_findings.len() as u32,
            recommendations_count: insight.recommendations.len() as u32,
        }
    }
}

/// Insight generation status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InsightGenerationStatus {
    Pending,
    Processing,
    Completed,
    Failed,
    Expired,
}

/// Insight generation task
#[derive(Debug, Clone)]
pub struct InsightGenerationTask {
    pub task_id: String,
    pub user_id: String,
    pub insight_request: InsightRequest,
    pub status: InsightGenerationStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error_message: Option<String>,
    pub result_insight_id: Option<String>,
}

impl InsightGenerationTask {
    pub fn new(user_id: String, insight_request: InsightRequest) -> Self {
        Self {
            task_id: Uuid::new_v4().to_string(),
            user_id,
            insight_request,
            status: InsightGenerationStatus::Pending,
            created_at: Utc::now(),
            started_at: None,
            completed_at: None,
            error_message: None,
            result_insight_id: None,
        }
    }

    pub fn start(&mut self) {
        self.status = InsightGenerationStatus::Processing;
        self.started_at = Some(Utc::now());
    }

    pub fn complete(&mut self, insight_id: String) {
        self.status = InsightGenerationStatus::Completed;
        self.completed_at = Some(Utc::now());
        self.result_insight_id = Some(insight_id);
    }

    pub fn fail(&mut self, error_message: String) {
        self.status = InsightGenerationStatus::Failed;
        self.completed_at = Some(Utc::now());
        self.error_message = Some(error_message);
    }
}

/// Insight analytics data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsightAnalytics {
    pub total_insights: u32,
    pub insights_by_type: std::collections::HashMap<String, u32>,
    pub avg_confidence_score: f32,
    pub most_common_findings: Vec<String>,
    pub most_common_recommendations: Vec<String>,
    pub generation_frequency: f64, // insights per day
}

/// Insight template for different types
#[derive(Debug, Clone)]
pub struct InsightTemplate {
    pub insight_type: InsightType,
    pub prompt_template: String,
    pub required_data_types: Vec<String>,
    pub max_tokens: u32,
    pub temperature: f32,
}

impl InsightTemplate {
    pub fn trading_patterns() -> Self {
        Self {
            insight_type: InsightType::TradingPatterns,
            prompt_template: "Analyze trading patterns in the provided data. Look for recurring strategies, entry/exit patterns, and behavioral trends.".to_string(),
            required_data_types: vec!["stock".to_string(), "option".to_string()],
            max_tokens: 2048,
            temperature: 0.7,
        }
    }

    pub fn performance_analysis() -> Self {
        Self {
            insight_type: InsightType::PerformanceAnalysis,
            prompt_template: "Analyze trading performance metrics. Calculate win rates, profit factors, drawdowns, and overall profitability.".to_string(),
            required_data_types: vec!["stock".to_string(), "option".to_string()],
            max_tokens: 2048,
            temperature: 0.6,
        }
    }

    pub fn risk_assessment() -> Self {
        Self {
            insight_type: InsightType::RiskAssessment,
            prompt_template: "Assess trading risk factors. Analyze position sizing, leverage usage, concentration risk, and risk management practices.".to_string(),
            required_data_types: vec!["stock".to_string(), "option".to_string()],
            max_tokens: 1536,
            temperature: 0.5,
        }
    }

    pub fn behavioral_analysis() -> Self {
        Self {
            insight_type: InsightType::BehavioralAnalysis,
            prompt_template: "Analyze trading behavior and psychology. Identify emotional patterns, decision-making biases, and behavioral trends.".to_string(),
            required_data_types: vec!["stock".to_string(), "option".to_string(), "tradenote".to_string()],
            max_tokens: 2048,
            temperature: 0.8,
        }
    }
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
        assert_eq!(insight.title, "Test Insight");
        assert_eq!(insight.confidence_score, 0.0);
    }

    #[test]
    fn test_insight_with_findings() {
        let insight = Insight::new(
            "user123".to_string(),
            TimeRange::SevenDays,
            InsightType::PerformanceAnalysis,
            "Test".to_string(),
            "Test".to_string(),
        ).with_findings(vec!["Finding 1".to_string(), "Finding 2".to_string()]);

        assert_eq!(insight.key_findings.len(), 2);
        assert_eq!(insight.key_findings[0], "Finding 1");
    }

    #[test]
    fn test_insight_expiration() {
        let mut insight = Insight::new(
            "user123".to_string(),
            TimeRange::SevenDays,
            InsightType::RiskAssessment,
            "Test".to_string(),
            "Test".to_string(),
        );

        assert!(!insight.is_expired());
        
        insight.set_expiration(1); // 1 hour from now
        assert!(!insight.is_expired());
        
        // Set expiration in the past
        insight.expires_at = Some(Utc::now() - chrono::Duration::hours(1));
        assert!(insight.is_expired());
    }

    #[test]
    fn test_insight_generation_task() {
        let request = InsightRequest {
            time_range: TimeRange::ThirtyDays,
            insight_type: InsightType::TradingPatterns,
            include_predictions: Some(true),
            force_regenerate: Some(false),
        };

        let mut task = InsightGenerationTask::new("user123".to_string(), request);
        assert_eq!(task.status, InsightGenerationStatus::Pending);

        task.start();
        assert_eq!(task.status, InsightGenerationStatus::Processing);
        assert!(task.started_at.is_some());

        task.complete("insight123".to_string());
        assert_eq!(task.status, InsightGenerationStatus::Completed);
        assert_eq!(task.result_insight_id, Some("insight123".to_string()));
    }

    #[test]
    fn test_insight_type_display() {
        assert_eq!(InsightType::TradingPatterns.to_string(), "trading_patterns");
        assert_eq!(InsightType::PerformanceAnalysis.to_string(), "performance_analysis");
        assert_eq!(InsightType::RiskAssessment.to_string(), "risk_assessment");
    }
}
