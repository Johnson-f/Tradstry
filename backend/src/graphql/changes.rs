use async_graphql::{Context, ID, Result, SimpleObject, Subscription};
use futures_util::{Stream, stream};
use tokio::sync::broadcast::error::RecvError;

use super::user::current_user;
use crate::realtime::{ChangeTopic, Event, Hub};

/// Something the signed-in user can see changed.
#[derive(SimpleObject, Clone, Debug, PartialEq, Eq)]
pub struct ChangeEvent {
    /// Null when `resync` is set.
    topic: Option<ChangeTopic>,
    /// The workspace the change is in, when it belongs to one.
    workspace_id: Option<ID>,
    /// Changes may have been missed: refetch everything.
    resync: bool,
}

impl ChangeEvent {
    fn missed() -> Self {
        Self {
            topic: None,
            workspace_id: None,
            resync: true,
        }
    }
}

#[derive(Default)]
pub struct ChangeSubscription;

#[Subscription]
impl ChangeSubscription {
    /// Every change to the signed-in user's data, from any device, import or
    /// rebuild, so apps can refetch what changed as it happens.
    async fn changes(&self, ctx: &Context<'_>) -> Result<impl Stream<Item = ChangeEvent>> {
        let user_id = current_user(ctx).await?.id;
        let receiver = ctx.data::<Hub>()?.subscribe().await;
        Ok(stream::unfold(receiver, move |mut receiver| async move {
            loop {
                let event = match receiver.recv().await {
                    Ok(Event::Change(change)) if change.user_id == user_id => ChangeEvent {
                        topic: Some(change.topic),
                        workspace_id: change.workspace_id.map(|id| ID(id.to_string())),
                        resync: false,
                    },
                    Ok(Event::Change(_)) => continue,
                    Ok(Event::Resync) | Err(RecvError::Lagged(_)) => ChangeEvent::missed(),
                    Err(RecvError::Closed) => return None,
                };
                return Some((event, receiver));
            }
        }))
    }
}
