use anyhow::{Context, Result};
use libsql::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::client::MarketClient;
use super::quotes::{get_simple_quotes, SimpleQuote};
use super::search::search;

/// Watchlist entry from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchlistEntry {
    pub id: String,
    pub stock_name: String,
    pub ticker_symbol: String,
    pub current_price: Option<f64>,
    pub percent_change: Option<f64>,
    pub logo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Price alert entry from database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceAlertEntry {
    pub id: String,
    pub stock_name: String,
    pub symbol: String,
    pub current_price: Option<f64>,
    pub price_change: Option<f64>,
    pub alert_price: f64,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Alert trigger result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertTrigger {
    pub alert_id: String,
    pub symbol: String,
    pub stock_name: String,
    pub current_price: f64,
    pub alert_price: f64,
    pub price_change: Option<f64>,
    pub note: Option<String>,
    pub alert_type: String, // "above" or "below"
}

/// Parse price string to f64
fn parse_price(price_str: Option<&String>) -> Option<f64> {
    price_str?.parse::<f64>().ok()
}

/// Parse percent change string to f64
fn parse_percent_change(percent_str: Option<&String>) -> Option<f64> {
    percent_str?.replace('%', "").parse::<f64>().ok()
}

/// Get all watchlist entries from database
pub async fn get_watchlist_entries(conn: &Connection) -> Result<Vec<WatchlistEntry>> {
    let stmt = conn
        .prepare("SELECT id, stock_name, ticker_symbol, current_price, percent_change, logo, created_at, updated_at FROM watchlist ORDER BY created_at DESC")
        .await
        .context("Failed to prepare watchlist query")?;

    let mut rows = stmt.query(libsql::params![]).await.context("Failed to execute watchlist query")?;
    let mut entries = Vec::new();

    while let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        let stock_name: String = row.get(1)?;
        let ticker_symbol: String = row.get(2)?;
        
        // Handle nullable DECIMAL fields
        let current_price: Option<f64> = match row.get::<libsql::Value>(3)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let percent_change: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let logo: Option<String> = row.get(5)?;
        let created_at: String = row.get(6)?;
        let updated_at: String = row.get(7)?;

        entries.push(WatchlistEntry {
            id,
            stock_name,
            ticker_symbol,
            current_price,
            percent_change,
            logo,
            created_at,
            updated_at,
        });
    }

    Ok(entries)
}

/// Get all price alert entries from database
pub async fn get_price_alert_entries(conn: &Connection) -> Result<Vec<PriceAlertEntry>> {
    let stmt = conn
        .prepare("SELECT id, stock_name, symbol, current_price, price_change, alert_price, note, created_at, updated_at FROM price_alert ORDER BY created_at DESC")
        .await
        .context("Failed to prepare price_alert query")?;

    let mut rows = stmt.query(libsql::params![]).await.context("Failed to execute price_alert query")?;
    let mut entries = Vec::new();

    while let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        let stock_name: String = row.get(1)?;
        let symbol: String = row.get(2)?;
        
        // Handle nullable DECIMAL fields
        let current_price: Option<f64> = match row.get::<libsql::Value>(3)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let price_change: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let alert_price: f64 = match row.get::<libsql::Value>(5)? {
            libsql::Value::Real(f) => f,
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Text(s) => s.parse::<f64>().unwrap_or(0.0),
            _ => 0.0,
        };
        
        let note: Option<String> = row.get(6)?;
        let created_at: String = row.get(7)?;
        let updated_at: String = row.get(8)?;

        entries.push(PriceAlertEntry {
            id,
            stock_name,
            symbol,
            current_price,
            price_change,
            alert_price,
            note,
            created_at,
            updated_at,
        });
    }

    Ok(entries)
}

/// Update watchlist with latest price data from external API
pub async fn update_watchlist_prices(
    conn: &Connection,
    client: &MarketClient,
) -> Result<Vec<String>> {
    // Get all watchlist entries
    let watchlist_entries = get_watchlist_entries(conn).await?;

    if watchlist_entries.is_empty() {
        return Ok(Vec::new());
    }

    // Extract symbols
    let symbols: Vec<String> = watchlist_entries
        .iter()
        .map(|e| e.ticker_symbol.clone())
        .collect();

    // Fetch latest quotes from external API
    let quotes = get_simple_quotes(client, &symbols)
        .await
        .context("Failed to fetch quotes for watchlist")?;

    // Create a map for quick lookup
    let quotes_map: HashMap<String, &SimpleQuote> = quotes
        .iter()
        .map(|q| (q.symbol.clone(), q))
        .collect();

    let mut updated_symbols = Vec::new();

    // Update each watchlist entry
    for entry in watchlist_entries {
        if let Some(quote) = quotes_map.get(&entry.ticker_symbol) {
            let current_price = parse_price(quote.price.as_ref());
            let percent_change = parse_percent_change(quote.percent_change.as_ref());
            let logo = quote.logo.clone();

            // Update in database
            let stmt = conn
                .prepare(
                    "UPDATE watchlist SET current_price = ?, percent_change = ?, logo = ? WHERE id = ?"
                )
                .await
                .context("Failed to prepare watchlist update")?;

            stmt.execute(libsql::params![
                current_price,
                percent_change,
                logo,
                entry.id
            ])
            .await
            .context("Failed to update watchlist entry")?;

            updated_symbols.push(entry.ticker_symbol);
        }
    }

    Ok(updated_symbols)
}

/// Update price alerts with latest price data from external API
pub async fn update_price_alert_prices(
    conn: &Connection,
    client: &MarketClient,
) -> Result<Vec<String>> {
    // Get all price alert entries
    let alert_entries = get_price_alert_entries(conn).await?;

    if alert_entries.is_empty() {
        return Ok(Vec::new());
    }

    // Extract symbols
    let symbols: Vec<String> = alert_entries
        .iter()
        .map(|e| e.symbol.clone())
        .collect();

    // Fetch latest quotes from external API
    let quotes = get_simple_quotes(client, &symbols)
        .await
        .context("Failed to fetch quotes for price alerts")?;

    // Create a map for quick lookup
    let quotes_map: HashMap<String, &SimpleQuote> = quotes
        .iter()
        .map(|q| (q.symbol.clone(), q))
        .collect();

    let mut updated_symbols = Vec::new();

    // Update each alert entry
    for entry in alert_entries {
        if let Some(quote) = quotes_map.get(&entry.symbol) {
            let current_price = parse_price(quote.price.as_ref());
            let price_change = parse_price(quote.change.as_ref());

            // Update in database
            let stmt = conn
                .prepare(
                    "UPDATE price_alert SET current_price = ?, price_change = ? WHERE id = ?"
                )
                .await
                .context("Failed to prepare price_alert update")?;

            stmt.execute(libsql::params![
                current_price,
                price_change,
                entry.id
            ])
            .await
            .context("Failed to update price_alert entry")?;

            updated_symbols.push(entry.symbol);
        }
    }

    Ok(updated_symbols)
}

/// Check price alerts and return triggered alerts
/// This function checks if the current price has crossed the alert threshold
pub async fn check_price_alerts(conn: &Connection) -> Result<Vec<AlertTrigger>> {
    let alert_entries = get_price_alert_entries(conn).await?;
    let mut triggered_alerts = Vec::new();

    for entry in alert_entries {
        // Skip if current_price is not available
        let Some(current_price) = entry.current_price else {
            continue;
        };

        let alert_price = entry.alert_price;

        // Calculate previous price from change if available
        // price_change is the difference, so previous = current - change
        let previous_price = entry.price_change.map(|change| current_price - change);

        // Determine if alert should trigger based on threshold crossing
        let should_trigger = if let Some(prev) = previous_price {
            // Check if price crossed the threshold from below or above
            // Trigger if price was below alert and now is at/above, or vice versa
            (prev < alert_price && current_price >= alert_price) ||
            (prev > alert_price && current_price <= alert_price)
        } else {
            // No previous price data available
            // Trigger if current price is at or has crossed the threshold
            // Use a small tolerance (0.01%) to account for floating point precision
            let tolerance = alert_price.abs() * 0.0001;
            (current_price - alert_price).abs() <= tolerance ||
            current_price >= alert_price ||
            current_price <= alert_price
        };

        if should_trigger {
            let alert_type = if current_price >= alert_price {
                "above"
            } else {
                "below"
            };

            triggered_alerts.push(AlertTrigger {
                alert_id: entry.id.clone(),
                symbol: entry.symbol.clone(),
                stock_name: entry.stock_name.clone(),
                current_price,
                alert_price,
                price_change: entry.price_change,
                note: entry.note.clone(),
                alert_type: alert_type.to_string(),
            });
        }
    }

    Ok(triggered_alerts)
}

/// Refresh all watchlist and price alert data
/// This is the main function to call periodically to update prices and check alerts
/// Optionally sends push notifications for triggered alerts
pub async fn refresh_watchlist_and_alerts(
    conn: &Connection,
    client: &MarketClient,
    user_id: Option<&str>,
    web_push_config: Option<&crate::turso::config::WebPushConfig>,
) -> Result<Vec<AlertTrigger>> {
    // Update watchlist prices
    update_watchlist_prices(conn, client).await?;

    // Update price alert prices
    update_price_alert_prices(conn, client).await?;

    // Check for triggered alerts
    let triggered_alerts = check_price_alerts(conn).await?;

    // Send push notifications if user_id and web_push_config are provided
    if let (Some(uid), Some(config)) = (user_id, web_push_config) {
        if !triggered_alerts.is_empty() {
            use crate::service::notifications::price_alert::send_price_alert_notifications;
            let sent_count = send_price_alert_notifications(conn, &triggered_alerts, uid, config).await
                .unwrap_or(0);
            log::info!("Sent {} price alert notifications for user {}", sent_count, uid);
        }
    }

    Ok(triggered_alerts)
}

// =====================================================
// CRUD OPERATIONS FOR WATCHLIST
// =====================================================

/// Create a new watchlist entry
/// Accepts either ticker_symbol OR stock_name, and fetches missing data from API
pub async fn create_watchlist_entry(
    conn: &Connection,
    client: &MarketClient,
    stock_name: Option<&str>,
    ticker_symbol: Option<&str>,
    logo: Option<&str>,
) -> Result<WatchlistEntry> {
    use uuid::Uuid;
    
    // Validate that at least one identifier is provided
    let (final_symbol, final_stock_name, final_logo, current_price, percent_change) = match (ticker_symbol, stock_name) {
        (Some(symbol), _) => {
            // User provided ticker symbol, fetch stock name and other fields
            let quotes = get_simple_quotes(client, &[symbol.to_string()])
                .await
                .context("Failed to fetch quote data for ticker symbol")?;
            
            let quote = quotes.first()
                .ok_or_else(|| anyhow::anyhow!("No quote data found for symbol: {}", symbol))?
                .clone(); // Clone the entire quote to avoid lifetime issues
            
            // Extract values we need
            let name = quote.name.unwrap_or_else(|| stock_name.unwrap_or("").to_string());
            let logo_data = logo.map(|s| s.to_string()).or(quote.logo);
            let price = parse_price(quote.price.as_ref());
            let percent = parse_percent_change(quote.percent_change.as_ref());
            
            (symbol.to_string(), name, logo_data, price, percent)
        }
        (None, Some(name)) => {
            // User provided stock name, search for symbol first
            let search_results = search(client, name, Some(1), Some(true))
                .await
                .context("Failed to search for stock symbol")?;
            
            let search_item = search_results.first()
                .ok_or_else(|| anyhow::anyhow!("No symbol found for stock name: {}", name))?;
            
            let symbol = search_item.symbol.clone();
            
            // Now fetch quote data using the found symbol
            let quotes = get_simple_quotes(client, &[symbol.clone()])
                .await
                .context("Failed to fetch quote data for symbol")?;
            
            let quote = quotes.first()
                .ok_or_else(|| anyhow::anyhow!("No quote data found for symbol: {}", symbol))?
                .clone(); // Clone the entire quote to avoid lifetime issues
            
            // Extract values we need
            let final_name = quote.name.unwrap_or_else(|| name.to_string());
            let logo_data = logo.map(|s| s.to_string()).or(quote.logo);
            let price = parse_price(quote.price.as_ref());
            let percent = parse_percent_change(quote.percent_change.as_ref());
            
            (symbol, final_name, logo_data, price, percent)
        }
        (None, None) => {
            return Err(anyhow::anyhow!("Either stock_name or ticker_symbol must be provided"));
        }
    };
    
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let now_clone = now.clone();

    conn.execute(
        "INSERT INTO watchlist (id, stock_name, ticker_symbol, current_price, percent_change, logo, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        libsql::params![id.clone(), final_stock_name, final_symbol, current_price, percent_change, final_logo, now, now_clone],
    )
    .await
    .context("Failed to insert watchlist entry")?;

    // Fetch the created entry
    get_watchlist_entry_by_id(conn, &id).await
}

/// Get a single watchlist entry by ID
pub async fn get_watchlist_entry_by_id(conn: &Connection, id: &str) -> Result<WatchlistEntry> {
    let stmt = conn
        .prepare("SELECT id, stock_name, ticker_symbol, current_price, percent_change, logo, created_at, updated_at FROM watchlist WHERE id = ?")
        .await
        .context("Failed to prepare watchlist query")?;

    let mut rows = stmt.query(libsql::params![id]).await.context("Failed to execute watchlist query")?;

    if let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        let stock_name: String = row.get(1)?;
        let ticker_symbol: String = row.get(2)?;
        
        let current_price: Option<f64> = match row.get::<libsql::Value>(3)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let percent_change: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let logo: Option<String> = row.get(5)?;
        let created_at: String = row.get(6)?;
        let updated_at: String = row.get(7)?;

        Ok(WatchlistEntry {
            id,
            stock_name,
            ticker_symbol,
            current_price,
            percent_change,
            logo,
            created_at,
            updated_at,
        })
    } else {
        Err(anyhow::anyhow!("Watchlist entry not found"))
    }
}

/// Update a watchlist entry
pub async fn update_watchlist_entry(
    conn: &Connection,
    id: &str,
    stock_name: Option<&str>,
    ticker_symbol: Option<&str>,
    logo: Option<&str>,
) -> Result<WatchlistEntry> {
    // Build update SQL dynamically
    let mut parts = Vec::new();
    if stock_name.is_some() {
        parts.push("stock_name = ?");
    }
    if ticker_symbol.is_some() {
        parts.push("ticker_symbol = ?");
    }
    if logo.is_some() {
        parts.push("logo = ?");
    }
    
    if parts.is_empty() {
        return get_watchlist_entry_by_id(conn, id).await;
    }
    
    parts.push("updated_at = datetime('now')");
    let sql = format!("UPDATE watchlist SET {} WHERE id = ?", parts.join(", "));
    
    let stmt = conn.prepare(&sql).await.context("Failed to prepare watchlist update")?;
    
    // Execute with appropriate params based on what's provided
    match (stock_name, ticker_symbol, logo) {
        (Some(name), Some(sym), Some(l)) => {
            stmt.execute(libsql::params![name, sym, l, id]).await?;
        }
        (Some(name), Some(sym), None) => {
            stmt.execute(libsql::params![name, sym, id]).await?;
        }
        (Some(name), None, Some(l)) => {
            stmt.execute(libsql::params![name, l, id]).await?;
        }
        (None, Some(sym), Some(l)) => {
            stmt.execute(libsql::params![sym, l, id]).await?;
        }
        (Some(name), None, None) => {
            stmt.execute(libsql::params![name, id]).await?;
        }
        (None, Some(sym), None) => {
            stmt.execute(libsql::params![sym, id]).await?;
        }
        (None, None, Some(l)) => {
            stmt.execute(libsql::params![l, id]).await?;
        }
        (None, None, None) => {
            // Already handled above
        }
    }

    get_watchlist_entry_by_id(conn, id).await
}

/// Delete a watchlist entry
pub async fn delete_watchlist_entry(conn: &Connection, id: &str) -> Result<bool> {
    let result = conn
        .execute(
            "DELETE FROM watchlist WHERE id = ?",
            libsql::params![id],
        )
        .await
        .context("Failed to delete watchlist entry")?;

    Ok(result > 0)
}

/// Get watchlist entry by ticker symbol
pub async fn get_watchlist_entry_by_symbol(conn: &Connection, ticker_symbol: &str) -> Result<Option<WatchlistEntry>> {
    let stmt = conn
        .prepare("SELECT id, stock_name, ticker_symbol, current_price, percent_change, logo, created_at, updated_at FROM watchlist WHERE ticker_symbol = ?")
        .await
        .context("Failed to prepare watchlist query")?;

    let mut rows = stmt.query(libsql::params![ticker_symbol]).await.context("Failed to execute watchlist query")?;

    if let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        let stock_name: String = row.get(1)?;
        let ticker_symbol: String = row.get(2)?;
        
        let current_price: Option<f64> = match row.get::<libsql::Value>(3)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let percent_change: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let logo: Option<String> = row.get(5)?;
        let created_at: String = row.get(6)?;
        let updated_at: String = row.get(7)?;

        Ok(Some(WatchlistEntry {
            id,
            stock_name,
            ticker_symbol,
            current_price,
            percent_change,
            logo,
            created_at,
            updated_at,
        }))
    } else {
        Ok(None)
    }
}

// =====================================================
// CRUD OPERATIONS FOR PRICE ALERTS
// =====================================================

/// Create a new price alert entry
/// Accepts either symbol OR stock_name, and fetches current_price and price_change from API
pub async fn create_price_alert_entry(
    conn: &Connection,
    client: &MarketClient,
    stock_name: Option<&str>,
    symbol: Option<&str>,
    alert_price: f64,
    note: Option<&str>,
) -> Result<PriceAlertEntry> {
    use uuid::Uuid;
    
    // Validate that at least one identifier is provided
    let (final_symbol, final_stock_name, current_price, price_change) = match (symbol, stock_name) {
        (Some(sym), _) => {
            // User provided symbol, fetch stock name and price data
            let quotes = get_simple_quotes(client, &[sym.to_string()])
                .await
                .context("Failed to fetch quote data for symbol")?;
            
            let quote = quotes.first()
                .ok_or_else(|| anyhow::anyhow!("No quote data found for symbol: {}", sym))?
                .clone(); // Clone the entire quote to avoid lifetime issues
            
            // Extract values we need
            let name = quote.name.unwrap_or_else(|| stock_name.unwrap_or("").to_string());
            let price = parse_price(quote.price.as_ref());
            let change = parse_price(quote.change.as_ref());
            
            (sym.to_string(), name, price, change)
        }
        (None, Some(name)) => {
            // User provided stock name, search for symbol first
            let search_results = search(client, name, Some(1), Some(true))
                .await
                .context("Failed to search for stock symbol")?;
            
            let search_item = search_results.first()
                .ok_or_else(|| anyhow::anyhow!("No symbol found for stock name: {}", name))?;
            
            let sym = search_item.symbol.clone();
            
            // Now fetch quote data using the found symbol
            let quotes = get_simple_quotes(client, &[sym.clone()])
                .await
                .context("Failed to fetch quote data for symbol")?;
            
            let quote = quotes.first()
                .ok_or_else(|| anyhow::anyhow!("No quote data found for symbol: {}", sym))?
                .clone(); // Clone the entire quote to avoid lifetime issues
            
            // Extract values we need
            let final_name = quote.name.unwrap_or_else(|| name.to_string());
            let price = parse_price(quote.price.as_ref());
            let change = parse_price(quote.change.as_ref());
            
            (sym, final_name, price, change)
        }
        (None, None) => {
            return Err(anyhow::anyhow!("Either stock_name or symbol must be provided"));
        }
    };
    
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let now_clone = now.clone();

    conn.execute(
        "INSERT INTO price_alert (id, stock_name, symbol, current_price, price_change, alert_price, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        libsql::params![id.clone(), final_stock_name, final_symbol, current_price, price_change, alert_price, note, now, now_clone],
    )
    .await
    .context("Failed to insert price alert entry")?;

    // Fetch the created entry
    get_price_alert_entry_by_id(conn, &id).await
}

/// Get a single price alert entry by ID
pub async fn get_price_alert_entry_by_id(conn: &Connection, id: &str) -> Result<PriceAlertEntry> {
    let stmt = conn
        .prepare("SELECT id, stock_name, symbol, current_price, price_change, alert_price, note, created_at, updated_at FROM price_alert WHERE id = ?")
        .await
        .context("Failed to prepare price_alert query")?;

    let mut rows = stmt.query(libsql::params![id]).await.context("Failed to execute price_alert query")?;

    if let Some(row) = rows.next().await? {
        let id: String = row.get(0)?;
        let stock_name: String = row.get(1)?;
        let symbol: String = row.get(2)?;
        
        let current_price: Option<f64> = match row.get::<libsql::Value>(3)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let price_change: Option<f64> = match row.get::<libsql::Value>(4)? {
            libsql::Value::Null => None,
            libsql::Value::Real(f) => Some(f),
            libsql::Value::Integer(i) => Some(i as f64),
            libsql::Value::Text(s) => s.parse::<f64>().ok(),
            _ => None,
        };
        
        let alert_price: f64 = match row.get::<libsql::Value>(5)? {
            libsql::Value::Real(f) => f,
            libsql::Value::Integer(i) => i as f64,
            libsql::Value::Text(s) => s.parse::<f64>().unwrap_or(0.0),
            _ => 0.0,
        };
        
        let note: Option<String> = row.get(6)?;
        let created_at: String = row.get(7)?;
        let updated_at: String = row.get(8)?;

        Ok(PriceAlertEntry {
            id,
            stock_name,
            symbol,
            current_price,
            price_change,
            alert_price,
            note,
            created_at,
            updated_at,
        })
    } else {
        Err(anyhow::anyhow!("Price alert entry not found"))
    }
}

/// Update a price alert entry
pub async fn update_price_alert_entry(
    conn: &Connection,
    id: &str,
    stock_name: Option<&str>,
    symbol: Option<&str>,
    alert_price: Option<f64>,
    note: Option<&str>,
) -> Result<PriceAlertEntry> {
    // Build update SQL dynamically
    let mut parts = Vec::new();
    if stock_name.is_some() {
        parts.push("stock_name = ?");
    }
    if symbol.is_some() {
        parts.push("symbol = ?");
    }
    if alert_price.is_some() {
        parts.push("alert_price = ?");
    }
    if note.is_some() {
        parts.push("note = ?");
    }
    
    if parts.is_empty() {
        return get_price_alert_entry_by_id(conn, id).await;
    }
    
    parts.push("updated_at = datetime('now')");
    let sql = format!("UPDATE price_alert SET {} WHERE id = ?", parts.join(", "));
    
    let stmt = conn.prepare(&sql).await.context("Failed to prepare price_alert update")?;
    
    // Execute with appropriate params based on what's provided
    match (stock_name, symbol, alert_price, note) {
        (Some(name), Some(sym), Some(price), Some(n)) => {
            stmt.execute(libsql::params![name, sym, price, n, id]).await?;
        }
        (Some(name), Some(sym), Some(price), None) => {
            stmt.execute(libsql::params![name, sym, price, id]).await?;
        }
        (Some(name), Some(sym), None, Some(n)) => {
            stmt.execute(libsql::params![name, sym, n, id]).await?;
        }
        (Some(name), None, Some(price), Some(n)) => {
            stmt.execute(libsql::params![name, price, n, id]).await?;
        }
        (None, Some(sym), Some(price), Some(n)) => {
            stmt.execute(libsql::params![sym, price, n, id]).await?;
        }
        (Some(name), Some(sym), None, None) => {
            stmt.execute(libsql::params![name, sym, id]).await?;
        }
        (Some(name), None, Some(price), None) => {
            stmt.execute(libsql::params![name, price, id]).await?;
        }
        (Some(name), None, None, Some(n)) => {
            stmt.execute(libsql::params![name, n, id]).await?;
        }
        (None, Some(sym), Some(price), None) => {
            stmt.execute(libsql::params![sym, price, id]).await?;
        }
        (None, Some(sym), None, Some(n)) => {
            stmt.execute(libsql::params![sym, n, id]).await?;
        }
        (None, None, Some(price), Some(n)) => {
            stmt.execute(libsql::params![price, n, id]).await?;
        }
        (Some(name), None, None, None) => {
            stmt.execute(libsql::params![name, id]).await?;
        }
        (None, Some(sym), None, None) => {
            stmt.execute(libsql::params![sym, id]).await?;
        }
        (None, None, Some(price), None) => {
            stmt.execute(libsql::params![price, id]).await?;
        }
        (None, None, None, Some(n)) => {
            stmt.execute(libsql::params![n, id]).await?;
        }
        (None, None, None, None) => {
            // Already handled above
        }
    }

    // If alert_price was updated, reset notification sent status
    if alert_price.is_some() {
        use crate::service::notifications::price_alert::reset_alert_notification_status;
        let _ = reset_alert_notification_status(conn, id).await;
    }

    get_price_alert_entry_by_id(conn, id).await
}

/// Delete a price alert entry
pub async fn delete_price_alert_entry(conn: &Connection, id: &str) -> Result<bool> {
    // Clean up notification tracking records
    use crate::service::notifications::price_alert::reset_alert_notification_status;
    let _ = reset_alert_notification_status(conn, id).await;

    let result = conn
        .execute(
            "DELETE FROM price_alert WHERE id = ?",
            libsql::params![id],
        )
        .await
        .context("Failed to delete price alert entry")?;

    Ok(result > 0)
}