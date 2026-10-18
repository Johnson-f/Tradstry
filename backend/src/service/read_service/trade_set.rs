//! The closed trades every report counts. The dashboard, the calendar, the journal
//! and analytics pages and the MCP tools all start here, so they always agree.
//!
//! With the journal on, the journal's closed trades count, broker and manual. With
//! it off, manual trades count plus broker trades nobody has put in the journal; a
//! broker trade that was published or linked to a journal entry counts once, as
//! that entry.

use std::collections::{HashMap, HashSet};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use rust_decimal::prelude::ToPrimitive;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::service::db::schema::tables::journal_table::{self, JournalEntry};
use crate::service::trade_review::stored::{
    self, StoredEpisode, direction_str, realized_pnl, weighted_price,
};
use crate::service::trade_review::types::ExecutionInstrument;

/// What a report covers besides the trades it counted.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, async_graphql::SimpleObject)]
#[graphql(rename_fields = "camelCase")]
pub struct TradeCoverage {
    /// Counted trades whose results come from broker history, net of fees.
    pub broker_trades: usize,
    /// Counted trades entered by hand.
    pub manual_trades: usize,
    /// Of those, trades with no fees entered, so their results are before fees.
    #[serde(default)]
    pub manual_without_fees: usize,
    pub open_positions: usize,
    /// Trades left out until the user resolves them, possible duplicates included.
    pub needs_review: usize,
    /// Manual trades waiting for the user to say whether they repeat a broker trade.
    pub possible_duplicates: usize,
}

/// Where a counted trade's initial stop came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StopSource {
    /// A position-calculator plan matched to the trade's broker history.
    Plan,
    /// A stop the user recorded in the journal.
    Journal,
    /// The stop saved with a manual trade; when it was set is unknown.
    Typed,
}

/// A stop the trader committed to, and when.
pub struct StopCandidate {
    pub at: DateTime<Utc>,
    pub price: f64,
    pub source: StopSource,
}

/// The stop in force when the trade opened: the latest commitment before it
/// opened, otherwise the first one made while it was open. Stops set after the
/// close are hindsight and never count.
fn initial_stop(
    candidates: &[StopCandidate],
    opened: DateTime<Utc>,
    closed: DateTime<Utc>,
) -> Option<&StopCandidate> {
    candidates
        .iter()
        .filter(|c| c.at < opened)
        .max_by_key(|c| c.at)
        .or_else(|| {
            candidates
                .iter()
                .filter(|c| c.at >= opened && c.at < closed)
                .min_by_key(|c| c.at)
        })
}

/// Realized money over the risk taken at entry. Unknown without a stop on the
/// losing side of the entry.
pub fn r_multiple(entry: &JournalEntry, money: f64) -> Option<f64> {
    let risk = stop_distance(entry)? * entry.position_size * entry.contract_multiplier;
    (risk > 0.0).then(|| money / risk)
}

fn stop_distance(entry: &JournalEntry) -> Option<f64> {
    let stop = entry.stop_loss?;
    let distance = if entry.trade_type == "short" {
        stop - entry.entry_price
    } else {
        entry.entry_price - stop
    };
    (distance > 0.0).then_some(distance)
}

fn reward_to_risk(entry: &JournalEntry) -> Option<f64> {
    let reward = if entry.trade_type == "short" {
        entry.entry_price - entry.exit_price
    } else {
        entry.exit_price - entry.entry_price
    };
    Some(reward / stop_distance(entry)?)
}

fn parse_time(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|at| at.with_timezone(&Utc))
}

pub struct TradeSet {
    /// Counted trades, oldest close first. Each carries its initial stop.
    pub entries: Vec<JournalEntry>,
    /// Realized money for each counted trade, by entry id.
    pub money: HashMap<String, Decimal>,
    /// The broker history behind a counted trade, by entry id, where there is one.
    pub episodes: HashMap<String, StoredEpisode>,
    pub coverage: TradeCoverage,
    /// The time zone that decides which day a trade belongs to.
    pub timezone: chrono_tz::Tz,
    /// Where each counted trade's initial stop came from, by entry id.
    pub stop_sources: HashMap<String, StopSource>,
}

impl TradeSet {
    pub fn money_of(&self, entry: &JournalEntry) -> Decimal {
        self.money.get(&entry.id).copied().unwrap_or_default()
    }

    /// Sets each trade's initial stop from the candidates, by entry id. A trade
    /// with none keeps its own saved stop only when `typed` allows it.
    pub fn apply_initial_stops(
        &mut self,
        candidates: &HashMap<String, Vec<StopCandidate>>,
        typed: impl Fn(&str) -> bool,
    ) {
        for entry in &mut self.entries {
            let times = parse_time(&entry.open_date).zip(parse_time(&entry.close_date));
            let found = times.and_then(|(opened, closed)| {
                initial_stop(candidates.get(&entry.id)?, opened, closed)
            });
            let source = match found {
                Some(candidate) => {
                    entry.stop_loss = Some(candidate.price);
                    Some(candidate.source)
                }
                None if entry.stop_loss.is_some() && typed(&entry.id) => Some(StopSource::Typed),
                None => {
                    entry.stop_loss = None;
                    None
                }
            };
            if let Some(source) = source {
                self.stop_sources.insert(entry.id.clone(), source);
            }
            entry.risk_reward = reward_to_risk(entry);
        }
    }

    pub fn money_f64(&self) -> HashMap<String, f64> {
        self.money
            .iter()
            .map(|(id, value)| (id.clone(), value.to_f64().unwrap_or_default()))
            .collect()
    }

    /// Broker trades only, as a workspace without a journal sees them. Used where
    /// only episodes are at hand.
    pub fn from_episodes(
        episodes: &[StoredEpisode],
        start: Option<DateTime<Utc>>,
        end: Option<DateTime<Utc>>,
        timezone: chrono_tz::Tz,
    ) -> Self {
        let mut set = Self {
            entries: Vec::new(),
            money: HashMap::new(),
            episodes: HashMap::new(),
            coverage: TradeCoverage::default(),
            timezone,
            stop_sources: HashMap::new(),
        };
        set.add_episodes(episodes, &HashSet::new(), start, end, "");
        set.finish(&HashSet::new());
        set
    }

    fn add_episodes(
        &mut self,
        episodes: &[StoredEpisode],
        represented: &HashSet<String>,
        start: Option<DateTime<Utc>>,
        end: Option<DateTime<Utc>>,
        user: &str,
    ) {
        let shared = shared_transactions(episodes);
        for episode in episodes {
            if represented.contains(&episode.id) {
                continue;
            }
            let Some(closed_at) = episode.draft.closed_at else {
                self.coverage.open_positions += 1;
                continue;
            };
            if start.is_some_and(|bound| closed_at < bound)
                || end.is_some_and(|bound| closed_at > bound)
            {
                continue;
            }
            let entry = settled_money(episode, &shared)
                .and_then(|money| Some((money, episode_entry(episode, user).ok()?)));
            let Some((money, entry)) = entry else {
                self.coverage.needs_review += 1;
                continue;
            };
            self.money.insert(entry.id.clone(), money);
            self.episodes.insert(entry.id.clone(), episode.clone());
            self.entries.push(entry);
        }
    }

    fn finish(&mut self, manual: &HashSet<String>) {
        self.entries.sort_by(|a, b| {
            a.close_date
                .cmp(&b.close_date)
                .then_with(|| a.id.cmp(&b.id))
        });
        self.coverage.manual_trades = self
            .entries
            .iter()
            .filter(|entry| manual.contains(&entry.id))
            .count();
        self.coverage.broker_trades = self.entries.len() - self.coverage.manual_trades;
        self.coverage.manual_without_fees = self
            .entries
            .iter()
            .filter(|entry| manual.contains(&entry.id) && entry.fees.is_none())
            .count();
    }
}

pub async fn load(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
) -> Result<TradeSet> {
    load_scoped(pool, user, workspace, start, end, &TradeScope::default()).await
}

/// Narrows the counted trades to those with a playbook, a tag, or both.
#[derive(Debug, Clone, Default)]
pub struct TradeScope {
    pub playbook: Option<String>,
    pub tag: Option<String>,
}

impl TradeScope {
    fn is_all(&self) -> bool {
        self.playbook.is_none() && self.tag.is_none()
    }
}

/// The trades every report counts, narrowed to `scope`. Coverage counts are
/// narrowed the same way.
pub async fn load_scoped(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    start: Option<DateTime<Utc>>,
    end: Option<DateTime<Utc>>,
    scope: &TradeScope,
) -> Result<TradeSet> {
    let start_iso = start.map_or_else(|| "1970-01-01T00:00:00Z".to_string(), |d| d.to_rfc3339());
    let end_iso = end.map_or_else(|| "9999-12-31T23:59:59Z".to_string(), |d| d.to_rfc3339());
    let (enabled, timezone, entries) = tokio::try_join!(
        crate::service::trade_review::journal_flow::is_enabled(pool, user, workspace),
        journal_timezone(pool, user, workspace),
        journal_table::list_journal_entries_for_account_in_range(
            pool, user, workspace, &start_iso, &end_iso
        ),
    )?;
    let mut entries = entries;
    if let Some(playbook) = &scope.playbook {
        entries.retain(|entry| entry.playbook_id.as_ref() == Some(playbook));
    }
    if let Some(tag) = &scope.tag {
        let tagged: HashSet<String> =
            sqlx::query_scalar("SELECT journal_entry_id FROM trade_tags WHERE tag_id = $1")
                .bind(tag)
                .fetch_all(pool)
                .await?
                .into_iter()
                .collect();
        entries.retain(|entry| tagged.contains(&entry.id));
    }
    let ids: Vec<String> = entries.iter().map(|entry| entry.id.clone()).collect();
    let sources = journal_table::trade_sources(pool, user, &ids).await?;
    let mut set = TradeSet {
        money: sources
            .iter()
            .map(|source| (source.id.clone(), source.money))
            .collect(),
        entries,
        episodes: HashMap::new(),
        coverage: TradeCoverage::default(),
        timezone,
        stop_sources: HashMap::new(),
    };
    let mut manual: HashSet<String> = sources
        .iter()
        .filter(|source| source.manual)
        .map(|source| source.id.clone())
        .collect();

    if enabled {
        let behind: HashMap<&str, &str> = sources
            .iter()
            .filter_map(|source| Some((source.episode_id.as_deref()?, source.id.as_str())))
            .collect();
        for episode in stored::list_workspace_episodes(pool, user, workspace).await? {
            if let Some(entry) = behind.get(episode.id.as_str()) {
                set.episodes.insert((*entry).to_string(), episode);
            }
        }
        let attention = journal_table::attention_counts(
            pool,
            user,
            workspace,
            scope.playbook.as_deref(),
            scope.tag.as_deref(),
        )
        .await?;
        set.coverage.open_positions = attention.open;
        set.coverage.needs_review = attention.needs_review;
        set.coverage.possible_duplicates = attention.possible_duplicates;
    } else {
        let episodes = stored::list_workspace_episodes(pool, user, workspace).await?;
        let journaled = journaled_episodes(pool, user, workspace, &episodes).await?;
        let shared = shared_transactions(&episodes);
        for episode in &episodes {
            let Some(entry_id) = journaled.exact.get(&episode.id) else {
                continue;
            };
            if let Some(money) = settled_money(episode, &shared)
                && set.money.contains_key(entry_id)
            {
                set.money.insert(entry_id.clone(), money);
                set.episodes.insert(entry_id.clone(), episode.clone());
                manual.remove(entry_id);
            }
        }
        // Broker trades nobody journaled have no playbook or tags.
        if scope.is_all() {
            set.add_episodes(&episodes, &journaled.represented, start, end, user);
        }
    }
    let candidates = stop_candidates(pool, user, workspace, &set, enabled).await?;
    // With the journal on, a broker trade's stop lives in the journal; the stop
    // saved on the row only counts for manual trades.
    set.apply_initial_stops(&candidates, |id| !enabled || manual.contains(id));
    set.finish(&manual);
    Ok(set)
}

/// Every stop commitment for the counted trades: calculator plans matched to
/// their broker history, dated by the plan's last save, and stops recorded in
/// the journal or in an entry note, dated when they were recorded.
async fn stop_candidates(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    set: &TradeSet,
    journal_enabled: bool,
) -> Result<HashMap<String, Vec<StopCandidate>>> {
    let mut candidates = HashMap::<String, Vec<StopCandidate>>::new();
    let entry_of_episode: HashMap<&str, &str> = set
        .episodes
        .iter()
        .map(|(entry, episode)| (episode.id.as_str(), entry.as_str()))
        .collect();
    let plans: Vec<(String, f64, DateTime<Utc>)> = sqlx::query_as(
        "SELECT m.episode_id,p.stop_loss::float8,p.updated_at FROM trade_episode_matches m
         JOIN position_calculator_plans p ON p.id=m.plan_id AND p.user_id=m.user_id
         WHERE m.user_id=$1 AND m.workspace_id=$2 AND m.status='confirmed' AND p.deleted_at IS NULL",
    )
    .bind(user)
    .bind(workspace)
    .fetch_all(pool)
    .await?;
    for (episode, price, at) in plans {
        if let Some(entry) = entry_of_episode.get(episode.as_str()) {
            candidates
                .entry((*entry).to_string())
                .or_default()
                .push(StopCandidate {
                    at,
                    price,
                    source: StopSource::Plan,
                });
        }
    }
    if journal_enabled {
        let ids: Vec<&str> = set.entries.iter().map(|entry| entry.id.as_str()).collect();
        let recorded: Vec<(String, DateTime<Utc>, Option<String>)> = sqlx::query_as(
            "SELECT entry_id,recorded_at,payload_json->>'stop_price' FROM journal_trade_context_events
             WHERE user_id=$1 AND workspace_id=$2 AND entry_id=ANY($3) AND kind='risk_strategy'
               AND payload_json->>'stop_state'='price'",
        )
        .bind(user)
        .bind(workspace)
        .bind(&ids)
        .fetch_all(pool)
        .await?;
        for (entry, at, price) in recorded {
            if let Some(price) = price.and_then(|price| price.parse().ok()) {
                candidates.entry(entry).or_default().push(StopCandidate {
                    at,
                    price,
                    source: StopSource::Journal,
                });
            }
        }
        let noted: Vec<(String, DateTime<Utc>, f64)> = sqlx::query_as(
            "SELECT j.id,n.updated_at,n.stop_price::float8 FROM journal_entries j
             JOIN LATERAL (SELECT coalesce(f.brokerage_transaction_id,'opening:'||f.opening_position_id) AS anchor FROM trade_episode_fills f
                 WHERE f.episode_id=j.episode_id AND f.role='entry' ORDER BY f.executed_at,f.allocation_order,f.id LIMIT 1) first ON true
             JOIN journal_action_notes n ON n.user_id=j.user_id AND n.workspace_id=j.workspace_id AND n.kind='plan'
                 AND n.anchor_role='entry' AND n.anchor_execution_id=first.anchor AND n.stop_price IS NOT NULL
             WHERE j.user_id=$1 AND j.workspace_id=$2 AND j.id=ANY($3)",
        )
        .bind(user)
        .bind(workspace)
        .bind(&ids)
        .fetch_all(pool)
        .await?;
        for (entry, at, price) in noted {
            candidates.entry(entry).or_default().push(StopCandidate {
                at,
                price,
                source: StopSource::Journal,
            });
        }
    }
    Ok(candidates)
}

/// The workspace's journal time zone, New York when unset or unrecognised.
pub async fn journal_timezone(pool: &PgPool, user: &str, workspace: &str) -> Result<chrono_tz::Tz> {
    let name: Option<String> = sqlx::query_scalar(
        "SELECT journal_timezone FROM workspaces WHERE id = $1 AND user_id = $2",
    )
    .bind(workspace)
    .bind(user)
    .fetch_optional(pool)
    .await
    .context("Failed to read the journal time zone")?;
    Ok(name
        .and_then(|name| name.parse().ok())
        .unwrap_or(chrono_tz::America::New_York))
}

struct Journaled {
    /// Episodes a live journal entry already stands for.
    represented: HashSet<String>,
    /// Of those, the ones whose entry covers exactly their executions, so the
    /// entry can take the broker's money: episode id to entry id.
    exact: HashMap<String, String>,
}

async fn journaled_episodes(
    pool: &PgPool,
    user: &str,
    workspace: &str,
    episodes: &[StoredEpisode],
) -> Result<Journaled> {
    let links: Vec<(String, String)> = sqlx::query_as(
        "SELECT l.brokerage_transaction_id,l.journal_entry_id FROM journal_brokerage_links l
         JOIN journal_entries j ON j.id=l.journal_entry_id AND j.user_id=l.user_id
         WHERE l.user_id=$1 AND j.workspace_id=$2 AND j.deleted_at IS NULL",
    )
    .bind(user)
    .bind(workspace)
    .fetch_all(pool)
    .await?;
    let published: Vec<(String, String)> = sqlx::query_as(
        "SELECT p.episode_id,p.journal_entry_id FROM brokerage_episode_publications p
         JOIN journal_entries j ON j.id=p.journal_entry_id AND j.user_id=p.user_id
         WHERE p.user_id=$1 AND p.workspace_id=$2 AND j.deleted_at IS NULL",
    )
    .bind(user)
    .bind(workspace)
    .fetch_all(pool)
    .await?;
    let entry_of_transaction: HashMap<&str, &str> = links
        .iter()
        .map(|(transaction, entry)| (transaction.as_str(), entry.as_str()))
        .collect();
    let mut transactions_of_entry = HashMap::<&str, HashSet<&str>>::new();
    for (transaction, entry) in &links {
        transactions_of_entry
            .entry(entry.as_str())
            .or_default()
            .insert(transaction.as_str());
    }
    let published: HashMap<&str, &str> = published
        .iter()
        .map(|(episode, entry)| (episode.as_str(), entry.as_str()))
        .collect();

    let mut journaled = Journaled {
        represented: HashSet::new(),
        exact: HashMap::new(),
    };
    for episode in episodes {
        let transactions: HashSet<&str> = episode
            .draft
            .allocations
            .iter()
            .map(|fill| fill.transaction_id.as_str())
            .collect();
        let linked: HashSet<&str> = transactions
            .iter()
            .filter_map(|transaction| entry_of_transaction.get(transaction).copied())
            .collect();
        let entry = published.get(episode.id.as_str()).copied().or_else(|| {
            let mut entries = linked.iter();
            match (entries.next(), entries.next()) {
                (Some(entry), None) if transactions_of_entry.get(entry) == Some(&transactions) => {
                    Some(*entry)
                }
                _ => None,
            }
        });
        if entry.is_some() || !linked.is_empty() {
            journaled.represented.insert(episode.id.clone());
        }
        if let Some(entry) = entry {
            journaled
                .exact
                .insert(episode.id.clone(), entry.to_string());
        }
    }
    Ok(journaled)
}

fn shared_transactions(episodes: &[StoredEpisode]) -> HashSet<&str> {
    let mut seen = HashMap::<&str, usize>::new();
    for episode in episodes {
        for fill in &episode.draft.allocations {
            *seen.entry(fill.transaction_id.as_str()).or_default() += 1;
        }
    }
    seen.into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(id, _)| id)
        .collect()
}

/// The money a closed episode realized, unless its executions are shared with
/// another episode or it still holds a position, which need the user first.
fn settled_money(episode: &StoredEpisode, shared: &HashSet<&str>) -> Option<Decimal> {
    let ambiguous = episode
        .draft
        .allocations
        .iter()
        .any(|fill| shared.contains(fill.transaction_id.as_str()));
    if ambiguous
        || episode.draft.closed_at.is_none()
        || episode.draft.current_quantity != Decimal::ZERO
    {
        return None;
    }
    realized_pnl(
        episode.draft.direction,
        &episode.draft.allocations,
        episode.draft.instrument.multiplier(),
    )
}

/// A closed episode in the shape of a journal entry, derived the way publishing
/// one to the journal derives it.
fn episode_entry(episode: &StoredEpisode, user: &str) -> Result<JournalEntry> {
    let draft = &episode.draft;
    let closed_at = draft.closed_at.context("the episode is still open")?;
    let entry_quantity = draft.entry_quantity();
    let entry_price = weighted_price(draft.entry_allocations(), entry_quantity)?;
    let exit_quantity: Decimal = draft.exit_allocations().map(|fill| fill.quantity).sum();
    let exit_price = weighted_price(draft.exit_allocations(), exit_quantity)?;
    let (symbol, multiplier) = match &draft.instrument {
        ExecutionInstrument::Equity { symbol } => (symbol.clone(), Decimal::ONE),
        ExecutionInstrument::Option {
            underlying,
            multiplier,
            ..
        } => (underlying.clone(), *multiplier),
    };
    let format = |at: DateTime<Utc>| at.format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let (open_date, close_date) = (format(draft.opened_at), format(closed_at));
    let trade_type = direction_str(draft.direction);
    let entry_price = entry_price
        .to_f64()
        .context("entry price cannot be represented")?;
    let exit_price = exit_price
        .to_f64()
        .context("exit price cannot be represented")?;
    let metrics = journal_table::derived_metrics(
        &open_date,
        &close_date,
        entry_price,
        exit_price,
        None,
        trade_type,
    )?;
    Ok(JournalEntry {
        id: episode.id.clone(),
        user_id: user.to_string(),
        workspace_id: episode.workspace_id.clone(),
        created_at: open_date.clone(),
        open_date,
        close_date,
        entry_price,
        exit_price,
        position_size: entry_quantity.to_f64().unwrap_or_default(),
        symbol_name: symbol.clone(),
        symbol,
        status: metrics.status,
        total_pl: metrics.total_pl,
        net_roi: metrics.net_roi,
        duration: metrics.duration,
        stop_loss: None,
        risk_reward: None,
        trade_type: trade_type.to_string(),
        mistakes: String::new(),
        entry_tactics: String::new(),
        edges_spotted: String::new(),
        playbook_id: None,
        notes: None,
        broke_30min_rule: None,
        pre_trade_conviction: None,
        market_regime: None,
        is_planned_pre_market: None,
        revenge_trade: None,
        rule_adherence_score: None,
        contract_multiplier: multiplier.to_f64().unwrap_or(1.0),
        possible_duplicates: Vec::new(),
        fees: draft
            .allocations
            .iter()
            .map(|fill| fill.fee)
            .sum::<Decimal>()
            .to_f64(),
        record_version: 0,
    })
}
