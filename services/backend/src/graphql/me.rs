use async_graphql::{Context, Object, Result, SimpleObject};

use crate::auth::AuthClaims;

/// The caller as their token describes them. Read from claims alone, so it
/// costs no Stytch or database call.
#[derive(SimpleObject)]
pub struct Me {
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
    async fn me(&self, ctx: &Context<'_>) -> Result<Me> {
        let claims = ctx.data::<AuthClaims>()?;
        let present = |value: &str| Some(value.to_owned()).filter(|value| !value.is_empty());
        Ok(Me {
            stytch_user_id: claims.sub.clone(),
            email: present(claims.email()),
            full_name: present(claims.full_name()),
            session_id: claims.stytch_session().map(|session| session.id),
        })
    }
}
