use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use super::{
    actions::{Action, ActionKind},
    types::{EpisodeDirection, FillRole, TradeEpisodeDraft},
};

/// Exits within this fraction of planned per-unit risk are described as at or
/// near the stop.
const NEAR_STOP_TOLERANCE_R: Decimal = Decimal::from_parts(5, 0, 0, false, 2);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopBoundaryPosition {
    BeforePlannedStop,
    AtOrNearPlannedStop,
    BeyondPlannedStop,
}

/// Where the planned stop for R came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StopSource {
    EntryNote,
    TradeContext,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RUnavailable {
    PositionStillOpen,
    NoPlannedStop,
    StopOnWrongSide,
    FeesUnknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeFlag {
    NoEntryNote,
    EntryBeyondStop,
    ExitBeyondStop,
}

/// What the user wrote for an action at the time.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ActionPlan {
    pub stop: Option<Decimal>,
    pub target: Option<Decimal>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ActionOutcome {
    pub anchor_execution_id: String,
    pub kind: ActionKind,
    pub quantity: Decimal,
    pub price: Decimal,
    pub planned_stop: Option<Decimal>,
    pub planned_target: Option<Decimal>,
    /// For exits: how far the fill landed on the safe side of the planned
    /// stop, in R. Negative means it printed beyond the stop.
    pub distance_from_stop_r: Option<Decimal>,
    pub boundary: Option<StopBoundaryPosition>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewOutcome {
    pub planned_stop: Option<Decimal>,
    pub stop_source: StopSource,
    pub entered_quantity: Decimal,
    pub entry_price: Decimal,
    pub exit_price: Option<Decimal>,
    pub fees: Decimal,
    pub realized_net: Option<Decimal>,
    pub initial_risk: Option<Decimal>,
    pub realized_r: Option<Decimal>,
    pub realized_r_unavailable: Option<RUnavailable>,
    pub actions: Vec<ActionOutcome>,
    pub flags: Vec<OutcomeFlag>,
}

pub struct OutcomeInput<'a> {
    pub draft: &'a TradeEpisodeDraft,
    pub actions: &'a [Action],
    /// The plan for each action, in the same order as `actions`.
    pub plans: &'a [Option<ActionPlan>],
    pub context_stop: Option<Decimal>,
    /// Net result after fees, when fees are known.
    pub realized_net: Option<Decimal>,
}

fn protects(direction: EpisodeDirection, stop: Decimal, entry: Decimal) -> bool {
    stop > Decimal::ZERO
        && match direction {
            EpisodeDirection::Long => stop < entry,
            EpisodeDirection::Short => stop > entry,
        }
}

/// The trade review's numbers: R from the stop the user planned, and how each
/// action compared with what they wrote at the time.
pub fn review_outcome(input: OutcomeInput<'_>) -> ReviewOutcome {
    let OutcomeInput {
        draft,
        actions,
        plans,
        context_stop,
        realized_net,
    } = input;
    let multiplier = draft.instrument.multiplier();
    let sign = match draft.direction {
        EpisodeDirection::Long => Decimal::ONE,
        EpisodeDirection::Short => -Decimal::ONE,
    };
    let entered: Decimal = draft.entry_allocations().map(|fill| fill.quantity).sum();
    let entry_price = if entered > Decimal::ZERO {
        draft
            .entry_allocations()
            .map(|fill| fill.price * fill.quantity)
            .sum::<Decimal>()
            / entered
    } else {
        Decimal::ZERO
    };
    let exited: Decimal = draft.exit_allocations().map(|fill| fill.quantity).sum();
    let exit_price = (exited > Decimal::ZERO).then(|| {
        draft
            .exit_allocations()
            .map(|fill| fill.price * fill.quantity)
            .sum::<Decimal>()
            / exited
    });
    let entry_plan = actions
        .iter()
        .zip(plans)
        .find(|(action, _)| action.kind == ActionKind::Entry)
        .and_then(|(_, plan)| plan.as_ref());
    let (planned_stop, stop_source) = match (entry_plan.and_then(|plan| plan.stop), context_stop) {
        (Some(stop), _) => (Some(stop), StopSource::EntryNote),
        (None, Some(stop)) => (Some(stop), StopSource::TradeContext),
        (None, None) => (None, StopSource::None),
    };
    let valid_stop = planned_stop.filter(|stop| protects(draft.direction, *stop, entry_price));
    let initial_risk = valid_stop.map(|stop| (entry_price - stop).abs() * entered * multiplier);
    let realized_r_unavailable = if draft.closed_at.is_none() {
        Some(RUnavailable::PositionStillOpen)
    } else if planned_stop.is_none() {
        Some(RUnavailable::NoPlannedStop)
    } else if valid_stop.is_none() {
        Some(RUnavailable::StopOnWrongSide)
    } else if realized_net.is_none() {
        Some(RUnavailable::FeesUnknown)
    } else {
        None
    };
    let realized_r = realized_net
        .zip(initial_risk)
        .filter(|(_, risk)| *risk > Decimal::ZERO && realized_r_unavailable.is_none())
        .map(|(net, risk)| net / risk);
    let risk_per_unit = valid_stop.map(|stop| (entry_price - stop).abs());

    let mut flags = vec![];
    if entry_plan.is_none() {
        flags.push(OutcomeFlag::NoEntryNote);
    }
    if planned_stop.is_some() && valid_stop.is_none() {
        flags.push(OutcomeFlag::EntryBeyondStop);
    }
    let outcomes = actions
        .iter()
        .zip(plans)
        .map(|(action, plan)| {
            let measured = valid_stop
                .zip(risk_per_unit)
                .filter(|_| action.role == FillRole::Exit);
            let distance_from_stop_r =
                measured.map(|(stop, per_unit)| (action.price - stop) * sign / per_unit);
            let boundary = distance_from_stop_r.map(|distance| {
                if distance.abs() <= NEAR_STOP_TOLERANCE_R {
                    StopBoundaryPosition::AtOrNearPlannedStop
                } else if distance > Decimal::ZERO {
                    StopBoundaryPosition::BeforePlannedStop
                } else {
                    StopBoundaryPosition::BeyondPlannedStop
                }
            });
            ActionOutcome {
                anchor_execution_id: action.anchor().to_owned(),
                kind: action.kind,
                quantity: action.quantity,
                price: action.price,
                planned_stop: plan.as_ref().and_then(|plan| plan.stop),
                planned_target: plan.as_ref().and_then(|plan| plan.target),
                distance_from_stop_r,
                boundary,
            }
        })
        .collect::<Vec<_>>();
    if outcomes
        .iter()
        .any(|outcome| outcome.boundary == Some(StopBoundaryPosition::BeyondPlannedStop))
    {
        flags.push(OutcomeFlag::ExitBeyondStop);
    }
    ReviewOutcome {
        planned_stop,
        stop_source,
        entered_quantity: entered,
        entry_price,
        exit_price,
        fees: draft.allocations.iter().map(|fill| fill.fee).sum(),
        realized_net,
        initial_risk,
        realized_r,
        realized_r_unavailable,
        actions: outcomes,
        flags,
    }
}

#[cfg(test)]
mod tests {
    use chrono::{TimeZone, Utc};

    use super::*;
    use crate::service::trade_review::{
        actions::label_actions,
        build_episodes,
        types::{ExecutionFill, ExecutionInstrument, ExecutionSide},
    };

    fn fill(
        id: &str,
        minute: u32,
        side: ExecutionSide,
        quantity: i64,
        price: i64,
    ) -> ExecutionFill {
        ExecutionFill {
            transaction_id: id.into(),
            instrument: ExecutionInstrument::Equity {
                symbol: "ACME".into(),
            },
            side,
            price: Decimal::new(price, 0),
            quantity: Decimal::new(quantity, 0),
            fee: Decimal::ONE,
            executed_at: Utc.with_ymd_and_hms(2026, 9, 2, 15, minute, 0).unwrap(),
        }
    }

    fn plan(stop: i64) -> Option<ActionPlan> {
        Some(ActionPlan {
            stop: Some(Decimal::new(stop, 0)),
            target: None,
        })
    }

    #[test]
    fn realized_r_uses_the_entry_note_stop_and_fees() {
        use ExecutionSide::{Buy, Sell};
        let draft = &build_episodes([
            fill("b1", 0, Buy, 10, 100),
            fill("s1", 5, Sell, 5, 110),
            fill("s2", 9, Sell, 5, 96),
        ])
        .unwrap()[0];
        let actions = label_actions(draft, &[]).actions;
        let outcome = review_outcome(OutcomeInput {
            draft,
            actions: &actions,
            plans: &[plan(95), None, None],
            context_stop: Some(Decimal::new(90, 0)),
            realized_net: Some(Decimal::new(27, 0)),
        });
        assert_eq!(outcome.stop_source, StopSource::EntryNote);
        assert_eq!(outcome.initial_risk, Some(Decimal::new(50, 0)));
        assert_eq!(outcome.realized_r, Some(Decimal::new(54, 2)));
        assert_eq!(outcome.realized_r_unavailable, None);
        assert_eq!(
            outcome.actions[1].distance_from_stop_r,
            Some(Decimal::new(3, 0))
        );
        assert_eq!(
            outcome.actions[2].boundary,
            Some(StopBoundaryPosition::BeforePlannedStop)
        );
        assert!(outcome.flags.is_empty());
    }

    #[test]
    fn a_short_exit_beyond_the_stop_is_flagged() {
        use ExecutionSide::{Buy, Sell};
        let draft = &build_episodes([fill("s1", 0, Sell, 10, 100), fill("b1", 5, Buy, 10, 106)])
            .unwrap()[0];
        let actions = label_actions(draft, &[]).actions;
        let outcome = review_outcome(OutcomeInput {
            draft,
            actions: &actions,
            plans: &[plan(104), None],
            context_stop: None,
            realized_net: Some(Decimal::new(-62, 0)),
        });
        assert_eq!(
            outcome.actions[1].boundary,
            Some(StopBoundaryPosition::BeyondPlannedStop)
        );
        assert_eq!(outcome.flags, [OutcomeFlag::ExitBeyondStop]);
    }

    #[test]
    fn r_needs_a_closed_trade_a_protective_stop_and_known_fees() {
        use ExecutionSide::{Buy, Sell};
        let open = &build_episodes([fill("b1", 0, Buy, 10, 100)]).unwrap()[0];
        let open_actions = label_actions(open, &[]).actions;
        let result = |draft, actions: &[Action], plans: &[Option<ActionPlan>], context, net| {
            review_outcome(OutcomeInput {
                draft,
                actions,
                plans,
                context_stop: context,
                realized_net: net,
            })
        };
        assert_eq!(
            result(open, &open_actions, &[plan(95)], None, None).realized_r_unavailable,
            Some(RUnavailable::PositionStillOpen)
        );
        let closed = &build_episodes([fill("b1", 0, Buy, 10, 100), fill("s1", 5, Sell, 10, 105)])
            .unwrap()[0];
        let actions = label_actions(closed, &[]).actions;
        let missing = result(
            closed,
            &actions,
            &[None, None],
            None,
            Some(Decimal::new(48, 0)),
        );
        assert_eq!(
            missing.realized_r_unavailable,
            Some(RUnavailable::NoPlannedStop)
        );
        assert_eq!(missing.flags, [OutcomeFlag::NoEntryNote]);
        let fallback = result(
            closed,
            &actions,
            &[None, None],
            Some(Decimal::new(98, 0)),
            Some(Decimal::new(48, 0)),
        );
        assert_eq!(fallback.stop_source, StopSource::TradeContext);
        assert_eq!(fallback.realized_r, Some(Decimal::new(24, 1)));
        let wrong_side = result(
            closed,
            &actions,
            &[plan(101), None],
            None,
            Some(Decimal::new(48, 0)),
        );
        assert_eq!(
            wrong_side.realized_r_unavailable,
            Some(RUnavailable::StopOnWrongSide)
        );
        assert!(wrong_side.flags.contains(&OutcomeFlag::EntryBeyondStop));
        let no_fees = result(closed, &actions, &[plan(95), None], None, None);
        assert_eq!(
            no_fees.realized_r_unavailable,
            Some(RUnavailable::FeesUnknown)
        );
    }
}
