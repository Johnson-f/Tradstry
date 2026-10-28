use async_graphql::{Context, ID, Object, Result, SimpleObject};

use super::user::current_user;
use crate::auth::AuthClaims;

#[derive(SimpleObject)]
pub struct Me {
    /// Tradstry's ID for the user.
    id: ID,
    stytch_user_id: String,
    email: Option<String>,
    full_name: Option<String>,
    /// Absent for connected-app tokens, which carry no web session.
    session_id: Option<String>,
}

#[derive(Default)]
pub struct MeQuery;

#[Object]
impl MeQuery {
    /// The signed-in user. A web session's first call creates the account.
    async fn me(&self, ctx: &Context<'_>) -> Result<Me> {
        let user = current_user(ctx).await?;
        let claims = ctx.data::<AuthClaims>()?;
        let present = |value: String| Some(value).filter(|value| !value.is_empty());
        Ok(Me {
            id: ID(user.id.to_string()),
            stytch_user_id: user.stytch_user_id,
            email: present(user.email),
            full_name: present(user.full_name),
            session_id: claims.stytch_session().map(|session| session.id),
        })
    }
}
