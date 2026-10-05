# Journal domain

The accepted design is `docs/plans/2026-10-03-feature-journal-first-flow-plan.md`.

Broker executions are provider facts. A trade is a stable account/instrument position with quantity allocations. A journal entry is its persistent public identity; recording it does not require reflection. Trade lifecycle (open, closed, incomplete), outcome (profit, loss, breakeven, unknown), and review state are independent.

`service/trade_review/journal_flow` owns broker-derived records, grouping decisions, context provenance, and review commands. Clients cannot edit broker facts or calculated results. Partial fills may belong to multiple trades; allocated quantities and fees must reconcile exactly. Grouping suggestions require confirmation and are scoped to the user's own corrections.

Missing risk, opening inventory, prices, fees, or event ordering stays unknown. Retrospective context cannot become a pre-entry plan by supplying an earlier claimed timestamp. Unknown or invalid records must not prevent unrelated valid trades from appearing.

All journal writes enforce user and workspace ownership, idempotency, and expected revisions. Workspace locking coordinates source updates, derivation, grouping, and review invalidation. Acknowledgement-unknown clients reconcile a mutation ID before retrying. Retire corrected records with readable history instead of deleting user context.

The original sidebar and neutral shadcn page design remain. The app frame is fixed; content panes use the existing ScrollArea. Web and desktop share the UI and typed contracts. Desktop may queue context drafts offline; grouping confirmation needs a current online preview.

The database schema contract and ordered migrations are authoritative. Follow `.agents/skills/seaorm-schema-change/SKILL.md`. Use a dedicated disposable test database; never point destructive test helpers at a retained development database.
