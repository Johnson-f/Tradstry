#![allow(dead_code)]

use chrono::{DateTime, Utc, Duration};
use dashmap::DashMap;
use std::sync::Arc;
use crate::turso::config::SupabaseClaims;
use anyhow::Result;
use log::{debug, info};

/// Cached JWT token with expiration
#[derive(Clone, Debug)]
pub struct CachedToken {
    pub claims: SupabaseClaims,
    pub cached_at: DateTime<Utc>,
    pub cache_duration_seconds: i64,
}

impl CachedToken {
    pub fn new(claims: SupabaseClaims, cache_duration_seconds: i64) -> Self {
        Self {
            claims,
            cached_at: Utc::now(),
            cache_duration_seconds,
        }
    }

    pub fn is_expired(&self) -> bool {
        let now = Utc::now();
        
        // Check if cache TTL has expired
        let cache_expires_at = self.cached_at + Duration::seconds(self.cache_duration_seconds);
        if now > cache_expires_at {
            return true;
        }
        
        // Check if the actual JWT token has expired
        // The JWT exp claim is in seconds since epoch
        let jwt_expires_at = DateTime::from_timestamp(self.claims.exp, 0).unwrap_or(Utc::now());
        if now > jwt_expires_at {
            return true;
        }
        
        false
    }
}

/// Cache statistics for monitoring
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct CacheStats {
    pub total_requests: u64,
    pub cache_hits: u64,
    pub cache_misses: u64,
    pub cache_errors: u64,
    pub jwt_expired_entries: u64,
    pub cache_ttl_expired_entries: u64,
    pub total_entries: usize,
    pub expired_entries: usize,
}

impl Default for CacheStats {
    fn default() -> Self {
        Self {
            total_requests: 0,
            cache_hits: 0,
            cache_misses: 0,
            cache_errors: 0,
            jwt_expired_entries: 0,
            cache_ttl_expired_entries: 0,
            total_entries: 0,
            expired_entries: 0,
        }
    }
}

/// In-memory JWT cache using DashMap for thread-safe operations
#[derive(Clone)]
pub struct JwtCache {
    cache: Arc<DashMap<String, CachedToken>>,
    cache_duration_seconds: i64,
    stats: Arc<DashMap<String, u64>>, // For tracking statistics
}

impl JwtCache {
    /// Create a new JWT cache with specified duration
    pub fn new(cache_duration_seconds: i64) -> Self {
        Self {
            cache: Arc::new(DashMap::new()),
            cache_duration_seconds,
            stats: Arc::new(DashMap::new()),
        }
    }

    /// Get cached token claims if they exist and are not expired
    pub fn get(&self, token: &str) -> Option<SupabaseClaims> {
        let token_hash = Self::hash_token(token);
        
        if let Some(cached) = self.cache.get(&token_hash) {
            let now = Utc::now();
            let cache_expires_at = cached.cached_at + Duration::seconds(cached.cache_duration_seconds);
            
            // Check cache TTL first
            if now > cache_expires_at {
                self.cache.remove(&token_hash);
                self.increment_stat("cache_ttl_expired_entries");
                debug!("JWT Cache: cache TTL expired for user_id={}", cached.claims.sub);
                return None;
            }
            
            // Check JWT expiration
            let jwt_expires_at = DateTime::from_timestamp(cached.claims.exp, 0).unwrap_or(Utc::now());
            if now > jwt_expires_at {
                self.cache.remove(&token_hash);
                self.increment_stat("jwt_expired_entries");
                debug!("JWT Cache: JWT token expired for user_id={}", cached.claims.sub);
                return None;
            }
            
            // Cache hit - token is still valid
            self.increment_stat("cache_hits");
            debug!("JWT Cache Hit: user_id={} (saved Supabase API call)", cached.claims.sub);
            return Some(cached.claims.clone());
        }
        
        // Cache miss
        self.increment_stat("cache_misses");
        debug!("JWT Cache Miss: validating with Supabase");
        None
    }

    /// Cache validated token claims with TTL
    pub fn set(&self, token: &str, claims: &SupabaseClaims) -> Result<()> {
        let token_hash = Self::hash_token(token);
        let cached_token = CachedToken::new(claims.clone(), self.cache_duration_seconds);
        
        self.cache.insert(token_hash, cached_token);
        debug!("JWT Cache: token cached for user_id={} (TTL: {}s)", claims.sub, self.cache_duration_seconds);
        
        Ok(())
    }

    /// Remove token from cache (for logout, password change, etc.)
    #[allow(dead_code)]
    pub fn invalidate(&self, token: &str) -> Result<()> {
        let token_hash = Self::hash_token(token);
        
        if let Some((_, cached_token)) = self.cache.remove(&token_hash) {
            info!("JWT Cache: token invalidated for user_id={}", cached_token.claims.sub);
        }
        
        Ok(())
    }

    /// Create a secure hash of the JWT token for use as cache key
    fn hash_token(token: &str) -> String {
        use sha2::{Sha256, Digest};
        
        let mut hasher = Sha256::new();
        hasher.update(token.as_bytes());
        let result = hasher.finalize();
        hex::encode(result)
    }

    /// Get current cache statistics
    #[allow(dead_code)]
    pub fn stats(&self) -> CacheStats {
        let total_requests = self.stats.get("total_requests").map(|v| *v).unwrap_or(0);
        let cache_hits = self.stats.get("cache_hits").map(|v| *v).unwrap_or(0);
        let cache_misses = self.stats.get("cache_misses").map(|v| *v).unwrap_or(0);
        let cache_errors = self.stats.get("cache_errors").map(|v| *v).unwrap_or(0);
        let jwt_expired_entries = self.stats.get("jwt_expired_entries").map(|v| *v).unwrap_or(0);
        let cache_ttl_expired_entries = self.stats.get("cache_ttl_expired_entries").map(|v| *v).unwrap_or(0);
        
        let total_entries = self.cache.len();
        let expired_entries = self.cache.iter()
            .filter(|entry| entry.value().is_expired())
            .count();
        
        CacheStats {
            total_requests,
            cache_hits,
            cache_misses,
            cache_errors,
            jwt_expired_entries,
            cache_ttl_expired_entries,
            total_entries,
            expired_entries,
        }
    }

    /// Clean up expired tokens from cache
    #[allow(dead_code)]
    pub fn cleanup_expired(&self) {
        let before_count = self.cache.len();
        self.cache.retain(|_, cached| !cached.is_expired());
        let after_count = self.cache.len();
        let removed = before_count - after_count;
        
        if removed > 0 {
            debug!("JWT Cache cleanup: removed {} expired tokens", removed);
        }
    }

    /// Clear all cached tokens
    #[allow(dead_code)]
    pub fn clear_all(&self) {
        let count = self.cache.len();
        self.cache.clear();
        info!("JWT Cache: cleared all {} cached tokens", count);
    }

    /// Increment a statistic counter
    fn increment_stat(&self, stat_name: &str) {
        self.stats.entry(stat_name.to_string()).and_modify(|v| *v += 1).or_insert(1);
    }

    /// Get cache hit rate as percentage
    #[allow(dead_code)]
    pub fn hit_rate(&self) -> f64 {
        let stats = self.stats();
        if stats.total_requests == 0 {
            return 0.0;
        }
        (stats.cache_hits as f64 / stats.total_requests as f64) * 100.0
    }

    /// Log cache statistics periodically
    #[allow(dead_code)]
    pub fn log_stats(&self) {
        let stats = self.stats();
        let hit_rate = self.hit_rate();
        
        info!("JWT Cache Stats:");
        info!("  Total Requests: {}", stats.total_requests);
        info!("  Cache Hits: {} ({:.1}%)", stats.cache_hits, hit_rate);
        info!("  Cache Misses: {} ({:.1}%)", stats.cache_misses, 100.0 - hit_rate);
        info!("  Cache Errors: {}", stats.cache_errors);
        info!("  Total Entries: {}", stats.total_entries);
        info!("  Expired Entries: {}", stats.expired_entries);
        info!("  Saved API Calls: {}", stats.cache_hits);
    }
}

impl Default for JwtCache {
    fn default() -> Self {
        Self::new(30) // Default 30 seconds cache duration
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::turso::config::SupabaseClaims;

    fn create_test_claims() -> SupabaseClaims {
        SupabaseClaims {
            sub: "test-user-123".to_string(),
            email: Some("test@example.com".to_string()),
            aud: "authenticated".to_string(),
            role: "authenticated".to_string(),
            iat: 1234567890,
            exp: 1234567890 + 3600, // 1 hour from iat
            iss: "https://test.supabase.co/auth/v1".to_string(),
            phone: None,
            aal: "aal1".to_string(),
            amr: vec![],
            session_id: "test-session-123".to_string(),
            is_anonymous: Some(false),
            user_metadata: None,
            app_metadata: None,
        }
    }

    #[test]
    fn test_jwt_cache_basic_operations() {
        let cache = JwtCache::new(30);
        let claims = create_test_claims();
        let token = "test-jwt-token";

        // Test cache miss
        assert!(cache.get(token).is_none());

        // Test cache set and hit
        cache.set(token, &claims).unwrap();
        let cached_claims = cache.get(token).unwrap();
        assert_eq!(cached_claims.sub, claims.sub);

        // Test cache invalidation
        cache.invalidate(token).unwrap();
        assert!(cache.get(token).is_none());
    }

    #[test]
    fn test_token_hashing() {
        let token1 = "test-token-1";
        let token2 = "test-token-2";
        let token1_copy = "test-token-1";

        let hash1 = JwtCache::hash_token(token1);
        let hash2 = JwtCache::hash_token(token2);
        let hash1_copy = JwtCache::hash_token(token1_copy);

        // Different tokens should have different hashes
        assert_ne!(hash1, hash2);
        
        // Same token should have same hash
        assert_eq!(hash1, hash1_copy);
        
        // Hash should be consistent length (SHA256 = 64 hex chars)
        assert_eq!(hash1.len(), 64);
    }

    #[test]
    fn test_cache_statistics() {
        let cache = JwtCache::new(1); // 1 second cache for testing
        let claims = create_test_claims();
        let token = "test-token";

        // Initial stats should be zero
        let stats = cache.stats();
        assert_eq!(stats.total_requests, 0);
        assert_eq!(stats.cache_hits, 0);
        assert_eq!(stats.cache_misses, 0);

        // Cache miss should increment miss counter
        cache.get(token);
        let stats = cache.stats();
        assert_eq!(stats.cache_misses, 1);

        // Cache hit should increment hit counter
        cache.set(token, &claims).unwrap();
        cache.get(token);
        let stats = cache.stats();
        assert_eq!(stats.cache_hits, 1);
    }
}
