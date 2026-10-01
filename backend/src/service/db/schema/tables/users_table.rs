use anyhow::{Context, Result};
use async_graphql::SimpleObject;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbErr, EntityTrait, QueryFilter, Set,
};
use serde::{Deserialize, Serialize};

use crate::service::db::entities::core::users;
use crate::service::db::error::is_unique_violation;

#[derive(Debug, Clone, Serialize, Deserialize, SimpleObject)]
pub struct User {
    pub id: String,
    pub clerk_uuid: String,
    pub full_name: String,
    pub email: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<users::Model> for User {
    fn from(model: users::Model) -> Self {
        Self {
            id: model.id,
            clerk_uuid: model.clerk_uuid,
            full_name: model.full_name,
            email: model.email,
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

pub async fn find_by_clerk_uuid(db: &DatabaseConnection, clerk_uuid: &str) -> Result<Option<User>> {
    Ok(users::Entity::find()
        .filter(users::Column::ClerkUuid.eq(clerk_uuid))
        .one(db)
        .await
        .context("Failed to query user by clerk_uuid")?
        .map(Into::into))
}

pub async fn create_user(
    db: &DatabaseConnection,
    clerk_uuid: &str,
    full_name: &str,
    email: &str,
) -> Result<User> {
    let model = users::ActiveModel {
        id: Set(crate::ids::new_uuid_v7().to_string()),
        clerk_uuid: Set(clerk_uuid.to_owned()),
        full_name: Set(full_name.to_owned()),
        email: Set(email.to_owned()),
        ..Default::default()
    }
    .insert(db)
    .await
    .context("Failed to insert user")?;
    Ok(model.into())
}

/// Fill in an email or full name that is still blank, leaving any value already
/// stored untouched. A user first seen through a token without those claims is
/// created with blanks, and nothing else ever updates the profile.
pub async fn fill_blank_profile(
    db: &DatabaseConnection,
    user: User,
    full_name: &str,
    email: &str,
) -> Result<User> {
    let fill_name = user.full_name.is_empty() && !full_name.is_empty();
    let fill_email = user.email.is_empty() && !email.is_empty();
    if !fill_name && !fill_email {
        return Ok(user);
    }

    let mut model = users::ActiveModel {
        id: Set(user.id.clone()),
        ..Default::default()
    };
    if fill_name {
        model.full_name = Set(full_name.to_owned());
    }
    if fill_email {
        model.email = Set(email.to_owned());
    }
    model.updated_at = Set(Utc::now().fixed_offset());
    Ok(model
        .update(db)
        .await
        .context("Failed to fill blank user profile")?
        .into())
}

pub async fn find_or_create_user(
    db: &DatabaseConnection,
    clerk_uuid: &str,
    full_name: &str,
    email: &str,
) -> Result<(User, bool)> {
    if let Some(user) = find_by_clerk_uuid(db, clerk_uuid).await? {
        return Ok((user, false));
    }

    match create_user(db, clerk_uuid, full_name, email).await {
        Ok(user) => Ok((user, true)),
        Err(error)
            if error
                .downcast_ref::<DbErr>()
                .is_some_and(is_unique_violation) =>
        {
            find_by_clerk_uuid(db, clerk_uuid)
                .await?
                .context("User not found after concurrent insert")
                .map(|user| (user, false))
        }
        Err(error) => Err(error),
    }
}
