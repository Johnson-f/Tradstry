use crate::replicache::{ClientState, SpaceVersion, MutationError, MutationResult};
use libsql::Connection;
use chrono::Utc;

/// Get the current space version
pub async fn get_space_version(conn: &Connection) -> MutationResult<u64> {
    let mut rows = conn.prepare("SELECT version FROM replicache_space_version WHERE id = 1").await?.query([]).await?;
    
    if let Some(row) = rows.next().await? {
        let version: u64 = row.get(0)?;
        Ok(version)
    } else {
        // Initialize if not exists
        conn.execute("INSERT OR IGNORE INTO replicache_space_version (id, version) VALUES (1, 0)", []).await?;
        Ok(0)
    }
}

/// Increment the space version
pub async fn increment_space_version(conn: &Connection) -> MutationResult<u64> {
    conn.execute("UPDATE replicache_space_version SET version = version + 1 WHERE id = 1", []).await?;
    get_space_version(conn).await
}

/// Update client's last mutation ID
pub async fn update_client_mutation_id(
    conn: &Connection,
    client_group_id: &str,
    client_id: &str,
    mutation_id: u64,
    user_id: &str,
) -> MutationResult<()> {
    let now = Utc::now().to_rfc3339();
    
    conn.execute(
        r#"
        INSERT OR REPLACE INTO replicache_clients 
        (client_group_id, client_id, last_mutation_id, last_modified_version, user_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
        params![
            client_group_id,
            client_id,
            mutation_id,
            get_space_version(conn).await?,
            user_id,
            now.clone(),
            now
        ],
    ).await?;
    
    Ok(())
}

/// Get client's last mutation ID
pub async fn get_client_mutation_id(
    conn: &Connection,
    client_group_id: &str,
    client_id: &str,
) -> MutationResult<u64> {
    let mut rows = conn.prepare(
        "SELECT last_mutation_id FROM replicache_clients WHERE client_group_id = ? AND client_id = ?"
    ).await?.query(params![client_group_id, client_id]).await?;
    
    if let Some(row) = rows.next().await? {
        let mutation_id: u64 = row.get(0)?;
        Ok(mutation_id)
    } else {
        Ok(0)
    }
}

/// Get all client mutation IDs for a client group
pub async fn get_client_mutation_ids(
    conn: &Connection,
    client_group_id: &str,
) -> MutationResult<std::collections::HashMap<String, u64>> {
    let mut rows = conn.prepare(
        "SELECT client_id, last_mutation_id FROM replicache_clients WHERE client_group_id = ?"
    ).await?.query([client_group_id]).await?;
    
    let mut result = std::collections::HashMap::new();
    while let Some(row) = rows.next().await? {
        let client_id: String = row.get(0)?;
        let mutation_id: u64 = row.get(1)?;
        result.insert(client_id, mutation_id);
    }
    
    Ok(result)
}

/// Get all clients for a user
pub async fn get_user_clients(
    conn: &Connection,
    user_id: &str,
) -> MutationResult<Vec<ClientState>> {
    let mut rows = conn.prepare(
        "SELECT client_group_id, client_id, last_mutation_id, last_modified_version, user_id, created_at, updated_at 
         FROM replicache_clients WHERE user_id = ?"
    ).await?.query([user_id]).await?;
    
    let mut clients = Vec::new();
    while let Some(row) = rows.next().await? {
        let client = ClientState {
            client_group_id: row.get(0)?,
            client_id: row.get(1)?,
            last_mutation_id: row.get(2)?,
            last_modified_version: row.get(3)?,
            user_id: row.get(4)?,
            created_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(5)?)?.with_timezone(&Utc),
            updated_at: chrono::DateTime::parse_from_rfc3339(&row.get::<String>(6)?)?.with_timezone(&Utc),
        };
        clients.push(client);
    }
    
    Ok(clients)
}

/// Clean up old client records (optional maintenance function)
pub async fn cleanup_old_clients(
    conn: &Connection,
    older_than_days: i64,
) -> MutationResult<u64> {
    let cutoff_date = Utc::now() - chrono::Duration::days(older_than_days);
    let cutoff_str = cutoff_date.to_rfc3339();
    
    let result = conn.execute(
        "DELETE FROM replicache_clients WHERE updated_at < ?",
        [cutoff_str],
    ).await?;
    
    Ok(result.changes())
}
