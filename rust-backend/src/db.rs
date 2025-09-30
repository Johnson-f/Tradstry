#![allow(dead_code)]
use reqwest::Client;
use serde::de::DeserializeOwned;

pub struct SupabaseClient {
    pub client: Client,
    pub url: String,
    pub key: String,
}

impl SupabaseClient {
    pub fn new(url: String, key: String) -> Self {
        Self {
            client: Client::new(),
            url,
            key,
        }
    }

    pub async fn from<T: DeserializeOwned>(&self, table: &str) -> Result<Vec<T>, reqwest::Error> {
        let url = format!("{}/rest/v1/{}", self.url, table);
        let res = self.client.get(&url).header("apikey", &self.key).send().await?;
        res.json::<Vec<T>>().await
    }
}