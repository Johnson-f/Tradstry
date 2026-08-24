use anyhow::{Context, Result};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};

use super::client::SnapTradeAccount;
use super::history_policy::{self, ResolvedTransactionImportPolicy};
use crate::service::db::schema::tables::workspaces_table::{self, CreateWorkspaceInput, Workspace};

#[derive(Debug, Clone, Copy)]
pub struct AccountImportSelection<'a> {
    pub snaptrade_account_id: &'a str,
    pub policy: ResolvedTransactionImportPolicy,
}

/// Bind one upstream SnapTrade account to one workspace. A brokerage
/// authorization can expose several upstream accounts; the workspace keeps its
/// existing binding, or selects the first account belonging to this connection.
/// It never creates additional workspaces implicitly.
pub async fn bind_workspace_brokerage_account(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    snaptrade_accounts: &[SnapTradeAccount],
) -> Result<Vec<Workspace>> {
    let workspace = workspaces_table::find_workspace(pool, workspace_id, user_id)
        .await?
        .context("Workspace not found")?;

    let connection_id = workspace.snaptrade_connection_id.as_deref();
    if let Some(bound_id) = workspace.snaptrade_account_id.as_deref()
        && let Some(candidate) = snaptrade_accounts.iter().find(|candidate| {
            candidate.id.as_deref() == Some(bound_id)
                && connection_id.is_none_or(|connection_id| {
                    candidate.brokerage_authorization.as_deref() == Some(connection_id)
                })
        })
    {
        let workspace = ensure_broker_label(pool, user_id, workspace, candidate).await?;
        return Ok(vec![workspace]);
    }

    let selected = snaptrade_accounts.iter().find(|candidate| {
        candidate.id.is_some()
            && connection_id.is_none_or(|connection_id| {
                candidate.brokerage_authorization.as_deref() == Some(connection_id)
            })
    });

    let Some(snaptrade_account_id) = selected.and_then(|candidate| candidate.id.as_deref()) else {
        return Ok(Vec::new());
    };

    let workspace = workspaces_table::set_snaptrade_account_id(
        pool,
        workspace_id,
        user_id,
        snaptrade_account_id,
    )
    .await?;
    let workspace = ensure_broker_label(pool, user_id, workspace, selected.unwrap()).await?;
    Ok(vec![workspace])
}

/// Repairs a stale upstream account binding after SnapTrade returns a new
/// account id for the same brokerage authorization. This is intentionally
/// stricter than the initial binding path: in a multi-account brokerage login,
/// falling back to the first account would silently attach the wrong workspace.
pub async fn rebind_workspace_brokerage_account_by_name(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
    snaptrade_accounts: &[SnapTradeAccount],
) -> Result<Option<Workspace>> {
    let workspace = workspaces_table::find_workspace(pool, workspace_id, user_id)
        .await?
        .context("Workspace not found")?;
    let connection_id = workspace.snaptrade_connection_id.as_deref();
    let workspace_name = normalized_workspace_name(&workspace.name);

    let Some(selected) = snaptrade_accounts.iter().find(|candidate| {
        candidate.id.is_some()
            && connection_id.is_none_or(|connection_id| {
                candidate.brokerage_authorization.as_deref() == Some(connection_id)
            })
            && normalized_workspace_name(&brokerage_account_name(candidate)) == workspace_name
    }) else {
        return Ok(None);
    };
    let Some(snaptrade_account_id) = selected.id.as_deref() else {
        return Ok(None);
    };

    let workspace = workspaces_table::set_snaptrade_account_id(
        pool,
        workspace_id,
        user_id,
        snaptrade_account_id,
    )
    .await?;
    let workspace = ensure_broker_label(pool, user_id, workspace, selected).await?;
    Ok(Some(workspace))
}

async fn ensure_broker_label(
    pool: &PgPool,
    user_id: &str,
    workspace: Workspace,
    account: &SnapTradeAccount,
) -> Result<Workspace> {
    if workspace.broker.is_some() {
        return Ok(workspace);
    }
    let Some(institution) = account
        .institution_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(workspace);
    };
    workspaces_table::set_broker(pool, &workspace.id, user_id, institution).await
}

pub fn brokerage_account_name(account: &SnapTradeAccount) -> String {
    account
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .or_else(|| {
            account
                .institution_name
                .as_deref()
                .map(str::trim)
                .filter(|name| !name.is_empty())
                .map(|name| format!("{name} Account"))
        })
        .unwrap_or_else(|| "Brokerage Account".to_string())
}

fn unique_workspace_name(preferred: &str, existing_names: &mut HashSet<String>) -> String {
    let normalized = preferred.to_lowercase();
    if existing_names.insert(normalized) {
        return preferred.to_string();
    }

    for suffix in 2.. {
        let candidate = format!("{preferred} ({suffix})");
        if existing_names.insert(candidate.to_lowercase()) {
            return candidate;
        }
    }
    unreachable!("workspace name suffix search is unbounded")
}

fn normalized_workspace_name(name: &str) -> String {
    name.trim().to_lowercase()
}

/// Explicitly creates one workspace for each selected, unlinked account that
/// belongs to the source workspace's brokerage authorization. Repeated calls
/// are idempotent because an upstream account can be bound only once per user.
pub async fn create_workspaces_for_connection_accounts(
    pool: &PgPool,
    user_id: &str,
    source_workspace_id: &str,
    snaptrade_accounts: &[SnapTradeAccount],
    requested_account_ids: &HashSet<String>,
) -> Result<Vec<Workspace>> {
    let source = workspaces_table::find_workspace(pool, source_workspace_id, user_id)
        .await?
        .context("Source workspace not found")?;
    let auth_mode = source.snaptrade_auth_mode.as_str();
    let snaptrade_user_id = source.snaptrade_user_id.as_deref();
    let encrypted_secret = source.snaptrade_user_secret_encrypted.as_deref();
    let oauth_grant_id = source.snaptrade_oauth_grant_id.as_deref();
    match auth_mode {
        "commercial" => {
            anyhow::ensure!(
                snaptrade_user_id.is_some(),
                "Source workspace is not registered with SnapTrade"
            );
            anyhow::ensure!(
                encrypted_secret.is_some(),
                "Source workspace has no SnapTrade secret"
            );
        }
        "oauth" => anyhow::ensure!(
            oauth_grant_id.is_some(),
            "Source workspace has no SnapTrade OAuth grant"
        ),
        _ => anyhow::bail!("Source workspace has an unsupported brokerage authentication mode"),
    }
    let connection_id = source
        .snaptrade_connection_id
        .as_deref()
        .context("Source workspace has no brokerage connection")?;

    let existing = workspaces_table::list_workspaces(pool, user_id).await?;
    let sync_account_bindings =
        workspaces_table::list_brokerage_sync_account_bindings(pool, user_id).await?;
    let mut linked_account_ids: HashSet<String> = existing
        .iter()
        .filter_map(|workspace| workspace.snaptrade_account_id.clone())
        .collect();
    let mut existing_names: HashSet<String> = existing
        .iter()
        .map(|workspace| normalized_workspace_name(&workspace.name))
        .collect();
    let reusable_existing: Vec<Workspace> = existing
        .iter()
        .filter(|workspace| {
            workspace.id != source.id
                && workspace.snaptrade_account_id.is_none()
                && workspace.snaptrade_connection_id.is_none()
        })
        .cloned()
        .collect();
    let mut unlinked_existing_by_name: HashMap<String, Workspace> = reusable_existing
        .iter()
        .map(|workspace| {
            (
                normalized_workspace_name(&workspace.name),
                workspace.clone(),
            )
        })
        .collect();
    let reusable_by_id: HashMap<String, Workspace> = reusable_existing
        .iter()
        .map(|workspace| (workspace.id.clone(), workspace.clone()))
        .collect();
    let mut unlinked_existing_by_sync_account: HashMap<String, Workspace> = sync_account_bindings
        .into_iter()
        .filter_map(|(workspace_id, snaptrade_account_id)| {
            reusable_by_id
                .get(&workspace_id)
                .map(|workspace| (snaptrade_account_id, workspace.clone()))
        })
        .collect();
    let mut created = Vec::new();

    for account in snaptrade_accounts {
        let Some(account_id) = account.id.as_deref() else {
            continue;
        };
        if account.brokerage_authorization.as_deref() != Some(connection_id)
            || !requested_account_ids.contains(account_id)
            || linked_account_ids.contains(account_id)
        {
            continue;
        }

        let preferred_name = brokerage_account_name(account);
        let (workspace, created_workspace) = if let Some(workspace) =
            unlinked_existing_by_sync_account.remove(account_id)
        {
            unlinked_existing_by_name.retain(|_, candidate| candidate.id != workspace.id);
            unlinked_existing_by_sync_account.retain(|_, candidate| candidate.id != workspace.id);
            (workspace, false)
        } else if let Some(workspace) =
            unlinked_existing_by_name.remove(&normalized_workspace_name(&preferred_name))
        {
            unlinked_existing_by_sync_account.retain(|_, candidate| candidate.id != workspace.id);
            (workspace, false)
        } else {
            let name = unique_workspace_name(&preferred_name, &mut existing_names);
            let workspace = workspaces_table::create_workspace(
                pool,
                user_id,
                CreateWorkspaceInput {
                    name,
                    icon: source.icon.clone(),
                    currency: source.currency.clone(),
                    risk_profile: source.risk_profile.clone(),
                    asset_class: source.asset_class.clone(),
                    broker: source
                        .broker
                        .clone()
                        .or_else(|| account.institution_name.clone()),
                },
            )
            .await?;
            (workspace, true)
        };

        let binding = async {
            match auth_mode {
                "commercial" => {
                    workspaces_table::update_snaptrade_credentials(
                        pool,
                        &workspace.id,
                        user_id,
                        snaptrade_user_id.expect("validated commercial user ID"),
                        encrypted_secret.expect("validated commercial secret"),
                        Some(connection_id),
                    )
                    .await?;
                }
                "oauth" => {
                    workspaces_table::prepare_snaptrade_oauth_connection(
                        pool,
                        &workspace.id,
                        user_id,
                        oauth_grant_id.expect("validated OAuth grant"),
                        connection_id,
                    )
                    .await?;
                }
                _ => unreachable!("validated authentication mode"),
            }
            let workspace = workspaces_table::set_snaptrade_account_id(
                pool,
                &workspace.id,
                user_id,
                account_id,
            )
            .await?;
            let workspace = ensure_broker_label(pool, user_id, workspace, account).await?;
            Ok::<Workspace, anyhow::Error>(workspace)
        }
        .await;

        match binding {
            Ok(bound) => {
                linked_account_ids.insert(account_id.to_string());
                created.push(bound);
            }
            Err(error) => {
                if created_workspace
                    && let Err(cleanup_error) =
                        workspaces_table::delete_workspace(pool, &workspace.id, user_id).await
                {
                    log::error!(
                        "Failed to remove partially imported workspace {}: {cleanup_error}",
                        workspace.id
                    );
                }
                return Err(error).context("Failed to bind imported brokerage workspace");
            }
        }
    }

    Ok(created)
}

pub async fn finalize_connection_accounts(
    pool: &PgPool,
    user_id: &str,
    source_workspace_id: &str,
    snaptrade_accounts: &[SnapTradeAccount],
    primary_account_id: &str,
    selections: &[AccountImportSelection<'_>],
) -> Result<Vec<Workspace>> {
    let source = workspaces_table::find_workspace(pool, source_workspace_id, user_id)
        .await?
        .context("Source workspace not found")?;
    let auth_mode = source.snaptrade_auth_mode.as_str();
    let snaptrade_user_id = source.snaptrade_user_id.as_deref();
    let encrypted_secret = source.snaptrade_user_secret_encrypted.as_deref();
    let oauth_grant_id = source.snaptrade_oauth_grant_id.as_deref();
    match auth_mode {
        "commercial" => {
            anyhow::ensure!(
                snaptrade_user_id.is_some(),
                "Source workspace is not registered with SnapTrade"
            );
            anyhow::ensure!(
                encrypted_secret.is_some(),
                "Source workspace has no SnapTrade secret"
            );
        }
        "oauth" => anyhow::ensure!(
            oauth_grant_id.is_some(),
            "Source workspace has no SnapTrade OAuth grant"
        ),
        _ => anyhow::bail!("Source workspace has an unsupported brokerage authentication mode"),
    }
    let connection_id = source
        .snaptrade_connection_id
        .as_deref()
        .context("Source workspace has no brokerage connection")?;

    ensure_selection_is_valid(
        snaptrade_accounts,
        connection_id,
        primary_account_id,
        selections,
    )?;

    let existing = workspaces_table::list_workspaces(pool, user_id).await?;
    let mut existing_names: HashSet<String> = existing
        .iter()
        .map(|workspace| normalized_workspace_name(&workspace.name))
        .collect();
    let mut target_by_account: HashMap<String, Workspace> = existing
        .iter()
        .filter_map(|workspace| {
            workspace
                .snaptrade_account_id
                .as_ref()
                .map(|account_id| (account_id.clone(), workspace.clone()))
        })
        .collect();
    let mut reusable_by_name: HashMap<String, Workspace> = existing
        .iter()
        .filter(|workspace| {
            workspace.id != source.id
                && workspace.snaptrade_account_id.is_none()
                && workspace.snaptrade_connection_id.is_none()
        })
        .map(|workspace| {
            (
                normalized_workspace_name(&workspace.name),
                workspace.clone(),
            )
        })
        .collect();

    let mut tx = pool.begin().await?;
    let mut target_ids = Vec::new();
    let mut created_ids = Vec::new();

    for selection in selections {
        let account = snaptrade_accounts
            .iter()
            .find(|account| account.id.as_deref() == Some(selection.snaptrade_account_id))
            .expect("validated account selection");
        let workspace = if selection.snaptrade_account_id == primary_account_id {
            source.clone()
        } else if let Some(workspace) = target_by_account.remove(selection.snaptrade_account_id) {
            workspace
        } else {
            let preferred_name = brokerage_account_name(account);
            if let Some(workspace) =
                reusable_by_name.remove(&normalized_workspace_name(&preferred_name))
            {
                workspace
            } else {
                let id = uuid::Uuid::new_v4().to_string();
                let name = unique_workspace_name(&preferred_name, &mut existing_names);
                sqlx::query(
                    "INSERT INTO workspaces (
                         id,user_id,name,icon,currency,risk_profile,asset_class
                     ) VALUES ($1,$2,$3,$4,$5,$6,$7)",
                )
                .bind(&id)
                .bind(user_id)
                .bind(&name)
                .bind(&source.icon)
                .bind(&source.currency)
                .bind(&source.risk_profile)
                .bind(&source.asset_class)
                .execute(&mut *tx)
                .await?;
                created_ids.push(id.clone());
                Workspace {
                    id,
                    user_id: user_id.to_string(),
                    name,
                    icon: source.icon.clone(),
                    currency: source.currency.clone(),
                    risk_profile: source.risk_profile.clone(),
                    asset_class: source.asset_class.clone(),
                    broker: source
                        .broker
                        .clone()
                        .or_else(|| account.institution_name.clone()),
                    snaptrade_user_id: None,
                    snaptrade_user_secret_encrypted: None,
                    snaptrade_connection_id: None,
                    snaptrade_account_id: None,
                    total_value: None,
                    total_value_currency: None,
                    snaptrade_connection_disabled: false,
                    snaptrade_connection_disabled_at: None,
                    brokerage_setup_complete: false,
                    brokerage_setup_completed_at: None,
                    snaptrade_auth_mode: source.snaptrade_auth_mode.clone(),
                    snaptrade_oauth_grant_id: source.snaptrade_oauth_grant_id.clone(),
                    created_at: String::new(),
                    updated_at: String::new(),
                }
            }
        };

        sqlx::query(
            "INSERT INTO brokerage_connections (
                 workspace_id,user_id,broker,auth_mode,oauth_grant_id,snaptrade_user_id,
                 snaptrade_user_secret_encrypted,snaptrade_connection_id,
                 snaptrade_account_id,setup_completed_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
             ON CONFLICT (workspace_id) DO UPDATE SET
                 broker=COALESCE(brokerage_connections.broker,EXCLUDED.broker),
                 auth_mode=EXCLUDED.auth_mode,
                 oauth_grant_id=EXCLUDED.oauth_grant_id,
                 snaptrade_user_id=EXCLUDED.snaptrade_user_id,
                 snaptrade_user_secret_encrypted=EXCLUDED.snaptrade_user_secret_encrypted,
                 snaptrade_connection_id=EXCLUDED.snaptrade_connection_id,
                 snaptrade_account_id=EXCLUDED.snaptrade_account_id,
                 setup_completed_at=now(),
                 connection_disabled=false,
                 connection_disabled_at=NULL",
        )
        .bind(&workspace.id)
        .bind(user_id)
        .bind(
            source
                .broker
                .as_deref()
                .or(account.institution_name.as_deref()),
        )
        .bind(auth_mode)
        .bind(oauth_grant_id)
        .bind(snaptrade_user_id)
        .bind(encrypted_secret)
        .bind(connection_id)
        .bind(selection.snaptrade_account_id)
        .execute(&mut *tx)
        .await?;

        history_policy::upsert(
            &mut *tx,
            user_id,
            &workspace.id,
            selection.snaptrade_account_id,
            selection.policy,
        )
        .await?;
        target_ids.push(workspace.id);
    }

    tx.commit().await?;
    for workspace_id in created_ids {
        crate::service::db::schema::tables::notebook::folders::ensure_system_folder(
            pool,
            user_id,
            &workspace_id,
        )
        .await?;
    }

    let mut result = Vec::with_capacity(target_ids.len());
    for workspace_id in target_ids {
        result.push(
            workspaces_table::find_workspace(pool, &workspace_id, user_id)
                .await?
                .context("Configured workspace was not found")?,
        );
    }
    Ok(result)
}

fn ensure_selection_is_valid(
    accounts: &[SnapTradeAccount],
    connection_id: &str,
    primary_account_id: &str,
    selections: &[AccountImportSelection<'_>],
) -> Result<()> {
    anyhow::ensure!(
        !selections.is_empty(),
        "Choose at least one brokerage account"
    );
    anyhow::ensure!(
        selections.len() <= 25,
        "A maximum of 25 brokerage accounts can be imported at once"
    );
    let selected: HashSet<&str> = selections
        .iter()
        .map(|selection| selection.snaptrade_account_id)
        .collect();
    anyhow::ensure!(
        selected.len() == selections.len(),
        "Each brokerage account can be selected once"
    );
    anyhow::ensure!(
        selected.contains(primary_account_id),
        "Choose which brokerage account belongs to this workspace"
    );
    for account_id in selected {
        anyhow::ensure!(
            accounts.iter().any(|account| {
                account.id.as_deref() == Some(account_id)
                    && account.brokerage_authorization.as_deref() == Some(connection_id)
            }),
            "A selected brokerage account does not belong to this connection"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{brokerage_account_name, unique_workspace_name};
    use crate::service::brokerage::client::SnapTradeAccount;
    use std::collections::HashSet;

    fn account(name: Option<&str>, institution_name: Option<&str>) -> SnapTradeAccount {
        SnapTradeAccount {
            id: Some("account".to_string()),
            brokerage_authorization: Some("connection".to_string()),
            name: name.map(str::to_string),
            number: None,
            institution_name: institution_name.map(str::to_string),
            sync_status: None,
        }
    }

    #[test]
    fn imported_name_prefers_account_then_institution() {
        assert_eq!(
            brokerage_account_name(&account(Some("Individual Margin"), Some("Webull"))),
            "Individual Margin"
        );
        assert_eq!(
            brokerage_account_name(&account(None, Some("Webull"))),
            "Webull Account"
        );
        assert_eq!(
            brokerage_account_name(&account(None, None)),
            "Brokerage Account"
        );
    }

    #[test]
    fn imported_names_are_unique_case_insensitively() {
        let mut names = HashSet::from(["cash account".to_string()]);
        assert_eq!(
            unique_workspace_name("Cash Account", &mut names),
            "Cash Account (2)"
        );
        assert_eq!(
            unique_workspace_name("Cash Account", &mut names),
            "Cash Account (3)"
        );
    }
}
