use anyhow::Result;

use crate::service::brokerage::client::BrokerageClient;
use crate::service::brokerage::connection::release_snaptrade_connection;
use crate::service::db::client::UserDb;
use crate::service::db::schema::tables::workspaces_table::{
    self, CreateWorkspaceInput, UpdateWorkspaceInput, Workspace,
};

pub async fn list_workspaces(user_db: &UserDb) -> Result<Vec<Workspace>> {
    workspaces_table::list_workspaces(user_db.pool(), user_db.user_id()).await
}

pub async fn get_workspace(user_db: &UserDb, id: &str) -> Result<Option<Workspace>> {
    workspaces_table::find_workspace(user_db.pool(), id, user_db.user_id()).await
}

pub async fn create_workspace(user_db: &UserDb, input: CreateWorkspaceInput) -> Result<Workspace> {
    workspaces_table::create_workspace(user_db.pool(), user_db.user_id(), input).await
}

pub async fn update_workspace(
    user_db: &UserDb,
    id: &str,
    input: UpdateWorkspaceInput,
) -> Result<Workspace> {
    workspaces_table::update_workspace(user_db.pool(), id, user_db.user_id(), input).await
}

/// Delete a workspace and everything in it. Its SnapTrade connection is removed
/// upstream first, so a workspace is never deleted while still connected there.
pub async fn delete_workspace(
    user_db: &UserDb,
    brokerage: &BrokerageClient,
    id: &str,
) -> Result<bool> {
    workspaces_table::delete_workspace_with(
        user_db.pool(),
        id,
        user_db.user_id(),
        async |workspace| {
            release_snaptrade_connection(user_db.pool(), brokerage, user_db.user_id(), workspace)
                .await
        },
    )
    .await
}
