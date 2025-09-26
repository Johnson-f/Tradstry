use std::env;

pub struct Config {
    pub supabase_url: String,
    pub supabase_key: String,
    pub jwt_secret: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            supabase_url: env::var("SUPABASE_URL").expect("SUPABASE_URL must be set"),
            supabase_key: env::var("SUPABASE_KEY").expect("SUPABASE_KEY must be set"),
            jwt_secret: env::var("JWT_SECRET_KEY").expect("JWT_SECRET_KEY must be set"),
        }
    }
}
