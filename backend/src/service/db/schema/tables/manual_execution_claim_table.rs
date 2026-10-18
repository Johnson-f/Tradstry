use anyhow::{Context, Result, anyhow, ensure};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, QueryOrder, Set};
use sqlx::PgPool;

use crate::service::db::error::is_unique_violation;
use crate::service::db::schema::tables::position_calculator_plans_table;
use crate::service::db::{client::sea_orm_connection, entities::trading::manual_execution_claims};

#[derive(Debug, Clone)]
pub struct ManualExecutionClaim {
    pub id: String,
    pub workspace_id: String,
    pub plan_id: String,
    pub tranche_id: String,
    pub quantity: String,
    pub price: String,
    pub executed_at: String,
    pub status: String,
    pub reconciled_match_id: Option<String>,
    pub created_at: String,
}

impl From<manual_execution_claims::Model> for ManualExecutionClaim {
    fn from(model: manual_execution_claims::Model) -> Self {
        Self {
            id: model.id,
            workspace_id: model.workspace_id,
            plan_id: model.plan_id,
            tranche_id: model.tranche_id,
            quantity: model.quantity.normalize().to_string(),
            price: model.price.normalize().to_string(),
            executed_at: model.executed_at.to_rfc3339(),
            status: model.status,
            reconciled_match_id: model.reconciled_match_id,
            created_at: model.created_at.to_rfc3339(),
        }
    }
}

pub async fn list_claims(
    pool: &PgPool,
    user_id: &str,
    workspace_id: &str,
) -> Result<Vec<ManualExecutionClaim>> {
    let db = sea_orm_connection(pool);
    Ok(manual_execution_claims::Entity::find()
        .filter(manual_execution_claims::Column::UserId.eq(user_id))
        .filter(manual_execution_claims::Column::WorkspaceId.eq(workspace_id))
        .filter(manual_execution_claims::Column::Status.ne("dismissed"))
        .order_by_asc(manual_execution_claims::Column::ExecutedAt)
        .order_by_asc(manual_execution_claims::Column::CreatedAt)
        .order_by_asc(manual_execution_claims::Column::Id)
        .all(&db)
        .await?
        .into_iter()
        .map(Into::into)
        .collect())
}

pub async fn create_claim(
    pool: &PgPool,
    user_id: &str,
    plan_id: &str,
    tranche_id: &str,
    quantity: &str,
    price: &str,
    executed_at: &str,
) -> Result<ManualExecutionClaim> {
    let plan = position_calculator_plans_table::find_plan(pool, plan_id, user_id)
        .await?
        .ok_or_else(|| anyhow!("plan not found"))?;
    ensure!(
        plan.status == "active",
        "manual executions require an active plan"
    );
    let tranche = plan
        .tranches
        .iter()
        .find(|tranche| tranche.id == tranche_id)
        .ok_or_else(|| anyhow!("plan tranche not found"))?;
    ensure!(
        tranche.status == "planned",
        "manual executions can only be recorded for planned tranches"
    );

    let quantity = quantity
        .parse::<Decimal>()
        .context("quantity must be a valid decimal")?;
    let price = price
        .parse::<Decimal>()
        .context("price must be a valid decimal")?;
    let planned_quantity = tranche
        .shares
        .to_string()
        .parse::<Decimal>()
        .context("planned tranche quantity is invalid")?;
    ensure!(
        quantity > Decimal::ZERO,
        "quantity must be greater than zero"
    );
    ensure!(price > Decimal::ZERO, "price must be greater than zero");
    ensure!(
        quantity <= planned_quantity,
        "manual quantity cannot exceed the planned tranche quantity"
    );
    let executed_at = DateTime::parse_from_rfc3339(executed_at)
        .context("executedAt must be an RFC 3339 timestamp")?
        .with_timezone(&Utc);

    let id = crate::ids::new_uuid_v7().to_string();
    let db = sea_orm_connection(pool);
    let model = manual_execution_claims::ActiveModel {
        id: Set(id),
        user_id: Set(user_id.to_owned()),
        workspace_id: Set(plan.workspace_id),
        plan_id: Set(plan_id.to_owned()),
        tranche_id: Set(tranche_id.to_owned()),
        quantity: Set(quantity),
        price: Set(price),
        executed_at: Set(executed_at.fixed_offset()),
        ..Default::default()
    }
    .insert(&db)
    .await
    .map_err(|error| {
        if is_unique_violation(&error) {
            anyhow!("this tranche already has a manual execution")
        } else {
            error.into()
        }
    })?;
    Ok(model.into())
}

pub async fn dismiss_claim(pool: &PgPool, user_id: &str, id: &str) -> Result<bool> {
    Ok(sqlx::query(
        "UPDATE manual_execution_claims SET status='dismissed',updated_at=now()
         WHERE id=$1 AND user_id=$2 AND status='pending'",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected()
        == 1)
}
