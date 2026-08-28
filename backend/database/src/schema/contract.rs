use std::collections::BTreeSet;

use anyhow::{Context, Result, bail};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde_json::Value;

const CONTRACT_QUERY: &str = include_str!("../../../schema/postgres/contract_query.sql");
const EXPECTED_CONTRACT: &str = include_str!("../../../schema/postgres/contract.json");
const CONTRACT_SECTIONS: [&str; 7] = [
    "tables",
    "columns",
    "constraints",
    "indexes",
    "functions",
    "triggers",
    "extensions",
];

pub fn managed_table_names() -> Result<Vec<String>> {
    let contract: Value = serde_json::from_str(EXPECTED_CONTRACT)?;
    contract["tables"]
        .as_array()
        .context("schema contract tables must be an array")?
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_owned)
                .context("schema contract table name must be a string")
        })
        .collect()
}

pub async fn verify(db: &DatabaseConnection) -> Result<()> {
    let row = db
        .query_one_raw(Statement::from_string(DbBackend::Postgres, CONTRACT_QUERY))
        .await?
        .context("schema contract query returned no row")?;
    let live: Value = row.try_get("", "contract")?;
    let expected: Value = serde_json::from_str(EXPECTED_CONTRACT)?;
    if live == expected {
        return Ok(());
    }

    let mut differences = Vec::new();
    for section in CONTRACT_SECTIONS {
        let expected_items = normalized_items(&expected, section)?;
        let live_items = normalized_items(&live, section)?;
        let missing = expected_items.difference(&live_items).take(8);
        let unexpected = live_items.difference(&expected_items).take(8);
        differences.extend(missing.map(|item| format!("{section}: missing {item}")));
        differences.extend(unexpected.map(|item| format!("{section}: unexpected {item}")));
    }
    bail!("schema contract mismatch:\n{}", differences.join("\n"))
}

fn normalized_items(contract: &Value, section: &str) -> Result<BTreeSet<String>> {
    contract[section]
        .as_array()
        .with_context(|| format!("schema contract {section} must be an array"))?
        .iter()
        .map(|value| serde_json::to_string(value).map_err(Into::into))
        .collect()
}
