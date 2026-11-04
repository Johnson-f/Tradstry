use async_graphql::{Context, Error, InputObject, Object, Result, SimpleObject};
use rust_decimal::Decimal;
use sqlx::PgPool;

use super::{
    brokerage::require_web_session,
    errors::{coded, to_graphql},
    user::current_user,
};
use crate::users::settings::{self, Settings, SettingsError, TimeZone, WeekStart};

#[derive(SimpleObject)]
pub struct UserSettings {
    /// Dollars at risk assumed for a trade with no stop or planned risk.
    default_risk: Option<Decimal>,
    /// Trades within this many dollars of breaking even count as breakeven.
    breakeven_band: Decimal,
    time_zone: TimeZone,
    week_start: WeekStart,
    /// The period the dashboard and analytics open on.
    default_period: String,
}

impl From<Settings> for UserSettings {
    fn from(settings: Settings) -> Self {
        Self {
            default_risk: settings.default_risk,
            breakeven_band: settings.breakeven_band,
            time_zone: settings.time_zone,
            week_start: settings.week_start,
            default_period: settings.default_period,
        }
    }
}

#[derive(InputObject)]
pub struct UserSettingsInput {
    default_risk: Option<Decimal>,
    breakeven_band: Decimal,
    time_zone: TimeZone,
    week_start: WeekStart,
    default_period: String,
}

fn settings_error(error: SettingsError) -> Error {
    match error {
        SettingsError::Invalid(code, message) => coded(message, code),
        SettingsError::Internal(error) => to_graphql(error),
    }
}

#[derive(Default)]
pub struct SettingsQuery;

#[Object]
impl SettingsQuery {
    async fn settings(&self, ctx: &Context<'_>) -> Result<UserSettings> {
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        settings::get(pool, user.id)
            .await
            .map(UserSettings::from)
            .map_err(to_graphql)
    }
}

#[derive(Default)]
pub struct SettingsMutation;

#[Object]
impl SettingsMutation {
    /// Replaces every setting. Changing the default risk or breakeven band
    /// changes R-multiples and statistics everywhere.
    async fn update_settings(
        &self,
        ctx: &Context<'_>,
        input: UserSettingsInput,
    ) -> Result<UserSettings> {
        require_web_session(ctx)?;
        let pool = ctx.data::<PgPool>()?;
        let user = current_user(ctx).await?;
        let settings = Settings {
            default_risk: input.default_risk,
            breakeven_band: input.breakeven_band,
            time_zone: input.time_zone,
            week_start: input.week_start,
            default_period: input.default_period,
        };
        settings::save(pool, user.id, &settings)
            .await
            .map(UserSettings::from)
            .map_err(settings_error)
    }
}
