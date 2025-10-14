use anyhow::{Result, Context};
use serde_json::Value;
use libsql::{Connection, params};
use chrono::Utc;
use super::types::Patch;

/// Apply a mutation to the database based on mutation name and arguments
pub async fn apply_mutation_to_db(
    conn: &Connection,
    user_id: &str,
    mutation_name: &str,
    mutation_args: Value,
) -> Result<()> {
    match mutation_name {
        // Stock mutations
        "createStock" => {
            let stock_data = serde_json::from_value::<StockData>(mutation_args)
                .context("Failed to parse createStock arguments")?;
            create_stock_in_db(conn, user_id, stock_data).await?;
        }
        "updateStock" => {
            let update_data = serde_json::from_value::<UpdateStockData>(mutation_args)
                .context("Failed to parse updateStock arguments")?;
            update_stock_in_db(conn, user_id, update_data).await?;
        }
        "deleteStock" => {
            let id = mutation_args.get("id")
                .and_then(|v| v.as_i64())
                .context("Missing or invalid stock ID")?;
            delete_stock_in_db(conn, user_id, id).await?;
        }
        
        // Option mutations
        "createOption" => {
            let option_data = serde_json::from_value::<OptionData>(mutation_args)
                .context("Failed to parse createOption arguments")?;
            create_option_in_db(conn, user_id, option_data).await?;
        }
        "updateOption" => {
            let update_data = serde_json::from_value::<UpdateOptionData>(mutation_args)
                .context("Failed to parse updateOption arguments")?;
            update_option_in_db(conn, user_id, update_data).await?;
        }
        "deleteOption" => {
            let id = mutation_args.get("id")
                .and_then(|v| v.as_i64())
                .context("Missing or invalid option ID")?;
            delete_option_in_db(conn, user_id, id).await?;
        }
        
        // Note mutations
        "createNote" => {
            let note_data = serde_json::from_value::<NoteData>(mutation_args)
                .context("Failed to parse createNote arguments")?;
            create_note_in_db(conn, user_id, note_data).await?;
        }
        "updateNote" => {
            let update_data = serde_json::from_value::<UpdateNoteData>(mutation_args)
                .context("Failed to parse updateNote arguments")?;
            update_note_in_db(conn, user_id, update_data).await?;
        }
        "deleteNote" => {
            let id = mutation_args.get("id")
                .and_then(|v| v.as_str())
                .context("Missing or invalid note ID")?;
            delete_note_in_db(conn, user_id, id).await?;
        }
        
        // Playbook mutations
        "createPlaybook" => {
            let playbook_data = serde_json::from_value::<PlaybookData>(mutation_args)
                .context("Failed to parse createPlaybook arguments")?;
            create_playbook_in_db(conn, user_id, playbook_data).await?;
        }
        "updatePlaybook" => {
            let update_data = serde_json::from_value::<UpdatePlaybookData>(mutation_args)
                .context("Failed to parse updatePlaybook arguments")?;
            update_playbook_in_db(conn, user_id, update_data).await?;
        }
        "deletePlaybook" => {
            let id = mutation_args.get("id")
                .and_then(|v| v.as_str())
                .context("Missing or invalid playbook ID")?;
            delete_playbook_in_db(conn, user_id, id).await?;
        }
        
        _ => {
            return Err(anyhow::anyhow!("Unknown mutation: {}", mutation_name));
        }
    }
    
    Ok(())
}

/// Generate patches from database changes since last version
pub async fn generate_patches_from_db_changes(
    conn: &Connection,
    user_id: &str,
    last_modified_version: u64,
    _current_space_version: u64,
) -> Result<Vec<Patch>> {
    let mut patches = Vec::new();
    
    // Get changed stocks
    let changed_stocks = get_changed_stocks(conn, user_id, last_modified_version).await?;
    for stock in changed_stocks {
        patches.push(stock_to_patch(stock)?);
    }
    
    // Get changed options
    let changed_options = get_changed_options(conn, user_id, last_modified_version).await?;
    for option in changed_options {
        patches.push(option_to_patch(option)?);
    }
    
    // Get changed notes
    let changed_notes = get_changed_notes(conn, user_id, last_modified_version).await?;
    for note in changed_notes {
        patches.push(note_to_patch(note)?);
    }
    
    // Get changed playbooks
    let changed_playbooks = get_changed_playbooks(conn, user_id, last_modified_version).await?;
    for playbook in changed_playbooks {
        patches.push(playbook_to_patch(playbook)?);
    }
    
    Ok(patches)
}

// Data structures for mutation arguments
#[derive(serde::Deserialize)]
struct StockData {
    symbol: String,
    trade_type: String,
    order_type: String,
    entry_price: f64,
    exit_price: Option<f64>,
    stop_loss: f64,
    commissions: Option<f64>,
    number_shares: f64,
    take_profit: Option<f64>,
    entry_date: String,
    exit_date: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateStockData {
    id: i64,
}

#[derive(serde::Deserialize)]
struct OptionData {
    symbol: String,
    strategy_type: String,
    trade_direction: String,
    number_of_contracts: i32,
    option_type: String,
    strike_price: f64,
    expiration_date: String,
    entry_price: f64,
    exit_price: Option<f64>,
    total_premium: f64,
    commissions: Option<f64>,
    implied_volatility: f64,
    entry_date: String,
    exit_date: Option<String>,
    status: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateOptionData {
    id: i64,
}

#[derive(serde::Deserialize)]
struct NoteData {
    name: String,
    content: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdateNoteData {
    id: String,
}

#[derive(serde::Deserialize)]
struct PlaybookData {
    name: String,
    description: Option<String>,
}

#[derive(serde::Deserialize)]
struct UpdatePlaybookData {
    id: String,
}

// Database row structures
#[derive(Debug)]
struct StockRow {
    id: i64,
    symbol: String,
    trade_type: String,
    order_type: String,
    entry_price: f64,
    exit_price: Option<f64>,
    stop_loss: f64,
    commissions: f64,
    number_shares: f64,
    take_profit: Option<f64>,
    entry_date: String,
    exit_date: Option<String>,
    created_at: String,
    updated_at: String,
    version: u64,
}

#[derive(Debug)]
struct OptionRow {
    id: i64,
    symbol: String,
    strategy_type: String,
    trade_direction: String,
    number_of_contracts: i32,
    option_type: String,
    strike_price: f64,
    expiration_date: String,
    entry_price: f64,
    exit_price: Option<f64>,
    total_premium: f64,
    commissions: f64,
    implied_volatility: f64,
    entry_date: String,
    exit_date: Option<String>,
    status: String,
    created_at: String,
    updated_at: String,
    version: u64,
}

#[derive(Debug)]
struct NoteRow {
    id: String,
    name: String,
    content: String,
    created_at: String,
    updated_at: String,
    version: u64,
}

#[derive(Debug)]
struct PlaybookRow {
    id: String,
    name: String,
    description: Option<String>,
    created_at: String,
    updated_at: String,
    version: u64,
}

// Stock operations
async fn create_stock_in_db(conn: &Connection, _user_id: &str, stock_data: StockData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    conn.execute(
        "INSERT INTO stocks (symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            stock_data.symbol,
            stock_data.trade_type,
            stock_data.order_type,
            stock_data.entry_price,
            stock_data.exit_price,
            stock_data.stop_loss,
            stock_data.commissions.unwrap_or(0.0),
            stock_data.number_shares,
            stock_data.take_profit,
            stock_data.entry_date,
            stock_data.exit_date,
            now.clone(),
            now,
            version
        ],
    ).await.context("Failed to create stock")?;
    
    Ok(())
}

async fn update_stock_in_db(conn: &Connection, _user_id: &str, update_data: UpdateStockData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    // For now, just update the timestamp and version
    conn.execute(
        "UPDATE stocks SET updated_at = ?, version = ? WHERE id = ?",
        params![now, version, update_data.id],
    ).await?;
    
    Ok(())
}

async fn delete_stock_in_db(conn: &Connection, _user_id: &str, id: i64) -> Result<()> {
    conn.execute("DELETE FROM stocks WHERE id = ?", params![id]).await?;
    Ok(())
}

async fn create_option_in_db(conn: &Connection, _user_id: &str, option_data: OptionData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    conn.execute(
        "INSERT INTO options (symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            option_data.symbol,
            option_data.strategy_type,
            option_data.trade_direction,
            option_data.number_of_contracts,
            option_data.option_type,
            option_data.strike_price,
            option_data.expiration_date,
            option_data.entry_price,
            option_data.exit_price,
            option_data.total_premium,
            option_data.commissions.unwrap_or(0.0),
            option_data.implied_volatility,
            option_data.entry_date,
            option_data.exit_date,
            option_data.status.unwrap_or("open".to_string()),
            now.clone(),
            now,
            version
        ],
    ).await.context("Failed to create option")?;
    
    Ok(())
}

async fn update_option_in_db(conn: &Connection, _user_id: &str, update_data: UpdateOptionData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    // For now, just update the timestamp and version
    conn.execute(
        "UPDATE options SET updated_at = ?, version = ? WHERE id = ?",
        params![now, version, update_data.id],
    ).await?;
    
    Ok(())
}

async fn delete_option_in_db(conn: &Connection, _user_id: &str, id: i64) -> Result<()> {
    conn.execute("DELETE FROM options WHERE id = ?", params![id]).await?;
    Ok(())
}

async fn create_note_in_db(conn: &Connection, _user_id: &str, note_data: NoteData) -> Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    conn.execute(
        "INSERT INTO trade_notes (id, name, content, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)",
        params![
            id,
            note_data.name,
            note_data.content.unwrap_or_default(),
            now.clone(),
            now,
            version
        ],
    ).await.context("Failed to create note")?;
    
    Ok(())
}

async fn update_note_in_db(conn: &Connection, _user_id: &str, update_data: UpdateNoteData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    // For now, just update the timestamp and version
    conn.execute(
        "UPDATE trade_notes SET updated_at = ?, version = ? WHERE id = ?",
        params![now, version, update_data.id],
    ).await?;
    
    Ok(())
}

async fn delete_note_in_db(conn: &Connection, _user_id: &str, id: &str) -> Result<()> {
    conn.execute("DELETE FROM trade_notes WHERE id = ?", params![id]).await?;
    Ok(())
}

async fn create_playbook_in_db(conn: &Connection, _user_id: &str, playbook_data: PlaybookData) -> Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    conn.execute(
        "INSERT INTO playbook (id, name, description, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?)",
        params![
            id,
            playbook_data.name,
            playbook_data.description,
            now.clone(),
            now,
            version
        ],
    ).await.context("Failed to create playbook")?;
    
    Ok(())
}

async fn update_playbook_in_db(conn: &Connection, _user_id: &str, update_data: UpdatePlaybookData) -> Result<()> {
    let now = Utc::now().to_rfc3339();
    let version = get_next_version(conn).await?;
    
    // For now, just update the timestamp and version
    conn.execute(
        "UPDATE playbook SET updated_at = ?, version = ? WHERE id = ?",
        params![now, version, update_data.id],
    ).await?;
    
    Ok(())
}

async fn delete_playbook_in_db(conn: &Connection, _user_id: &str, id: &str) -> Result<()> {
    conn.execute("DELETE FROM playbook WHERE id = ?", params![id]).await?;
    Ok(())
}

async fn get_changed_stocks(conn: &Connection, _user_id: &str, from_version: u64) -> Result<Vec<StockRow>> {
    let stmt = conn.prepare("SELECT id, symbol, trade_type, order_type, entry_price, exit_price, stop_loss, commissions, number_shares, take_profit, entry_date, exit_date, created_at, updated_at, version FROM stocks WHERE version > ? ORDER BY version ASC").await?;
    let mut rows = stmt.query(params![from_version]).await?;
    let mut stocks = Vec::new();
    
    while let Some(row) = rows.next().await? {
        stocks.push(StockRow {
            id: row.get(0)?,
            symbol: row.get(1)?,
            trade_type: row.get(2)?,
            order_type: row.get(3)?,
            entry_price: row.get(4)?,
            exit_price: row.get(5)?,
            stop_loss: row.get(6)?,
            commissions: row.get(7)?,
            number_shares: row.get(8)?,
            take_profit: row.get(9)?,
            entry_date: row.get(10)?,
            exit_date: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            version: row.get(14)?,
        });
    }
    
    Ok(stocks)
}

async fn get_changed_options(conn: &Connection, _user_id: &str, from_version: u64) -> Result<Vec<OptionRow>> {
    let stmt = conn.prepare("SELECT id, symbol, strategy_type, trade_direction, number_of_contracts, option_type, strike_price, expiration_date, entry_price, exit_price, total_premium, commissions, implied_volatility, entry_date, exit_date, status, created_at, updated_at, version FROM options WHERE version > ? ORDER BY version ASC").await?;
    let mut rows = stmt.query(params![from_version]).await?;
    let mut options = Vec::new();
    
    while let Some(row) = rows.next().await? {
        options.push(OptionRow {
            id: row.get(0)?,
            symbol: row.get(1)?,
            strategy_type: row.get(2)?,
            trade_direction: row.get(3)?,
            number_of_contracts: row.get(4)?,
            option_type: row.get(5)?,
            strike_price: row.get(6)?,
            expiration_date: row.get(7)?,
            entry_price: row.get(8)?,
            exit_price: row.get(9)?,
            total_premium: row.get(10)?,
            commissions: row.get(11)?,
            implied_volatility: row.get(12)?,
            entry_date: row.get(13)?,
            exit_date: row.get(14)?,
            status: row.get(15)?,
            created_at: row.get(16)?,
            updated_at: row.get(17)?,
            version: row.get(18)?,
        });
    }
    
    Ok(options)
}

async fn get_changed_notes(conn: &Connection, _user_id: &str, from_version: u64) -> Result<Vec<NoteRow>> {
    let stmt = conn.prepare("SELECT id, name, content, created_at, updated_at, version FROM trade_notes WHERE version > ? ORDER BY version ASC").await?;
    let mut rows = stmt.query(params![from_version]).await?;
    let mut notes = Vec::new();
    
    while let Some(row) = rows.next().await? {
        notes.push(NoteRow {
            id: row.get(0)?,
            name: row.get(1)?,
            content: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            version: row.get(5)?,
        });
    }
    
    Ok(notes)
}

async fn get_changed_playbooks(conn: &Connection, _user_id: &str, from_version: u64) -> Result<Vec<PlaybookRow>> {
    let stmt = conn.prepare("SELECT id, name, description, created_at, updated_at, version FROM playbook WHERE version > ? ORDER BY version ASC").await?;
    let mut rows = stmt.query(params![from_version]).await?;
    let mut playbooks = Vec::new();
    
    while let Some(row) = rows.next().await? {
        playbooks.push(PlaybookRow {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
            version: row.get(5)?,
        });
    }
    
    Ok(playbooks)
}

fn stock_to_patch(stock: StockRow) -> Result<Patch> {
    let key = format!("stock/{}", stock.id);
    let value = serde_json::json!({
        "id": stock.id,
        "symbol": stock.symbol,
        "trade_type": stock.trade_type,
        "order_type": stock.order_type,
        "entry_price": stock.entry_price,
        "exit_price": stock.exit_price,
        "stop_loss": stock.stop_loss,
        "commissions": stock.commissions,
        "number_shares": stock.number_shares,
        "take_profit": stock.take_profit,
        "entry_date": stock.entry_date,
        "exit_date": stock.exit_date,
        "created_at": stock.created_at,
        "updated_at": stock.updated_at,
        "version": stock.version,
    });
    
    Ok(Patch {
        op: super::types::PatchOp::Put,
        key,
        value: Some(value),
    })
}

fn option_to_patch(option: OptionRow) -> Result<Patch> {
    let key = format!("option/{}", option.id);
    let value = serde_json::json!({
        "id": option.id,
        "symbol": option.symbol,
        "strategy_type": option.strategy_type,
        "trade_direction": option.trade_direction,
        "number_of_contracts": option.number_of_contracts,
        "option_type": option.option_type,
        "strike_price": option.strike_price,
        "expiration_date": option.expiration_date,
        "entry_price": option.entry_price,
        "exit_price": option.exit_price,
        "total_premium": option.total_premium,
        "commissions": option.commissions,
        "implied_volatility": option.implied_volatility,
        "entry_date": option.entry_date,
        "exit_date": option.exit_date,
        "status": option.status,
        "created_at": option.created_at,
        "updated_at": option.updated_at,
        "version": option.version,
    });
    
    Ok(Patch {
        op: super::types::PatchOp::Put,
        key,
        value: Some(value),
    })
}

fn note_to_patch(note: NoteRow) -> Result<Patch> {
    let key = format!("note/{}", note.id);
    let value = serde_json::json!({
        "id": note.id,
        "name": note.name,
        "content": note.content,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "version": note.version,
    });
    
    Ok(Patch {
        op: super::types::PatchOp::Put,
        key,
        value: Some(value),
    })
}

fn playbook_to_patch(playbook: PlaybookRow) -> Result<Patch> {
    let key = format!("playbook/{}", playbook.id);
    let value = serde_json::json!({
        "id": playbook.id,
        "name": playbook.name,
        "description": playbook.description,
        "created_at": playbook.created_at,
        "updated_at": playbook.updated_at,
        "version": playbook.version,
    });
    
    Ok(Patch {
        op: super::types::PatchOp::Put,
        key,
        value: Some(value),
    })
}

async fn get_next_version(conn: &Connection) -> Result<u64> {
    let stmt = conn.prepare("SELECT version FROM replicache_space_version WHERE id = 1").await?;
    let mut rows = stmt.query(params![]).await?;
    
    if let Some(row) = rows.next().await? {
        let version: u64 = row.get(0)?;
        Ok(version + 1)
    } else {
        Ok(1)
    }
}