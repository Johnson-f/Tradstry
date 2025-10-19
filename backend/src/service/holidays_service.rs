use anyhow::Result;
use libsql::{Connection, params};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct HolidaysService;

#[derive(Debug, Serialize, Deserialize)]
pub struct PublicHoliday {
    pub id: String,
    pub country_code: String,
    pub holiday_name: String,
    pub holiday_date: String,
    pub is_national: bool,
    pub description: Option<String>,
}

impl HolidaysService {
    /// Fetch public holidays from Google Calendar API
    pub async fn fetch_google_holidays(country_code: &str, year: i32) -> Result<Vec<PublicHoliday>> {
        let calendar_id = format!("en.{}%23holiday@group.v.calendar.google.com", country_code.to_lowercase());
        let start_date = format!("{}-01-01T00:00:00Z", year);
        let end_date = format!("{}-12-31T23:59:59Z", year);
        
        let url = format!(
            "https://www.googleapis.com/calendar/v3/calendars/{}/events?timeMin={}&timeMax={}&singleEvents=true&orderBy=startTime&key={}",
            urlencoding::encode(&calendar_id),
            urlencoding::encode(&start_date),
            urlencoding::encode(&end_date),
            std::env::var("GOOGLE_API_KEY").unwrap_or_default()
        );
        
        let client = Client::new();
        let resp = client.get(url).send().await?;
        
        if !resp.status().is_success() {
            return Err(anyhow::anyhow!("Failed to fetch holidays: {}", resp.status()));
        }
        
        let body: serde_json::Value = resp.json().await?;
        let mut holidays = Vec::new();
        
        if let Some(items) = body.get("items").and_then(|v| v.as_array()) {
            for item in items {
                let name = item.get("summary").and_then(|v| v.as_str()).unwrap_or("Unknown Holiday");
                let date = item.get("start").and_then(|s| s.get("date")).and_then(|v| v.as_str())
                    .unwrap_or(&start_date);
                let description = item.get("description").and_then(|v| v.as_str());
                
                holidays.push(PublicHoliday {
                    id: uuid::Uuid::new_v4().to_string(),
                    country_code: country_code.to_uppercase(),
                    holiday_name: name.to_string(),
                    holiday_date: date.to_string(),
                    is_national: true,
                    description: description.map(|s| s.to_string()),
                });
            }
        }
        
        Ok(holidays)
    }
    
    /// Store holidays in database
    pub async fn store_holidays(conn: &Connection, holidays: Vec<PublicHoliday>) -> Result<u64> {
        let mut inserted = 0u64;
        
        for holiday in holidays {
            // Check if holiday already exists
            let existing = conn
                .prepare("SELECT id FROM public_holidays WHERE country_code = ? AND holiday_date = ? AND holiday_name = ?")
                .await?
                .query(params![holiday.country_code.clone(), holiday.holiday_date.clone(), holiday.holiday_name.clone()])
                .await?
                .next()
                .await?;
            
            if existing.is_none() {
                conn.execute(
                    "INSERT INTO public_holidays (id, country_code, holiday_name, holiday_date, is_national, description) VALUES (?, ?, ?, ?, ?, ?)",
                    params![holiday.id, holiday.country_code, holiday.holiday_name, holiday.holiday_date, holiday.is_national, holiday.description],
                ).await?;
                inserted += 1;
            }
        }
        
        Ok(inserted)
    }
    
    /// Get holidays for a specific country and date range
    pub async fn get_holidays(conn: &Connection, country_code: &str, start_date: &str, end_date: &str) -> Result<Vec<PublicHoliday>> {
        let stmt = conn
            .prepare("SELECT id, country_code, holiday_name, holiday_date, is_national, description FROM public_holidays WHERE country_code = ? AND holiday_date BETWEEN ? AND ? ORDER BY holiday_date")
            .await?;
        
        let mut rows = stmt.query(params![country_code, start_date, end_date]).await?;
        let mut holidays = Vec::new();
        
        while let Some(row) = rows.next().await? {
            holidays.push(PublicHoliday {
                id: row.get(0)?,
                country_code: row.get(1)?,
                holiday_name: row.get(2)?,
                holiday_date: row.get(3)?,
                is_national: row.get(4)?,
                description: row.get(5)?,
            });
        }
        
        Ok(holidays)
    }
}
