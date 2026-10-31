use std::fmt;

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetClass {
    Stock,
    Option,
    Crypto,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OptionRight {
    Call,
    Put,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct OptionContract {
    pub underlying: String,
    pub expiry: NaiveDate,
    pub right: OptionRight,
    pub strike: Decimal,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Instrument {
    pub asset_class: AssetClass,
    /// The ticker, or the OCC symbol for an option.
    pub symbol: String,
    pub option: Option<OptionContract>,
    /// Shares per contract for options; 1 otherwise.
    pub multiplier: Decimal,
    pub description: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Buy,
    Sell,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Long,
    Short,
}

impl Direction {
    pub fn opened_by(side: Side) -> Self {
        match side {
            Side::Buy => Self::Long,
            Side::Sell => Self::Short,
        }
    }

    /// +1 for long, -1 for short: realised = (exit - cost) * quantity * sign.
    pub fn sign(self) -> Decimal {
        match self {
            Self::Long => Decimal::ONE,
            Self::Short => Decimal::NEGATIVE_ONE,
        }
    }

    pub fn reduced_by(self, side: Side) -> bool {
        matches!(
            (self, side),
            (Self::Long, Side::Sell) | (Self::Short, Side::Buy)
        )
    }
}

/// The open/close hint brokers give on option fills (`BUY_TO_OPEN`, …).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Intent {
    Open,
    Close,
}

#[derive(Clone, Debug, PartialEq)]
pub enum EventKind {
    Fill {
        side: Side,
        quantity: Decimal,
        price: Decimal,
        fee: Decimal,
        intent: Option<Intent>,
    },
    /// `ratio` is new shares per old share; `delta` the shares added (or
    /// removed, for a reverse split) when the brokerage reports only that.
    Split {
        ratio: Option<Decimal>,
        delta: Option<Decimal>,
    },
    StockDividend {
        quantity: Decimal,
    },
    TransferIn {
        quantity: Decimal,
        cost_per_unit: Option<Decimal>,
    },
    TransferOut {
        quantity: Decimal,
        value_per_unit: Option<Decimal>,
    },
    Expire {
        quantity: Option<Decimal>,
    },
    Assign {
        quantity: Option<Decimal>,
    },
    Exercise {
        quantity: Option<Decimal>,
    },
    Dividend {
        amount: Decimal,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Event {
    pub key: String,
    pub workspace_id: Uuid,
    pub instrument: Instrument,
    /// The instrument key after aliases; what the event is stitched under.
    pub instrument_key: String,
    pub at: DateTime<Utc>,
    pub kind: EventKind,
    pub derived: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaxStatus {
    Taxable,
    /// Tax-advantaged (IRA, 401(k), HSA, …): gains are not reported.
    Sheltered,
}

#[derive(Clone, Debug, PartialEq)]
pub struct WorkspaceInfo {
    pub id: Uuid,
    pub can_short: bool,
    pub tax: TaxStatus,
    /// An IRA as a wash-sale replacement makes the loss permanent.
    pub is_ira: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Info,
    Warning,
    Error,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Issue {
    pub code: String,
    pub severity: Severity,
    pub message: String,
    pub workspace_id: Option<Uuid>,
    pub instrument_key: Option<String>,
    pub fill_key: Option<String>,
    pub trade_id: Option<String>,
}

impl Issue {
    pub fn new(code: &str, severity: Severity, message: impl Into<String>) -> Self {
        Self {
            code: code.to_owned(),
            severity,
            message: message.into(),
            workspace_id: None,
            instrument_key: None,
            fill_key: None,
            trade_id: None,
        }
    }

    pub fn workspace(mut self, id: Uuid) -> Self {
        self.workspace_id = Some(id);
        self
    }

    pub fn instrument(mut self, key: &str) -> Self {
        self.instrument_key = Some(key.to_owned());
        self
    }

    pub fn fill(mut self, key: &str) -> Self {
        self.fill_key = Some(key.to_owned());
        self
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FillRole {
    Open,
    Add,
    Reduce,
    Close,
    FlipClose,
    FlipOpen,
    Expire,
    Assign,
    Exercise,
    Split,
    StockDividend,
    TransferIn,
    TransferOut,
    /// A close with nothing open to close: the opening is missing.
    Orphan,
}

impl fmt::Display for FillRole {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = serde_json::to_value(self)
            .ok()
            .and_then(|value| value.as_str().map(str::to_owned))
            .unwrap_or_default();
        f.write_str(&text)
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TradeFill {
    pub key: String,
    pub role: FillRole,
    pub at: DateTime<Utc>,
    /// Always positive; the role says which way it moved the position.
    pub quantity: Decimal,
    pub price: Decimal,
    /// The part of the fill's fee that belongs to this trade.
    pub fee: Decimal,
    pub derived: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ClosureKind {
    Trade,
    Expire,
    Assign,
    Exercise,
    TransferOut,
    Dust,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Term {
    Short,
    Long,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct TaxDetail {
    pub proceeds: Decimal,
    pub cost: Decimal,
    pub realized: Decimal,
    pub wash_disallowed: Decimal,
    /// The disallowed loss went into an IRA and can never be recovered.
    pub wash_permanent: bool,
    pub washed_into: Vec<String>,
    pub term: Option<Term>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Closure {
    pub closed_by: String,
    pub closed_at: DateTime<Utc>,
    pub quantity: Decimal,
    pub exit_price: Decimal,
    /// The share of the closing fill's fee.
    pub fee: Decimal,
    /// (exit - cost) * quantity * multiplier * direction sign; before fees.
    pub gross: Decimal,
    pub kind: ClosureKind,
    /// Moving shares out of the account is not a trading result.
    pub non_economic: bool,
    /// Per-unit change to proceeds for tax: the premium of an assigned or
    /// exercised option folds into the stock sale.
    pub tax_proceeds_adjustment: Decimal,
    /// The premium of an assigned or exercised option is reported through the
    /// stock, not on its own.
    pub tax_folded: bool,
    /// None for sheltered accounts, which report nothing.
    pub tax: Option<TaxDetail>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WashAdjustment {
    pub quantity: Decimal,
    pub amount: Decimal,
    pub holding_from: DateTime<Utc>,
    pub from_closure: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Lot {
    pub id: String,
    pub opened_by: String,
    pub acquired_at: DateTime<Utc>,
    /// When the holding period starts; earlier than `acquired_at` for stock
    /// dividends and wash-sale replacements.
    pub holding_from: DateTime<Utc>,
    pub direction: Direction,
    pub original_quantity: Decimal,
    pub quantity: Decimal,
    pub cost_per_unit: Decimal,
    pub fee_per_unit: Decimal,
    pub cost_known: bool,
    /// Bought or sold short, so it can replace a washed lot; stock dividends
    /// and transfers are not purchases.
    pub purchase: bool,
    /// Per-unit change to cost for tax (option premium carried into stock).
    pub tax_cost_adjustment: Decimal,
    pub wash_adjustments: Vec<WashAdjustment>,
    pub closures: Vec<Closure>,
}

impl Lot {
    pub fn closure_id(&self, index: usize) -> String {
        format!("{}/{index}", self.id)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TradeStatus {
    Open,
    Closed,
    Incomplete,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TradeKind {
    Single,
    Strategy,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Trade {
    pub id: String,
    pub kind: TradeKind,
    pub workspace_id: Uuid,
    pub instrument_key: String,
    pub instrument: Instrument,
    pub direction: Option<Direction>,
    pub status: TradeStatus,
    pub opened_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub fills: Vec<TradeFill>,
    pub lots: Vec<Lot>,
    /// Dividends received while the trade was open; kept out of net P&L.
    pub income: Decimal,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
    pub related: Vec<String>,
    pub decision_id: Option<Uuid>,
    pub strategy_label: Option<String>,
    pub issues: Vec<Issue>,
}

impl Trade {
    pub fn underlying(&self) -> &str {
        self.instrument
            .option
            .as_ref()
            .map_or(self.instrument.symbol.as_str(), |option| {
                option.underlying.as_str()
            })
    }

    pub fn non_economic(&self) -> bool {
        self.lots
            .iter()
            .flat_map(|lot| &lot.closures)
            .any(|closure| closure.non_economic)
    }
}
