use anyhow::Result;

use crate::service::db::Db;
use crate::service::db::schema::tables::tags_table;
use crate::service::db::schema::tables::users_table::{self, User};
use crate::service::db::schema::tables::workspaces_table;

/// Find or create a user from Clerk JWT claims.
/// On first sign-in, creates the user and a default "Main Workspace".
pub async fn ensure_user(db: &Db, clerk_uuid: &str, full_name: &str, email: &str) -> Result<User> {
    let (user, created) =
        users_table::find_or_create_user(db.connection(), clerk_uuid, full_name, email).await?;

    // Provisioning only on first sign-in.
    if created {
        let workspace = workspaces_table::create_default_workspace(db.pool(), &user.id).await?;
        tags_table::ensure_default_categories(db.pool(), &user.id, &workspace.id).await?;
    }

    Ok(user)
}
