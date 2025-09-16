
use once_cell::sync::Lazy;
use std::env;

pub struct Config {
    pub supabase_url: String,
    pub supabase_anon_key: String,
}

impl Config {
    fn from_env() -> Self {
        // Load .env file from the sibling `backend` directory
        let dotenv_path = env::current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("backend/.env");

        if dotenv_path.exists() {
            dotenv::from_path(&dotenv_path).ok();
            println!("Loaded .env file from: {:?}", dotenv_path);
        } else {
            println!(".env file not found at {:?}", dotenv_path);
        }

        Self {
            supabase_url: env::var("SUPABASE_URL").expect("SUPABASE_URL must be set"),
            supabase_anon_key: env::var("SUPABASE_ANON_KEY").expect("SUPABASE_ANON_KEY must be set"),
        }
    }
}

pub static CONFIG: Lazy<Config> = Lazy::new(Config::from_env);
