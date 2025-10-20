use crate::models::stock::stocks::Stock;
use crate::models::options::options::OptionTrade;
use crate::models::notes::trade_notes::TradeNote;
use crate::models::notebook::notebook_note::NotebookNote;
use crate::models::playbook::playbook::Playbook;
use serde::{Deserialize, Serialize};

/// Data type enum for vectorization
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DataType {
    Stock,
    Option,
    TradeNote,
    NotebookEntry,
    PlaybookStrategy,
}

/// Data formatter for converting trading data to text for embeddings
pub struct DataFormatter;

impl DataFormatter {
    /// Format stock trade for embedding
    pub fn format_stock_for_embedding(stock: &Stock) -> String {
        let entry_date = stock.entry_date.format("%Y-%m-%d").to_string();
        let exit_date = stock.exit_date.map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_else(|| "Open".to_string());
        
        // Calculate P&L from entry and exit prices
        let pnl = if let Some(exit_price) = stock.exit_price {
            (exit_price - stock.entry_price) * stock.number_shares - stock.commissions
        } else {
            0.0
        };
        
        let pnl_percentage = if stock.entry_price > 0.0 {
            (pnl / (stock.entry_price * stock.number_shares)) * 100.0
        } else {
            0.0
        };

        format!(
            "Stock trade: {} {:.2} shares of {} at ${:.2} on {}. Exit: {} at ${:.2} on {}. P&L: ${:.2} ({:.2}% {}). Stop Loss: ${:.2}. Commissions: ${:.2}",
            stock.trade_type,
            stock.number_shares,
            stock.symbol,
            stock.entry_price,
            entry_date,
            if stock.exit_price.is_some() { "SELL" } else { "HOLD" },
            stock.exit_price.unwrap_or(stock.entry_price),
            exit_date,
            pnl,
            pnl_percentage,
            if pnl >= 0.0 { "gain" } else { "loss" },
            stock.stop_loss,
            stock.commissions
        )
    }

    /// Format option trade for embedding
    pub fn format_option_for_embedding(option: &OptionTrade) -> String {
        let entry_date = option.entry_date.format("%Y-%m-%d").to_string();
        let exit_date = option.exit_date.map(|d| d.format("%Y-%m-%d").to_string()).unwrap_or_else(|| "Open".to_string());
        
        // Calculate P&L from entry and exit prices
        let pnl = if let Some(exit_price) = option.exit_price {
            (exit_price - option.entry_price) * option.number_of_contracts as f64 - option.commissions
        } else {
            0.0
        };
        
        let pnl_percentage = if option.entry_price > 0.0 {
            (pnl / (option.entry_price * option.number_of_contracts as f64)) * 100.0
        } else {
            0.0
        };

        format!(
            "Option trade: {} {} {} {} contracts of {} (Strike: ${:.2}, Expiry: {}) at ${:.2} on {}. Exit: {} at ${:.2} on {}. P&L: ${:.2} ({:.2}% {}). Premium: ${:.2}. Commissions: ${:.2}",
            option.strategy_type,
            option.number_of_contracts,
            option.option_type,
            option.trade_direction,
            option.symbol,
            option.strike_price,
            option.expiration_date.format("%Y-%m-%d"),
            option.entry_price,
            entry_date,
            if option.exit_price.is_some() { "CLOSE" } else { "HOLD" },
            option.exit_price.unwrap_or(option.entry_price),
            exit_date,
            pnl,
            pnl_percentage,
            if pnl >= 0.0 { "gain" } else { "loss" },
            option.total_premium,
            option.commissions
        )
    }

    /// Format trade note for embedding
    pub fn format_trade_note_for_embedding(note: &TradeNote) -> String {
        format!(
            "Trade note: {} - {}",
            note.name,
            note.content
        )
    }

    /// Format notebook entry for embedding
    pub fn format_notebook_for_embedding(notebook: &NotebookNote) -> String {
        format!(
            "Notebook entry: {} - {}",
            notebook.title,
            notebook.content
        )
    }

    /// Format playbook strategy for embedding
    pub fn format_playbook_for_embedding(playbook: &Playbook) -> String {
        format!(
            "Trading strategy: {} - {}",
            playbook.name,
            playbook.description.as_deref().unwrap_or("No description")
        )
    }

    /// Format any data type for embedding
    pub fn format_for_embedding(data_type: DataType, data: &serde_json::Value) -> Result<String, String> {
        match data_type {
            DataType::Stock => {
                let stock: Stock = serde_json::from_value(data.clone())
                    .map_err(|e| format!("Failed to parse stock data: {}", e))?;
                Ok(Self::format_stock_for_embedding(&stock))
            }
            DataType::Option => {
                let option: OptionTrade = serde_json::from_value(data.clone())
                    .map_err(|e| format!("Failed to parse option data: {}", e))?;
                Ok(Self::format_option_for_embedding(&option))
            }
            DataType::TradeNote => {
                let note: TradeNote = serde_json::from_value(data.clone())
                    .map_err(|e| format!("Failed to parse trade note data: {}", e))?;
                Ok(Self::format_trade_note_for_embedding(&note))
            }
            DataType::NotebookEntry => {
                let notebook: NotebookNote = serde_json::from_value(data.clone())
                    .map_err(|e| format!("Failed to parse notebook data: {}", e))?;
                Ok(Self::format_notebook_for_embedding(&notebook))
            }
            DataType::PlaybookStrategy => {
                let playbook: Playbook = serde_json::from_value(data.clone())
                    .map_err(|e| format!("Failed to parse playbook data: {}", e))?;
                Ok(Self::format_playbook_for_embedding(&playbook))
            }
        }
    }

    /// Generate content hash for change detection
    pub fn generate_content_hash(content: &str) -> String {
        use sha2::{Sha256, Digest};
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        format!("{:x}", hasher.finalize())
    }

    /// Extract tags from content for better vector organization
    pub fn extract_tags(content: &str, data_type: &DataType) -> Vec<String> {
        let mut tags = Vec::new();
        
        // Add data type tag
        tags.push(format!("{:?}", data_type).to_lowercase());
        
        // Extract common trading terms
        let content_lower = content.to_lowercase();
        
        if content_lower.contains("profit") || content_lower.contains("gain") {
            tags.push("profitable".to_string());
        }
        if content_lower.contains("loss") || content_lower.contains("losing") {
            tags.push("loss".to_string());
        }
        if content_lower.contains("momentum") {
            tags.push("momentum".to_string());
        }
        if content_lower.contains("earnings") {
            tags.push("earnings".to_string());
        }
        if content_lower.contains("swing") {
            tags.push("swing".to_string());
        }
        if content_lower.contains("day trade") {
            tags.push("day_trade".to_string());
        }
        if content_lower.contains("option") {
            tags.push("options".to_string());
        }
        if content_lower.contains("call") {
            tags.push("call_option".to_string());
        }
        if content_lower.contains("put") {
            tags.push("put_option".to_string());
        }
        if content_lower.contains("strategy") {
            tags.push("strategy".to_string());
        }
        if content_lower.contains("risk") {
            tags.push("risk_management".to_string());
        }
        
        tags
    }

    /// Validate content before vectorization
    pub fn validate_content(content: &str) -> Result<(), String> {
        if content.trim().is_empty() {
            return Err("Content cannot be empty".to_string());
        }
        
        if content.len() > 32000 {
            return Err("Content too long for embedding (max 32K characters)".to_string());
        }
        
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_format_stock_for_embedding() {
        let stock = Stock {
            id: 1,
            symbol: "AAPL".to_string(),
            quantity: 100,
            entry_price: 150.0,
            exit_price: Some(160.0),
            entry_date: Utc::now(),
            exit_date: Some(Utc::now()),
            trade_type: crate::models::stock::stocks::TradeType::BUY,
            pnl: Some(1000.0),
            notes: Some("Strong earnings beat".to_string()),
        };

        let formatted = DataFormatter::format_stock_for_embedding(&stock);
        assert!(formatted.contains("AAPL"));
        assert!(formatted.contains("BUY"));
        assert!(formatted.contains("1000.00"));
        assert!(formatted.contains("Strong earnings beat"));
    }

    #[test]
    fn test_generate_content_hash() {
        let content = "test content";
        let hash1 = DataFormatter::generate_content_hash(content);
        let hash2 = DataFormatter::generate_content_hash(content);
        assert_eq!(hash1, hash2);
        
        let hash3 = DataFormatter::generate_content_hash("different content");
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_extract_tags() {
        let content = "This is a profitable momentum trade with strong earnings";
        let tags = DataFormatter::extract_tags(content, &DataType::Stock);
        
        assert!(tags.contains(&"stock".to_string()));
        assert!(tags.contains(&"profitable".to_string()));
        assert!(tags.contains(&"momentum".to_string()));
        assert!(tags.contains(&"earnings".to_string()));
    }

    #[test]
    fn test_validate_content() {
        assert!(DataFormatter::validate_content("valid content").is_ok());
        assert!(DataFormatter::validate_content("").is_err());
        assert!(DataFormatter::validate_content("   ").is_err());
    }
}
