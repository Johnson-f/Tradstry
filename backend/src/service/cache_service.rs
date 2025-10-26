#![allow(dead_code)]

use anyhow::{Context, Result};
use crate::turso::redis::{RedisClient, ttl};
use crate::turso::schema::{get_expected_schema, TableSchema};
use libsql::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Cache service for managing Redis operations with dynamic schema discovery
#[derive(Debug, Clone)]
pub struct CacheService {
    redis_client: RedisClient,
    schema_cache: HashMap<String, TableSchema>,
}

impl CacheService {
    /// Create a new cache service
    pub fn new(redis_client: RedisClient) -> Self {
        Self { 
            redis_client,
            schema_cache: HashMap::new(),
        }
    }

    /// Initialize cache service with schema information
    pub async fn initialize(&mut self) -> Result<()> {
        log::info!("Initializing cache service with schema discovery");
        
        // Load expected schema from schema.rs
        let expected_schema = get_expected_schema();
        
        // Cache schema information
        for table_schema in expected_schema {
            self.schema_cache.insert(table_schema.name.clone(), table_schema);
        }
        
        log::info!("Cache service initialized with {} tables", self.schema_cache.len());
        Ok(())
    }

    /// Preload all user data into cache after login using dynamic schema discovery
    pub async fn preload_user_data(&self, conn: &Connection, user_id: &str) -> Result<()> {
        log::info!("Starting dynamic cache preload for user database: {}", user_id);

        // Get all tables that should be cached for this user
        let cacheable_tables = self.get_cacheable_tables();
        
        // Preload data from all cacheable tables in parallel
        let mut preload_tasks = Vec::new();
        
        for table_name in &cacheable_tables {
            let table_name = table_name.clone();
            let redis_client = self.redis_client.clone();
            let conn = conn.clone();
            let user_id = user_id.to_string();
            
            let task = tokio::spawn(async move {
                Self::preload_table_data(&redis_client, &conn, &user_id, &table_name).await
            });
            
            preload_tasks.push(task);
        }

        // Wait for all preload tasks to complete
        let mut total_records = 0;
        for task in preload_tasks {
            match task.await {
                Ok(Ok(record_count)) => {
                    total_records += record_count;
                }
                Ok(Err(e)) => {
                    log::warn!("Failed to preload table data: {}", e);
                }
                Err(e) => {
                    log::warn!("Preload task panicked: {}", e);
                }
            }
        }

        // Pre-compute and cache analytics for known analytics tables
        self.preload_analytics(conn, user_id).await?;

        log::info!(
            "Dynamic cache preload completed for user database: {} - {} total records cached",
            user_id,
            total_records
        );

        Ok(())
    }

    /// Get list of tables that should be cached for users
    fn get_cacheable_tables(&self) -> Vec<String> {
        // Define tables that should be cached with their TTL settings
        let cacheable_tables = vec![
            ("stocks", ttl::STOCKS_LIST),
            ("options", ttl::OPTIONS_LIST),
            ("trade_notes", ttl::TRADE_NOTES_LIST),
            ("playbook", ttl::PLAYBOOK_LIST),
            ("notebook_notes", ttl::NOTEBOOK_NOTES_LIST),
            ("images", ttl::IMAGES_LIST),
            ("external_calendar_connections", ttl::CALENDAR_EVENTS),
            ("external_calendar_events", ttl::CALENDAR_EVENTS),
            ("notebook_tags", 3600), // 1 hour
            ("notebook_templates", 3600), // 1 hour
            ("notebook_reminders", 1800), // 30 minutes
            ("calendar_events", ttl::CALENDAR_EVENTS),
            ("public_holidays", ttl::PUBLIC_HOLIDAYS),
        ];

        // Filter to only include tables that exist in our schema
        cacheable_tables
            .into_iter()
            .filter(|(table_name, _)| self.schema_cache.contains_key(*table_name))
            .map(|(table_name, _)| table_name.to_string())
            .collect()
    }

    /// Preload data from a specific table
    async fn preload_table_data(
        redis_client: &RedisClient,
        conn: &Connection,
        user_id: &str,
        table_name: &str,
    ) -> Result<usize> {
        log::debug!("Preloading data for table: {}", table_name);

        // Build dynamic query based on table structure (no user_id needed since each user has their own DB)
        let query = Self::build_select_query(table_name, user_id);
        
        // Execute query and get results with better error handling
        let stmt = match conn.prepare(&query).await {
            Ok(stmt) => stmt,
            Err(e) => {
                log::warn!("Failed to prepare query for table {}: {}", table_name, e);
                return Ok(0); // Return 0 instead of erroring
            }
        };
        
        let mut rows = match stmt.query(libsql::params![]).await {
            Ok(rows) => rows,
            Err(e) => {
                log::warn!("Failed to execute query for table {}: {}", table_name, e);
                return Ok(0); // Return 0 instead of erroring
            }
        };

        let mut records = Vec::new();
        loop {
            match rows.next().await {
                Ok(Some(row)) => {
                    match Self::row_to_json(&row, table_name) {
                        Ok(record) => records.push(record),
                        Err(e) => {
                            log::warn!("Failed to convert row to JSON for table {}: {}", table_name, e);
                            // Continue with other rows
                        }
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    log::warn!("Error reading row from table {}: {}", table_name, e);
                    break; // Continue with what we have
                }
            }
        }

        if records.is_empty() {
            log::debug!("No records found for table: {}", table_name);
            return Ok(0);
        }

        // Cache the data (user_id represents the user's database)
        let cache_key = format!("db:{}:{}:all", user_id, table_name);
        let ttl_seconds = Self::get_table_ttl(table_name);
        
        match redis_client.set(&cache_key, &records, ttl_seconds).await {
            Ok(_) => {
                log::debug!("Cached {} records for table: {}", records.len(), table_name);
                Ok(records.len())
            }
            Err(e) => {
                log::warn!("Failed to cache data for table {}: {}", table_name, e);
                Ok(0) // Return 0 instead of erroring
            }
        }
    }

    /// Check if a table has a specific column
    async fn table_has_column(conn: &Connection, table_name: &str, column_name: &str) -> bool {
        let query = format!("PRAGMA table_info({})", table_name);
        
        if let Ok(stmt) = conn.prepare(&query).await
            && let Ok(mut rows) = stmt.query(libsql::params![]).await
        {
            loop {
                match rows.next().await {
                    Ok(Some(row)) => {
                        if let Ok(col_name) = row.get::<String>(1) { // Column name is at index 1
                            if col_name == column_name {
                                return true;
                            }
                        }
                    }
                    Ok(None) => break,
                    Err(_) => break,
                }
            }
        }
        
        false
    }

    /// Build dynamic SELECT query for a table with column validation
    async fn build_select_query_with_validation(conn: &Connection, table_name: &str, _user_id: &str) -> String {
        // Check for common ordering columns and use the first one found
        let ordering_columns = vec![
            ("created_at", "DESC"),
            ("last_synced_at", "DESC"),
            ("updated_at", "DESC"),
            ("holiday_date", "ASC"),
            ("start_date", "ASC"),
            ("id", "ASC"),
        ];

        for (column, order) in ordering_columns {
            if Self::table_has_column(conn, table_name, column).await {
                return format!("SELECT * FROM {} ORDER BY {} {}", table_name, column, order);
            }
        }

        // Fallback to no ordering
        format!("SELECT * FROM {}", table_name)
    }

    /// Build dynamic SELECT query for a table (legacy method for backward compatibility)
    fn build_select_query(table_name: &str, _user_id: &str) -> String {
        match table_name {
            // Tables with created_at column for ordering
            "stocks" | "options" | "trade_notes" | "playbook" | "notebook_notes" | 
            "images" | "external_calendar_connections" |
            "notebook_tags" | "notebook_templates" | "notebook_reminders" | "calendar_events" |
            "user_profile" => {
                format!("SELECT * FROM {} ORDER BY created_at DESC", table_name)
            }
            // Tables with last_synced_at column for ordering
            "external_calendar_events" => {
                format!("SELECT * FROM {} ORDER BY last_synced_at DESC", table_name)
            }
            // Tables with specific ordering
            "public_holidays" => {
                format!("SELECT * FROM {} ORDER BY holiday_date ASC", table_name)
            }
            // Tables with different ordering
            "replicache_clients" | "replicache_space_version" => {
                format!("SELECT * FROM {} ORDER BY updated_at DESC", table_name)
            }
            // Default case - just select all
            _ => {
                format!("SELECT * FROM {}", table_name)
            }
        }
    }

    /// Convert database row to JSON for caching
    fn row_to_json(row: &libsql::Row, table_name: &str) -> Result<serde_json::Value> {
        let mut record = serde_json::Map::new();
        
        // Get column count
        let column_count = row.column_count();
        
        for i in 0..column_count {
            let column_name = row.column_name(i)
                .context(format!("Failed to get column name for index {}", i))?;
            
            // Get value based on column type
            let value = Self::get_column_value(row, i as usize, table_name, column_name)?;
            record.insert(column_name.to_string(), value);
        }
        
        Ok(serde_json::Value::Object(record))
    }

    /// Get column value with proper type handling - safer approach
    fn get_column_value(
        row: &libsql::Row,
        index: usize,
        _table_name: &str,
        column_name: &str,
    ) -> Result<serde_json::Value> {
        // Use libsql's Value type to safely handle all types
        use libsql::Value;
        
        // Get the raw value first to avoid panics
        let raw_value = match row.get_value(index as i32) {
            Ok(value) => value,
            Err(e) => {
                log::warn!("Failed to get value for column {} at index {}: {}", column_name, index, e);
                return Ok(serde_json::Value::Null);
            }
        };

        // Convert based on the actual SQLite value type
        let json_value = match raw_value {
            Value::Null => serde_json::Value::Null,
            Value::Integer(i) => {
                // Handle boolean columns that are stored as integers
                if column_name.contains("is_") || column_name == "deleted" || 
                   column_name.contains("active") || column_name.contains("synced") {
                    serde_json::Value::Bool(i != 0)
                } else {
                    serde_json::Value::Number(serde_json::Number::from(i))
                }
            }
            Value::Real(f) => {
                match serde_json::Number::from_f64(f) {
                    Some(num) => serde_json::Value::Number(num),
                    None => {
                        log::warn!("Invalid float value for column {}: {}", column_name, f);
                        serde_json::Value::Null
                    }
                }
            }
            Value::Text(s) => {
                // Try to parse text values based on column name patterns
                if column_name.contains("_id") || column_name == "id" {
                    // ID columns might be integers stored as text
                    if let Ok(int_val) = s.parse::<i64>() {
                        serde_json::Value::Number(serde_json::Number::from(int_val))
                    } else {
                        serde_json::Value::String(s)
                    }
                } else if column_name.contains("price") || column_name.contains("amount") || 
                          column_name.contains("quantity") || column_name.contains("size") {
                    // Numeric columns that might be stored as text
                    if let Ok(float_val) = s.parse::<f64>() {
                        match serde_json::Number::from_f64(float_val) {
                            Some(num) => serde_json::Value::Number(num),
                            None => serde_json::Value::String(s)
                        }
                    } else if let Ok(int_val) = s.parse::<i64>() {
                        serde_json::Value::Number(serde_json::Number::from(int_val))
                    } else {
                        serde_json::Value::String(s)
                    }
                } else if column_name.contains("is_") || column_name == "deleted" {
                    // Boolean columns that might be stored as text
                    match s.to_lowercase().as_str() {
                        "true" | "1" | "yes" => serde_json::Value::Bool(true),
                        "false" | "0" | "no" => serde_json::Value::Bool(false),
                        _ => {
                            if let Ok(int_val) = s.parse::<i64>() {
                                serde_json::Value::Bool(int_val != 0)
                            } else {
                                serde_json::Value::String(s)
                            }
                        }
                    }
                } else {
                    serde_json::Value::String(s)
                }
            }
            Value::Blob(b) => {
                // Convert blob to base64 string for JSON serialization
                use base64::Engine;
                let base64_string = base64::engine::general_purpose::STANDARD.encode(&b);
                serde_json::Value::String(format!("data:application/octet-stream;base64,{}", base64_string))
            }
        };

        Ok(json_value)
    }

    /// Get TTL for a specific table
    fn get_table_ttl(table_name: &str) -> usize {
        match table_name {
            "stocks" | "options" | "trade_notes" => ttl::STOCKS_LIST,
            "playbook" | "notebook_tags" | "notebook_templates" | "images" => ttl::PLAYBOOK_LIST,
            "notebook_notes" | "notebook_reminders" => ttl::NOTEBOOK_NOTES_LIST,
            "external_calendar_connections" | "external_calendar_events" | "calendar_events" => ttl::CALENDAR_EVENTS,
            "public_holidays" => ttl::PUBLIC_HOLIDAYS,
            _ => ttl::STOCKS_LIST, // Default TTL
        }
    }

    /// Preload analytics for known analytics tables
    async fn preload_analytics(&self, conn: &Connection, user_id: &str) -> Result<()> {
        log::info!("Preloading analytics for user database: {}", user_id);

        // Only preload analytics for tables that exist and have analytics methods
        let analytics_tables = vec!["stocks", "options"];
        
        for table_name in analytics_tables {
            if !self.schema_cache.contains_key(table_name) {
                continue;
            }

            // Preload analytics for different time ranges
            let time_ranges = vec!["7d", "30d", "90d", "1y", "ytd", "all_time"];
            
            for time_range in time_ranges {
                let analytics = self.calculate_table_analytics(conn, table_name, time_range).await?;
                let cache_key = format!("analytics:db:{}:{}:{}", user_id, table_name, time_range);
                
                self.redis_client.set(&cache_key, &analytics, ttl::ANALYTICS).await
                    .context(format!("Failed to cache analytics for {}:{}", table_name, time_range))?;
            }
        }

        Ok(())
    }

    /// Calculate analytics for a specific table and time range
    async fn calculate_table_analytics(
        &self,
        _conn: &Connection,
        table_name: &str,
        time_range: &str,
    ) -> Result<serde_json::Value> {
        // This is a simplified analytics calculation
        // In a real implementation, you'd have specific analytics methods for each table
        
        let mut analytics = serde_json::Map::new();
        
        match table_name {
            "stocks" => {
                // Calculate stock-specific analytics
                analytics.insert("total_trades".to_string(), serde_json::Value::Number(serde_json::Number::from(0)));
                analytics.insert("win_rate".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(0.0).unwrap()));
                analytics.insert("total_pnl".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(0.0).unwrap()));
            }
            "options" => {
                // Calculate option-specific analytics
                analytics.insert("total_trades".to_string(), serde_json::Value::Number(serde_json::Number::from(0)));
                analytics.insert("win_rate".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(0.0).unwrap()));
                analytics.insert("total_pnl".to_string(), serde_json::Value::Number(serde_json::Number::from_f64(0.0).unwrap()));
            }
            _ => {
                // Default analytics
                analytics.insert("total_records".to_string(), serde_json::Value::Number(serde_json::Number::from(0)));
            }
        }
        
        analytics.insert("time_range".to_string(), serde_json::Value::String(time_range.to_string()));
        analytics.insert("table_name".to_string(), serde_json::Value::String(table_name.to_string()));
        
        Ok(serde_json::Value::Object(analytics))
    }

    /// Get cached data with fallback to database
    pub async fn get_or_fetch<T, F, Fut>(&self, cache_key: &str, ttl_seconds: u64, fetch_fn: F) -> Result<T>
    where
        T: Serialize + for<'de> Deserialize<'de> + Clone,
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        // Try to get from cache first
        if let Some(cached_data) = self.redis_client.get::<T>(cache_key).await? {
            log::debug!("Cache hit for key: {}", cache_key);
            return Ok(cached_data);
        }

        log::debug!("Cache miss for key: {}, fetching from database", cache_key);

        // Fetch from database
        let data = fetch_fn().await?;

        // Store in cache
        self.redis_client.set(cache_key, &data, ttl_seconds as usize).await
            .context("Failed to cache fetched data")?;

        Ok(data)
    }

    /// Invalidate cache keys matching a pattern
    pub async fn invalidate_pattern(&self, pattern: &str) -> Result<usize> {
        let deleted_count = self.redis_client.del_pattern(pattern).await
            .context("Failed to invalidate cache pattern")?;

        log::info!("Invalidated {} cache keys matching pattern: {}", deleted_count, pattern);
        Ok(deleted_count)
    }

    /// Invalidate all user database cache
    #[allow(dead_code)]
    pub async fn invalidate_user_cache(&self, user_id: &str) -> Result<usize> {
        let pattern = format!("db:{}:*", user_id);
        self.invalidate_pattern(&pattern).await
    }

    /// Invalidate analytics cache for a user database
    pub async fn invalidate_user_analytics(&self, user_id: &str) -> Result<usize> {
        let pattern = format!("analytics:db:{}:*", user_id);
        self.invalidate_pattern(&pattern).await
    }

    /// Invalidate cache for a specific table in user database
    pub async fn invalidate_table_cache(&self, user_id: &str, table_name: &str) -> Result<usize> {
        let pattern = format!("db:{}:{}:*", user_id, table_name);
        self.invalidate_pattern(&pattern).await
    }

    /// Get cache statistics
    #[allow(dead_code)]
    pub async fn get_cache_stats(&self) -> Result<CacheStats> {
        // For now, return basic stats since info() method is not available
        let stats = CacheStats {
            total_keys: 0,
            memory_usage: 0,
            hit_rate: 0.0,
            connected_clients: 0,
        };
        
        Ok(stats)
    }

    /// Health check for cache service
    pub async fn health_check(&self) -> Result<()> {
        self.redis_client.health_check().await
    }

    /// Get list of cached tables for a user database
    #[allow(dead_code)]
    pub async fn get_cached_tables(&self, user_id: &str) -> Result<Vec<String>> {
        let _pattern = format!("db:{}:*:all", user_id);
        
        // This would require implementing keys() method in RedisClient
        // For now, return the expected tables
        Ok(self.get_cacheable_tables())
    }
}

/// Cache statistics structure
#[derive(Debug, Serialize, Deserialize)]
pub struct CacheStats {
    pub total_keys: usize,
    pub memory_usage: usize,
    pub hit_rate: f64,
    pub connected_clients: usize,
}