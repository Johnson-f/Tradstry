use anyhow::{Result, Context};
use libsql::Connection;
use log::{info, warn, error};
use serde_json::Value;
use chrono::Utc;
use std::sync::Arc;
use std::collections::HashMap;
use crate::service::ai_service::{
    VectorizationService,
    data_formatter::DataFormatter,
};
use crate::service::ai_service::upstash_vector_client::DataType as VectorDataType;

/// Transaction data structure for matching
#[derive(Debug, Clone)]
struct TransactionData {
    id: String,
    snaptrade_transaction_id: String,
    account_id: String,
    symbol: String,
    trade_type: String, // "BUY" or "SELL"
    units: f64,
    price: f64,
    fee: f64,
    trade_date: String,
    brokerage_name: Option<String>,
    raw_data: Value,
    is_option: bool,
}

/// Transform brokerage transactions into stocks or options trades
/// This function now matches BUY and SELL transactions and merges them into complete trades
pub async fn transform_brokerage_transactions(
    conn: &Connection,
    user_id: &str,
    vectorization_service: Option<Arc<VectorizationService>>,
) -> Result<()> {
    info!("Starting transformation of brokerage transactions to trades");

    // Step 1: Collect all untransformed transactions
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, raw_data, snaptrade_transaction_id, account_id
            FROM brokerage_transactions
            WHERE raw_data IS NOT NULL AND raw_data != ''
            ORDER BY trade_date ASC
            "#
        )
        .await
        .context("Failed to prepare query for brokerage transactions")?;

    let mut rows = stmt.query(libsql::params![]).await
        .context("Failed to query brokerage transactions")?;

    let mut transactions: Vec<TransactionData> = Vec::new();
    let mut skipped_count = 0;

    // Collect all transactions
    while let Some(row) = rows.next().await? {
        let transaction_id: String = row.get(0)?;
        let raw_data: String = row.get(1)?;
        let snaptrade_transaction_id: String = row.get(2)?;
        let account_id: String = row.get(3)?;

        // Check if this transaction has already been transformed
        if transaction_already_transformed(conn, &snaptrade_transaction_id).await? {
            skipped_count += 1;
            continue;
        }

        // Parse the raw_data JSON
        let transaction_data: Value = match serde_json::from_str(&raw_data) {
            Ok(data) => data,
            Err(e) => {
                error!("Failed to parse raw_data for transaction {}: {}", transaction_id, e);
                continue;
            }
        };

        // Extract transaction details
        let symbol = match transaction_data
            .get("symbol")
            .and_then(|s| s.get("symbol"))
            .and_then(|v| v.as_str()) {
            Some(s) => s.to_string(),
            None => {
                warn!("Skipping transaction {}: missing symbol", snaptrade_transaction_id);
                continue;
            }
        };

        let trade_type = match transaction_data.get("type").and_then(|v| v.as_str()) {
            Some("BUY") | Some("SELL") => {
                transaction_data.get("type").and_then(|v| v.as_str()).unwrap().to_string()
            }
            Some(t) => {
                warn!("Skipping transaction {}: invalid trade type {}", snaptrade_transaction_id, t);
                continue;
            }
            None => {
                warn!("Skipping transaction {}: missing trade type", snaptrade_transaction_id);
                continue;
            }
        };

        let units = transaction_data
            .get("units")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let price = transaction_data
            .get("price")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let fee = transaction_data
            .get("fee")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        let trade_date = transaction_data
            .get("trade_date")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let brokerage_name = transaction_data
            .get("institution")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let is_option = transaction_data
            .get("option_symbol")
            .and_then(|v| v.as_str())
            .map(|s| !s.is_empty())
            .unwrap_or(false)
            || transaction_data
                .get("option_type")
                .and_then(|v| v.as_str())
                .map(|s| !s.is_empty())
                .unwrap_or(false);

        transactions.push(TransactionData {
            id: transaction_id,
            snaptrade_transaction_id,
            account_id,
            symbol,
            trade_type,
            units,
            price,
            fee,
            trade_date,
            brokerage_name,
            raw_data: transaction_data,
            is_option,
        });
    }

    info!("Collected {} untransformed transactions", transactions.len());

    // Step 2: Group transactions by symbol and match BUY with SELL
    let mut transformed_count = 0;
    let mut error_count = 0;

    // Separate stocks and options
    let stock_transactions: Vec<&TransactionData> = transactions.iter()
        .filter(|t| !t.is_option)
        .collect();
    let option_transactions: Vec<&TransactionData> = transactions.iter()
        .filter(|t| t.is_option)
        .collect();

    // Process stock transactions with buy/sell matching
    match match_and_transform_stocks(
        conn,
        &stock_transactions,
        user_id,
        vectorization_service.as_ref().map(|arc| arc.as_ref()),
    ).await {
        Ok(count) => {
            transformed_count += count;
            info!("Successfully transformed {} stock trades", count);
        }
        Err(e) => {
            error!("Error transforming stock trades: {}", e);
            error_count += stock_transactions.len();
        }
    }

    // Process option transactions (for now, keep existing logic - can be enhanced later)
    for transaction in option_transactions {
        match transform_to_option(
            conn,
            &transaction.raw_data,
            &transaction.snaptrade_transaction_id,
            user_id,
            vectorization_service.as_ref().map(|arc| arc.as_ref()),
        ).await {
            Ok(_) => {
                transformed_count += 1;
                info!("Transformed transaction {} to option trade", transaction.snaptrade_transaction_id);
            }
            Err(e) => {
                error!("Failed to transform transaction {} to option: {}", transaction.snaptrade_transaction_id, e);
                error_count += 1;
            }
        }
    }

    info!(
        "Transformation complete: {} transformed, {} skipped, {} errors",
        transformed_count, skipped_count, error_count
    );

    Ok(())
}

/// Check if a transaction has already been transformed
/// 
/// This prevents duplicate trades from being created when the sync runs multiple times.
/// We check by looking for trades that match the transaction's key characteristics:
/// - Same symbol
/// - Same trade date
/// - Same price
/// - Same quantity/shares
/// - Same brokerage name (if available)
async fn transaction_already_transformed(
    conn: &Connection,
    snaptrade_transaction_id: &str,
) -> Result<bool> {
    // First, get the transaction data to extract key fields for matching
    let mut stmt = conn
        .prepare(
            r#"
            SELECT raw_data
            FROM brokerage_transactions
            WHERE snaptrade_transaction_id = ?
            LIMIT 1
            "#
        )
        .await
        .context("Failed to prepare query for transaction check")?;

    let mut rows = stmt.query(libsql::params![snaptrade_transaction_id]).await
        .context("Failed to query transaction")?;

    if let Some(row) = rows.next().await? {
        let raw_data: Option<String> = row.get(0)?;

        // Parse raw_data to get transaction details
        if let Some(raw) = raw_data {
            if let Ok(trans_data) = serde_json::from_str::<Value>(&raw) {
                let trans_symbol = trans_data
                    .get("symbol")
                    .and_then(|s| s.get("symbol"))
                    .and_then(|v| v.as_str());
                let trans_type = trans_data.get("type").and_then(|v| v.as_str());
                let trans_units = trans_data.get("units").and_then(|v| v.as_f64());
                let trans_price = trans_data.get("price").and_then(|v| v.as_f64());
                let trans_trade_date = trans_data.get("trade_date").and_then(|v| v.as_str());
                let trans_institution = trans_data.get("institution").and_then(|v| v.as_str());

                // Check if it's an option trade
                let is_option = trans_data
                    .get("option_symbol")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
                    || trans_data
                        .get("option_type")
                        .and_then(|v| v.as_str())
                        .map(|s| !s.is_empty())
                        .unwrap_or(false);

                if let (Some(sym), Some(price), Some(units), Some(date)) = 
                    (trans_symbol, trans_price, trans_units, trans_trade_date) {
                    
                    if is_option {
                        // Check options table for matching trade
                        let mut check_stmt = conn
                            .prepare(
                                r#"
                                SELECT COUNT(*) FROM options
                                WHERE symbol = ? 
                                AND entry_date = ?
                                AND entry_price = ?
                                AND number_of_contracts = ?
                                AND brokerage_name = COALESCE(?, brokerage_name)
                                AND is_deleted = 0
                                LIMIT 1
                                "#
                            )
                            .await?;

                        let mut check_rows = check_stmt.query(libsql::params![
                            sym, date, price, units as i32, trans_institution
                        ]).await?;

                        if let Some(check_row) = check_rows.next().await? {
                            let count: i64 = check_row.get(0)?;
                            if count > 0 {
                                return Ok(true);
                            }
                        }
                    } else {
                        // Check stocks table for matching trade
                        let mut check_stmt = conn
                            .prepare(
                                r#"
                                SELECT COUNT(*) FROM stocks
                                WHERE symbol = ? 
                                AND entry_date = ?
                                AND entry_price = ?
                                AND number_shares = ?
                                AND brokerage_name = COALESCE(?, brokerage_name)
                                AND is_deleted = 0
                                LIMIT 1
                                "#
                            )
                            .await?;

                        let mut check_rows = check_stmt.query(libsql::params![
                            sym, date, price, units, trans_institution
                        ]).await?;

                        if let Some(check_row) = check_rows.next().await? {
                            let count: i64 = check_row.get(0)?;
                            if count > 0 {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(false) // Transaction not yet transformed
}

/// Match BUY and SELL transactions and create merged trades
/// Uses FIFO (First In First Out) matching algorithm
async fn match_and_transform_stocks(
    conn: &Connection,
    transactions: &[&TransactionData],
    user_id: &str,
    vectorization_service: Option<&VectorizationService>,
) -> Result<usize> {
    if transactions.is_empty() {
        return Ok(0);
    }

    // Group transactions by symbol
    let mut by_symbol: HashMap<String, Vec<&TransactionData>> = HashMap::new();
    for transaction in transactions {
        by_symbol
            .entry(transaction.symbol.clone())
            .or_insert_with(Vec::new)
            .push(transaction);
    }

    let mut transformed_count = 0;

    // Process each symbol separately
    for (symbol, symbol_transactions) in by_symbol.iter() {
        // Separate BUY and SELL transactions, sorted by date
        let mut buys: Vec<&TransactionData> = symbol_transactions
            .iter()
            .filter(|t| t.trade_type == "BUY")
            .cloned()
            .collect();
        let mut sells: Vec<&TransactionData> = symbol_transactions
            .iter()
            .filter(|t| t.trade_type == "SELL")
            .cloned()
            .collect();

        // Sort by trade_date to ensure FIFO matching
        buys.sort_by(|a, b| a.trade_date.cmp(&b.trade_date));
        sells.sort_by(|a, b| a.trade_date.cmp(&b.trade_date));

        info!(
            "Processing symbol {}: {} BUYs, {} SELLs",
            symbol,
            buys.len(),
            sells.len()
        );

        // Track remaining quantities for FIFO matching
        let mut buy_queue: Vec<(f64, f64, f64, String, Option<String>)> = Vec::new();
        // Each tuple: (remaining_quantity, price, fee, trade_date, brokerage_name)

        // Process all transactions in chronological order
        let mut all_txns: Vec<(&TransactionData, bool)> = buys
            .iter()
            .map(|b| (*b, true))
            .chain(sells.iter().map(|s| (*s, false)))
            .collect();
        all_txns.sort_by(|a, b| a.0.trade_date.cmp(&b.0.trade_date));

        for (transaction, is_buy) in all_txns {
            if is_buy {
                // Add BUY to queue
                buy_queue.push((
                    transaction.units,
                    transaction.price,
                    transaction.fee,
                    transaction.trade_date.clone(),
                    transaction.brokerage_name.clone(),
                ));
                info!(
                    "Added BUY: {} shares of {} at ${} on {}",
                    transaction.units, symbol, transaction.price, transaction.trade_date
                );
            } else {
                // Match SELL with BUYs from queue (FIFO)
                let mut remaining_sell = transaction.units;
                let mut matched_trades: Vec<(f64, f64, f64, String, String, f64, f64, Option<String>)> = Vec::new();
                // Each tuple: (entry_price, exit_price, shares, entry_date, exit_date, entry_fee, exit_fee, brokerage_name)

                while remaining_sell > 0.0001 && !buy_queue.is_empty() {
                    let (buy_qty, buy_price, buy_fee, buy_date, buy_brokerage) = buy_queue[0].clone();

                    let shares_to_match = remaining_sell.min(buy_qty);
                    let weighted_entry_price = buy_price; // For simplicity, use the buy price
                    // In a more sophisticated system, you might want to average multiple buys

                    let brokerage_name = transaction.brokerage_name.clone().or(buy_brokerage);

                    matched_trades.push((
                        weighted_entry_price,
                        transaction.price,
                        shares_to_match,
                        buy_date.clone(),
                        transaction.trade_date.clone(),
                        buy_fee * (shares_to_match / buy_qty), // Proportional fee
                        transaction.fee * (shares_to_match / transaction.units), // Proportional fee
                        brokerage_name,
                    ));

                    // Update buy queue
                    if shares_to_match >= buy_qty - 0.0001 {
                        // Fully consumed this buy
                        buy_queue.remove(0);
                    } else {
                        // Partially consumed
                        buy_queue[0].0 -= shares_to_match;
                        buy_queue[0].2 -= buy_fee * (shares_to_match / buy_qty); // Adjust fee proportionally
                    }

                    remaining_sell -= shares_to_match;
                }

                // Create merged trades for matched BUY/SELL pairs
                for (entry_price, exit_price, shares, entry_date, exit_date, entry_fee, exit_fee, brokerage_name) in matched_trades {
                    match create_merged_stock_trade(
                        conn,
                        symbol,
                        entry_price,
                        exit_price,
                        shares,
                        entry_date,
                        exit_date,
                        entry_fee + exit_fee,
                        brokerage_name,
                        user_id,
                        vectorization_service,
                    ).await {
                        Ok(_) => {
                            transformed_count += 1;
                            info!(
                                "Created merged trade: {} shares of {} (entry: ${}, exit: ${})",
                                shares, symbol, entry_price, exit_price
                            );
                        }
                        Err(e) => {
                            error!(
                                "Failed to create merged trade for {}: {}",
                                symbol, e
                            );
                        }
                    }
                }

                // If there's remaining SELL quantity, create a trade with unknown entry
                if remaining_sell > 0.0001 {
                    warn!(
                        "SELL of {} shares of {} could not be fully matched. Creating trade with unknown entry.",
                        remaining_sell, symbol
                    );
                    // You might want to handle this differently - perhaps create a trade with entry_price = 0
                    // or skip it entirely. For now, we'll skip unmatched SELLs.
                }
            }
        }

        // Handle unmatched BUYs (open positions)
        for (remaining_qty, price, fee, entry_date, brokerage_name) in buy_queue {
            if remaining_qty > 0.0001 {
                match create_open_stock_trade(
                    conn,
                    symbol,
                    price,
                    remaining_qty,
                    entry_date,
                    fee,
                    brokerage_name,
                    user_id,
                    vectorization_service,
                ).await {
                    Ok(_) => {
                        transformed_count += 1;
                        info!(
                            "Created open position: {} shares of {} at ${}",
                            remaining_qty, symbol, price
                        );
                    }
                    Err(e) => {
                        error!(
                            "Failed to create open position for {}: {}",
                            symbol, e
                        );
                    }
                }
            }
        }
    }

    Ok(transformed_count)
}

/// Create a merged stock trade from matched BUY and SELL
async fn create_merged_stock_trade(
    conn: &Connection,
    symbol: &str,
    entry_price: f64,
    exit_price: f64,
    number_shares: f64,
    entry_date: String,
    exit_date: String,
    total_commissions: f64,
    brokerage_name: Option<String>,
    user_id: &str,
    vectorization_service: Option<&VectorizationService>,
) -> Result<i64> {
    let order_type = "MARKET";
    let stop_loss = entry_price * 0.95; // Default to 5% below entry price

    // Insert merged trade
    let mut insert_stmt = conn
        .prepare(
            r#"
            INSERT INTO stocks (
                symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions,
                number_shares, entry_date, exit_date, brokerage_name, reviewed, is_deleted
            ) VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?, ?, ?, ?, false, 0)
            RETURNING id
            "#,
        )
        .await
        .context("Failed to prepare merged stock insert statement")?;

    let mut rows = insert_stmt
        .query(libsql::params![
            symbol,
            order_type,
            entry_price,
            exit_price,
            stop_loss,
            total_commissions,
            number_shares,
            entry_date,
            exit_date,
            brokerage_name
        ])
        .await
        .context("Failed to insert merged stock trade")?;

    let stock_id: i64 = if let Some(row) = rows.next().await? {
        row.get(0)?
    } else {
        return Err(anyhow::anyhow!("Failed to get inserted stock ID"));
    };

    // Vectorize the trade if vectorization service is available
    if let Some(vector_service) = vectorization_service {
        vectorize_stock_trade(conn, stock_id, user_id, vector_service).await?;
    }

    Ok(stock_id)
}

/// Create an open stock position (unmatched BUY)
async fn create_open_stock_trade(
    conn: &Connection,
    symbol: &str,
    entry_price: f64,
    number_shares: f64,
    entry_date: String,
    commissions: f64,
    brokerage_name: Option<String>,
    user_id: &str,
    vectorization_service: Option<&VectorizationService>,
) -> Result<i64> {
    let order_type = "MARKET";
    let stop_loss = entry_price * 0.95; // Default to 5% below entry price

    // Insert open position (no exit_price or exit_date)
    let mut insert_stmt = conn
        .prepare(
            r#"
            INSERT INTO stocks (
                symbol, trade_type, order_type, entry_price, stop_loss, commissions,
                number_shares, entry_date, brokerage_name, reviewed, is_deleted
            ) VALUES (?, 'BUY', ?, ?, ?, ?, ?, ?, ?, false, 0)
            RETURNING id
            "#,
        )
        .await
        .context("Failed to prepare open stock insert statement")?;

    let mut rows = insert_stmt
        .query(libsql::params![
            symbol,
            order_type,
            entry_price,
            stop_loss,
            commissions,
            number_shares,
            entry_date,
            brokerage_name
        ])
        .await
        .context("Failed to insert open stock trade")?;

    let stock_id: i64 = if let Some(row) = rows.next().await? {
        row.get(0)?
    } else {
        return Err(anyhow::anyhow!("Failed to get inserted stock ID"));
    };

    // Vectorize the trade if vectorization service is available
    if let Some(vector_service) = vectorization_service {
        vectorize_stock_trade(conn, stock_id, user_id, vector_service).await?;
    }

    Ok(stock_id)
}

/// Helper function to vectorize a stock trade
async fn vectorize_stock_trade(
    conn: &Connection,
    stock_id: i64,
    user_id: &str,
    vector_service: &VectorizationService,
) -> Result<()> {
    // Retrieve the full stock record for formatting
    let mut select_stmt = conn
        .prepare(
            r#"
            SELECT id, symbol, trade_type, order_type, entry_price,
                   exit_price, stop_loss, commissions, number_shares, take_profit,
                   initial_target, profit_target, trade_ratings,
                   entry_date, exit_date, reviewed, mistakes, brokerage_name, created_at, updated_at
            FROM stocks
            WHERE id = ?
            "#
        )
        .await
        .context("Failed to prepare stock select statement")?;

    let mut select_rows = select_stmt
        .query(libsql::params![stock_id])
        .await
        .context("Failed to query inserted stock")?;

    if let Some(row) = select_rows.next().await? {
        // Parse the stock record
        use crate::models::stock::stocks::{Stock, TradeType, OrderType};
        
        let trade_type_str: String = row.get(2)?;
        let order_type_str: String = row.get(3)?;
        
        let trade_type = trade_type_str.parse::<TradeType>()
            .map_err(|e| anyhow::anyhow!("Invalid trade type: {}", e))?;
        
        let order_type = order_type_str.parse::<OrderType>()
            .map_err(|e| anyhow::anyhow!("Invalid order type: {}", e))?;

        // Parse dates
        let entry_date_str: String = row.get(13)?;
        let exit_date_str: Option<String> = row.get(14)?;
        let reviewed = row.get::<Option<i64>>(15)?.map(|v| v != 0).unwrap_or(false);
        let mistakes_str: Option<String> = row.get(16)?;
        let brokerage_name: Option<String> = row.get(17)?;
        let created_at_str: String = row.get(18)?;
        let updated_at_str: String = row.get(19)?;

        fn parse_dt(s: &str) -> Result<chrono::DateTime<Utc>> {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Ok(dt.with_timezone(&Utc));
            }
            if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
            }
            if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                let ndt = date.and_hms_opt(0, 0, 0).ok_or_else(|| anyhow::anyhow!("invalid date"))?;
                return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
            }
            Err(anyhow::anyhow!("Unsupported datetime format: {}", s))
        }

        let entry_date = parse_dt(&entry_date_str)?;
        let exit_date = exit_date_str.as_ref().map(|s| parse_dt(s)).transpose()?;
        let created_at = parse_dt(&created_at_str)?;
        let updated_at = parse_dt(&updated_at_str)?;

        let stock = Stock {
            id: stock_id,
            symbol: row.get(1)?,
            trade_type,
            order_type,
            entry_price: row.get::<f64>(4)?,
            exit_price: row.get::<Option<f64>>(5)?,
            stop_loss: row.get::<f64>(6)?,
            commissions: row.get::<f64>(7)?,
            number_shares: row.get::<f64>(8)?,
            take_profit: row.get::<Option<f64>>(9)?,
            initial_target: row.get::<Option<f64>>(10)?,
            profit_target: row.get::<Option<f64>>(11)?,
            trade_ratings: row.get::<Option<i32>>(12)?,
            entry_date,
            exit_date,
            reviewed,
            mistakes: mistakes_str,
            brokerage_name,
            created_at,
            updated_at,
        };

        // Format stock for embedding
        let content = DataFormatter::format_stock_for_embedding(&stock);
        
        // Vectorize the trade
        if let Err(e) = vector_service
            .vectorize_data(
                user_id,
                VectorDataType::Stock,
                &stock_id.to_string(),
                &content,
            )
            .await
        {
            // Log error but don't fail the transformation
            error!(
                "Failed to vectorize stock trade {} for user {}: {}",
                stock_id, user_id, e
            );
        } else {
            info!(
                "Successfully vectorized stock trade {} for user {}",
                stock_id, user_id
            );
        }
    }

    Ok(())
}

/// Transform a brokerage transaction to a stock trade
/// This is kept for backward compatibility but is now primarily used for unmatched transactions
async fn transform_to_stock(
    conn: &Connection,
    transaction: &Value,
    snaptrade_transaction_id: &str,
    user_id: &str,
    vectorization_service: Option<&VectorizationService>,
) -> Result<()> {
    // Extract data from transaction JSON
    let symbol = transaction
        .get("symbol")
        .and_then(|s| s.get("symbol"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing symbol in transaction"))?;

    let trade_type = transaction
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing type in transaction"))?;

    // Validate trade_type
    if trade_type != "BUY" && trade_type != "SELL" {
        return Err(anyhow::anyhow!("Invalid trade_type: {}", trade_type));
    }

    let units = transaction
        .get("units")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| anyhow::anyhow!("Missing units in transaction"))?;

    let price = transaction
        .get("price")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| anyhow::anyhow!("Missing price in transaction"))?;

    let fee = transaction
        .get("fee")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let trade_date = transaction
        .get("trade_date")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing trade_date in transaction"))?;

    let brokerage_name = transaction
        .get("institution")
        .and_then(|v| v.as_str());

    // Set default values for required fields that might be missing
    let order_type = "MARKET"; // Default to MARKET since we don't have this info
    let stop_loss = price * 0.95; // Default to 5% below entry price (user will review)

    // Insert into stocks table and get the inserted ID
    let mut insert_stmt = conn
        .prepare(
            r#"
            INSERT INTO stocks (
                symbol, trade_type, order_type, entry_price, stop_loss, commissions,
                number_shares, entry_date, brokerage_name, reviewed, is_deleted
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, false, 0)
            RETURNING id
            "#,
        )
        .await
        .context("Failed to prepare stock insert statement")?;

    let mut rows = insert_stmt
        .query(libsql::params![
            symbol,
            trade_type,
            order_type,
            price,
            stop_loss,
            fee,
            units,
            trade_date,
            brokerage_name
        ])
        .await
        .context("Failed to insert stock trade")?;

    let stock_id: i64 = if let Some(row) = rows.next().await? {
        row.get(0)?
    } else {
        return Err(anyhow::anyhow!("Failed to get inserted stock ID"));
    };

    // Vectorize the trade if vectorization service is available
    if let Some(vector_service) = vectorization_service {
        // Retrieve the full stock record for formatting
        let mut select_stmt = conn
            .prepare(
                r#"
                SELECT id, symbol, trade_type, order_type, entry_price,
                       exit_price, stop_loss, commissions, number_shares, take_profit,
                       initial_target, profit_target, trade_ratings,
                       entry_date, exit_date, reviewed, mistakes, brokerage_name, created_at, updated_at
                FROM stocks
                WHERE id = ?
                "#
            )
            .await
            .context("Failed to prepare stock select statement")?;

        let mut select_rows = select_stmt
            .query(libsql::params![stock_id])
            .await
            .context("Failed to query inserted stock")?;

        if let Some(row) = select_rows.next().await? {
            // Parse the stock record
            use crate::models::stock::stocks::{Stock, TradeType, OrderType};
            
            let trade_type_str: String = row.get(2)?;
            let order_type_str: String = row.get(3)?;
            
            let trade_type = trade_type_str.parse::<TradeType>()
                .map_err(|e| anyhow::anyhow!("Invalid trade type: {}", e))?;
            
            let order_type = order_type_str.parse::<OrderType>()
                .map_err(|e| anyhow::anyhow!("Invalid order type: {}", e))?;

            // Parse dates
            let entry_date_str: String = row.get(13)?;
            let exit_date_str: Option<String> = row.get(14)?;
            let reviewed = row.get::<Option<i64>>(15)?.map(|v| v != 0).unwrap_or(false);
            let mistakes_str: Option<String> = row.get(16)?;
            let brokerage_name: Option<String> = row.get(17)?;
            let created_at_str: String = row.get(18)?;
            let updated_at_str: String = row.get(19)?;

            fn parse_dt(s: &str) -> Result<chrono::DateTime<Utc>> {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                    return Ok(dt.with_timezone(&Utc));
                }
                if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                    return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
                }
                if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    let ndt = date.and_hms_opt(0, 0, 0).ok_or_else(|| anyhow::anyhow!("invalid date"))?;
                    return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
                }
                Err(anyhow::anyhow!("Unsupported datetime format: {}", s))
            }

            let entry_date = parse_dt(&entry_date_str)?;
            let exit_date = exit_date_str.as_ref().map(|s| parse_dt(s)).transpose()?;
            let created_at = parse_dt(&created_at_str)?;
            let updated_at = parse_dt(&updated_at_str)?;

            let stock = Stock {
                id: stock_id,
                symbol: row.get(1)?,
                trade_type,
                order_type,
                entry_price: row.get::<f64>(4)?,
                exit_price: row.get::<Option<f64>>(5)?,
                stop_loss: row.get::<f64>(6)?,
                commissions: row.get::<f64>(7)?,
                number_shares: row.get::<f64>(8)?,
                take_profit: row.get::<Option<f64>>(9)?,
                initial_target: row.get::<Option<f64>>(10)?,
                profit_target: row.get::<Option<f64>>(11)?,
                trade_ratings: row.get::<Option<i32>>(12)?,
                entry_date,
                exit_date,
                reviewed,
                mistakes: mistakes_str,
                brokerage_name,
                created_at,
                updated_at,
            };

            // Format stock for embedding
            let content = DataFormatter::format_stock_for_embedding(&stock);
            
            // Vectorize the trade
            if let Err(e) = vector_service
                .vectorize_data(
                    user_id,
                    VectorDataType::Stock,
                    &stock_id.to_string(),
                    &content,
                )
                .await
            {
                // Log error but don't fail the transformation
                error!(
                    "Failed to vectorize stock trade {} for user {}: {}",
                    stock_id, user_id, e
                );
            } else {
                info!(
                    "Successfully vectorized stock trade {} for user {}",
                    stock_id, user_id
                );
            }
        }
    }

    Ok(())
}

/// Transform a brokerage transaction to an option trade
async fn transform_to_option(
    conn: &Connection,
    transaction: &Value,
    snaptrade_transaction_id: &str,
    user_id: &str,
    vectorization_service: Option<&VectorizationService>,
) -> Result<()> {
    // Extract data from transaction JSON
    let symbol = transaction
        .get("symbol")
        .and_then(|s| s.get("symbol"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing symbol in transaction"))?;

    let trade_type = transaction
        .get("type")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing type in transaction"))?;

    let units = transaction
        .get("units")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0) as i32;

    let price = transaction
        .get("price")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| anyhow::anyhow!("Missing price in transaction"))?;

    let fee = transaction
        .get("fee")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let trade_date = transaction
        .get("trade_date")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("Missing trade_date in transaction"))?;

    let brokerage_name = transaction
        .get("institution")
        .and_then(|v| v.as_str());

    // Extract option-specific data
    let option_type_str = transaction
        .get("option_type")
        .and_then(|v| v.as_str())
        .unwrap_or("Call");

    let option_type = match option_type_str.to_uppercase().as_str() {
        "PUT" | "PUTS" => "Put",
        _ => "Call",
    };

    // For options, we need to extract strike price and expiration from option_symbol
    // If option_symbol is not available, we'll use defaults that the user can update
    let option_symbol = transaction
        .get("option_symbol")
        .and_then(|v| v.as_str());

    // Parse option symbol if available (format: SYMBOL YYMMDD C/P STRIKE)
    // For now, use defaults - user will need to review and update
    let strike_price = price; // Default to entry price, user will update
    let expiration_date = trade_date; // Default to trade date, user will update

    // Set defaults for required fields
    let strategy_type = "Single"; // Default strategy
    let trade_direction = if trade_type == "BUY" { "Bullish" } else { "Bearish" };
    let total_premium = price * units as f64;
    let implied_volatility = 0.0; // Default, user will update

    // Insert into options table and get the inserted ID
    let mut insert_stmt = conn
        .prepare(
            r#"
            INSERT INTO options (
                symbol, strategy_type, trade_direction, number_of_contracts,
                option_type, strike_price, expiration_date, entry_price,
                total_premium, commissions, implied_volatility, entry_date,
                brokerage_name, reviewed, is_deleted, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, 0, 'open')
            RETURNING id
            "#,
        )
        .await
        .context("Failed to prepare option insert statement")?;

    let mut rows = insert_stmt
        .query(libsql::params![
            symbol,
            strategy_type,
            trade_direction,
            units,
            option_type,
            strike_price,
            expiration_date,
            price,
            total_premium,
            fee,
            implied_volatility,
            trade_date,
            brokerage_name
        ])
        .await
        .context("Failed to insert option trade")?;

    let option_id: i64 = if let Some(row) = rows.next().await? {
        row.get(0)?
    } else {
        return Err(anyhow::anyhow!("Failed to get inserted option ID"));
    };

    // Vectorize the trade if vectorization service is available
    if let Some(vector_service) = vectorization_service {
        // Retrieve the full option record for formatting
        let mut select_stmt = conn
            .prepare(
                r#"
                SELECT id, symbol, strategy_type, trade_direction, number_of_contracts,
                       option_type, strike_price, expiration_date, entry_price, exit_price,
                       total_premium, commissions, implied_volatility, entry_date, exit_date,
                       status, initial_target, profit_target, trade_ratings, reviewed, mistakes,
                       brokerage_name, created_at, updated_at, is_deleted
                FROM options
                WHERE id = ?
                "#
            )
            .await
            .context("Failed to prepare option select statement")?;

        let mut select_rows = select_stmt
            .query(libsql::params![option_id])
            .await
            .context("Failed to query inserted option")?;

        if let Some(row) = select_rows.next().await? {
            // Parse the option record
            use crate::models::options::option_trade::{OptionTrade, TradeDirection, OptionType, TradeStatus};
            
            let trade_direction_str = match row.get::<libsql::Value>(3) {
                Ok(libsql::Value::Text(s)) => s,
                _ => "Neutral".to_string(),
            };
            let option_type_str = match row.get::<libsql::Value>(5) {
                Ok(libsql::Value::Text(s)) => s,
                _ => "Call".to_string(),
            };
            let status_str = match row.get::<libsql::Value>(15) {
                Ok(libsql::Value::Text(s)) => s,
                _ => "open".to_string(),
            };

            let trade_direction = trade_direction_str.parse::<TradeDirection>()
                .map_err(|e| anyhow::anyhow!("Invalid trade direction: {}", e))?;
            let option_type = option_type_str.parse::<OptionType>()
                .map_err(|e| anyhow::anyhow!("Invalid option type: {}", e))?;
            let status = status_str.parse::<TradeStatus>()
                .map_err(|e| anyhow::anyhow!("Invalid trade status: {}", e))?;

            // Parse dates
            let expiration_date_str = match row.get::<libsql::Value>(7) {
                Ok(libsql::Value::Text(s)) => s,
                _ => return Err(anyhow::anyhow!("Failed to get expiration_date")),
            };
            let entry_date_str = match row.get::<libsql::Value>(13) {
                Ok(libsql::Value::Text(s)) => s,
                _ => return Err(anyhow::anyhow!("Failed to get entry_date")),
            };
            let exit_date_str: Option<String> = match row.get::<libsql::Value>(14) {
                Ok(libsql::Value::Text(s)) => Some(s),
                Ok(libsql::Value::Null) => None,
                _ => None,
            };
            let reviewed_val: Option<i64> = match row.get::<libsql::Value>(19) {
                Ok(libsql::Value::Integer(val)) => Some(val),
                Ok(libsql::Value::Null) => None,
                Ok(libsql::Value::Real(val)) => Some(val as i64),
                _ => None,
            };
            let reviewed = reviewed_val.map(|v| v != 0).unwrap_or(false);
            let mistakes_str: Option<String> = match row.get::<libsql::Value>(20) {
                Ok(libsql::Value::Text(s)) => Some(s),
                Ok(libsql::Value::Null) => None,
                _ => None,
            };
            let brokerage_name: Option<String> = match row.get::<libsql::Value>(21) {
                Ok(libsql::Value::Text(s)) => Some(s),
                Ok(libsql::Value::Null) => None,
                _ => None,
            };
            let created_at_str = match row.get::<libsql::Value>(22) {
                Ok(libsql::Value::Text(s)) => s,
                _ => return Err(anyhow::anyhow!("Failed to get created_at")),
            };
            let updated_at_str = match row.get::<libsql::Value>(23) {
                Ok(libsql::Value::Text(s)) => s,
                _ => return Err(anyhow::anyhow!("Failed to get updated_at")),
            };

            fn parse_dt(s: &str) -> Result<chrono::DateTime<Utc>> {
                if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                    return Ok(dt.with_timezone(&Utc));
                }
                if let Ok(ndt) = chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
                    return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
                }
                if let Ok(date) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                    let ndt = date.and_hms_opt(0, 0, 0).ok_or_else(|| anyhow::anyhow!("invalid date"))?;
                    return Ok(chrono::DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc));
                }
                Err(anyhow::anyhow!("Unsupported datetime format: {}", s))
            }

            let expiration_date = parse_dt(&expiration_date_str)?;
            let entry_date = parse_dt(&entry_date_str)?;
            let exit_date = exit_date_str.as_ref().map(|s| parse_dt(s)).transpose()?;
            let created_at = parse_dt(&created_at_str)?;
            let updated_at = parse_dt(&updated_at_str)?;

            let option = OptionTrade {
                id: option_id,
                symbol: match row.get::<libsql::Value>(1) {
                    Ok(libsql::Value::Text(s)) => s,
                    _ => return Err(anyhow::anyhow!("Failed to get symbol")),
                },
                strategy_type: match row.get::<libsql::Value>(2) {
                    Ok(libsql::Value::Text(s)) => s,
                    _ => return Err(anyhow::anyhow!("Failed to get strategy_type")),
                },
                trade_direction,
                number_of_contracts: match row.get::<libsql::Value>(4) {
                    Ok(libsql::Value::Integer(val)) => val as i32,
                    Ok(libsql::Value::Real(val)) => val as i32,
                    _ => return Err(anyhow::anyhow!("Failed to get number_of_contracts")),
                },
                option_type,
                strike_price: row.get::<f64>(6)?,
                expiration_date,
                entry_price: row.get::<f64>(8)?,
                exit_price: row.get::<Option<f64>>(9)?,
                total_premium: row.get::<f64>(10)?,
                commissions: row.get::<f64>(11)?,
                implied_volatility: row.get::<f64>(12)?,
                entry_date,
                exit_date,
                status,
                initial_target: row.get::<Option<f64>>(16)?,
                profit_target: row.get::<Option<f64>>(17)?,
                trade_ratings: match row.get::<libsql::Value>(18) {
                    Ok(libsql::Value::Integer(val)) => Some(val as i32),
                    Ok(libsql::Value::Null) => None,
                    Ok(libsql::Value::Real(val)) => Some(val as i32),
                    _ => None,
                },
                reviewed,
                mistakes: mistakes_str,
                brokerage_name,
                created_at,
                updated_at,
                is_deleted: match row.get::<libsql::Value>(24) {
                    Ok(libsql::Value::Integer(val)) => val != 0,
                    Ok(libsql::Value::Null) => false,
                    _ => false,
                },
            };

            // Format option for embedding
            let content = DataFormatter::format_option_for_embedding(&option);
            
            // Vectorize the trade
            if let Err(e) = vector_service
                .vectorize_data(
                    user_id,
                    VectorDataType::Option,
                    &option_id.to_string(),
                    &content,
                )
                .await
            {
                // Log error but don't fail the transformation
                error!(
                    "Failed to vectorize option trade {} for user {}: {}",
                    option_id, user_id, e
                );
            } else {
                info!(
                    "Successfully vectorized option trade {} for user {}",
                    option_id, user_id
                );
            }
        }
    }

    Ok(())
}

/// Add brokerage_name column to existing stocks and options tables if it doesn't exist
pub async fn migrate_add_brokerage_name_column(conn: &Connection) -> Result<()> {
    info!("Migrating: Adding brokerage_name column to stocks and options tables");

    // Check and add to stocks table
    {
        let check_col = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('stocks') WHERE name = 'brokerage_name'")
            .await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                conn.execute("ALTER TABLE stocks ADD COLUMN brokerage_name TEXT", libsql::params![])
                    .await
                    .context("Failed to add brokerage_name to stocks table")?;
                info!("Added brokerage_name column to stocks table");
            }
        }
    }

    // Check and add to options table
    {
        let check_col = conn
            .prepare("SELECT COUNT(*) FROM pragma_table_info('options') WHERE name = 'brokerage_name'")
            .await?;
        let mut rows = check_col.query(libsql::params![]).await?;
        if let Some(row) = rows.next().await? {
            let count: i64 = row.get(0)?;
            if count == 0 {
                conn.execute("ALTER TABLE options ADD COLUMN brokerage_name TEXT", libsql::params![])
                    .await
                    .context("Failed to add brokerage_name to options table")?;
                info!("Added brokerage_name column to options table");
            }
        }
    }

    Ok(())
}

