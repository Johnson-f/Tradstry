use crate::service::agents::tools::ToolEnvelope;
use crate::service::agents::{AgentClaim, AnswerBlock, AnswerDraft};
use crate::service::db::schema::tables::journal_table::JournalEntry;
use crate::service::trading_performance::TradingPerformance;

pub fn performance_answer(envelope: &ToolEnvelope<TradingPerformance>) -> AnswerDraft {
    let Some(value) = &envelope.data else {
        return unavailable_answer("Trading performance is unavailable.");
    };
    let evidence_ids = envelope
        .evidence
        .iter()
        .map(|item| item.evidence_id.clone())
        .collect::<Vec<_>>();
    AnswerDraft {
        blocks: vec![
            AnswerBlock::Metric {
                label: "Net P&L".into(),
                value: format_money(value.total_realized_pnl),
            },
            AnswerBlock::Metric {
                label: "Win rate".into(),
                value: format!("{:.2}%", value.win_rate),
            },
            AnswerBlock::Metric {
                label: "Closed trades".into(),
                value: value.closed_trade_count.to_string(),
            },
        ],
        claims: vec![AgentClaim {
            claim_id: "performance-summary".into(),
            text: format!(
                "Realized P&L is {} across {} closed trades with a {:.2}% win rate.",
                format_money(value.total_realized_pnl),
                value.closed_trade_count,
                value.win_rate
            ),
            evidence_ids,
        }],
    }
}

pub fn journal_answer(envelope: &ToolEnvelope<Vec<JournalEntry>>) -> AnswerDraft {
    let Some(values) = &envelope.data else {
        return unavailable_answer("Journal records are unavailable.");
    };
    if values.is_empty() {
        return AnswerDraft {
            blocks: vec![AnswerBlock::Paragraph {
                text: "No matching trades were found.".into(),
            }],
            claims: Vec::new(),
        };
    }
    let items = values
        .iter()
        .map(|entry| {
            format!(
                "{} · {} · closed {} · {:.2}% P&L",
                entry.symbol, entry.trade_type, entry.close_date, entry.total_pl
            )
        })
        .collect::<Vec<_>>();
    let claims = values
        .iter()
        .zip(envelope.evidence.iter())
        .enumerate()
        .map(|(index, (entry, evidence))| AgentClaim {
            claim_id: format!("trade-{}", index + 1),
            text: format!(
                "The {} {} trade closed {} with {:.2}% P&L.",
                entry.symbol, entry.trade_type, entry.close_date, entry.total_pl
            ),
            evidence_ids: vec![evidence.evidence_id.clone()],
        })
        .collect();
    AnswerDraft {
        blocks: vec![AnswerBlock::List {
            title: Some("Selected trades".into()),
            items,
        }],
        claims,
    }
}

fn unavailable_answer(message: &str) -> AnswerDraft {
    AnswerDraft {
        blocks: vec![AnswerBlock::Warning {
            text: message.into(),
        }],
        claims: Vec::new(),
    }
}

fn format_money(value: f64) -> String {
    if value.is_finite() {
        format!(
            "{}{:.2}",
            if value >= 0.0 { "+$" } else { "-$" },
            value.abs()
        )
    } else {
        "Unavailable".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::agents::{AgentEvidenceRef, tools::ToolScopeApplied};

    #[test]
    fn performance_answer_preserves_unavailable_numbers() {
        let envelope = ToolEnvelope {
            ok: true,
            data: Some(TradingPerformance {
                total_realized_pnl: f64::NAN,
                ..empty_performance()
            }),
            scope: ToolScopeApplied::default(),
            evidence: vec![AgentEvidenceRef {
                evidence_id: "e1".into(),
                source_type: "calculation".into(),
                source_id: "s".into(),
                source_version: "v".into(),
            }],
            warnings: Vec::new(),
            unavailable: None,
        };
        let answer = performance_answer(&envelope);
        assert!(matches!(
            &answer.blocks[0],
            AnswerBlock::Metric { value, .. } if value == "Unavailable"
        ));
    }

    fn empty_performance() -> TradingPerformance {
        TradingPerformance {
            total_realized_pnl: 0.0,
            gross_profit: 0.0,
            gross_loss: 0.0,
            average_win: 0.0,
            average_loss: 0.0,
            profit_factor: None,
            win_rate: 0.0,
            closed_trade_count: 0,
            winning_trade_count: 0,
            breakeven_trade_count: 0,
            losing_trade_count: 0,
            average_realized_r: None,
            risk_defined_trade_count: 0,
            open_position_count: 0,
            needs_review_count: 0,
            peak_realized_pnl: 0.0,
            current_drawdown: 0.0,
            max_drawdown: 0.0,
            current_streak: 0,
            longest_loss_streak: 0,
            best_symbol: None,
            worst_symbol: None,
            best_day: None,
            worst_day: None,
            points: Vec::new(),
        }
    }
}
