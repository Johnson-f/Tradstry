use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, IntoActiveModel, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};

use crate::service::db::entities::core::user_prompts;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct UserPrompt {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<user_prompts::Model> for UserPrompt {
    fn from(model: user_prompts::Model) -> Self {
        Self {
            id: model.id,
            user_id: model.user_id,
            name: model.name,
            content: model.content,
            created_at: format_timestamp(model.created_at),
            updated_at: format_timestamp(model.updated_at),
        }
    }
}

fn format_timestamp(value: chrono::DateTime<chrono::FixedOffset>) -> String {
    value
        .with_timezone(&Utc)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

pub async fn list_user_prompts(db: &DatabaseConnection, user_id: &str) -> Result<Vec<UserPrompt>> {
    Ok(user_prompts::Entity::find()
        .filter(user_prompts::Column::UserId.eq(user_id))
        .order_by_desc(user_prompts::Column::CreatedAt)
        .all(db)
        .await
        .context("Failed to list user prompts")?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn find_user_prompt(
    db: &DatabaseConnection,
    id: &str,
    user_id: &str,
) -> Result<Option<UserPrompt>> {
    Ok(user_prompts::Entity::find_by_id(id)
        .filter(user_prompts::Column::UserId.eq(user_id))
        .one(db)
        .await
        .context("Failed to find user prompt")?
        .map(Into::into))
}

pub async fn create_user_prompt(
    db: &DatabaseConnection,
    user_id: &str,
    name: &str,
    content: &str,
) -> Result<UserPrompt> {
    Ok(user_prompts::ActiveModel {
        id: Set(crate::ids::new_uuid_v7().to_string()),
        user_id: Set(user_id.to_owned()),
        name: Set(name.to_owned()),
        content: Set(content.to_owned()),
        ..Default::default()
    }
    .insert(db)
    .await
    .context("Failed to insert user prompt")?
    .into())
}

pub async fn update_user_prompt(
    db: &DatabaseConnection,
    id: &str,
    user_id: &str,
    name: Option<&str>,
    content: Option<&str>,
) -> Result<UserPrompt> {
    let model = user_prompts::Entity::find_by_id(id)
        .filter(user_prompts::Column::UserId.eq(user_id))
        .one(db)
        .await
        .context("Failed to find user prompt")?
        .context("User prompt not found")?;
    if name.is_none() && content.is_none() {
        return Ok(model.into());
    }

    let mut active = model.into_active_model();
    if let Some(name) = name {
        active.name = Set(name.to_owned());
    }
    if let Some(content) = content {
        active.content = Set(content.to_owned());
    }
    Ok(active
        .update(db)
        .await
        .context("Failed to update user prompt")?
        .into())
}

pub async fn delete_user_prompt(db: &DatabaseConnection, id: &str, user_id: &str) -> Result<bool> {
    let result = user_prompts::Entity::delete_many()
        .filter(user_prompts::Column::Id.eq(id))
        .filter(user_prompts::Column::UserId.eq(user_id))
        .exec(db)
        .await
        .context("Failed to delete user prompt")?;
    Ok(result.rows_affected > 0)
}
