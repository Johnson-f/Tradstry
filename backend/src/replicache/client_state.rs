use crate::replicache::{MutationResult};
use libsql::{Connection, params};
use chrono::Utc;

/// Get the current space version
pub async fn get_space_version(conn: &Connection) -> MutationResult<u64> {
    let mut rows = conn.prepare("SELECT version FROM replicache_space_version WHERE id = 1").await?.query(params![]).await?;
    
    if let Some(row) = rows.next().await? {
        let version: u64 = row.get(0)?;
        Ok(version)
    } else {
        // Initialize if not exists
        conn.execute("INSERT OR IGNORE INTO replicache_space_version (id, version) VALUES (1, 0)", params![]).await?;
        Ok(0)
    }
}

/// Increment the space version
pub async fn increment_space_version(conn: &Connection) -> MutationResult<u64> {
    conn.execute("UPDATE replicache_space_version SET version = version + 1 WHERE id = 1", params![]).await?;
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


