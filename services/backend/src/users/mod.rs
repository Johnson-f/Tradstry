pub mod account;
pub mod settings;

use anyhow::Result;
use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{auth::TokenKind, db::new_id};

pub const DEFAULT_WORKSPACE_NAME: &str = "Main Workspace";

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub stytch_user_id: String,
    pub email: String,
    pub full_name: String,
    pub created_at: DateTime<Utc>,
}

/// Whether a request may create the Tradstry account for a Stytch user it has
/// not seen before. Sign-up belongs to the web app; connected apps such as MCP
/// clients act only for accounts that already exist.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provisioning {
    CreateIfMissing,
    ExistingOnly,
}

impl From<TokenKind> for Provisioning {
    fn from(kind: TokenKind) -> Self {
        match kind {
            TokenKind::Session => Self::CreateIfMissing,
            TokenKind::ConnectedApp => Self::ExistingOnly,
        }
    }
}

#[derive(Clone, Copy, Debug, thiserror::Error)]
#[error("no Tradstry account exists for this login. Sign up at tradstry.com first")]
pub struct AccountRequired;

const USER_COLUMNS: &str = "id, stytch_user_id, email, full_name, created_at";

pub async fn find_by_stytch_id(pool: &PgPool, stytch_user_id: &str) -> Result<Option<User>> {
    Ok(sqlx::query_as::<_, User>(sqlx::AssertSqlSafe(format!(
        "SELECT {USER_COLUMNS} FROM users WHERE stytch_user_id = $1"
    )))
    .bind(stytch_user_id)
    .fetch_optional(pool)
    .await?)
}

/// Resolves the user behind verified token claims. A new user is created with a
/// default workspace in one transaction, so no account is ever left without one.
/// Blank profile fields are filled from the token; stored values never change.
pub async fn load_user(
    pool: &PgPool,
    stytch_user_id: &str,
    full_name: &str,
    email: &str,
    provisioning: Provisioning,
) -> Result<User> {
    if let Some(user) = find_by_stytch_id(pool, stytch_user_id).await? {
        return fill_blank_profile(pool, user, full_name, email).await;
    }
    if provisioning == Provisioning::ExistingOnly {
        return Err(AccountRequired.into());
    }

    let mut tx = pool.begin().await?;
    let inserted = sqlx::query_as::<_, User>(sqlx::AssertSqlSafe(format!(
        "INSERT INTO users (id, stytch_user_id, email, full_name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (stytch_user_id) DO NOTHING RETURNING {USER_COLUMNS}"
    )))
    .bind(new_id())
    .bind(stytch_user_id)
    .bind(email)
    .bind(full_name)
    .fetch_optional(&mut *tx)
    .await?;
    let Some(user) = inserted else {
        // A concurrent request created the user first; its transaction made the workspace.
        tx.rollback().await?;
        return find_by_stytch_id(pool, stytch_user_id)
            .await?
            .ok_or_else(|| anyhow::anyhow!("user vanished during sign-up"));
    };
    sqlx::query("INSERT INTO workspaces (id, user_id, name) VALUES ($1, $2, $3)")
        .bind(new_id())
        .bind(user.id)
        .bind(DEFAULT_WORKSPACE_NAME)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(user)
}

async fn fill_blank_profile(
    pool: &PgPool,
    user: User,
    full_name: &str,
    email: &str,
) -> Result<User> {
    let fills_name = user.full_name.is_empty() && !full_name.is_empty();
    let fills_email = user.email.is_empty() && !email.is_empty();
    if !fills_name && !fills_email {
        return Ok(user);
    }
    Ok(sqlx::query_as::<_, User>(sqlx::AssertSqlSafe(format!(
        "UPDATE users SET
            full_name = CASE WHEN full_name = '' THEN $2 ELSE full_name END,
            email = CASE WHEN email = '' THEN $3 ELSE email END,
            updated_at = now()
         WHERE id = $1 RETURNING {USER_COLUMNS}"
    )))
    .bind(user.id)
    .bind(full_name)
    .bind(email)
    .fetch_one(pool)
    .await?)
}

/// Deletes the user and, through foreign keys, everything they own.
pub async fn delete(pool: &PgPool, user_id: Uuid) -> Result<bool> {
    let deleted = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?
        .rows_affected();
    Ok(deleted > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn workspace_count(pool: &PgPool, user_id: Uuid) -> i64 {
        sqlx::query_scalar("SELECT count(*) FROM workspaces WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[sqlx::test]
    async fn first_sign_in_creates_the_user_and_a_workspace(pool: PgPool) {
        let user = load_user(
            &pool,
            "user-1",
            "Ada",
            "ada@example.com",
            Provisioning::CreateIfMissing,
        )
        .await
        .unwrap();
        assert_eq!(user.email, "ada@example.com");
        assert_eq!(workspace_count(&pool, user.id).await, 1);

        let again = load_user(
            &pool,
            "user-1",
            "Ada",
            "ada@example.com",
            Provisioning::CreateIfMissing,
        )
        .await
        .unwrap();
        assert_eq!(again.id, user.id);
        assert_eq!(workspace_count(&pool, user.id).await, 1);
    }

    #[sqlx::test]
    async fn concurrent_first_requests_create_one_user_and_one_workspace(pool: PgPool) {
        let loads = (0..8).map(|_| {
            let pool = pool.clone();
            tokio::spawn(async move {
                load_user(&pool, "user-1", "", "", Provisioning::CreateIfMissing).await
            })
        });
        let ids: Vec<Uuid> = futures_util::future::join_all(loads)
            .await
            .into_iter()
            .map(|joined| joined.unwrap().unwrap().id)
            .collect();
        assert!(ids.iter().all(|id| *id == ids[0]));
        let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(users, 1);
        assert_eq!(workspace_count(&pool, ids[0]).await, 1);
    }

    #[sqlx::test]
    async fn connected_apps_cannot_create_accounts(pool: PgPool) {
        let error = load_user(&pool, "user-1", "", "", Provisioning::ExistingOnly)
            .await
            .unwrap_err();
        assert!(error.is::<AccountRequired>());
    }

    #[sqlx::test]
    async fn blank_profile_fields_are_filled_but_never_overwritten(pool: PgPool) {
        let created = load_user(&pool, "user-1", "", "", Provisioning::CreateIfMissing)
            .await
            .unwrap();
        assert_eq!(created.full_name, "");
        let filled = load_user(
            &pool,
            "user-1",
            "Ada",
            "ada@example.com",
            Provisioning::ExistingOnly,
        )
        .await
        .unwrap();
        assert_eq!(
            (filled.full_name.as_str(), filled.email.as_str()),
            ("Ada", "ada@example.com")
        );
        let kept = load_user(
            &pool,
            "user-1",
            "Other",
            "other@example.com",
            Provisioning::ExistingOnly,
        )
        .await
        .unwrap();
        assert_eq!(
            (kept.full_name.as_str(), kept.email.as_str()),
            ("Ada", "ada@example.com")
        );
    }

    #[sqlx::test]
    async fn deleting_a_user_removes_their_workspaces(pool: PgPool) {
        let user = load_user(&pool, "user-1", "", "", Provisioning::CreateIfMissing)
            .await
            .unwrap();
        assert!(delete(&pool, user.id).await.unwrap());
        assert_eq!(workspace_count(&pool, user.id).await, 0);
        assert!(!delete(&pool, user.id).await.unwrap());
    }
}
