use std::time::Duration;

use async_graphql::{Context, Result, Subscription};
use futures_util::Stream;
use futures_util::stream::{self, StreamExt};

use crate::auth::AuthClaims;

const MIN_INTERVAL_MS: u64 = 50;
const MAX_INTERVAL_MS: u64 = 60_000;

/// A counter that proves the authenticated WebSocket path end to end. Remove
/// it once a real subscription exists.
#[derive(Default)]
pub struct TicksSubscription;

#[Subscription]
impl TicksSubscription {
    async fn ticks(
        &self,
        ctx: &Context<'_>,
        #[graphql(default = 1000)] interval_ms: u64,
    ) -> Result<impl Stream<Item = u64>> {
        ctx.data::<AuthClaims>()?;
        let interval = Duration::from_millis(interval_ms.clamp(MIN_INTERVAL_MS, MAX_INTERVAL_MS));
        Ok(stream::iter(1..).then(move |tick| async move {
            tokio::time::sleep(interval).await;
            tick
        }))
    }
}
