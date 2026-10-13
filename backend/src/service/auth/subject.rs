use super::claims::{AuthClaims, AuthProvider};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Subject {
    Clerk(String),
    Stytch {
        user_id: String,
        clerk_id: Option<String>,
    },
}

impl From<&AuthClaims> for Subject {
    fn from(claims: &AuthClaims) -> Self {
        match claims.provider {
            AuthProvider::Clerk => Self::Clerk(claims.sub.clone()),
            AuthProvider::Stytch => Self::Stytch {
                user_id: claims.sub.clone(),
                clerk_id: claims.clerk_id().map(str::to_owned),
            },
        }
    }
}
