use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::types::{FillAllocation, FillRole, TradeEpisodeDraft};

/// Fills this close together, on the same side and at the same price, are
/// likely pieces of one order.
const SUGGESTED_JOIN_WINDOW: Duration = Duration::seconds(2);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActionKind {
    Entry,
    Add,
    Trim,
    Exit,
}

impl ActionKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Entry => "entry",
            Self::Add => "add",
            Self::Trim => "trim",
            Self::Exit => "exit",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Action {
    pub kind: ActionKind,
    pub role: FillRole,
    pub execution_ids: Vec<String>,
    pub quantity: Decimal,
    /// Quantity-weighted across the action's executions.
    pub price: Decimal,
    pub fee: Decimal,
    pub first_executed_at: DateTime<Utc>,
    pub last_executed_at: DateTime<Utc>,
    pub position_after: Decimal,
    pub join_id: Option<String>,
}

impl Action {
    /// The execution a note on this action points at.
    pub fn anchor(&self) -> &str {
        &self.execution_ids[0]
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActionJoin {
    pub id: String,
    pub execution_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Timeline {
    pub actions: Vec<Action>,
    /// Joins that touch this trade but no longer fit it, for example after a
    /// sync moved one of their executions into another trade.
    pub broken_joins: Vec<String>,
}

fn single(allocation: &FillAllocation, kind: ActionKind, position_after: Decimal) -> Action {
    Action {
        kind,
        role: allocation.role,
        execution_ids: vec![allocation.transaction_id.clone()],
        quantity: allocation.quantity,
        price: allocation.price,
        fee: allocation.fee,
        first_executed_at: allocation.executed_at,
        last_executed_at: allocation.executed_at,
        position_after,
        join_id: None,
    }
}

/// Labels each execution of a trade, then applies the joins the user
/// confirmed. A join must cover neighbouring executions on the same side.
pub fn label_actions(draft: &TradeEpisodeDraft, joins: &[ActionJoin]) -> Timeline {
    let mut position = Decimal::ZERO;
    let mut singles = Vec::with_capacity(draft.allocations.len());
    for (index, allocation) in draft.allocations.iter().enumerate() {
        let kind = match allocation.role {
            FillRole::Entry => {
                position += allocation.quantity;
                if index == 0 {
                    ActionKind::Entry
                } else {
                    ActionKind::Add
                }
            }
            FillRole::Exit => {
                position -= allocation.quantity;
                if position == Decimal::ZERO {
                    ActionKind::Exit
                } else {
                    ActionKind::Trim
                }
            }
        };
        singles.push(single(allocation, kind, position));
    }

    let mut timeline = Timeline::default();
    let mut applied = Vec::<(usize, usize, &ActionJoin)>::new();
    for join in joins {
        let positions = join
            .execution_ids
            .iter()
            .map(|id| singles.iter().position(|action| action.anchor() == id))
            .collect::<Vec<_>>();
        if positions.iter().all(Option::is_none) {
            continue;
        }
        let Some(mut positions) = positions.into_iter().collect::<Option<Vec<_>>>() else {
            timeline.broken_joins.push(join.id.clone());
            continue;
        };
        positions.sort_unstable();
        let (start, end) = (positions[0], positions[positions.len() - 1]);
        let fits = end - start + 1 == positions.len()
            && singles[start..=end]
                .iter()
                .all(|action| action.role == singles[start].role)
            && !applied
                .iter()
                .any(|(other_start, other_end, _)| start <= *other_end && *other_start <= end);
        if fits {
            applied.push((start, end, join));
        } else {
            timeline.broken_joins.push(join.id.clone());
        }
    }
    applied.sort_by_key(|(start, _, _)| *start);

    let mut index = 0;
    let mut applied = applied.into_iter().peekable();
    while index < singles.len() {
        match applied.peek() {
            Some((start, end, join)) if *start == index => {
                timeline
                    .actions
                    .push(combine(&singles[*start..=*end], &join.id));
                index = end + 1;
                applied.next();
            }
            _ => {
                timeline.actions.push(singles[index].clone());
                index += 1;
            }
        }
    }
    timeline
}

fn combine(parts: &[Action], join_id: &str) -> Action {
    let quantity: Decimal = parts.iter().map(|part| part.quantity).sum();
    let notional: Decimal = parts.iter().map(|part| part.quantity * part.price).sum();
    let first = &parts[0];
    let last = &parts[parts.len() - 1];
    // Entries keep the first label (an order that opens the trade is the
    // Entry); exits keep the last (an order that ends flat is the Exit).
    let kind = match first.role {
        FillRole::Entry => first.kind,
        FillRole::Exit => last.kind,
    };
    Action {
        kind,
        role: first.role,
        execution_ids: parts
            .iter()
            .flat_map(|part| part.execution_ids.clone())
            .collect(),
        quantity,
        price: notional / quantity,
        fee: parts.iter().map(|part| part.fee).sum(),
        first_executed_at: first.first_executed_at,
        last_executed_at: last.last_executed_at,
        position_after: last.position_after,
        join_id: Some(join_id.to_owned()),
    }
}

/// Runs of neighbouring actions that look like one order: same side, same
/// price, each within a couple of seconds of the one before.
pub fn suggest_joins(actions: &[Action]) -> Vec<Vec<String>> {
    let mut suggestions = vec![];
    let mut run: Vec<&Action> = vec![];
    let flush = |run: &mut Vec<&Action>, suggestions: &mut Vec<Vec<String>>| {
        if run.len() > 1 {
            suggestions.push(
                run.iter()
                    .flat_map(|action| action.execution_ids.clone())
                    .collect(),
            );
        }
        run.clear();
    };
    for action in actions {
        let continues = run.last().is_some_and(|previous| {
            previous.join_id.is_none()
                && action.join_id.is_none()
                && previous.role == action.role
                && previous.price == action.price
                && action.first_executed_at - previous.last_executed_at <= SUGGESTED_JOIN_WINDOW
        });
        if !continues {
            flush(&mut run, &mut suggestions);
        }
        if action.join_id.is_none() {
            run.push(action);
        } else {
            flush(&mut run, &mut suggestions);
        }
    }
    flush(&mut run, &mut suggestions);
    suggestions
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;
    use crate::service::trade_review::{
        build_episodes,
        types::{ExecutionFill, ExecutionInstrument, ExecutionSide},
    };

    fn at(minute: u32, millis: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 8, 14, 12, minute, 0).unwrap() + Duration::milliseconds(millis)
    }

    fn fill(
        id: &str,
        at: DateTime<Utc>,
        side: ExecutionSide,
        quantity: i64,
        price: i64,
    ) -> ExecutionFill {
        ExecutionFill {
            transaction_id: id.into(),
            instrument: ExecutionInstrument::Equity {
                symbol: "SNAP".into(),
            },
            side,
            price: Decimal::new(price, 0),
            quantity: Decimal::new(quantity, 0),
            fee: Decimal::ONE,
            executed_at: at,
        }
    }

    fn kinds(timeline: &Timeline) -> Vec<ActionKind> {
        timeline.actions.iter().map(|action| action.kind).collect()
    }

    fn join(id: &str, ids: &[&str]) -> ActionJoin {
        ActionJoin {
            id: id.into(),
            execution_ids: ids.iter().map(|id| (*id).to_owned()).collect(),
        }
    }

    #[test]
    fn labels_entry_add_trim_and_exit() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("b1", at(0, 0), Buy, 10, 100),
            fill("b2", at(1, 0), Buy, 5, 102),
            fill("s1", at(2, 0), Sell, 6, 103),
            fill("s2", at(3, 0), Sell, 9, 104),
        ])
        .unwrap();
        let timeline = label_actions(&drafts[0], &[]);
        assert_eq!(
            kinds(&timeline),
            [
                ActionKind::Entry,
                ActionKind::Add,
                ActionKind::Trim,
                ActionKind::Exit
            ]
        );
        assert_eq!(timeline.actions[2].position_after, Decimal::new(9, 0));
    }

    #[test]
    fn a_reversing_fill_exits_one_trade_and_enters_the_next() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("b1", at(0, 0), Buy, 4, 100),
            fill("flip", at(1, 0), Sell, 10, 99),
        ])
        .unwrap();
        let long = label_actions(&drafts[0], &[]);
        let short = label_actions(&drafts[1], &[]);
        assert_eq!(kinds(&long), [ActionKind::Entry, ActionKind::Exit]);
        assert_eq!(long.actions[1].anchor(), "flip");
        assert_eq!(kinds(&short), [ActionKind::Entry]);
        assert_eq!(short.actions[0].anchor(), "flip");
        assert_eq!(short.actions[0].role, FillRole::Entry);
    }

    #[test]
    fn a_short_trade_enters_with_sells_and_exits_with_buys() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("s1", at(0, 0), Sell, 10, 100),
            fill("s2", at(1, 0), Sell, 10, 101),
            fill("b1", at(2, 0), Buy, 5, 99),
            fill("b2", at(3, 0), Buy, 15, 98),
        ])
        .unwrap();
        assert_eq!(
            kinds(&label_actions(&drafts[0], &[])),
            [
                ActionKind::Entry,
                ActionKind::Add,
                ActionKind::Trim,
                ActionKind::Exit
            ]
        );
    }

    #[test]
    fn joined_fills_read_as_one_action() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("b1", at(0, 0), Buy, 7, 10),
            fill("b2", at(0, 1), Buy, 3, 12),
            fill("s1", at(5, 0), Sell, 4, 13),
            fill("s2", at(5, 500), Sell, 6, 13),
        ])
        .unwrap();
        let timeline = label_actions(
            &drafts[0],
            &[join("entry", &["b1", "b2"]), join("exit", &["s2", "s1"])],
        );
        assert!(timeline.broken_joins.is_empty());
        assert_eq!(kinds(&timeline), [ActionKind::Entry, ActionKind::Exit]);
        let entry = &timeline.actions[0];
        assert_eq!(entry.quantity, Decimal::new(10, 0));
        assert_eq!(entry.price, Decimal::new(106, 1));
        assert_eq!(entry.fee, Decimal::new(2, 0));
        assert_eq!(entry.join_id.as_deref(), Some("entry"));
    }

    #[test]
    fn joins_across_sides_or_with_gaps_are_broken() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("b1", at(0, 0), Buy, 10, 10),
            fill("s1", at(1, 0), Sell, 4, 11),
            fill("b2", at(2, 0), Buy, 4, 10),
            fill("s2", at(3, 0), Sell, 10, 12),
        ])
        .unwrap();
        let timeline = label_actions(
            &drafts[0],
            &[
                join("sides", &["b1", "s1"]),
                join("gap", &["b1", "b2"]),
                join("elsewhere", &["s2", "other"]),
            ],
        );
        assert_eq!(timeline.broken_joins, ["sides", "gap", "elsewhere"]);
        assert_eq!(timeline.actions.len(), 4);
        assert!(
            label_actions(&drafts[0], &[join("unrelated", &["x", "y"])])
                .broken_joins
                .is_empty()
        );
    }

    #[test]
    fn suggests_fills_split_from_one_order() {
        use ExecutionSide::{Buy, Sell};
        let drafts = build_episodes([
            fill("b1", at(0, 0), Buy, 7, 10),
            fill("b2", at(0, 1), Buy, 3, 10),
            fill("b3", at(5, 0), Buy, 3, 10),
            fill("s1", at(9, 0), Sell, 13, 11),
        ])
        .unwrap();
        let timeline = label_actions(&drafts[0], &[]);
        assert_eq!(
            suggest_joins(&timeline.actions),
            [vec!["b1".to_owned(), "b2".to_owned()]]
        );
        let joined = label_actions(&drafts[0], &[join("j", &["b1", "b2"])]);
        assert!(suggest_joins(&joined.actions).is_empty());
    }
}
