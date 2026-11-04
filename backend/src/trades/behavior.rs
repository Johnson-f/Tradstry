//! How the trader felt and behaved on a trade, recorded in its journal entry.

use async_graphql::{Enum, InputObject, SimpleObject};
use sqlx::{
    Decode, Encode, Postgres, Type,
    encode::IsNull,
    error::BoxDynError,
    postgres::{PgArgumentBuffer, PgTypeInfo, PgValueRef},
};

/// What the market was doing during the trade.
#[derive(Enum, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum MarketRegime {
    Trending,
    Choppy,
    Ranging,
    Volatile,
}

impl MarketRegime {
    pub const ALL: [Self; 4] = [Self::Trending, Self::Choppy, Self::Ranging, Self::Volatile];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Trending => "trending",
            Self::Choppy => "choppy",
            Self::Ranging => "ranging",
            Self::Volatile => "volatile",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Trending => "Trending",
            Self::Choppy => "Choppy",
            Self::Ranging => "Ranging",
            Self::Volatile => "Volatile",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|regime| regime.as_str() == text)
    }
}

impl Type<Postgres> for MarketRegime {
    fn type_info() -> PgTypeInfo {
        <&str as Type<Postgres>>::type_info()
    }

    fn compatible(ty: &PgTypeInfo) -> bool {
        <&str as Type<Postgres>>::compatible(ty)
    }
}

impl Encode<'_, Postgres> for MarketRegime {
    fn encode_by_ref(&self, buf: &mut PgArgumentBuffer) -> Result<IsNull, BoxDynError> {
        <&str as Encode<Postgres>>::encode_by_ref(&self.as_str(), buf)
    }
}

impl Decode<'_, Postgres> for MarketRegime {
    fn decode(value: PgValueRef<'_>) -> Result<Self, BoxDynError> {
        let text = <&str as Decode<Postgres>>::decode(value)?;
        Self::parse(text).ok_or_else(|| format!("unknown market regime {text}").into())
    }
}

/// Every field is optional; null means not recorded, which is not the same as "no".
#[derive(SimpleObject, InputObject, Clone, Copy, Debug, Default, PartialEq, Eq, sqlx::FromRow)]
#[graphql(input_name = "TradeBehaviorInput")]
pub struct TradeBehavior {
    /// How sure the trader was before entering, 1 to 5.
    pub conviction: Option<i16>,
    pub market_regime: Option<MarketRegime>,
    /// The trade was planned before the market opened.
    pub planned_pre_market: Option<bool>,
    /// Taken to win back an earlier loss.
    pub revenge_trade: Option<bool>,
    pub broke_thirty_minute_rule: Option<bool>,
    /// How closely the trader followed their rules, 1 to 5.
    pub rule_adherence: Option<i16>,
}

impl TradeBehavior {
    pub fn scores_in_range(&self) -> bool {
        [self.conviction, self.rule_adherence]
            .into_iter()
            .flatten()
            .all(|score| (1..=5).contains(&score))
    }
}
