use anyhow::Result;
use libsql::Connection;
use log::info;
use uuid::Uuid;

/// Calculate weighted average entry price for multiple entries
#[allow(dead_code)]
pub fn calculate_weighted_average_entry(
    entries: &[(f64, f64)], // (quantity, price)
) -> f64 {
    if entries.is_empty() {
        return 0.0;
    }

    let total_cost: f64 = entries.iter().map(|(qty, price)| qty * price).sum();
    let total_quantity: f64 = entries.iter().map(|(qty, _)| qty).sum();

    if total_quantity == 0.0 {
        0.0
    } else {
        total_cost / total_quantity
    }
}

/// Calculate realized P&L using FIFO (First In First Out) method
#[allow(dead_code)]
pub fn calculate_realized_pnl_fifo(
    entries: &mut Vec<(f64, f64)>, // (remaining_quantity, entry_price)
    exit_quantity: f64,
    exit_price: f64,
) -> f64 {
    let mut remaining_to_exit = exit_quantity;
    let mut total_cost_basis = 0.0;

    while remaining_to_exit > 0.0 && !entries.is_empty() {
        let (available_qty, entry_price) = entries[0];
        
        if available_qty <= remaining_to_exit {
            // Use entire entry
            total_cost_basis += available_qty * entry_price;
            remaining_to_exit -= available_qty;
            entries.remove(0);
        } else {
            // Partial exit
            total_cost_basis += remaining_to_exit * entry_price;
            entries[0] = (available_qty - remaining_to_exit, entry_price);
            remaining_to_exit = 0.0;
        }
    }

    let proceeds = exit_quantity * exit_price;
    proceeds - total_cost_basis
}

/// Update position quantity after entry/exit transaction
pub async fn update_position_quantity(
    conn: &Connection,
    position_id: &str,
    position_type: &str, // "stock" or "option"
    transaction_quantity: f64,
    transaction_price: f64,
    transaction_type: &str, // "entry" or "exit"
) -> Result<()> {
    let table_name = if position_type == "stock" {
        "stock_positions"
    } else {
        "option_positions"
    };

    // Get current position
    let mut rows = conn
        .prepare(&format!(
            "SELECT total_quantity, average_entry_price, realized_pnl FROM {} WHERE id = ?",
            table_name
        ))
        .await?
        .query(libsql::params![position_id])
        .await?;

    if let Some(row) = rows.next().await? {
        let current_quantity: f64 = row.get(0)?;
        let current_avg_price: f64 = row.get(1)?;
        let current_realized_pnl: f64 = row.get(2)?;

        let (new_quantity, new_avg_price, new_realized_pnl) = if transaction_type == "entry" {
            // Add to position
            let new_qty = current_quantity + transaction_quantity;
            let new_avg = if new_qty > 0.0 {
                ((current_quantity * current_avg_price) + (transaction_quantity * transaction_price)) / new_qty
            } else {
                transaction_price
            };
            (new_qty, new_avg, current_realized_pnl)
        } else {
            // Exit from position (FIFO)
            let new_qty = (current_quantity - transaction_quantity).max(0.0);
            let realized = if transaction_quantity <= current_quantity {
                (transaction_price - current_avg_price) * transaction_quantity
            } else {
                (transaction_price - current_avg_price) * current_quantity
            };
            (new_qty, current_avg_price, current_realized_pnl + realized)
        };

        // Update position
        conn.execute(
            &format!(
                "UPDATE {} SET total_quantity = ?, average_entry_price = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                table_name
            ),
            libsql::params![new_quantity, new_avg_price, new_realized_pnl, position_id],
        )
        .await?;
    } else {
        // Create new position if it doesn't exist (entry transaction)
        if transaction_type == "entry" {
            let position_id_uuid = if position_id.is_empty() {
                Uuid::new_v4().to_string()
            } else {
                position_id.to_string()
            };

            conn.execute(
                &format!(
                    "INSERT INTO {} (id, total_quantity, average_entry_price, realized_pnl, created_at, updated_at) VALUES (?, ?, ?, 0.0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    table_name
                ),
                libsql::params![position_id_uuid, transaction_quantity, transaction_price],
            )
            .await?;
        }
    }

    Ok(())
}

/// Reconcile position by recalculating from transaction history
#[allow(dead_code)]
pub async fn reconcile_position(
    conn: &Connection,
    position_id: &str,
    position_type: &str,
) -> Result<()> {
    // Get all transactions for this position
    let mut rows = conn
        .prepare(
            "SELECT transaction_type, quantity, price FROM position_transactions 
             WHERE position_id = ? ORDER BY transaction_date ASC"
        )
        .await?
        .query(libsql::params![position_id])
        .await?;

    let mut entries: Vec<(f64, f64)> = Vec::new(); // (quantity, price)
    let mut total_realized_pnl = 0.0;

    while let Some(row) = rows.next().await? {
        let trans_type: String = row.get(0)?;
        let quantity: f64 = row.get(1)?;
        let price: f64 = row.get(2)?;

        if trans_type == "entry" {
            entries.push((quantity, price));
        } else if trans_type == "exit" {
            // Calculate FIFO P&L
            let mut remaining_entries = entries.clone();
            let realized = calculate_realized_pnl_fifo(&mut remaining_entries, quantity, price);
            total_realized_pnl += realized;
            entries = remaining_entries;
        }
    }

    // Calculate current position state
    let total_quantity: f64 = entries.iter().map(|(qty, _)| qty).sum();
    let avg_entry_price = if !entries.is_empty() {
        calculate_weighted_average_entry(&entries)
    } else {
        0.0
    };

    // Update position
    let table_name = if position_type == "stock" {
        "stock_positions"
    } else {
        "option_positions"
    };

    conn.execute(
        &format!(
            "UPDATE {} SET total_quantity = ?, average_entry_price = ?, realized_pnl = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            table_name
        ),
        libsql::params![total_quantity, avg_entry_price, total_realized_pnl, position_id],
    )
    .await?;

    info!("Reconciled position {}: quantity={}, avg_price={}, realized_pnl={}", 
          position_id, total_quantity, avg_entry_price, total_realized_pnl);

    Ok(())
}