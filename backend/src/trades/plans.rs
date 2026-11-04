//! Trade plans: what the trader means to do before a trade, sized so the loss
//! at the stop is no more than the risk they chose. A plan stays open until
//! the trader links it to the trade that carried it out, or skips it.

use async_graphql::Enum;
use chrono::{DateTime, Utc};
use rust_decimal::{Decimal, RoundingStrategy};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{PgPool, Postgres, Transaction, types::Json};
use uuid::Uuid;

use super::{
    instrument::STANDARD_MULTIPLIER,
    measure::money,
    positions::account_value,
    service::{TradeError, anchor_fill, invalid, owns_workspace},
};
use crate::db::new_id;

type Result<T> = std::result::Result<T, TradeError>;

macro_rules! text_enum {
    ($name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        #[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
        pub enum $name {
            $($variant),+
        }

        impl $name {
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $text),+
                }
            }

            pub fn parse(text: &str) -> Option<Self> {
                [$(Self::$variant),+].into_iter().find(|value| value.as_str() == text)
            }
        }
    };
}

text_enum!(PlanAssetClass { Stock => "stock", Option => "option" });
text_enum!(PlanDirection { Long => "long", Short => "short" });
text_enum!(PlanStatus { Open => "open", Linked => "linked", Skipped => "skipped" });

impl PlanAssetClass {
    pub fn multiplier(self) -> Decimal {
        match self {
            Self::Option => Decimal::from(STANDARD_MULTIPLIER),
            Self::Stock => Decimal::ONE,
        }
    }

    fn unit(self) -> &'static str {
        match self {
            Self::Stock => "share",
            Self::Option => "contract",
        }
    }
}

/// One planned entry: a share of the plan's risk, entered at a price.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tranche {
    /// Percent of the plan's risk; a plan's tranches add up to 100.
    pub percent: Decimal,
    /// Per share, contract premium or coin.
    pub entry: Decimal,
}

pub const MAX_TRANCHES: usize = 10;

#[derive(Clone, Debug)]
pub struct PlanInput {
    pub asset_class: PlanAssetClass,
    /// The ticker; the underlying for an option.
    pub symbol: String,
    pub direction: PlanDirection,
    pub tranches: Vec<Tranche>,
    pub stop: Decimal,
    pub target: Option<Decimal>,
    /// Dollars the trader is willing to lose at the stop.
    pub risk: Decimal,
    /// Round each tranche's size up instead of down, risking a little more than `risk`.
    pub round_up: bool,
    pub note: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TrancheSizing {
    pub percent: Decimal,
    pub entry: Decimal,
    pub quantity: Decimal,
    /// What this tranche loses at the stop.
    pub risk: Decimal,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Sizing {
    pub tranches: Vec<TrancheSizing>,
    pub quantity: Decimal,
    /// The size-weighted average entry.
    pub entry: Decimal,
    /// What the rounded sizes lose at the stop; above `risk` only when rounding up.
    pub actual_risk: Decimal,
    pub cost: Decimal,
}

fn check_prices(input: &PlanInput) -> Result<()> {
    let long = input.direction == PlanDirection::Long;
    if input.tranches.is_empty() || input.tranches.len() > MAX_TRANCHES {
        return invalid(
            "INVALID_TRANCHES",
            format!("Plan between 1 and {MAX_TRANCHES} entries"),
        );
    }
    if input.tranches.iter().any(|t| t.percent <= Decimal::ZERO) {
        return invalid(
            "INVALID_TRANCHES",
            "Give every entry a share of the risk above 0%",
        );
    }
    if input.tranches.iter().map(|t| t.percent).sum::<Decimal>() != Decimal::ONE_HUNDRED {
        return invalid(
            "INVALID_TRANCHES",
            "The entries' shares of the risk must add up to 100%",
        );
    }
    if input.stop < Decimal::ZERO || input.tranches.iter().any(|t| t.entry <= Decimal::ZERO) {
        return invalid(
            "INVALID_PRICE",
            "Enter entries above zero and a stop of zero or more",
        );
    }
    if input.tranches.iter().any(|t| {
        if long {
            input.stop >= t.entry
        } else {
            input.stop <= t.entry
        }
    }) {
        let side = if long { "below" } else { "above" };
        let kind = if long { "long" } else { "short" };
        return invalid(
            "INVALID_STOP",
            format!("For a {kind}, the stop must be {side} every entry"),
        );
    }
    if let Some(target) = input.target
        && (target <= Decimal::ZERO
            || input.tranches.iter().any(|t| {
                if long {
                    target <= t.entry
                } else {
                    target >= t.entry
                }
            }))
    {
        let side = if long { "above" } else { "below" };
        let kind = if long { "long" } else { "short" };
        return invalid(
            "INVALID_TARGET",
            format!("For a {kind}, the target must be {side} every entry"),
        );
    }
    if input.risk <= Decimal::ZERO || input.risk > Decimal::from(1_000_000_000) {
        return invalid("INVALID_RISK", "Risk must be a dollar amount above zero");
    }
    Ok(())
}

/// Each tranche sized so its loss at the stop is its share of the risk,
/// rounded down (or up) to whole shares or contracts.
pub fn size(input: &PlanInput) -> Result<Sizing> {
    check_prices(input)?;
    let multiplier = input.asset_class.multiplier();
    let strategy = if input.round_up {
        RoundingStrategy::AwayFromZero
    } else {
        RoundingStrategy::ToZero
    };
    let tranches: Vec<TrancheSizing> = input
        .tranches
        .iter()
        .map(|tranche| {
            let per_unit = (tranche.entry - input.stop).abs() * multiplier;
            let budget = input.risk * tranche.percent / Decimal::ONE_HUNDRED;
            let quantity = (budget / per_unit)
                .round_dp_with_strategy(0, strategy)
                .normalize();
            TrancheSizing {
                percent: tranche.percent.normalize(),
                entry: tranche.entry.normalize(),
                quantity,
                risk: money(quantity * per_unit),
            }
        })
        .collect();
    if tranches.iter().any(|t| t.quantity <= Decimal::ZERO) {
        let unit = input.asset_class.unit();
        let what = if tranches.len() == 1 {
            "That risk"
        } else {
            "An entry's share of the risk"
        };
        return invalid(
            "RISK_TOO_SMALL",
            format!(
                "{what} is less than one {unit} loses at this stop. Raise the risk, move the stop closer or round up"
            ),
        );
    }
    let quantity: Decimal = tranches.iter().map(|t| t.quantity).sum();
    let value: Decimal = tranches.iter().map(|t| t.quantity * t.entry).sum();
    Ok(Sizing {
        entry: (value / quantity).round_dp(4).normalize(),
        actual_risk: money(tranches.iter().map(|t| t.risk).sum()),
        cost: money(value * multiplier),
        quantity: quantity.normalize(),
        tranches,
    })
}

fn validate(input: &PlanInput) -> Result<(String, Sizing)> {
    let symbol = input.symbol.trim().to_ascii_uppercase();
    if symbol.is_empty() || symbol.chars().count() > 32 {
        return invalid("INVALID_SYMBOL", "Enter a symbol of up to 32 characters");
    }
    if input.note.chars().count() > 2000 {
        return invalid("INVALID_NOTE", "Keep the note under 2,000 characters");
    }
    Ok((symbol, size(input)?))
}

#[derive(Clone, Debug, sqlx::FromRow)]
pub struct PlanRow {
    pub id: Uuid,
    pub workspace_id: Uuid,
    pub asset_class: String,
    pub symbol: String,
    pub direction: String,
    /// The size-weighted average entry.
    pub entry: Decimal,
    pub stop: Decimal,
    pub target: Option<Decimal>,
    pub risk: Decimal,
    pub quantity: Decimal,
    pub tranches: Json<Vec<Tranche>>,
    pub round_up: bool,
    pub note: String,
    pub status: String,
    pub trade_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl PlanRow {
    pub fn asset_class(&self) -> PlanAssetClass {
        PlanAssetClass::parse(&self.asset_class).unwrap_or(PlanAssetClass::Stock)
    }

    pub fn direction(&self) -> PlanDirection {
        PlanDirection::parse(&self.direction).unwrap_or(PlanDirection::Long)
    }

    pub fn status(&self) -> PlanStatus {
        PlanStatus::parse(&self.status).unwrap_or(PlanStatus::Open)
    }

    pub fn sizing(&self) -> Option<Sizing> {
        size(&PlanInput {
            asset_class: self.asset_class(),
            symbol: self.symbol.clone(),
            direction: self.direction(),
            tranches: self.tranches.0.clone(),
            stop: self.stop,
            target: self.target,
            risk: self.risk,
            round_up: self.round_up,
            note: String::new(),
        })
        .ok()
    }
}

const COLUMNS: &str =
    "id, workspace_id, asset_class, symbol, direction, entry, stop, target, risk, quantity,
    tranches, round_up, note, status, trade_id, created_at, updated_at";

/// Every plan in the workspace, newest first.
pub async fn list(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<Vec<PlanRow>> {
    owns_workspace(pool, user_id, workspace_id).await?;
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {COLUMNS} FROM trade_plans WHERE user_id = $1 AND workspace_id = $2
         ORDER BY created_at DESC LIMIT 500"
    )))
    .bind(user_id)
    .bind(workspace_id)
    .fetch_all(pool)
    .await?)
}

async fn locked(tx: &mut Transaction<'_, Postgres>, user_id: Uuid, id: Uuid) -> Result<PlanRow> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {COLUMNS} FROM trade_plans WHERE id = $1 AND user_id = $2 FOR UPDATE"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await?
    .ok_or(TradeError::NotFound)
}

async fn fetch(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<PlanRow> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {COLUMNS} FROM trade_plans WHERE id = $1 AND user_id = $2"
    )))
    .bind(id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or(TradeError::NotFound)
}

fn stored_tranches(sizing: &Sizing) -> Json<Vec<Tranche>> {
    Json(
        sizing
            .tranches
            .iter()
            .map(|t| Tranche {
                percent: t.percent,
                entry: t.entry,
            })
            .collect(),
    )
}

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    input: &PlanInput,
) -> Result<PlanRow> {
    owns_workspace(pool, user_id, workspace_id).await?;
    let (symbol, sizing) = validate(input)?;
    let id = new_id();
    sqlx::query(
        "INSERT INTO trade_plans (id, user_id, workspace_id, asset_class, symbol, direction, entry, stop, target,
            risk, quantity, tranches, round_up, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(id)
    .bind(user_id)
    .bind(workspace_id)
    .bind(input.asset_class.as_str())
    .bind(symbol)
    .bind(input.direction.as_str())
    .bind(sizing.entry)
    .bind(input.stop)
    .bind(input.target)
    .bind(input.risk)
    .bind(sizing.quantity)
    .bind(stored_tranches(&sizing))
    .bind(input.round_up)
    .bind(input.note.trim())
    .execute(pool)
    .await?;
    fetch(pool, user_id, id).await
}

/// Changes a plan that is not linked; unlink it first to change one that is.
pub async fn update(pool: &PgPool, user_id: Uuid, id: Uuid, input: &PlanInput) -> Result<PlanRow> {
    let (symbol, sizing) = validate(input)?;
    let mut tx = pool.begin().await?;
    if locked(&mut tx, user_id, id).await?.status() == PlanStatus::Linked {
        return invalid(
            "PLAN_LINKED",
            "Unlink this plan from its trade before changing it",
        );
    }
    sqlx::query(
        "UPDATE trade_plans SET asset_class = $2, symbol = $3, direction = $4, entry = $5, stop = $6, target = $7,
            risk = $8, quantity = $9, tranches = $10, round_up = $11, note = $12, updated_at = now()
         WHERE id = $1",
    )
    .bind(id)
    .bind(input.asset_class.as_str())
    .bind(symbol)
    .bind(input.direction.as_str())
    .bind(sizing.entry)
    .bind(input.stop)
    .bind(input.target)
    .bind(input.risk)
    .bind(sizing.quantity)
    .bind(stored_tranches(&sizing))
    .bind(input.round_up)
    .bind(input.note.trim())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    fetch(pool, user_id, id).await
}

/// Skips an open plan, or reopens a skipped one.
pub async fn set_skipped(pool: &PgPool, user_id: Uuid, id: Uuid, skipped: bool) -> Result<PlanRow> {
    let mut tx = pool.begin().await?;
    if locked(&mut tx, user_id, id).await?.status() == PlanStatus::Linked {
        return invalid("PLAN_LINKED", "Unlink this plan from its trade first");
    }
    sqlx::query("UPDATE trade_plans SET status = $2, updated_at = now() WHERE id = $1")
        .bind(id)
        .bind(
            if skipped {
                PlanStatus::Skipped
            } else {
                PlanStatus::Open
            }
            .as_str(),
        )
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    fetch(pool, user_id, id).await
}

pub async fn delete(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<()> {
    let mut tx = pool.begin().await?;
    if locked(&mut tx, user_id, id).await?.status() == PlanStatus::Linked {
        return invalid(
            "PLAN_LINKED",
            "Unlink this plan from its trade before deleting it",
        );
    }
    sqlx::query("DELETE FROM trade_plans WHERE id = $1")
        .bind(id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(())
}

/// Links an open or skipped plan to a top-level trade in its workspace. A
/// trade carries at most one plan.
pub async fn link(pool: &PgPool, user_id: Uuid, id: Uuid, trade_id: &str) -> Result<PlanRow> {
    let mut tx = pool.begin().await?;
    let plan = locked(&mut tx, user_id, id).await?;
    if plan.status() == PlanStatus::Linked {
        return invalid("PLAN_LINKED", "This plan is already linked to a trade");
    }
    let top_level: Option<bool> = sqlx::query_scalar(
        "SELECT parent_id IS NULL FROM trades WHERE user_id = $1 AND workspace_id = $2 AND id = $3",
    )
    .bind(user_id)
    .bind(plan.workspace_id)
    .bind(trade_id)
    .fetch_optional(&mut *tx)
    .await?;
    match top_level {
        None => return Err(TradeError::NotFound),
        Some(false) => {
            return invalid(
                "INVALID_TRADE",
                "Link the plan to the whole strategy, not one leg",
            );
        }
        Some(true) => {}
    }
    let anchor = anchor_fill(pool, user_id, plan.workspace_id, trade_id).await?;
    sqlx::query(
        "UPDATE trade_plans SET status = 'linked', trade_id = $2, anchor_fill_key = $3, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(trade_id)
    .bind(anchor)
    .execute(&mut *tx)
    .await
    .map_err(|error| match error {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            TradeError::Invalid("PLAN_EXISTS", "That trade already has a plan".into())
        }
        other => other.into(),
    })?;
    tx.commit().await?;
    fetch(pool, user_id, id).await
}

/// Reopens a linked plan. Anything it filled in on the trade stays there.
pub async fn unlink(pool: &PgPool, user_id: Uuid, id: Uuid) -> Result<PlanRow> {
    let updated = sqlx::query(
        "UPDATE trade_plans SET status = 'open', trade_id = NULL, anchor_fill_key = NULL, updated_at = now()
         WHERE id = $1 AND user_id = $2 AND status = 'linked'",
    )
    .bind(id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected();
    let plan = fetch(pool, user_id, id).await?;
    if updated == 0 && plan.status() != PlanStatus::Open {
        return invalid("PLAN_NOT_LINKED", "This plan is not linked to a trade");
    }
    Ok(plan)
}

#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq)]
pub enum BalanceSource {
    /// The latest holdings snapshot from the linked brokerage account.
    Brokerage,
    /// Entered by the trader.
    Manual,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PlanningRule {
    /// What percent risk is sized from: the brokerage snapshot when there is one, else the typed balance.
    pub balance: Option<Decimal>,
    pub source: Option<BalanceSource>,
    pub as_of: Option<DateTime<Utc>>,
    /// The workspace is linked to a brokerage, whose balance wins over a typed one.
    pub linked: bool,
    pub manual_balance: Option<Decimal>,
    /// Percent of the balance risked per trade.
    pub risk_percent: Option<Decimal>,
    /// The widest stop, as a percent of the entry, before the calculator warns.
    pub max_stop_percent: Option<Decimal>,
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct RuleInput {
    pub manual_balance: Option<Decimal>,
    pub risk_percent: Option<Decimal>,
    pub max_stop_percent: Option<Decimal>,
}

type RuleRow = (
    Option<Decimal>,
    Option<Decimal>,
    Option<Decimal>,
    Option<Uuid>,
);

pub async fn rule(pool: &PgPool, user_id: Uuid, workspace_id: Uuid) -> Result<PlanningRule> {
    let row: Option<RuleRow> = sqlx::query_as(
        "SELECT planning_balance, planning_risk_percent, max_stop_percent, brokerage_account_id
         FROM workspaces WHERE id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let (manual, risk_percent, max_stop_percent, account) = row.ok_or(TradeError::NotFound)?;
    let mut rule = PlanningRule {
        balance: manual,
        source: manual.map(|_| BalanceSource::Manual),
        as_of: None,
        linked: account.is_some(),
        manual_balance: manual,
        risk_percent,
        max_stop_percent,
    };
    if let Some(account) = account {
        let snapshot: Option<(DateTime<Utc>, Value, Value)> = sqlx::query_as(
            "SELECT captured_at, positions, balances FROM brokerage_snapshots
             WHERE account_id = $1 ORDER BY captured_at DESC LIMIT 1",
        )
        .bind(account)
        .fetch_optional(pool)
        .await?;
        if let Some((captured_at, positions, balances)) = snapshot
            && let Some(amount) = account_value(&positions, &balances)
        {
            rule.balance = Some(amount);
            rule.source = Some(BalanceSource::Brokerage);
            rule.as_of = Some(captured_at);
        }
    }
    Ok(rule)
}

/// Replaces the workspace's rule; a null field clears it.
pub async fn save_rule(
    pool: &PgPool,
    user_id: Uuid,
    workspace_id: Uuid,
    input: RuleInput,
) -> Result<PlanningRule> {
    if input.manual_balance.is_some_and(|a| a <= Decimal::ZERO) {
        return invalid("INVALID_BALANCE", "The balance must be above zero");
    }
    let percent = |value: Option<Decimal>| {
        value.is_some_and(|p| p <= Decimal::ZERO || p > Decimal::ONE_HUNDRED)
    };
    if percent(input.risk_percent) {
        return invalid(
            "INVALID_RISK",
            "Risk per trade must be a percent above 0 and at most 100",
        );
    }
    if percent(input.max_stop_percent) {
        return invalid(
            "INVALID_STOP",
            "The maximum stop must be a percent above 0 and at most 100",
        );
    }
    let updated = sqlx::query(
        "UPDATE workspaces SET planning_balance = $3, planning_risk_percent = $4, max_stop_percent = $5
         WHERE id = $1 AND user_id = $2",
    )
    .bind(workspace_id)
    .bind(user_id)
    .bind(input.manual_balance)
    .bind(input.risk_percent)
    .bind(input.max_stop_percent)
    .execute(pool)
    .await?
    .rows_affected();
    if updated == 0 {
        return Err(TradeError::NotFound);
    }
    rule(pool, user_id, workspace_id).await
}

#[cfg(test)]
mod tests {
    use rust_decimal_macros::dec;
    use serde_json::json;

    use super::*;

    fn plan(
        asset_class: PlanAssetClass,
        direction: PlanDirection,
        entry: Decimal,
        stop: Decimal,
        risk: Decimal,
    ) -> PlanInput {
        PlanInput {
            asset_class,
            symbol: "aapl".into(),
            direction,
            tranches: vec![Tranche {
                percent: dec!(100),
                entry,
            }],
            stop,
            target: None,
            risk,
            round_up: false,
            note: String::new(),
        }
    }

    fn code(result: Result<Sizing>) -> &'static str {
        match result {
            Err(TradeError::Invalid(code, _)) => code,
            other => panic!("expected an invalid plan, got {other:?}"),
        }
    }

    #[test]
    fn size_rounds_down_so_the_loss_stays_within_the_risk() {
        let sizing = size(&plan(
            PlanAssetClass::Stock,
            PlanDirection::Long,
            dec!(50),
            dec!(48.5),
            dec!(200),
        ))
        .unwrap();
        assert_eq!(
            (
                sizing.quantity,
                sizing.entry,
                sizing.actual_risk,
                sizing.cost
            ),
            (dec!(133), dec!(50), dec!(199.50), dec!(6650.00))
        );
    }

    #[test]
    fn rounding_up_takes_the_next_share_and_risks_a_little_more() {
        let sizing = size(&PlanInput {
            round_up: true,
            ..plan(
                PlanAssetClass::Stock,
                PlanDirection::Long,
                dec!(50),
                dec!(48.5),
                dec!(200),
            )
        })
        .unwrap();
        assert_eq!(
            (sizing.quantity, sizing.actual_risk),
            (dec!(134), dec!(201.00))
        );
        let tiny = PlanInput {
            round_up: true,
            ..plan(
                PlanAssetClass::Option,
                PlanDirection::Long,
                dec!(5),
                dec!(1),
                dec!(100),
            )
        };
        assert_eq!(
            size(&tiny).unwrap().quantity,
            dec!(1),
            "rounding up never leaves zero"
        );
    }

    #[test]
    fn tranches_split_the_risk_and_weight_the_entry() {
        let sizing = size(&PlanInput {
            tranches: vec![
                Tranche {
                    percent: dec!(50),
                    entry: dec!(100),
                },
                Tranche {
                    percent: dec!(50),
                    entry: dec!(98),
                },
            ],
            ..plan(
                PlanAssetClass::Stock,
                PlanDirection::Long,
                dec!(0),
                dec!(95),
                dec!(200),
            )
        })
        .unwrap();
        assert_eq!(
            sizing
                .tranches
                .iter()
                .map(|t| (t.quantity, t.risk))
                .collect::<Vec<_>>(),
            [(dec!(20), dec!(100.00)), (dec!(33), dec!(99.00))]
        );
        assert_eq!(
            (sizing.quantity, sizing.entry, sizing.actual_risk),
            (dec!(53), dec!(98.7547), dec!(199.00))
        );

        let uneven = PlanInput {
            tranches: vec![
                Tranche {
                    percent: dec!(60),
                    entry: dec!(100),
                },
                Tranche {
                    percent: dec!(30),
                    entry: dec!(98),
                },
            ],
            ..plan(
                PlanAssetClass::Stock,
                PlanDirection::Long,
                dec!(0),
                dec!(95),
                dec!(200),
            )
        };
        assert_eq!(code(size(&uneven)), "INVALID_TRANCHES");
        let beyond = PlanInput {
            tranches: vec![
                Tranche {
                    percent: dec!(50),
                    entry: dec!(100),
                },
                Tranche {
                    percent: dec!(50),
                    entry: dec!(94),
                },
            ],
            ..plan(
                PlanAssetClass::Stock,
                PlanDirection::Long,
                dec!(0),
                dec!(95),
                dec!(200),
            )
        };
        assert_eq!(
            code(size(&beyond)),
            "INVALID_STOP",
            "the stop must be below every entry"
        );
    }

    #[test]
    fn options_count_contracts_of_100_and_shorts_stop_above() {
        let option = size(&plan(
            PlanAssetClass::Option,
            PlanDirection::Long,
            dec!(2.40),
            dec!(1.20),
            dec!(500),
        ))
        .unwrap();
        assert_eq!(
            (option.quantity, option.actual_risk, option.cost),
            (dec!(4), dec!(480.00), dec!(960.00))
        );
        let short = size(&plan(
            PlanAssetClass::Stock,
            PlanDirection::Short,
            dec!(50),
            dec!(51.5),
            dec!(100),
        ))
        .unwrap();
        assert_eq!(short.quantity, dec!(66));
    }

    #[test]
    fn stops_and_targets_must_sit_on_the_right_side() {
        let long = plan(
            PlanAssetClass::Stock,
            PlanDirection::Long,
            dec!(10),
            dec!(11),
            dec!(100),
        );
        assert_eq!(code(size(&long)), "INVALID_STOP");
        let short = plan(
            PlanAssetClass::Stock,
            PlanDirection::Short,
            dec!(10),
            dec!(9),
            dec!(100),
        );
        assert_eq!(code(size(&short)), "INVALID_STOP");
        let target = PlanInput {
            target: Some(dec!(9)),
            ..plan(
                PlanAssetClass::Stock,
                PlanDirection::Long,
                dec!(10),
                dec!(9.5),
                dec!(100),
            )
        };
        assert_eq!(code(size(&target)), "INVALID_TARGET");
        let tiny = plan(
            PlanAssetClass::Option,
            PlanDirection::Long,
            dec!(5),
            dec!(1),
            dec!(100),
        );
        assert_eq!(
            code(size(&tiny)),
            "RISK_TOO_SMALL",
            "one contract loses $400"
        );
    }

    #[test]
    fn account_value_is_dollar_cash_plus_positions() {
        let positions = json!([
            { "symbol": { "symbol": { "symbol": "AAPL" } }, "units": 10, "price": 200 },
            { "instrument": { "kind": "option", "symbol": "AAPL  261120C00230000" }, "units": 2, "price": 1.5 },
        ]);
        let balances = json!([
            { "currency": { "code": "USD" }, "cash": 1000.0 },
            { "currency": { "code": "CAD" }, "cash": 500.0 },
        ]);
        assert_eq!(account_value(&positions, &balances), Some(dec!(3300)));
        assert_eq!(account_value(&json!([]), &json!([])), None);
    }
}
