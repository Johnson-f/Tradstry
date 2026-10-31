use async_graphql::{
    Context, Error, ErrorExtensions, ID, InputObject, Object, Result, SimpleObject,
};
use sqlx::PgPool;

use super::brokerage::require_web_session;
use super::errors::{coded, to_graphql};
use super::user::current_user;
use super::workspaces::parse_id;
use crate::trades::labels::{self, Label, LabelInput, LabelKind};
use crate::trades::service::TradeError;

fn label_error(error: TradeError) -> Error {
    match error {
        TradeError::NotFound => coded("Not found", "NOT_FOUND"),
        TradeError::Invalid(code, message) => coded(message, code),
        TradeError::LabelExists(id) => Error::new(error.to_string()).extend_with(|_, ext| {
            ext.set("code", "LABEL_EXISTS");
            ext.set("existingId", id.to_string());
        }),
        TradeError::Internal(error) => to_graphql(error),
        other => to_graphql(anyhow::anyhow!(other.to_string())),
    }
}

#[derive(SimpleObject)]
pub struct JournalLabel {
    id: ID,
    kind: LabelKind,
    name: String,
    description: String,
    /// `#rrggbb`.
    color: Option<String>,
    position: i32,
    archived: bool,
    /// Journal entries using it, across every workspace.
    trade_count: i64,
}

impl From<Label> for JournalLabel {
    fn from(label: Label) -> Self {
        Self {
            id: ID(label.id.to_string()),
            kind: LabelKind::parse(&label.kind).unwrap_or(LabelKind::Tag),
            name: label.name,
            description: label.description,
            color: label.color,
            position: label.position,
            archived: label.archived_at.is_some(),
            trade_count: label.trade_count,
        }
    }
}

#[derive(InputObject)]
pub struct JournalLabelInput {
    name: String,
    #[graphql(default)]
    description: String,
    color: Option<String>,
    position: Option<i32>,
}

impl From<JournalLabelInput> for LabelInput {
    fn from(input: JournalLabelInput) -> Self {
        Self {
            name: input.name,
            description: input.description,
            color: input.color,
            position: input.position,
        }
    }
}

#[derive(Default)]
pub struct JournalQuery;

#[Object]
impl JournalQuery {
    /// The user's edges, entry tactics, tags and mistakes, shared by every
    /// workspace. Archived labels are left out unless asked for.
    async fn journal_labels(
        &self,
        ctx: &Context<'_>,
        kind: Option<LabelKind>,
        #[graphql(default = false)] include_archived: bool,
    ) -> Result<Vec<JournalLabel>> {
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        let rows = labels::list(pool, user.id, kind, include_archived)
            .await
            .map_err(label_error)?;
        Ok(rows.into_iter().map(JournalLabel::from).collect())
    }
}

#[derive(Default)]
pub struct JournalMutation;

#[Object]
impl JournalMutation {
    /// Refused with `LABEL_EXISTS` (and `existingId`) when an active label of
    /// that kind already has the name.
    async fn create_journal_label(
        &self,
        ctx: &Context<'_>,
        kind: LabelKind,
        input: JournalLabelInput,
    ) -> Result<JournalLabel> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::create(pool, user.id, kind, &input.into())
            .await
            .map(JournalLabel::from)
            .map_err(label_error)
    }

    async fn update_journal_label(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: JournalLabelInput,
    ) -> Result<JournalLabel> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::update(pool, user.id, parse_id(&id)?, &input.into())
            .await
            .map(JournalLabel::from)
            .map_err(label_error)
    }

    /// Hides the label from pickers; trades and statistics keep it.
    async fn archive_journal_label(&self, ctx: &Context<'_>, id: ID) -> Result<JournalLabel> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::set_archived(pool, user.id, parse_id(&id)?, true)
            .await
            .map(JournalLabel::from)
            .map_err(label_error)
    }

    async fn unarchive_journal_label(&self, ctx: &Context<'_>, id: ID) -> Result<JournalLabel> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::set_archived(pool, user.id, parse_id(&id)?, false)
            .await
            .map(JournalLabel::from)
            .map_err(label_error)
    }

    /// Moves every trade from `fromId` onto `intoId`, deletes `fromId`, and
    /// returns `intoId`.
    async fn merge_journal_labels(
        &self,
        ctx: &Context<'_>,
        from_id: ID,
        into_id: ID,
    ) -> Result<JournalLabel> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::merge(pool, user.id, parse_id(&from_id)?, parse_id(&into_id)?)
            .await
            .map(JournalLabel::from)
            .map_err(label_error)
    }

    /// Only for a label no trade uses; otherwise `LABEL_IN_USE`.
    async fn delete_journal_label(&self, ctx: &Context<'_>, id: ID) -> Result<bool> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        labels::delete(pool, user.id, parse_id(&id)?)
            .await
            .map_err(label_error)?;
        Ok(true)
    }
}
