use std::sync::Arc;

use async_graphql::{Context, Enum, Error, ID, InputObject, Json, Object, Result, SimpleObject};
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use tracing::warn;
use uuid::Uuid;

use super::errors::{coded, to_graphql};
use super::user::current_user;
use crate::auth::{AuthClaims, TokenKind};
use crate::brokerage::history::ImportMode as StoredImportMode;
use crate::brokerage::import::{ImportError, StoredActivity, StoredOrder};
use crate::brokerage::linking::{
    AccountChoice as LinkChoice, ConnectionView, LinkError, Selection,
};
use crate::brokerage::{Brokerage, SessionError, store};
use crate::snaptrade::SnapTradeError;

fn brokerage<'a>(ctx: &Context<'a>) -> Result<&'a Arc<Brokerage>> {
    ctx.data_opt::<Arc<Brokerage>>().ok_or_else(|| {
        coded(
            "Brokerage linking is not available right now",
            "BROKERAGE_UNAVAILABLE",
        )
    })
}

/// Linking and unlinking brokerages acts for a person in the app, never for a
/// connected app such as an MCP client.
fn require_web_session(ctx: &Context<'_>) -> Result<()> {
    match ctx.data::<AuthClaims>()?.kind {
        TokenKind::Session => Ok(()),
        TokenKind::ConnectedApp => Err(coded(
            "A Tradstry web session is required for this action",
            "SESSION_REQUIRED",
        )),
    }
}

fn parse_id(id: &ID) -> Result<Uuid> {
    Uuid::parse_str(id).map_err(|_| coded("Not found", "NOT_FOUND"))
}

fn link_error(error: LinkError) -> Error {
    let (message, code) = match &error {
        LinkError::NotFound => (error.to_string(), "NOT_FOUND"),
        LinkError::OAuthUnavailable => (error.to_string(), "OAUTH_UNAVAILABLE"),
        LinkError::NotRegistered => (error.to_string(), "NOT_REGISTERED"),
        LinkError::InvalidSelection(_) => (error.to_string(), "INVALID_SELECTION"),
        LinkError::InvalidImportRange(_) => (error.to_string(), "INVALID_IMPORT_RANGE"),
        LinkError::AuthorizationIncomplete => (error.to_string(), "AUTHORIZATION_INCOMPLETE"),
        LinkError::RepairInSnapTrade => (error.to_string(), "REPAIR_IN_SNAPTRADE"),
        LinkError::Session(SessionError::ReauthorizationRequired) => (
            "Your SnapTrade access needs to be authorized again".to_owned(),
            "REAUTHORIZATION_REQUIRED",
        ),
        LinkError::Session(SessionError::StaleCredentials) => (
            "Reconnect your brokerage to continue".to_owned(),
            "RECONNECT_REQUIRED",
        ),
        LinkError::Session(SessionError::SnapTrade(SnapTradeError::RateLimited { .. })) => (
            "SnapTrade is busy. Try again in a minute.".to_owned(),
            "RATE_LIMITED",
        ),
        LinkError::Session(SessionError::SnapTrade(snaptrade)) => {
            warn!(error = %snaptrade, "SnapTrade request failed");
            (
                "SnapTrade could not complete the request. Try again.".to_owned(),
                "BROKERAGE_ERROR",
            )
        }
        LinkError::Session(SessionError::Internal(_)) | LinkError::Internal(_) => {
            return to_graphql(match error {
                LinkError::Session(SessionError::Internal(e)) | LinkError::Internal(e) => e,
                _ => unreachable!(),
            });
        }
    };
    coded(message, code)
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum ImportMode {
    OneYear,
    TwoYears,
    All,
    Custom,
}

impl From<ImportMode> for StoredImportMode {
    fn from(mode: ImportMode) -> Self {
        match mode {
            ImportMode::OneYear => Self::OneYear,
            ImportMode::TwoYears => Self::TwoYears,
            ImportMode::All => Self::All,
            ImportMode::Custom => Self::Custom,
        }
    }
}

#[derive(Enum, Copy, Clone, Eq, PartialEq)]
pub enum AuthorizationIntent {
    Connect,
    Reauthorize,
}

#[derive(SimpleObject)]
pub struct BrokerageStatus {
    /// Connecting a brokerage through Tradstry (Connection Portal).
    available: bool,
    /// Continuing with an existing SnapTrade account.
    oauth_available: bool,
}

#[derive(SimpleObject)]
pub struct AccountChoice {
    connection_id: ID,
    institution_name: String,
    snaptrade_account_id: String,
    name: String,
    masked_number: Option<String>,
    raw_type: Option<String>,
    is_paper: bool,
    linked_workspace_id: Option<ID>,
    previously_linked: bool,
}

impl From<LinkChoice> for AccountChoice {
    fn from(choice: LinkChoice) -> Self {
        Self {
            connection_id: ID(choice.connection_id.to_string()),
            institution_name: choice.institution_name,
            snaptrade_account_id: choice.snaptrade_account_id,
            name: choice.name,
            masked_number: choice.masked_number,
            raw_type: choice.raw_type,
            is_paper: choice.is_paper,
            linked_workspace_id: choice.linked_workspace_id.map(|id| ID(id.to_string())),
            previously_linked: choice.previously_linked,
        }
    }
}

#[derive(SimpleObject)]
pub struct BrokerageAccount {
    id: ID,
    name: String,
    masked_number: Option<String>,
    raw_type: Option<String>,
    is_paper: bool,
    import_mode: String,
    import_start_date: Option<NaiveDate>,
    initial_import_completed_at: Option<DateTime<Utc>>,
    unlinked: bool,
    workspace_id: Option<ID>,
}

impl From<store::Account> for BrokerageAccount {
    fn from(account: store::Account) -> Self {
        Self {
            id: ID(account.id.to_string()),
            name: account.name,
            masked_number: account.masked_number,
            raw_type: account.raw_type,
            is_paper: account.is_paper,
            import_mode: account.import_mode,
            import_start_date: account.import_start_date,
            initial_import_completed_at: account.initial_import_completed_at,
            unlinked: account.unlinked_at.is_some(),
            workspace_id: account.workspace_id.map(|id| ID(id.to_string())),
        }
    }
}

#[derive(SimpleObject)]
pub struct BrokerageConnection {
    id: ID,
    /// `commercial` (linked through Tradstry) or `oauth` (shared from SnapTrade).
    auth_mode: String,
    institution_name: String,
    disabled: bool,
    disabled_at: Option<DateTime<Utc>>,
    new_accounts_available: bool,
    unlinked: bool,
    /// For shared connections: `active`, `reauthorization_required`, or `revoked`.
    grant_status: Option<String>,
    checked_at: Option<DateTime<Utc>>,
    accounts: Vec<BrokerageAccount>,
}

impl From<ConnectionView> for BrokerageConnection {
    fn from(view: ConnectionView) -> Self {
        let c = view.connection;
        Self {
            id: ID(c.id.to_string()),
            auth_mode: c.auth_mode,
            institution_name: c.institution_name,
            disabled: c.disabled,
            disabled_at: c.disabled_at,
            new_accounts_available: c.new_accounts_available,
            unlinked: c.unlinked_at.is_some(),
            grant_status: view.grant_status,
            checked_at: c.checked_at,
            accounts: view
                .accounts
                .into_iter()
                .map(BrokerageAccount::from)
                .collect(),
        }
    }
}

#[derive(SimpleObject)]
pub struct ConnectionPortal {
    url: String,
}

#[derive(SimpleObject)]
pub struct SnapTradeAuthorizationStart {
    attempt_id: ID,
    authorization_url: String,
}

#[derive(SimpleObject)]
pub struct SnapTradeAuthorizationStatus {
    /// `pending`, `processing`, `authorized`, `denied`, or `failed`.
    status: String,
    error_code: Option<String>,
    intent: String,
    expired: bool,
}

#[derive(SimpleObject)]
pub struct SnapTradeRevocation {
    revoked: bool,
    /// False when SnapTrade could not confirm; access is still removed locally.
    upstream_confirmed: bool,
    unlinked_connections: i32,
}

#[derive(InputObject)]
pub struct AccountSelectionInput {
    connection_id: ID,
    snaptrade_account_id: String,
    import_mode: ImportMode,
    custom_start_date: Option<NaiveDate>,
}

#[derive(Default)]
pub struct BrokerageQuery;

#[Object]
impl BrokerageQuery {
    async fn brokerage_status(&self, ctx: &Context<'_>) -> Result<BrokerageStatus> {
        let brokerage = ctx.data_opt::<Arc<Brokerage>>();
        Ok(BrokerageStatus {
            available: brokerage.is_some(),
            oauth_available: brokerage
                .is_some_and(|b| b.oauth_client_id.is_some() && b.client.oauth_enabled()),
        })
    }

    /// The user's brokerage connections. `refresh` re-reads their health from
    /// SnapTrade (at most once a minute per connection).
    async fn brokerage_connections(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = false)] refresh: bool,
    ) -> Result<Vec<BrokerageConnection>> {
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let views = brokerage
            .connections(user.id, refresh)
            .await
            .map_err(link_error)?;
        Ok(views.into_iter().map(BrokerageConnection::from).collect())
    }

    /// Accounts in an existing connection the user could import.
    async fn brokerage_connection_accounts(
        &self,
        ctx: &Context<'_>,
        connection_id: ID,
    ) -> Result<Vec<AccountChoice>> {
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let choices = brokerage
            .connection_account_choices(user.id, parse_id(&connection_id)?)
            .await
            .map_err(link_error)?;
        Ok(choices.into_iter().map(AccountChoice::from).collect())
    }

    async fn snap_trade_authorization_status(
        &self,
        ctx: &Context<'_>,
        attempt_id: ID,
    ) -> Result<Option<SnapTradeAuthorizationStatus>> {
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let attempt = brokerage
            .oauth_status(user.id, parse_id(&attempt_id)?)
            .await
            .map_err(link_error)?;
        Ok(attempt.map(|attempt| SnapTradeAuthorizationStatus {
            expired: attempt.status == "pending" && attempt.expires_at < Utc::now(),
            status: attempt.status,
            error_code: attempt.error_code,
            intent: attempt.intent,
        }))
    }

    /// The accounts a finished SnapTrade authorization can import.
    async fn snap_trade_authorization_accounts(
        &self,
        ctx: &Context<'_>,
        attempt_id: ID,
    ) -> Result<Vec<AccountChoice>> {
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let choices = brokerage
            .oauth_account_choices(user.id, parse_id(&attempt_id)?)
            .await
            .map_err(link_error)?;
        Ok(choices.into_iter().map(AccountChoice::from).collect())
    }
}

#[derive(Default)]
pub struct BrokerageMutation;

#[Object]
impl BrokerageMutation {
    /// A SnapTrade Connection Portal link. Pass `reconnectConnectionId` to
    /// repair a disabled connection instead of adding a new one.
    async fn start_brokerage_connection(
        &self,
        ctx: &Context<'_>,
        reconnect_connection_id: Option<ID>,
    ) -> Result<ConnectionPortal> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let reconnect = reconnect_connection_id.as_ref().map(parse_id).transpose()?;
        let url = brokerage
            .start_commercial(user.id, reconnect)
            .await
            .map_err(link_error)?;
        Ok(ConnectionPortal { url })
    }

    /// Confirms the connection the portal returned and lists its accounts.
    async fn complete_brokerage_connection(
        &self,
        ctx: &Context<'_>,
        snaptrade_connection_id: String,
    ) -> Result<Vec<AccountChoice>> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let choices = brokerage
            .complete_commercial(user.id, &snaptrade_connection_id)
            .await
            .map_err(link_error)?;
        Ok(choices.into_iter().map(AccountChoice::from).collect())
    }

    /// Imports the chosen accounts, one workspace each.
    async fn finalize_brokerage_accounts(
        &self,
        ctx: &Context<'_>,
        accounts: Vec<AccountSelectionInput>,
    ) -> Result<Vec<BrokerageAccount>> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let selections = accounts
            .into_iter()
            .map(|input| {
                Ok(Selection {
                    connection_id: parse_id(&input.connection_id)?,
                    snaptrade_account_id: input.snaptrade_account_id,
                    mode: input.import_mode.into(),
                    custom_start_date: input.custom_start_date,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let imported = brokerage
            .finalize_accounts(user.id, selections)
            .await
            .map_err(link_error)?;
        Ok(imported.into_iter().map(BrokerageAccount::from).collect())
    }

    async fn start_snap_trade_authorization(
        &self,
        ctx: &Context<'_>,
        intent: AuthorizationIntent,
    ) -> Result<SnapTradeAuthorizationStart> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let intent = match intent {
            AuthorizationIntent::Connect => "connect",
            AuthorizationIntent::Reauthorize => "reauthorize",
        };
        let started = brokerage
            .start_oauth(user.id, intent)
            .await
            .map_err(link_error)?;
        Ok(SnapTradeAuthorizationStart {
            attempt_id: ID(started.attempt_id.to_string()),
            authorization_url: started.authorization_url,
        })
    }

    /// Ends Tradstry's access to the user's SnapTrade account.
    async fn revoke_snap_trade_authorization(
        &self,
        ctx: &Context<'_>,
    ) -> Result<SnapTradeRevocation> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        let revocation = brokerage.revoke_oauth(user.id).await.map_err(link_error)?;
        Ok(SnapTradeRevocation {
            revoked: revocation.revoked,
            upstream_confirmed: revocation.upstream_confirmed,
            unlinked_connections: i32::try_from(revocation.unlinked_connections)
                .unwrap_or(i32::MAX),
        })
    }

    /// Stops syncing a connection; imported history stays.
    async fn disconnect_brokerage_connection(
        &self,
        ctx: &Context<'_>,
        connection_id: ID,
    ) -> Result<bool> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        brokerage
            .disconnect(user.id, parse_id(&connection_id)?)
            .await
            .map_err(link_error)?;
        Ok(true)
    }
}

// ── Imported data ─────────────────────────────────────────────────────────────

const MAX_PAGE: i64 = 200;

fn import_error(error: ImportError) -> Error {
    match error {
        ImportError::NotFound => coded("Not found", "NOT_FOUND"),
        ImportError::InvalidRange(message) => coded(message, "INVALID_IMPORT_RANGE"),
        ImportError::TooSoon => coded(error.to_string(), "TOO_SOON"),
        ImportError::Internal(error) => to_graphql(error),
    }
}

async fn workspace_account(ctx: &Context<'_>, workspace_id: &ID) -> Result<Option<store::Account>> {
    let brokerage = brokerage(ctx)?;
    let user = current_user(ctx).await?;
    brokerage
        .account_for_workspace(user.id, parse_id(workspace_id)?)
        .await
        .map_err(to_graphql)
}

#[derive(SimpleObject)]
pub struct BrokerageActivity {
    id: String,
    /// As SnapTrade reported it, e.g. `BUY`, `DIVIDEND`, `SPINOFF`, or a
    /// brokerage's own type.
    r#type: String,
    trade_date: Option<DateTime<Utc>>,
    settlement_date: Option<DateTime<Utc>>,
    units: Option<f64>,
    price: Option<f64>,
    amount: Option<f64>,
    currency: Option<String>,
    fee: Option<f64>,
    symbol: Option<String>,
    option_symbol: Option<String>,
    description: Option<String>,
}

impl From<StoredActivity> for BrokerageActivity {
    fn from(row: StoredActivity) -> Self {
        Self {
            id: row.snaptrade_activity_id,
            r#type: row.r#type,
            trade_date: row.trade_date,
            settlement_date: row.settlement_date,
            units: row.units,
            price: row.price,
            amount: row.amount,
            currency: row.currency,
            fee: row.fee,
            symbol: row.symbol,
            option_symbol: row.option_symbol,
            description: row.description,
        }
    }
}

#[derive(SimpleObject)]
pub struct BrokerageActivityPage {
    total: i64,
    items: Vec<BrokerageActivity>,
}

#[derive(SimpleObject)]
pub struct BrokerageOrder {
    id: String,
    status: Option<String>,
    action: Option<String>,
    symbol: Option<String>,
    total_units: Option<f64>,
    filled_units: Option<f64>,
    execution_price: Option<f64>,
    time_placed: Option<DateTime<Utc>>,
    time_executed: Option<DateTime<Utc>>,
}

impl From<StoredOrder> for BrokerageOrder {
    fn from(row: StoredOrder) -> Self {
        Self {
            id: row.brokerage_order_id,
            status: row.status,
            action: row.action,
            symbol: row.symbol,
            total_units: row.total_units,
            filled_units: row.filled_units,
            execution_price: row.execution_price,
            time_placed: row.time_placed,
            time_executed: row.time_executed,
        }
    }
}

#[derive(SimpleObject)]
pub struct BrokerageHoldings {
    captured_at: DateTime<Utc>,
    /// Positions exactly as SnapTrade returned them.
    positions: Json<Value>,
    balances: Json<Value>,
}

#[derive(SimpleObject)]
pub struct BrokerageSyncStatus {
    account: BrokerageAccount,
    initial_import_completed_at: Option<DateTime<Utc>>,
    transactions_synced_through: Option<NaiveDate>,
    holdings_synced_at: Option<DateTime<Utc>>,
    next_sync_at: Option<DateTime<Utc>>,
    last_error: Option<String>,
}

#[derive(Default)]
pub struct ImportQuery;

#[Object]
impl ImportQuery {
    async fn brokerage_activities(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        #[graphql(default = 0)] offset: i64,
        #[graphql(default = 50)] limit: i64,
    ) -> Result<BrokerageActivityPage> {
        let Some(account) = workspace_account(ctx, &workspace_id).await? else {
            return Ok(BrokerageActivityPage {
                total: 0,
                items: Vec::new(),
            });
        };
        let (rows, total) = brokerage(ctx)?
            .activities(account.id, offset.max(0), limit.clamp(1, MAX_PAGE))
            .await
            .map_err(to_graphql)?;
        Ok(BrokerageActivityPage {
            total,
            items: rows.into_iter().map(BrokerageActivity::from).collect(),
        })
    }

    async fn brokerage_orders(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
        #[graphql(default = 50)] limit: i64,
    ) -> Result<Vec<BrokerageOrder>> {
        let Some(account) = workspace_account(ctx, &workspace_id).await? else {
            return Ok(Vec::new());
        };
        let rows = brokerage(ctx)?
            .orders(account.id, limit.clamp(1, MAX_PAGE))
            .await
            .map_err(to_graphql)?;
        Ok(rows.into_iter().map(BrokerageOrder::from).collect())
    }

    async fn brokerage_holdings(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
    ) -> Result<Option<BrokerageHoldings>> {
        let Some(account) = workspace_account(ctx, &workspace_id).await? else {
            return Ok(None);
        };
        let snapshot = brokerage(ctx)?
            .latest_snapshot(account.id)
            .await
            .map_err(to_graphql)?;
        Ok(snapshot.map(|s| BrokerageHoldings {
            captured_at: s.captured_at,
            positions: Json(s.positions),
            balances: Json(s.balances),
        }))
    }

    /// Null for a manual workspace.
    async fn brokerage_sync_status(
        &self,
        ctx: &Context<'_>,
        workspace_id: ID,
    ) -> Result<Option<BrokerageSyncStatus>> {
        let Some(account) = workspace_account(ctx, &workspace_id).await? else {
            return Ok(None);
        };
        let state = brokerage(ctx)?
            .sync_state(account.id)
            .await
            .map_err(to_graphql)?;
        Ok(Some(BrokerageSyncStatus {
            account: account.into(),
            initial_import_completed_at: state.initial_import_completed_at,
            transactions_synced_through: state.transactions_synced_through,
            holdings_synced_at: state.holdings_synced_at,
            next_sync_at: state.next_sync_at,
            last_error: state.last_error,
        }))
    }
}

#[derive(Default)]
pub struct ImportMutation;

#[Object]
impl ImportMutation {
    /// Imports an account's history further back; it can never shrink.
    async fn expand_brokerage_history(
        &self,
        ctx: &Context<'_>,
        account_id: ID,
        import_mode: ImportMode,
        custom_start_date: Option<NaiveDate>,
    ) -> Result<BrokerageAccount> {
        require_web_session(ctx)?;
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        brokerage
            .expand_history(
                user.id,
                parse_id(&account_id)?,
                import_mode.into(),
                custom_start_date,
            )
            .await
            .map(BrokerageAccount::from)
            .map_err(import_error)
    }

    /// Fetches holdings and recent orders now (at most every few minutes).
    async fn refresh_brokerage_holdings(&self, ctx: &Context<'_>, account_id: ID) -> Result<bool> {
        let brokerage = brokerage(ctx)?;
        let user = current_user(ctx).await?;
        brokerage
            .refresh_holdings(user.id, parse_id(&account_id)?)
            .await
            .map_err(import_error)?;
        Ok(true)
    }
}
