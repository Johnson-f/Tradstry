# Behavior insights: discovery, comparison, and follow-up

Date: 2026-08-30
Repository baseline: `65a8b3c`
Status: product direction and visual layout approved; this technical specification awaits final review. No production implementation has started.

## 1. Agreed product

Tradstry will discover patterns from completed trades without requiring journaling. It will support day and swing trading, search combinations of factors rather than only predefined comparisons, compare the biggest win and loss, and remember whether findings hold up in later trades.

Calculations discover and evaluate patterns. AI explains those results, brings in available journal context, and answers follow-up questions. AI cannot calculate authoritative totals, invent missing context, award evidence labels, or claim an observed association proves a cause.

Early signals remain available, clearly separated from supported findings. Each finding has two independent readouts: the strength of its evidence and the result of follow-up. The approved layout has Insights, Trade comparison, and Tracking views within Behavior; existing discipline information remains accessible below them.

Approved interactive reference: [Behavior preview](assets/2026-08-30-behavior-insights.html). Open the HTML in a browser to explore it without a server. All records, numerical examples, and labels in that reference are illustrative, not validated calculations. In particular, the sample counts are not promises about when production evidence becomes sufficient.

### Scope and boundaries

- Include timing, weekday, holding period, position size, instrument, direction, trade sequence, and combinations of those factors. Add setups, recorded plans, mistakes, conviction, and market context when the corresponding records exist.
- Include single-trade comparison, cohort comparisons, supporting trades, original-versus-later evidence, and AI follow-up in the shipped feature.
- “Everything” means broad discovery across usable data, not inventing unavailable data or searching an infinite space in a page request. Search proceeds in bounded, resumable work units; incomplete coverage is visible.
- The initial instrument adapters cover the equity and option types the current trade engine supports. Unsupported instruments remain visible in coverage diagnostics and must not be silently treated as equities.
- No automatic order placement, strategy changes, causal claims, guaranteed returns, or new external market-data subscriptions.
- Discovery and follow-up run automatically after relevant data changes. No Codex automation or machine-local scheduler is part of the product.

## 2. Existing foundations and chosen approach

Current Behavior analytics use journal entries, so importing trades alone does not populate that analysis. The existing day/session breakdown uses closing timestamps and the stored offset. It must not simply be relabeled as an entry-time finding.

The brokerage performance path already builds completed trade groups from fills, excludes incomplete/ambiguous groups, calculates realized money amounts with contract multipliers and recorded fees, and exposes a performance tool to the existing AI runtime. Journal publication records provide explicit links back to those trade groups.

Relevant source locations, relative to the repository root:

| Area | Existing entry points |
| --- | --- |
| Analytics UI and payload | `packages/app-ui/src/components/analytics/{analytics,behavioral,breakdowns}.tsx`; `packages/app-ui/src/lib/{types,service}/analytics.ts`; `packages/app-ui/src/hooks/analytics.ts` |
| Broker-derived performance | `backend/src/service/trading_performance.rs`; `backend/src/service/read_service/analytics.rs` |
| Grouping and publication | `backend/src/service/trade_review/{episode,types}.rs`; `backend/src/service/db/schema/tables/trade_review_table.rs` |
| Journal links | `journal_brokerage_links`, `trade_review_publications`, `brokerage_episode_publications` |
| Existing AI | `backend/src/service/agents/tools/adapters/performance.rs`; `backend/src/service/agents/specialists/performance.rs`; existing evidence persistence |
| Durable notifications | `backend/src/service/notifications/{outbox,outbox_worker}.rs` |
| Desktop integration | `apps/desktop/electron/sync/remote-analytics.ts` and the shared app UI |

The considered alternatives were calculations and sentence templates only, AI-led exploration, and a combined system. The combined system is selected: reproducible numeric discovery and evaluation, with AI constrained to its recorded evidence. This uses the existing agent runtime rather than creating another agent platform.

## 3. One trade, one source of financial truth

Introduce a shared, read-only trade-facts adapter. Reuse the existing broker eligibility and realized-P/L functions rather than duplicating their arithmetic. Extract shared helpers only with parity tests against the existing performance path.

For imported trading, a fact represents a complete position lifecycle, not an individual buy, sell, partial exit, or journal entry. Its stable identity contains the source type and source ID; its revision includes the grouping fingerprint and relevant source hashes.

Attach linked journal entries, confirmed plans, tags, and notes to that fact. Never add the linked journal entry as another financial outcome. Legacy transaction-level links that cannot be mapped unambiguously are a coverage warning, not permission to count both records.

Standalone manual journal trades are supported through a separate adapter. They must be unlinked, completed, and internally valid. Expose `brokerage`, `manual`, and `all` source filters. Default to brokerage for a connected workspace and manual for a workspace without a brokerage. When combined, label the source mix and exclude records with unresolved linkage; do not guess duplicates from matching ticker, date, and amount.

Each fact includes:

- User/workspace/source identity, source revision, and source availability timestamps.
- Instrument class and identity, direction, currency, open/close timestamps, and timestamp precision.
- Exact realized P/L, recorded fee treatment, entry notional, holding duration, and optional confirmed initial risk.
- Day/swing/unknown classification; entry-time and weekday features; relevant prior closed-trade outcomes.
- Optional journal/plan fields, their recorded timestamps, and whether each field was known at entry or recorded retrospectively.
- Explicit inclusion/exclusion reasons and links to the original trade and review.

Use decimal arithmetic for financial calculations; convert validated finite values only at the statistical boundary. Journal percentage fields are never summed as dollars. Show realized P/L after recorded fees, not an unsupported claim that every possible cost is included. Do not sum different currencies without a verified conversion basis; exclude and explain unresolved currency cases.

Open positions, missing execution timestamps, ambiguous grouping, unknown initial risk, and absent journal context are separate quality conditions. Exclude a record only from the comparisons requiring the missing fact. For example, missing initial risk blocks risk-normalized comparisons but does not remove a valid dollar outcome.

## 4. Scope, timing, and comparable groups

### Time and style

- Scope every request to one authorized workspace, a source filter, and a resolved date window.
- Use the existing close-date window convention to select completed trades. Derive entry-time features from the opening execution, not the close.
- Use an explicit analysis timezone, initially `America/New_York` to match the current US-market analytics. Display it in timing views and freeze it into each definition. Changing it creates a new analysis definition; it cannot mutate historical findings.
- Same local opening and closing date is a day trade; an overnight completed position is a swing trade. Records lacking sufficient date precision are unknown, not guessed.
- For current US-market timing comparisons, use premarket before 09:30, morning 09:30–11:59, afternoon 12:00–15:59, and after-hours from 16:00. Non-US session assumptions are not inferred from the ticker alone.
- Swing holding bands use elapsed duration: under 2 days, 2–5 days, over 5–10 days, and over 10 days. Display the elapsed-day definition so weekends do not silently change meaning.

### Comparison rules

Day and swing groups are analyzed separately even when both are displayed. Keep instrument class, currency, and any non-investigated direction differences controlled. Position-size analysis uses entry notional within comparable instrument/direction groups, not raw share/contract counts. Risk as a percentage of account equity is available only when valid historical equity and initial risk exist.

Use normalized return alongside dollar profit so a difference in capital alone is not presented as a trading edge. Define return on entry notional explicitly as realized P/L divided by the sum of entry-fill notional. This is not return on peak capital or margin. If the denominator is unavailable or invalid, show dollars but do not silently substitute a different return measure.

For sequence features, “after a loss” means the last eligible trade already closed before this trade opened. Do not use the later outcome of an overlapping position. A sequence is not proof of revenge trading.

Journal context is optional. Untagged is not clean, unplanned, low-conviction, or free of mistakes. Unknown values are excluded from the particular context comparison and their count is visible. Holding duration and retrospective notes are descriptive post-trade features, not information that was necessarily available at entry.

## 5. Discovery and evidence policy

The following is the selected technical design for review. Its numeric settings are versioned engineering defaults, not universal sample-size guarantees. Production must pass the calibration gates below before enabling Supported labels.

### Search

Maintain a registry of typed factors, valid buckets, provenance requirements, incompatible combinations, and allowed outcomes. It is extensible without a new UI or database schema for each factor.

Search individual factors and valid conjunctions incrementally. Prune contradictory groups, insufficient groups, and identical membership sets. Rank exploratory candidates by effect size, coverage, stability, and simplicity. The same direction, metric, group predicates, comparator, matching rules, and cutoffs produce the same definition hash.

There is no user-facing restriction to a fixed list of hand-authored insights. Work batches have bounded CPU/memory budgets, checkpoint the search frontier, and resume. Return `searching`, `partial`, or `complete` coverage; never imply that a bounded first batch examined every combination.

Discovery uses an older chronological sample. Freeze candidate definitions and learned size cutoffs before looking at a separate, later historical validation sample. Start with a 60/40 split of complete time blocks, then purge positions crossing the boundary and apply an embargo of one block. If a usable independent validation sample cannot be formed, findings remain early.

Historical validation is a one-time bootstrap for a workspace's initial automatic discovery family. Keep a validation-use ledger. Later definitions, user-selected alternative scopes, or candidates chosen after seeing validation results must use observations that occur after their definitions are frozen; do not recycle the already-examined historical check. The inference budget alone does not repair reused or contaminated test data. Changing a page filter can show descriptive comparisons immediately, but cannot manufacture a newly Supported historical claim.

The production implementation must use time-block splits rather than a random per-trade split. Time-ordered validation avoids training on future information and evaluating on the past; a gap can separate the sets. [Time-series validation reference](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)

### Evidence evaluation

An early signal requires at least five trades and three distinct entry dates in both groups. Smaller groups remain available as descriptive breakdowns with “Not enough data”; they are not promoted into a pattern claim.

Support requires all of the following, not just a trade-count cutoff:

1. At least 30 eligible trades in each validation group and at least 12 usable dependence blocks in the validation sample.
2. Valid comparison overlap: mandatory strata are respected and no claim of adjustment is made where comparable trades do not exist.
3. A material effect in the registered metric. Initial policy: at least five percentage points for win rate; at least 0.2 discovery-sample robust standard deviations for normalized return; at least 0.2 R for a risk-normalized claim.
4. The claimed direction survives dropping the single largest winning trade, the single largest losing trade, and the most influential time block, each checked separately. Keep genuine trades in the reported totals; these are sensitivity checks.
5. A later historical check supports the frozen claim after correction for the whole tested family. Every tested direction, metric, and comparator counts, including those not displayed.

The selected inference approach is a null-centered moving-block bootstrap of studentized, stratum-adjusted contrasts, with Holm–Bonferroni family correction. Report simultaneous Bonferroni-adjusted uncertainty bounds rather than treating a marginal interval as family-adjusted. Freeze block length using discovery data: begin with calendar weeks and widen swing blocks to exceed the longest discovery holding duration. If longer overlapping validation positions undermine that dependence model, report insufficient evidence instead of silently changing the test after seeing its result. Do not treat fills from the same position or a cluster of trades on one volatile day as independent observations.

Freeze the claimed direction and orient effects to that direction before testing the minimum material effect. A loss pattern and a benefit pattern therefore use the same support rules. Register both strengthening and weakening tests in the inference family. Existing win-rate semantics exclude breakevens from the decisive denominator; expose wins/losses/breakevens explicitly and show no rate when there are no decisive trades. Return comparisons include valid breakeven trades.

Resampling assumptions must be recorded. These checks are conditional evidence screens for dependent market data, not a guarantee that all dependence or confounding has been removed. A basic independent-trade t-test is not an acceptable silent fallback. Maintain reference fixtures against an independent statistical implementation and null simulations with correlated days, overlapping swing positions, heavy tails, and missing context. Short date ranges and sparse swing histories will often have only early signals; show the failed coverage gate and offer a wider range without lowering the standard.

At most 64 hypotheses enter a validation family at a time, selected using discovery data only. Other explored candidates remain accessible as early signals and can be admitted to later families using fresh validation data. This limits inference work, not discovery breadth. Never choose which candidates to validate based on that validation sample’s results.

Record family membership before evaluation. Use a persistent workspace family ordinal `k >= 1` and allocate nominal error budget `0.05 / (k * (k + 1))`. Half goes to the one historical validation look; the other half is reserved for later looks. The budget does not reset on retries, filter changes, user refreshes, or software upgrades. This conservative budget is a policy input, not a displayed “probability the pattern is true.”

Multiple comparisons need joint safeguards; post-hoc selection cannot inherit the confidence claims of a single prespecified comparison. [NIST guidance](https://www.itl.nist.gov/div898/handbook/prc/section4/prc47.htm) Holm correction is selected because it accommodates dependent comparisons when the individual tests are valid. [Sequential rejection reference](https://arxiv.org/abs/1211.3313)

Use deterministic seeds, cache block summaries, and evaluate resampling in bounded chunks. Start at 10,000 repetitions and allow continuation to 1,000,000 when needed to resolve a corrected decision. Never return a zero Monte Carlo p-value. If the compute cap cannot resolve the allocated threshold, return `precision_insufficient` and keep the finding early. Do not increase support by silently relaxing the family correction.

### Labels

`evidenceLevel` is `early_signal` or `supported`. Supported refers to the recorded evaluation and policy version. The UI exposes group sizes, time blocks, effect size, comparison metric, sensitivity results, exclusions, validation dates, and the exact reason for the label.

`followUpState` is separately `awaiting_new_trades`, `holding_up`, `inconclusive`, or `weakened`. The mockup’s three main labels remain; “inconclusive” handles enough observations with an uncertain result, rather than falsely declaring either success or failure.

Use an independent lifecycle flag for `active`, `data_changed`, `superseded`, and `archived`. A data correction is not a newly failed trading pattern.

## 6. Remembering and testing findings

Saving a finding freezes its definition, discovery cutoff, historical validation membership, source revisions, timezone, policy version, inference-family allocation, and minimum meaningful effect. `discoveredAt` is immutable.

Only a completed trade opened strictly after the finding’s effective validation start can enter prospective follow-up. A trade already open at discovery is not fresh evidence. Importing an old trade later is not fresh evidence. A corrected trade retains its event-time identity and does not become a new observation.

Update descriptive counts after imports, but do not repeatedly test at the ordinary single-test threshold. Evaluate support at predeclared completed-block checkpoints: 12, 24, 48, and so on. For prospective look `j >= 1`, use `familyAlpha / (2 * j * (j + 1))`, then correct across the frozen family. Persist look IDs and spent budgets before publication; retries cannot create a new look.

Repeated inspection needs special treatment; ordinary fixed-sample confidence checks do not automatically remain valid when monitored continuously. The chosen fixed-checkpoint spending policy avoids introducing an unreviewed continuous-monitoring algorithm. [Sequential inference reference](https://arxiv.org/abs/1810.08240)

At an eligible checkpoint:

- **Holding up:** the new-data interval supports the original direction and minimum material effect, with the same quality and sensitivity gates.
- **Weakened:** the new-data interval rules out the original minimum material effect, including a reversal.
- **Inconclusive:** neither statement is supported. Loss of statistical significance alone does not prove the pattern disappeared.
- **Waiting:** insufficient eligible trades/blocks or no new trades. Calendar time alone does not improve evidence.

Keep both cumulative follow-up and the fixed evaluation checkpoints visible. Do not cherry-pick a favorable recent window. Discovery-range controls do not rewrite follow-up history; the Tracking view clearly separates the original range from “new trades since discovery.”

New fills, corrections, deleted journal context, plan changes, or regrouped positions mark affected evidence `data_changed`. Preserve the old aggregate evaluation as superseded, deny drill-down to deleted/inaccessible records, and recompute a revision. A revised definition or materially corrected baseline gets a new effective validation start and must wait for genuinely later evidence; it cannot silently inherit Supported from the obsolete version. Permanent account/workspace deletion removes the corresponding insight records and evidence.

## 7. Processing and persistence

Add a `behavior_insights` service with clear modules: trade-facts adapter, feature extraction, candidate search, evidence evaluation, persistence/queue, API projection, and AI evidence adapter. Pure math modules do not perform database, network, or model calls.

Relevant producers mark a workspace dirty durably: broker imports/rebuilds, grouping changes, standalone manual-trade mutations, journal publication/edit/deletion, plan confirmation, and tag changes. Commit the dirty marker with the source write where possible. Where an existing rebuild follows a committed import, retain the dirty marker until rebuilding and analysis both succeed. A periodic reconciliation scan repairs missed invalidation.

The worker takes a consistent input snapshot, evaluates outside the transaction, and publishes results atomically. Each workspace has at most one active lease. Start with one compute worker and bounded batches; deployment can increase worker count through configuration. Do not run expensive discovery inside a GraphQL request or create a model call per candidate.

If source revisions change during computation, the result may be retained as an older snapshot but cannot become the current fresh result. Requeue the latest revision. Repeated failures retain the last successful snapshot with a stale/error indicator; they never return fake zero results.

Proposed persistence responsibilities:

| Record | Responsibility and identity |
| --- | --- |
| `behavior_insight_state` | One row per user/workspace: source revision, dirty/retry state, lease, monotonic inference-family ordinal, historical-validation consumption marker |
| `behavior_analysis_runs` | Scope hash, input revision, source/time/style filters, policy, search frontier/progress, coverage, comparison summary, and status |
| `behavior_insights` | Stable definition hash/version, frozen rules, discovery/validation boundaries and membership ledger, family allocation, evidence/follow-up/lifecycle labels |
| `behavior_insight_evaluations` | Append-only evaluation results: kind, look number, dataset hash, algorithm/seed/budget, metrics, intervals, sensitivity results, reason codes |
| `behavior_insight_evidence` | Evaluation membership, canonical source IDs/revisions, group/role, minimal numeric features, and journal/plan references |

Enforce tenant-scoped uniqueness and foreign keys. An evaluation is unique by finding version, evaluation kind/look, input hash, and policy version. A run is reusable only for the exact authorized scope, source revision, and policy. Redis may accelerate reads but is not the owner of findings or follow-up history.

Do not snapshot full journal bodies into these tables. Reuse existing authorized knowledge/evidence retrieval when the user asks AI. Export the new structured records with user exports and add them to purge/workspace deletion paths. Apply the repository’s SeaORM schema-change workflow during implementation, including fresh-bootstrap and upgraded-database parity; this design does not select migration numbers in advance.

## 8. API and AI contracts

Add dedicated Behavior operations instead of silently changing the meaning of every existing analytics payload:

- `requestBehaviorAnalysis(workspaceId, scope)` returns/reuses a run ID and records bounded work.
- `behaviorInsights(workspaceId, scope, filters, cursor)` returns findings, progress/freshness, quality counts, and source coverage.
- `behaviorInsight(workspaceId, insightId)` returns the frozen definition and evaluation history.
- `behaviorInsightTrades(workspaceId, insightId, evaluationId, group, cursor)` returns authorized evidence pages, including exclusions where relevant.
- `behaviorTradeComparison(workspaceId, scope)` returns the positive and negative extremes with financial units, trade facts, and source links. If there are no wins or no losses, return that side as absent; do not relabel a profitable trade as the biggest loss.
- `archiveBehaviorInsight` and `restoreBehaviorInsight` affect visibility only; they do not erase inference history or replenish a testing budget.

Every result includes explicit scope, currency, timezone, source revision, evaluated-at time, evidence/lifecycle state, and exclusion reasons. Membership links are checked against the same user/workspace at read time. Pagination is stable and does not expand the account scope.

Register a read-only Behavior evidence tool in the current agent runtime. “Ask Tradstry AI” opens the existing assistant with the insight ID and evaluation ID, not a pasted screenshot or unauthenticated arbitrary trade IDs. Retrieve aggregate evidence first and load a bounded set of linked records only when needed.

Answers distinguish recorded facts, user-written explanations, and hypotheses. Numeric claims cite a persisted evaluation; note claims cite authorized source records. Treat notes as untrusted data, not instructions. Inference status comes from the service and cannot be changed by the model. If source data changed, say so and avoid explaining a stale label as current.

AI may propose a setup/mistake tag through the existing reviewed-action flow, but cannot silently add inferred labels to the numerical evidence population. Comparisons based on post-trade annotations are explicitly retrospective; follow-up checks continuation of that association, not a demonstrated ability to predict a trade before entry.

Use deterministic summaries as the always-available card text. Generate richer explanations on demand, with a cache keyed by user/workspace, finding version, evaluation ID, source-context revision, and prompt/model policy. Invalidate explanations when their evidence changes. AI failure leaves the numeric UI fully usable.

## 9. Approved interface and product behavior

Reuse the installed shadcn/ui primitives and Tradstry tokens, not the standalone mockup’s custom DOM/CSS. Use Tabs, Card, Badge, Select, Switch/Checkbox, Dialog/Sheet, Table, Button, Skeleton, and accessible empty/error treatments.

Refactor the Analytics page's loading/empty gates so Behavior can load from the new service independently. The current page returns its journal-empty screen before rendering tabs when `advancedAnalytics.tradeCount === 0`; that gate must not hide imported-trade insights from someone with no journal entries. Other analytics tabs retain their own existing data contract and empty states.

- **Insights:** supported findings first; a separate, visible Early signals section with an explicit reveal control; day/swing/source filters; quality and coverage counts; stable paging for additional findings. Show search progress without moving focus or constantly reordering cards.
- **Trade comparison:** actual biggest positive and negative outcomes within the selected scope. All-style comparison uses the true global extremes, not the day-trade pair by default. Display style differences and missing context rather than implying the two trades were comparable experiments.
- **Tracking:** original evidence, fixed later checkpoints, status changes, and why a state changed. No fabricated percentage “confidence.”
- **Insight detail:** Evidence, Follow-up, Trades, and Ask AI. Supporting trades must be the actual membership behind the selected evaluation, not a conveniently chosen sample presented as the full basis.
- Preserve the existing Behavior/Discipline content. New calculations must not reinterpret unreviewed trades as clean or mistake-free.
- Entry-based timing, timezone, metric units, sample/validation counts, and recorded context coverage are visible where they affect interpretation.

Loading uses skeletons without inventing results. An empty account, no eligible completed trades, sparse data, missing notes, ambiguous grouping, stale analysis, unavailable AI, and a deleted finding have distinct messages and useful next actions. Stale results remain labeled with their last evaluation time. Supported/Weakened status changes do not happen merely because a filter changed.

Default notifications stay inside Tradstry and respect existing preferences. Coalesce meaningful promotions, weakening, and invalidation into at most one workspace summary per day through the existing notification outbox. Do not notify for every early candidate or every imported trade. Email/push delivery is not enabled implicitly.

The shared UI serves web and desktop. The new discovery engine remains server-authoritative. Desktop can display its last authorized cached snapshot with an offline/as-of label; it cannot manufacture fresh evidence or run AI offline. Cache keys include user and workspace and are cleared on logout/account changes. Do not copy the obsolete Tauri plan into the current Electron architecture.

## 10. Verification and release gates

Required before enabling the full feature:

1. **Financial parity:** known fills, fees, option multipliers, partial exits, short trades, reversals, manual groups, and missing/invalid currency. Broker-only insight totals must match the existing performance path for the same eligible population.
2. **Identity:** imported trade plus published journal counts once; old and current publication links; duplicate import; regroup/rebuild; unresolved linkage; standalone manual entries.
3. **Time:** entry versus close, ET midnight, daylight-saving transitions, weekends, overnight positions, missing precision, exact session boundaries, and range endpoints.
4. **No hindsight:** frozen size thresholds; no validation rows used in feature selection; overlap purge/embargo; retrospective tags clearly marked; old backfill and trades already open at discovery excluded from prospective follow-up.
5. **Inference correctness:** reference results for the registered metrics, strata, resampling, Holm adjustment, family budgets, and checkpoint spending. No zero p-values, unexplained nulls, invalid numeric conversions, or favorable fallback when precision is insufficient.
6. **Calibration:** at least 10,000 seeded null histories per supported test configuration, with clustered trades, heavy tails, changing regimes, overlapping holds, and missing context. Gate the measured false-promotion rate against the declared policy using a binomial uncertainty bound. Also test predeclared strong-effect positive controls and report detection power; an implementation that never promotes cannot pass by having zero false positives. Keep tuning and final evaluation seeds separate. Failure blocks Supported labels, not just a test report.
7. **Adversarial search:** many null factors, correlated duplicate factors, user-defined tags, outliers, metric/direction switching, repeated requests, and repeated future checks. Tested-family membership and spent budgets must remain auditable.
8. **Durability:** crash before/after source commit, expired lease, duplicate jobs, input changing during evaluation, retry, stale result publication, and notification deduplication.
9. **Authorization/privacy:** every query, evidence page, cached explanation, subscription, archived record, export, and deletion path is tenant-scoped. Deleted notes cannot be quoted from stale caches.
10. **UI:** real end-to-end fixtures for both styles, mixed styles, no win/loss, early-only data, all filters, keyboard/dialog focus, evidence paging, status history, stale/offline states, mobile at 390px, and light/dark themes.

Release uses shadow evaluation first, then a feature flag with observable queue age, source coverage, exclusion reasons, compute cost, label distribution, invalidation rates, and explanation failures. Benchmark the actual workload before enabling automatic broad discovery for everyone. The rollout may be staged operationally; the agreed product scope is not reduced to fixed comparison cards.

## 11. Planning handoff

After this specification is reviewed, the implementation plan should order work around the shared trade facts, persisted definitions/evaluations, calibrated discovery and follow-up, then UI/AI integration. Each unit needs an independently reviewable result and explicit verification. Production support labels cannot precede the inference calibration and source-identity gates.

Approval of the visual mockup is already recorded. Final review of this document is the next step in the requested brainstorming workflow; implementation planning and production edits follow that approval.
