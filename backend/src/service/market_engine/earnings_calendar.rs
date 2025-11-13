use anyhow::{anyhow, Result};
use chrono::{Datelike, NaiveDate, Utc};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;

use super::client::MarketClient;
use super::quotes::{get_quotes, get_simple_quotes};

/// Earnings calendar entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsCalendar {
    pub symbol: String,
    pub exchange_id: Option<u32>,
    pub earnings_date: String,
    pub time_of_day: Option<String>, // 'amc', 'bmo', 'dmh', 'unknown'
    pub eps: Option<f64>,
    pub eps_estimated: Option<f64>,
    pub eps_surprise: Option<f64>,
    pub eps_surprise_percent: Option<f64>,
    pub revenue: Option<f64>,
    pub revenue_estimated: Option<f64>,
    pub revenue_surprise: Option<f64>,
    pub revenue_surprise_percent: Option<f64>,
    pub fiscal_date_ending: Option<String>,
    pub fiscal_year: i32,
    pub fiscal_quarter: Option<u8>,
    pub market_cap_at_time: Option<f64>,
    pub sector: Option<String>,
    pub industry: Option<String>,
    pub conference_call_date: Option<String>,
    pub conference_call_time: Option<String>,
    pub webcast_url: Option<String>,
    pub transcript_available: Option<bool>,
    pub status: Option<String>,
    pub last_updated: Option<String>,
    pub update_source: Option<String>,
    pub data_provider: String,
    pub logo: Option<String>,
}

/// Request parameters for earnings calendar
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EarningsCalendarParams {
    pub from_date: Option<String>, // YYYY-MM-DD format
    pub to_date: Option<String>,   // YYYY-MM-DD format
    pub symbols: Option<Vec<String>>, // Optional filter by symbols
}

/// Edge Function response structure
#[derive(Debug, Deserialize)]
struct EdgeFunctionResponse {
    #[allow(dead_code)]
    date_from: String,
    #[allow(dead_code)]
    date_to: String,
    earnings: HashMap<String, EdgeFunctionDateData>,
}

#[derive(Debug, Deserialize)]
struct EdgeFunctionDateData {
    stocks: Vec<EdgeFunctionStock>,
}

#[derive(Debug, Deserialize)]
struct EdgeFunctionStock {
    #[allow(dead_code)]
    importance: u32,
    symbol: String,
    #[allow(dead_code)]
    date: String,
    time: String,
    #[allow(dead_code)]
    title: String,
    #[serde(default)]
    #[allow(dead_code)]
    emoji: Option<String>,
}

/// Request body for edge function
#[derive(Debug, Serialize)]
struct EdgeFunctionRequest {
    #[serde(rename = "fromDate")]
    from_date: String,
    #[serde(rename = "toDate")]
    to_date: String,
    #[serde(rename = "returnRawData")]
    return_raw_data: bool,
}

/// Parse time string to determine time of day
fn parse_time_of_day(time_str: &str) -> String {
    if time_str.is_empty() {
        return "unknown".to_string();
    }

    // Try to parse hour from time string (format: "HH:MM" or "HH:MM:SS")
    if let Some(hour_str) = time_str.split(':').next()
        && let Ok(hour) = hour_str.parse::<u32>() {
        if hour >= 16 {
            return "amc".to_string(); // After market close
        }
        if hour <= 9 {
            return "bmo".to_string(); // Before market open
        }
        return "dmh".to_string(); // During market hours
    }

    "unknown".to_string()
}

/// Parse market cap string to numeric value in millions
/// Handles formats like "200M", "1.5B", "500K", "$1.2B", etc.
fn parse_market_cap(market_cap_str: &str) -> Option<f64> {
    if market_cap_str.is_empty() {
        return None;
    }

    let cleaned = market_cap_str.trim().to_uppercase();
    
    // Remove common prefixes like "$"
    let cleaned = cleaned.trim_start_matches('$').trim();

    // Find the last character to determine the multiplier
    let (multiplier, numeric_part) = if let Some(stripped) = cleaned.strip_suffix('B') {
        (1000.0, stripped) // Billions to millions
    } else if let Some(stripped) = cleaned.strip_suffix('M') {
        (1.0, stripped) // Already in millions
    } else if let Some(stripped) = cleaned.strip_suffix('K') {
        (0.001, stripped) // Thousands to millions
    } else if let Some(stripped) = cleaned.strip_suffix('T') {
        (1_000_000.0, stripped) // Trillions to millions
    } else {
        // No suffix, assume millions
        (1.0, cleaned)
    };

    // Parse the number
    if let Ok(value) = numeric_part.trim().parse::<f64>() {
        Some(value * multiplier)
    } else {
        None
    }
}

/// Fetch market cap data for symbols using the quotes endpoint
async fn fetch_market_caps(
    client: &MarketClient,
    symbols: &[String],
) -> Result<HashMap<String, f64>> {
    let mut market_cap_map = HashMap::new();

    if symbols.is_empty() {
        return Ok(market_cap_map);
    }

    // Process in batches of 50 to avoid overwhelming the API
    const BATCH_SIZE: usize = 50;
    for chunk in symbols.chunks(BATCH_SIZE) {
        match get_quotes(client, chunk).await {
            Ok(quotes) => {
                for quote in quotes {
                    if let Some(market_cap_str) = &quote.market_cap
                        && let Some(market_cap_millions) = parse_market_cap(market_cap_str) {
                        market_cap_map.insert(quote.symbol.to_uppercase(), market_cap_millions);
                    }
                }
            }
            Err(e) => {
                log::warn!("Error fetching market caps for batch: {}", e);
                // Continue with next batch
            }
        }

        // Small delay between batches
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    log::info!("Fetched {} market caps", market_cap_map.len());
    Ok(market_cap_map)
}

/// Fetch earnings calendar data from Supabase Edge Function
async fn fetch_from_edge_function(
    from_date: &str,
    to_date: &str,
    symbols_filter: Option<&[String]>,
) -> Result<Vec<EarningsCalendar>> {
    // Get Supabase configuration from environment
    let supabase_url = env::var("SUPABASE_URL")
        .map_err(|_| anyhow!("SUPABASE_URL environment variable not set"))?;
    let supabase_anon_key = env::var("SUPABASE_ANON_KEY")
        .map_err(|_| anyhow!("SUPABASE_ANON_KEY environment variable not set"))?;

    // Construct edge function URL
    let edge_function_url = format!("{}/functions/v1/earnings-calendar", supabase_url);

    log::info!("Fetching earnings calendar from edge function: {}", edge_function_url);

    // Create HTTP client
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    // Prepare request body
    let request_body = EdgeFunctionRequest {
        from_date: from_date.to_string(),
        to_date: to_date.to_string(),
        return_raw_data: true,
    };

    // Make request to edge function
    let response = client
        .post(&edge_function_url)
        .header("Authorization", format!("Bearer {}", supabase_anon_key))
        .header("Content-Type", "application/json")
        .json(&request_body)
        .send()
        .await?;

    let status = response.status();
    log::info!("Edge function response status: {}", status);

    if !status.is_success() {
        let body = response.text().await.unwrap_or_else(|_| "Unable to read body".to_string());
        log::error!("Error response body: {}", body);
        return Err(anyhow!(
            "Edge function returned status: {} - Body: {}",
            status,
            body
        ));
    }

    let body_text = response.text().await?;
    log::debug!("Response body length: {} bytes", body_text.len());

    let data: EdgeFunctionResponse = serde_json::from_str(&body_text)
        .map_err(|e| {
            log::error!("JSON parse error: {}", e);
            log::error!("Response body preview: {}", &body_text[..body_text.len().min(500)]);
            anyhow!("Failed to parse JSON: {} - Body preview: {}", e, &body_text[..body_text.len().min(200)])
        })?;

    let mut all_earnings: Vec<EarningsCalendar> = Vec::new();

    // Transform edge function response to EarningsCalendar format
    for (date, date_data) in data.earnings {
        for stock in date_data.stocks {
            // Filter by symbols if provided
            if let Some(symbols) = symbols_filter
                && !symbols.contains(&stock.symbol) {
                continue;
            }

            let earnings_date = NaiveDate::parse_from_str(&date, "%Y-%m-%d")
                .unwrap_or_else(|_| Utc::now().date_naive());
            let fiscal_year = earnings_date.year();
            let fiscal_quarter = Some(((earnings_date.month0() / 3) + 1) as u8);

            let earning = EarningsCalendar {
                symbol: stock.symbol,
                exchange_id: None,
                earnings_date: date.clone(),
                time_of_day: Some(parse_time_of_day(&stock.time)),
                eps: None,
                eps_estimated: None,
                eps_surprise: None,
                eps_surprise_percent: None,
                revenue: None,
                revenue_estimated: None,
                revenue_surprise: None,
                revenue_surprise_percent: None,
                fiscal_date_ending: None,
                fiscal_year,
                fiscal_quarter,
                market_cap_at_time: None,
                sector: None,
                industry: None,
                conference_call_date: None,
                conference_call_time: Some(stock.time),
                webcast_url: None,
                transcript_available: Some(false),
                status: Some("scheduled".to_string()),
                last_updated: Some(Utc::now().to_rfc3339()),
                update_source: Some("edge_function".to_string()),
                data_provider: "stocktwits".to_string(),
                logo: None,
            };

            all_earnings.push(earning);
        }
    }

    log::info!("Fetched {} earnings records from edge function", all_earnings.len());
    Ok(all_earnings)
}

/// Fetch logos for symbols using the simple quotes endpoint
async fn fetch_logos_for_symbols(
    client: &MarketClient,
    symbols: &[String],
) -> Result<HashMap<String, String>> {
    let mut logo_map = HashMap::new();

    if symbols.is_empty() {
        return Ok(logo_map);
    }

    // Process in batches of 50 to avoid overwhelming the API
    const BATCH_SIZE: usize = 50;
    for chunk in symbols.chunks(BATCH_SIZE) {
        match get_simple_quotes(client, chunk).await {
            Ok(quotes) => {
                for quote in quotes {
                    if let Some(logo) = quote.logo {
                        logo_map.insert(quote.symbol.to_uppercase(), logo);
                    }
                }
            }
            Err(e) => {
                log::warn!("Error fetching logos for batch: {}", e);
                // Continue with next batch
            }
        }

        // Small delay between batches
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    log::info!("Fetched {} logos", logo_map.len());
    Ok(logo_map)
}

/// Get earnings calendar data with optional date range and symbol filtering
/// Filters stocks to only include those with market cap above $200 million
pub async fn get_earnings_calendar(
    client: &MarketClient,
    params: EarningsCalendarParams,
) -> Result<Vec<EarningsCalendar>> {
    // Determine date range
    let (from_date, to_date) = if let (Some(from), Some(to)) = (params.from_date, params.to_date) {
        (from, to)
    } else {
        // Default to 1 month from today
        let today = Utc::now().date_naive();
        let to = today + chrono::Duration::days(30);
        (today.format("%Y-%m-%d").to_string(), to.format("%Y-%m-%d").to_string())
    };

    log::info!(
        "Fetching earnings calendar from {} to {}",
        from_date,
        to_date
    );

    // Fetch earnings data from edge function (without symbol filter first to get all symbols)
    let all_earnings = fetch_from_edge_function(
        &from_date,
        &to_date,
        params.symbols.as_deref(),
    )
    .await?;

    if all_earnings.is_empty() {
        return Ok(vec![]);
    }

    // Get unique symbols from earnings
    let unique_symbols: Vec<String> = all_earnings
        .iter()
        .map(|e| e.symbol.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    log::info!("Found {} unique symbols with earnings", unique_symbols.len());

    // Fetch market cap data for all symbols
    let market_cap_map = fetch_market_caps(client, &unique_symbols).await?;

    // Filter earnings to only include stocks with market cap > $200 million
    const MIN_MARKET_CAP_MILLIONS: f64 = 200.0;
    let mut filtered_earnings: Vec<EarningsCalendar> = all_earnings
        .into_iter()
        .filter(|earning| {
            let symbol_upper = earning.symbol.to_uppercase();
            if let Some(market_cap) = market_cap_map.get(&symbol_upper) {
                *market_cap > MIN_MARKET_CAP_MILLIONS
            } else {
                // If market cap is not available, exclude the stock (conservative approach)
                log::debug!("Excluding {} - market cap not available", earning.symbol);
                false
            }
        })
        .collect();

    log::info!(
        "Filtered to {} earnings records with market cap > ${}M",
        filtered_earnings.len(),
        MIN_MARKET_CAP_MILLIONS
    );

    // Update earnings with market cap data
    for earning in &mut filtered_earnings {
        let symbol_upper = earning.symbol.to_uppercase();
        if let Some(market_cap) = market_cap_map.get(&symbol_upper) {
            earning.market_cap_at_time = Some(*market_cap);
        }
    }

    // Fetch logos for filtered symbols
    if !filtered_earnings.is_empty() {
        let filtered_symbols: Vec<String> = filtered_earnings
            .iter()
            .map(|e| e.symbol.clone())
            .collect::<std::collections::HashSet<_>>()
            .into_iter()
            .collect();

        let logo_map = fetch_logos_for_symbols(client, &filtered_symbols).await?;

        // Update earnings with logos
        for earning in &mut filtered_earnings {
            if let Some(logo) = logo_map.get(&earning.symbol.to_uppercase()) {
                earning.logo = Some(logo.clone());
            }
        }
    }

    Ok(filtered_earnings)
}