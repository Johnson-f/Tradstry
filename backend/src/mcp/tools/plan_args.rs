//! The position inputs `size_position` and `save_plan` share, and how they
//! become a sized plan using the workspace's calculator rule.

use rmcp::ErrorData;
use rust_decimal::{Decimal, prelude::FromPrimitive};
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::{
    TradstryMcp,
    common::{Workspace, internal, money},
};
use crate::{
    trades::{
        plans::{self, PlanAssetClass, PlanDirection, PlanInput, Sizing, Tranche},
        service::TradeError,
    },
    users::settings,
};

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Long,
    Short,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum Asset {
    #[default]
    Stock,
    /// Prices are per-share premiums; one contract is 100 shares.
    Option,
}

#[derive(Clone, Copy, Debug, Deserialize, JsonSchema)]
pub struct EntryArg {
    /// Share of the risk this entry takes, in percent. All entries add up to 100.
    pub percent: f64,
    pub price: f64,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PlanArgs {
    pub symbol: String,
    pub side: Side,
    #[serde(default)]
    pub asset: Asset,
    /// The entry price, for a single entry.
    pub entry: Option<f64>,
    /// Several entries splitting the risk, instead of `entry`.
    pub entries: Option<Vec<EntryArg>>,
    pub stop: f64,
    pub target: Option<f64>,
    /// Dollars to lose at the stop.
    pub risk_dollars: Option<f64>,
    /// Percent of the account balance to lose at the stop. Without either, the
    /// workspace's rule or the default risk from settings is used.
    pub risk_percent: Option<f64>,
    /// Round sizes up instead of down, risking slightly more than chosen.
    #[serde(default)]
    pub round_up: bool,
    /// A workspace name or ID; needed when the user has more than one.
    pub workspace: Option<String>,
}

fn decimal(value: f64, what: &str) -> Result<Decimal, String> {
    Decimal::from_f64(value)
        .map(|d| d.round_dp(6).normalize())
        .ok_or_else(|| format!("The {what} is not a number."))
}

pub(super) fn trade_error(error: TradeError) -> Result<String, ErrorData> {
    match error {
        TradeError::Invalid(_, message) => Ok(format!("{message}.")),
        TradeError::NotFound => Ok("Not found.".into()),
        other => Err(internal(other)),
    }
}

/// A plan input ready to size, plus how the risk was chosen.
pub(super) struct Prepared {
    pub input: PlanInput,
    pub balance: Option<Decimal>,
    pub max_stop_percent: Option<Decimal>,
    pub risk_source: String,
}

impl TradstryMcp {
    /// The plan the arguments describe, or a message saying what to fix.
    pub(super) async fn prepare_plan(
        &self,
        user_id: Uuid,
        workspace: &Workspace,
        args: &PlanArgs,
        note: String,
    ) -> Result<Result<Prepared, String>, ErrorData> {
        let rule = match plans::rule(&self.pool, user_id, workspace.id).await {
            Ok(rule) => rule,
            Err(error) => return trade_error(error).map(Err),
        };
        let tranches = match (&args.entries, args.entry) {
            (Some(entries), _) if !entries.is_empty() => {
                let mut tranches = Vec::new();
                for entry in entries {
                    match (
                        decimal(entry.percent, "entry percent"),
                        decimal(entry.price, "entry price"),
                    ) {
                        (Ok(percent), Ok(price)) => tranches.push(Tranche {
                            percent,
                            entry: price,
                        }),
                        (Err(message), _) | (_, Err(message)) => return Ok(Err(message)),
                    }
                }
                tranches
            }
            (_, Some(entry)) => match decimal(entry, "entry") {
                Ok(price) => vec![Tranche {
                    percent: Decimal::ONE_HUNDRED,
                    entry: price,
                }],
                Err(message) => return Ok(Err(message)),
            },
            _ => {
                return Ok(Err(
                    "Give an entry price, or entries with their share of the risk.".into(),
                ));
            }
        };
        let percent_of_balance = |percent: Decimal| -> Result<Decimal, String> {
            rule.balance
                .map(|balance| (balance * percent / Decimal::ONE_HUNDRED).round_dp(2))
                .ok_or_else(|| {
                    "There's no account balance for this workspace, so risk a dollar amount instead.".to_owned()
                })
        };
        let (risk, risk_source) = if let Some(dollars) = args.risk_dollars {
            match decimal(dollars, "risk") {
                Ok(risk) => (risk, format!("{} chosen", money(risk))),
                Err(message) => return Ok(Err(message)),
            }
        } else if let Some(percent) = args.risk_percent {
            match decimal(percent, "risk percent")
                .and_then(|p| percent_of_balance(p).map(|risk| (p, risk)))
            {
                Ok((percent, risk)) => (risk, format!("{percent}% of the balance")),
                Err(message) => return Ok(Err(message)),
            }
        } else if let (Some(percent), Some(_)) = (rule.risk_percent, rule.balance) {
            match percent_of_balance(percent) {
                Ok(risk) => (
                    risk,
                    format!("the workspace rule of {percent}% of the balance"),
                ),
                Err(message) => return Ok(Err(message)),
            }
        } else {
            match settings::get(&self.pool, user_id)
                .await
                .map_err(internal)?
                .default_risk
            {
                Some(risk) => (risk, "the default risk from settings".to_owned()),
                None => {
                    return Ok(Err(
                        "Say how much to risk, in dollars or as a percent of the balance. The user has no default risk set."
                            .into(),
                    ));
                }
            }
        };
        let stop = match decimal(args.stop, "stop") {
            Ok(stop) => stop,
            Err(message) => return Ok(Err(message)),
        };
        let target = match args.target.map(|t| decimal(t, "target")).transpose() {
            Ok(target) => target,
            Err(message) => return Ok(Err(message)),
        };
        Ok(Ok(Prepared {
            input: PlanInput {
                asset_class: match args.asset {
                    Asset::Stock => PlanAssetClass::Stock,
                    Asset::Option => PlanAssetClass::Option,
                },
                symbol: args.symbol.trim().to_ascii_uppercase(),
                direction: match args.side {
                    Side::Long => PlanDirection::Long,
                    Side::Short => PlanDirection::Short,
                },
                tranches,
                stop,
                target,
                risk,
                round_up: args.round_up,
                note,
            },
            balance: rule.balance,
            max_stop_percent: rule.max_stop_percent,
            risk_source,
        }))
    }
}

/// The size, cost and warnings for a sized plan.
pub(super) fn sizing_json(prepared: &Prepared, sizing: &Sizing) -> (String, Value) {
    let input = &prepared.input;
    let unit = match input.asset_class {
        PlanAssetClass::Option => "contracts",
        PlanAssetClass::Stock => "shares",
    };
    let stop_percent =
        ((sizing.entry - input.stop).abs() / sizing.entry * Decimal::ONE_HUNDRED).round_dp(2);
    let reward_risk = input.target.map(|target| {
        ((target - sizing.entry).abs() / (sizing.entry - input.stop).abs()).round_dp(2)
    });
    let account_percent = prepared
        .balance
        .filter(|balance| *balance > Decimal::ZERO)
        .map(|balance| (sizing.cost / balance * Decimal::ONE_HUNDRED).round_dp(2));
    let mut warnings = Vec::new();
    if let Some(max) = prepared.max_stop_percent
        && stop_percent > max
    {
        warnings.push(format!(
            "The stop is {stop_percent}% from the entry, wider than the rule's {max}% maximum."
        ));
    }
    if let Some(balance) = prepared.balance
        && sizing.cost > balance
    {
        warnings.push(format!(
            "The position costs {}, more than the {} balance.",
            money(sizing.cost),
            money(balance)
        ));
    }
    let mut summary = format!(
        "{} {} {} at {}, stop {}: risks {} ({}), costs {}",
        sizing.quantity,
        input.symbol,
        unit,
        money(sizing.entry),
        money(input.stop),
        money(sizing.actual_risk),
        prepared.risk_source,
        money(sizing.cost),
    );
    if let Some(rr) = reward_risk {
        summary.push_str(&format!(", {rr}R to the target"));
    }
    summary.push('.');
    for warning in &warnings {
        summary.push(' ');
        summary.push_str(warning);
    }
    let value = json!({
        "symbol": input.symbol,
        "quantity": sizing.quantity,
        "unit": unit,
        "averageEntry": sizing.entry,
        "stop": input.stop,
        "target": input.target,
        "riskChosen": input.risk,
        "riskActual": sizing.actual_risk,
        "riskSource": prepared.risk_source,
        "cost": sizing.cost,
        "stopPercent": stop_percent,
        "rewardToRisk": reward_risk,
        "percentOfBalance": account_percent,
        "entries": sizing.tranches.iter().map(|t| json!({
            "percent": t.percent, "price": t.entry, "quantity": t.quantity, "risk": t.risk,
        })).collect::<Vec<_>>(),
        "warnings": warnings,
    });
    (summary, value)
}
