use anyhow::{Result, Context};
use libsql::Connection;
use log::{info, warn, error};
use serde_json::Value;
use chrono::Utc;

/// Transform brokerage transactions into stocks or options trades
pub async fn transform_brokerage_transactions(conn: &Connection) -> Result<()> {
    info!("Starting transformation of brokerage transactions to trades");

    // Fetch all brokerage transactions that haven't been transformed yet
    // We'll use a flag or check if the transaction_id exists in stocks/options
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

    let mut transformed_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    while let Some(row) = rows.next().await? {
        let transaction_id: String = row.get(0)?;
        let raw_data: String = row.get(1)?;
        let snaptrade_transaction_id: String = row.get(2)?;
        let _account_id: String = row.get(3)?;

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
                error_count += 1;
                continue;
            }
        };

        // Determine if it's a stock or option trade
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

        if is_option {
            match transform_to_option(conn, &transaction_data, &snaptrade_transaction_id).await {
                Ok(_) => {
                    transformed_count += 1;
                    info!("Transformed transaction {} to option trade", snaptrade_transaction_id);
                }
                Err(e) => {
                    error!("Failed to transform transaction {} to option: {}", snaptrade_transaction_id, e);
                    error_count += 1;
                }
            }
        } else {
            match transform_to_stock(conn, &transaction_data, &snaptrade_transaction_id).await {
                Ok(_) => {
                    transformed_count += 1;
                    info!("Transformed transaction {} to stock trade", snaptrade_transaction_id);
                }
                Err(e) => {
                    error!("Failed to transform transaction {} to stock: {}", snaptrade_transaction_id, e);
                    error_count += 1;
                }
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

/// Transform a brokerage transaction to a stock trade
async fn transform_to_stock(
    conn: &Connection,
    transaction: &Value,
    snaptrade_transaction_id: &str,
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

    // Insert into stocks table
    conn.execute(
        r#"
        INSERT INTO stocks (
            symbol, trade_type, order_type, entry_price, stop_loss, commissions,
            number_shares, entry_date, brokerage_name, reviewed, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, false, 0)
        "#,
        libsql::params![
            symbol,
            trade_type,
            order_type,
            price,
            stop_loss,
            fee,
            units,
            trade_date,
            brokerage_name
        ],
    )
    .await
    .context("Failed to insert stock trade")?;

    Ok(())
}

/// Transform a brokerage transaction to an option trade
async fn transform_to_option(
    conn: &Connection,
    transaction: &Value,
    snaptrade_transaction_id: &str,
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

    // Insert into options table
    conn.execute(
        r#"
        INSERT INTO options (
            symbol, strategy_type, trade_direction, number_of_contracts,
            option_type, strike_price, expiration_date, entry_price,
            total_premium, commissions, implied_volatility, entry_date,
            brokerage_name, reviewed, is_deleted, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, false, 0, 'open')
        "#,
        libsql::params![
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
        ],
    )
    .await
    .context("Failed to insert option trade")?;

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

