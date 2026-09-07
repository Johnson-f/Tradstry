# Database analytics engine and AI integration

Date: 2026-09-07

Repository baseline: `757eeee`

Status: product direction and architectural sections approved in conversation; this written specification awaits user review. No implementation is authorized by this document alone.

## 1. Product agreement

Tradstry will have one deterministic analytics engine that reads its PostgreSQL database and executes structured analysis requests. AI translates natural-language questions into those requests and explains returned results. Existing analytics pages and dashboard cards use the same engine.

The engine is a general calculation system, not a dispatch table of hardcoded metric functions. Users and AI can combine available operations into new formulas and analyses without a backend deployment. Built-in metrics, saved custom metrics, and one-time questions use the same request language.

The first release includes:

- A consistent analytical representation of broker and manually entered trades, with explicit deduplication and optional journal/plan context.
- A versioned, typed request language compiled into parameterized PostgreSQL queries.
- Filtering, related-data queries, formulas, grouping, comparisons, ordered calculations, and multistage analyses.
- Integration with the existing AI runtime, GraphQL API, MCP analytics tools, shared web UI, and desktop path.
- Migration of existing trading analytics to engine definitions, including the dashboard, calendar, advanced analytics, and associated playbook/principle performance reads.
- User-owned saved definitions, immutable definition revisions, and dashboard cards that run those definitions.
- Result provenance, coverage, understandable errors, and bounded execution.

Product examples include “show profitable trades with their R numbers,” “average realized R by strategy last month,” and “compare strategies for trades opened after two consecutive losses.” These are examples of composition, not the complete set of supported questions.

“Everything valid” means any well-typed request expressible with the installed language and authorized dataset catalog. A new metric or combination requires a definition, not new engine code. A new fundamental operator or new source mapping may require extending the engine or catalog. Arbitrary executable SQL, scripts, unavailable data, and unlimited computation are not part of this promise.

This release provides requested calculations. The separate automatic pattern discovery and statistical follow-up feature described in `2026-08-30-behavior-insights-design.md` can later consume this engine; its autonomous search, evidence labels, and inference policies are not implicitly included here. Countly product-event reporting remains a separate subsystem.

## 2. Current implementation and required changes

The current checkout has two financial paths:

| Surface | Current source and execution |
| --- | --- |
| `tradingPerformance`, `calendarAnalytics` | Stored broker episodes and fills, calculated in Rust by `service/trading_performance.rs` |
| `journalAnalytics` | SQL aggregates over `journal_entries` |
| `advancedAnalytics` | Journal rows plus tags, violations, and workspace value, calculated in Rust |
| Internal AI `trading_performance` tool | Shared episode performance service |
| MCP `calculate_analytics`, `advanced_analytics` | Shared journal analytics services |
| Desktop analytics commands | GraphQL requests through `RemoteAnalytics` |

Current journal money is `position_size * entry_price * total_pl / 100 * contract_multiplier`; `total_pl` is a percentage. Broker performance subtracts recorded execution fees. Publishing a broker review creates a journal entry using weighted prices, which does not preserve those fees as journal P&L. The pipelines can therefore disagree on both membership and amounts.

Other verified inconsistencies that affect migration:

- Advanced R includes the contract multiplier in profit but omits it from the risk denominator.
- Advanced session/day grouping uses UTC-formatted journal timestamps, while broker calendar/performance use New York dates.
- Advanced drawdown duration accumulates percentage returns while drawdown amount uses dollars.
- The journal field `risk_reward` is derived from the actual exit price; it is not evidence of a planned reward target.
- Plan tranche `target_price` becomes `PlanTranche.entry_price` in `plan_to_snapshot`; it must not be interpreted as a take-profit price.
- The current Redis version only tracks journal/workspace timestamps. That is insufficient for the new source graph, and workspace brokerage value is now read from the separate brokerage connection record.
- Episode rebuilding is currently recoverable, best-effort work after transaction sync. An empty episode set is not sufficient evidence that an existing nonempty set is current.

The backend README still describes an equity replay service that is absent from the active service modules. Stored equity-history entities do not make that an active or authoritative input. The engine's realized-P&L curve must be labeled accordingly.

Relevant repository boundaries:

- `backend/src/service/trade_review/{episode,types,calculation}.rs`: execution grouping and plan-review semantics.
- `backend/src/service/db/schema/tables/{trade_review_table,manual_execution_claim_table,journal_table,brokerage_table,workspaces_table,tags_table,trading_principle_table}.rs`: source persistence and relationships.
- `backend/src/service/read_service/{analytics,analytics_advanced}.rs` and `backend/src/graphql/analytics.rs`: current analytics entry points.
- `backend/src/service/agents/tools/{catalog,mod}.rs`, `adapters/performance.rs`, and `runtime/provider_contract/schema.rs`: AI tool registration, evidence, and provider constraints.
- `backend/mcp-server/src/tools/read/analytics.rs`: external MCP consumers.
- `packages/app-ui/src/{hooks/analytics,lib/service/analytics,lib/types/analytics}.ts`, analytics/dashboard components, and `apps/desktop/electron/sync/remote-analytics.ts`: application consumers.

## 3. Architecture and alternatives

### Chosen: a typed analysis language over named datasets, compiled to SQL

The system has three public boundaries:

1. **Data catalog:** describes available datasets, fields, units, relationships, grain, and provenance. Domain adapters establish trustworthy facts.
2. **Analysis engine:** validates requests, expands metric definitions, compiles relational operations into SQL, executes them, and builds result envelopes.
3. **Consumers:** GraphQL compatibility operations, new generic analysis APIs, AI tools, MCP tools, saved definitions, and dashboard cards.

PostgreSQL performs relational and numerical query execution. Existing Rust trade grouping remains domain preparation, not a parallel analytics calculator. The engine cannot rebuild a special Rust function for every new metric.

### Alternatives considered

Direct AI-generated SQL gives immediate SQL expressiveness but exposes physical schema and leaves join grain, financial definitions, and scoping to each generated query. It is not the public contract selected here.

A standalone in-memory calculation runtime would require duplicating database query capabilities and moving source data into application memory. It is not the first execution backend.

The chosen language has a maintenance cost: operators need documented semantics, validation, and SQL compilation. It must remain composable; a request such as `metric: win_rate` alone is not an adequate implementation.

### Proposed internal ownership

Introduce `backend/src/service/analytics_engine/` with independently testable responsibilities:

| Module responsibility | Input → output | Dependencies |
| --- | --- | --- |
| Catalog and source adapters | Authenticated scope → typed dataset mappings and source coverage | Domain tables and trade grouping |
| Language and normalization | Request document → canonical versioned expression/stage graph | Serializable types only |
| Validation and metric expansion | Graph + catalog + definitions → typed graph or located errors | Catalog and definition store |
| SQL compiler | Typed graph → bound SQL and output schema | PostgreSQL dialect; no AI |
| Executor | Compiled query + scope + budget → completed typed result | Database pool, cancellation |
| Results and provenance | Result + coverage + versions → stable envelope | Execution/result persistence |
| Saved analyses and cards | Explicit user commands → versioned definitions and card bindings | Existing auth and persistence |

Keep transport types and UI chart configuration out of the compiler. Keep AI prompts and evidence formatting out of the executor. Consumers may reshape results into compatible response fields but may not recalculate financial totals.

## 4. Canonical data and financial identity

### Trade grain and source precedence

The `trades` dataset contains one record per complete position lifecycle. Individual fills are available through a separate `executions` dataset. Closed-trade counts never count partial exits as complete trades.

Broker facts use the existing deterministic grouping of normalized fills by exact instrument and direction, including contract identity, quantities, and prorated fees. Grouping remains responsible for determining complete and incomplete positions. Monetary aggregation over eligible allocations is expressed in PostgreSQL and verified against independent fixtures and the existing valid broker calculations.

Standalone, valid, completed manual journal trades also enter `trades`. `manual_execution_claims` are planned-entry claims without a complete exit lifecycle, so they are not standalone realized outcomes. Manually regrouped broker episodes remain broker financial records.

Default source selection is `all`: eligible broker trades and eligible standalone manual trades. Explicit `brokerage` and `manual` filters are available. This supersedes the connected-workspace source default proposed in the earlier behavior-insights document for engine-powered analytics.

Resolve identity using `brokerage_episode_publications`, `trade_review_publications` through their matches, and `journal_brokerage_links`. A journal linked to a broker episode enriches that episode and is never another outcome. Match identity does not depend on guessing from ticker, dates, or amount.

When linkage is ambiguous, keep the affected financial records out of combined totals and return coverage reasons until grouping/linkage is resolved. Preserve valid unrelated records. Open positions and incomplete/ambiguous positions remain queryable in a `positions`/coverage relation even when they do not contribute realized performance.

Several journals or several tags attached to one trade must not multiply its P&L. Catalog relationships carry cardinality and grain. Financial aggregates over a multiplied relation are rejected unless the request explicitly restores trade grain. Filtering by a tag or violation normally compiles to `EXISTS`; grouping by tags intentionally allows a trade in several groups, with an overlapping-groups notice.

### Dataset catalog

Initial named datasets cover canonical trades, positions, execution allocations, journal context, confirmed plans, trade-tag relationships, principle violations, playbooks, and workspace/brokerage value metadata. Private credentials, raw provider payloads, internal agent state, and arbitrary physical table names are not queryable fields.

Each field declares type, unit, nullability, meaning, source, historical availability, and valid relationships. New analytical datasets can be registered through trusted mappings without changing metric execution. Adding an arbitrary database column does not automatically expose it.

Journal context is optional. An untagged or unreviewed trade is unknown, not proof of discipline or absence of mistakes. Mistake-role tags identify recorded flawed trades. The clean comparison uses explicitly reviewed trades without recorded mistake tags; unknown coverage is separate. Self-reported revenge trading remains distinct from the observable sequence “opened after a loss.”

Use the uniquely linked journal for scalar context. If several journals are linked, the scalar is unavailable unless the request explicitly selects one of those authorized records; all related records remain queryable. Do not add a guessed “latest journal wins” rule or require a new primary-journal UI. Set-valued tags and violations can be combined with deduplication by stable IDs.

### Amounts, currency, and missing costs

Use PostgreSQL `numeric` and Rust decimal types at financial boundaries. Reject nonfinite values. Existing floating-point storage is normalized deterministically through its round-trip decimal representation; conversion does not recover precision already lost at ingestion. New persisted financial values use decimal representations. Rounding happens for display, not before aggregation.

Broker realized P&L is direction-aware exit proceeds minus allocated entry cost, multiplied by the instrument multiplier, minus recorded fees. It excludes funding transfers and unrealized market movement.

Manual P&L is derived from its actual entry/exit prices, quantity, direction, and multiplier. Existing manual records do not provide fee amounts. Their fee status is `unknown`, with P&L labeled according to recorded costs; never imply fees were verified zero. The result includes unknown-fee counts. This release does not invent an external fee source or add a new trade-entry workflow.

Every monetary field carries currency. Broker currency comes from executions; manual currency uses the workspace denomination with that provenance recorded. Conflicting or unavailable currency prevents a combined monetary total. Requests may group by currency or restrict to one currency; a single scalar card must select one. No automatic FX conversion is introduced.

### Source freshness

Create a transactional workspace analytics revision, incremented on relevant broker, grouping, journal, link, tag/category, violation, plan, and brokerage-value changes, including soft/hard deletes and moves affecting either workspace. This is explicit dependency invalidation, not `max(updated_at)` inference.

Track broker source revision and the revision successfully consumed by episode derivation separately. Rebuilds publish episodes and their consumed revision atomically. A later source change leaves the mismatch visible. Preserve manually grouped allocations and existing publication identity rules.

Coalesce pending rebuilds durably per workspace and retry failed derivation through the existing brokerage worker infrastructure. Mark existing workspaces dirty at rollout. A read may schedule missing preparation, but analytical execution starts only after required source generations match. On mismatch, return `SOURCE_NOT_READY`; do not present old episodes as current. The SQL execution transaction itself is read-only.

## 5. Shared metric meanings

Built-in definitions are immutable and versioned. A user variation receives a separate definition ID and label. Defaults below apply across AI, dashboard, calendar, and advanced analytics.

| Concept | Definition |
| --- | --- |
| Eligible trade | A closed, valid, unambiguously identified trade; coverage tracks excluded records |
| Win/loss/breakeven | Realized P&L after recorded fees greater than / less than / equal to zero |
| Win rate | Wins / (wins + losses) × 100; null when no decisive trades |
| Trade count | Wins + losses + breakevens |
| Net realized P&L | Sum of eligible trade P&L within one currency |
| Average gain/loss | Mean winner P&L / mean absolute loser P&L; null if that cohort is empty |
| Expectancy in money | Net P&L / all eligible trades, including breakevens |
| Profit factor | Gross positive P&L / absolute gross negative P&L; null with `NO_LOSS_DENOMINATOR` when there are no losses |
| Entry return | Realized P&L / entry notional × 100; explicitly not portfolio return |
| Realized curve | Cumulative realized money P&L, starting from zero; not historical account equity |
| Drawdown | Running realized-P&L peak minus current cumulative P&L, with an initial zero baseline |
| Streak | Consecutive positive or negative closed outcomes; breakeven breaks either streak |
| SQN | Square root of valid R count × mean R / sample standard deviation of R; null for insufficient count or zero deviation |

An empty sum/count can be zero. An undefined average, ratio, or percentage remains null with a reason; clients must stop converting these to an apparently observed zero. Missing R removes a trade from R calculations only, not money P&L or general counts.

### Risk and reward are distinct fields

Expose `planned_reward_to_risk`, `realized_r`, and their denominators/provenance separately. If the user asks broadly for “risk-to-reward,” AI shows the available named measures and states missing information.

For continuity with the existing confirmed-plan performance calculation, the standard `realized_r` uses net realized P&L divided by confirmed planned initial money risk when an appropriate frozen plan snapshot exists. Planned risk is the sum of direction-valid tranche entry-to-stop distance × planned quantity × multiplier. Standalone manual trades use their explicitly recorded entry/stop/quantity risk, labeled `manual_recorded`; edited retrospective values must not be described as known before entry. Include risk-basis counts in combined results.

A separate explicit expression can calculate realized P&L divided by actual execution size/entry-to-stop risk. Name that `realized_r_on_execution_risk`; it must not silently replace the standard denominator. Both risk formulas include the contract multiplier. Invalid stops or zero/nonpositive risk yield unavailable R.

Use the earliest immutable confirmed review snapshot as planned evidence. A live editable plan is not automatically historical initial-risk evidence. Where no suitable snapshot or explicit recorded risk exists, R is unavailable. Existing immutable snapshots may lack reliable pre-entry provenance; expose that limitation rather than inferring it from current plan status.

`planned_reward_to_risk` requires a genuine recorded planned reward target, plus planned entry, stop, quantity, and multiplier. Current tranche `target_price` fields represent planned entries in the review adapter, and journal `risk_reward` is exit-derived. Neither supplies that reward target. The catalog exposes the measure as unavailable with `MISSING_PLANNED_REWARD_TARGET` until a supported source records the required facts. Adding profit-target capture is a separately scoped source extension, not a guessed value in this release.

### Dates, sequences, and context

Default analysis timezone is `America/New_York`, recorded in every resolved request. Date-only custom ranges use that timezone consistently; offset-bearing timestamps identify exact instants. Relative ranges are resolved once per execution. Calendar output is Sunday–Saturday and includes every day in the requested month, with zero counts for inactive days.

Distinguish `previous_calendar_month` (the complete preceding month) from `trailing_1_calendar_month` (one calendar month back through today). Existing `LAST_1_MONTH` compatibility requests map to the latter. Natural-language “last month” defaults to the former and displays its resolved dates. `all` has no trade-date bounds; capture an execution-time `asOf` for calculations needing an end date, such as unrecovered drawdown duration.

Default completed-trade selection uses closing time. Entry-session, weekday, and holding-period features explicitly name which timestamp they use. Session definitions use New York time for the existing US-market views. Standard day trade means opened and closed on the same local date; overnight means swing. Arbitrary elapsed holding bands remain expressible through formulas.

For an ordered calculation, define ties using timestamp plus canonical trade ID; expressions using order cannot rely on physical row order. For “opened after two losses,” look only at eligible trades closed strictly before that trade opened. Load the necessary history before applying the output date filter. A future close from an overlapping position cannot become a prior outcome.

Drawdown duration follows the same cumulative dollar curve as its amount. An unrecovered drawdown is measured through the resolved analysis end. Percentage drawdown requires a verified starting-capital basis; current workspace balance minus selected trade P&L is not reliable historical capital. The old estimate is removed from authoritative drawdown percentages. With no capital basis, show dollar drawdown and an unavailable percentage. Preserve current account value as separately labeled metadata.

Standard realized curves and drawdown statistics start at zero for the selected outcome window and evaluate every trade in stable close order. Daily chart points sample that curve; daily netting must not erase an intra-day peak/trough from the maximum-drawdown statistic. A separately requested end-of-day drawdown is a differently named definition. The prior history loaded for sequence classification does not silently change the selected-window curve baseline.

## 6. Request language

### Envelope and graph

Use a language-versioned request document with these logical fields:

- `languageVersion`: supported version; initially `1`.
- `parameters`: typed values and declared date/source/timezone parameters. Decimal literals use strings.
- `expressions`: a bounded graph of named scalar, aggregate, and window expression nodes.
- `stages`: a bounded acyclic graph of named relational stages referring only to previous stages, catalog datasets, and expression IDs.
- `outputs`: named result stages and expected shape: scalar, records, grouped records, or time series.
- `definitionRefs`: immutable metric/analysis revision references used by this request.

Actor identity is never a request parameter. Workspace is selected through the authenticated application context and checked by the service. A caller cannot replace the actor through a nested expression or source. Initial execution is one authorized workspace; cross-workspace combination is a future explicit capability.

A node has a stable ID, an operation identifier, ordered input references, and operation-specific validated attributes. Every operation has a documented signature. Unknown fields and operators are errors. Forward references, cycles, duplicate aliases, invalid references, unsupported language versions, and incompatible units are rejected before SQL execution.

The normalized form freezes expanded metric revisions, defaults, resolved dates, timezone, parameter types, explicit sort order, and operator versions. Hash this canonical form rather than arbitrary JSON serialization. Display-only labels do not change financial semantics; computational settings do.

### Required first-release operations

| Family | Required capabilities |
| --- | --- |
| Sources and relations | Scan catalog datasets, follow registered relationships, inner/left joins of typed stage outputs with explicit cardinality/grain, as-of self joins, `EXISTS`/`NOT EXISTS`, explicit union of compatible grains |
| Scalars | Decimal arithmetic, safe division, comparisons, boolean logic, conditionals, null tests, explicit coalesce, bounded text/date operations, casts permitted by the type system |
| Aggregates | Count, distinct count, sum, mean, min/max, sample standard deviation, percentiles, conditional aggregation |
| Grouping | Multiple dimensions, derived buckets, post-aggregate filters, separate currency partitions |
| Ordering and windows | Stable sort, rank/row number, lag/lead, explicit row frames, cumulative sums/extrema, bounded rolling aggregates |
| Composition | Multiple stages, references to earlier results, derived metrics built from metrics, group-to-group comparisons, calendar/date spine and left join |
| Output | Typed scalar/table/series selection and explicit ordering; display rounding only |

Subqueries and window/aggregation stages compose through the graph. No arbitrary SQL fragments, function names, table names, procedural loops, recursive database queries, scripts, or network calls are accepted. Additional functions are installed as versioned, typed operators, not invented by the model.

Filters take effect at their declared stage. The compiler must not push a filter across a window, sequence, or aggregation boundary when that changes the meaning. Date parameters must be consumed by an explicit filter stage; built-in definitions place them according to their semantics. An unused range is a validation error instead of misleading range metadata.

SQL `WHERE` retains true predicates; null/unknown predicates do not become false evidence of the opposite condition. Aggregates over nullable operands report valid and missing counts. The output includes a coverage entry for each requested metric and group, because different metrics can have different eligible populations.

A new metric consists of a typed definition graph with parameters and dependencies. Expansion uses the same validator as a one-time request and enforces maximum graph size after expansion. A formula is not allowed to hide a cyclic reference or bypass scope.

### Example execution meaning

For “average realized R by strategy for profitable trades last month,” the graph scans canonical trades, selects the resolved close-date window, filters positive realized P&L, attaches the scalar strategy identity, groups, and averages valid `realized_r`. It also returns total eligible trades, valid-R trades, and missing-R reasons per strategy. Unknown strategy is a visible group rather than a silently discarded trade.

For “after two consecutive losses,” a preceding stage computes the as-of prior closed outcomes before the output range filter. This must work by composing relational and ordered operations, not by adding a bespoke `after_two_losses` backend endpoint.

## 7. Query execution, repeatability, and failures

Compile only validated identifiers from the catalog and bind all literal values. Use fixed schema qualification and restricted database execution privileges. Database read-only enforcement is defense in depth; only vetted expression functions may be emitted. Scope every source and relationship, and test nested joins/unions for isolation.

Execute every named output and its coverage queries in one read-only repeatable-read database transaction. Check source readiness and observe the workspace revision inside that same snapshot; a readiness check before opening the transaction is insufficient. Save the completed envelope after execution in a separate write transaction. A revision that changes later does not retroactively change the saved answer.

The engine promises repeatability for the same normalized definition, data snapshot, and operator/catalog versions. It does not promise that repeating a natural-language prompt produces identical AI wording or an identical interpreted request. Ambiguous interpretation is resolved before claiming a definitive result.

Engineering defaults for the first synchronous executor are 256 KiB request size, 32 relational stages, 2,048 expression nodes after expansion, 16 outputs, 10 seconds for the complete database execution transaction, 2 concurrent analytical executions per user, and an application-wide configurable semaphore initially set to 4. Joins use registered relationships or validated predicates between scoped stage outputs with explicit grain; unrestricted cross joins are rejected, with a dedicated bounded date-spine expansion available. Resource defaults are configurable deployment settings and reported when exceeded.

Limit retained output to 50,000 rows and 10 MiB per execution. Paginate completed retained results with a default page of 200 and maximum of 1,000 rows. Never execute each page against a different live database snapshot. If the completed output exceeds a bound, return `RESULT_LIMIT_EXCEEDED`; the caller can narrow the range or request aggregation. Never report a limited prefix as “all trades.” An explicit top-N request is a complete analysis of that declared request.

Cancellation and timeout roll back the analysis transaction. Persist safe terminal status and a bounded diagnostic, not a partially computed success. SQL syntax/implementation failures are internal engine errors; model-visible errors must not expose physical SQL, credentials, or other users' identifiers.

Stable error categories include invalid request/version/type/reference, ambiguous grain, unavailable field/source, source not ready, forbidden scope, division/denominator unavailability, execution timeout/cancellation, result limit, and internal failure. Expression errors identify the stage or node and expected type. Missing row-level data usually appears in coverage instead of failing unrelated calculations.

Disable the old Redis analytics cache during migration. Introduce result reuse only with a key including authenticated user/workspace, normalized request hash, complete dependency revision, catalog/operator versions, and effective dates. Relative-date presets alone are insufficient cache keys. Database reads remain authoritative when Redis is absent.

## 8. Result contract and evidence

Every completed execution returns:

- Execution ID, definition hash/revision references, language/catalog/operator versions, workspace, source selection, resolved dates, timezone, execution time, and source revision.
- Named outputs with shape, typed columns, units/currency, ordered rows, and retained-result pagination metadata.
- Metric/group coverage: selected, eligible, contributing, missing, and excluded counts with reason codes. Reason counts can overlap and must not be advertised as a disjoint total.
- Formula descriptions and denominator/risk/cost provenance sufficient to explain the result.
- Stable source references for supporting trades, with authorized drilldown through the same execution context.
- Explicit warnings for unknown fees, retrospective context, mixed risk bases, or intentionally overlapping groups.

Financial cells serialize as decimal strings; timestamps are RFC3339 instants and dates are ISO calendar dates. Plotting code can convert checked finite values at the rendering boundary. Existing numeric GraphQL fields require explicit compatible conversion, with no frontend arithmetic used to reconstruct totals.

Retain completed ad-hoc results for seven days. A result referenced by an AI answer is retained with that conversation/evidence lifecycle until user deletion or applicable account retention rules remove it. Deleting a saved definition does not silently rewrite existing referenced answers. Saving a definition does not retain every automatic dashboard refresh forever.

Keep the normalized request, metadata, and retained result sufficient to redisplay the old answer. Source IDs and revisions document provenance; they are not a promise to reconstruct arbitrary historical raw data after source deletion. Rerunning a saved definition against current data creates a new execution, with changed-source metadata visible. When an old result has expired, return explicit expiration rather than substituting a fresh result under its ID.

## 9. AI and public interfaces

Reuse the current TinyAgents tool catalog and actor/workspace context. Add catalog/definition discovery, request validation, analysis execution, and retained-result retrieval capabilities. The current `trading_performance` tool becomes a compatibility request for built-in definitions.

The provider contract currently rejects unions, references, and open object schemas. Expose the graph to AI through a closed tool envelope with a size-bounded `request_json` string, decoded and fully validated server-side. Provider schema compatibility is not validation of the enclosed language. Catalog discovery returns bounded descriptions, field types, operator signatures, and worked compositions. The engine never accepts actor/workspace identity from that JSON.

A clear read question can run immediately. Material ambiguity about metric meaning, scope, or source requires clarification or clearly labeled distinct results. A model may make up to two corrections after an actionable validation error, subject to the existing run budget. Scope failures do not trigger broader source searches. Repeated failure is surfaced honestly.

Persist results through the existing tool evidence infrastructure using execution and definition revisions. AI summaries use returned values and coverage; a deterministic table/card renderer shows the actual outputs. If AI needs another total or comparison, it submits another engine request. Notes and journal text are data, never authority to change tool scope or definitions.

Saving/editing definitions and adding dashboard cards are explicit user actions. AI uses the existing action proposal/execution boundary for these mutations; reading results does not save or pin anything automatically. Definitions and card mutations are ownership-checked and idempotent.

GraphQL exposes catalog discovery, validation, execution, retained-result pages, and saved-definition/card operations through typed outer envelopes. Schema JSON or serialized request documents are decoded by the same service used by AI. MCP uses the same generic engine operations and keeps existing analytics tool names as compatibility entry points. Transport wrappers cannot implement their own metric math.

## 10. Saved definitions and dashboard behavior

Persist user-owned saved analyses and metric definitions with immutable revisions. A saved item records name, description, language document, declared parameters, pinned definition dependencies, output contract, presentation settings, and ownership/workspace applicability.

Built-in definitions ship as versioned declarative documents with stable IDs. Saved references pin versions. Updating a built-in creates a new revision; it does not reinterpret an earlier saved answer. User variations get their own IDs and names. Dependency cycles and incompatible updates fail validation before publication.

Dashboard cards bind one saved revision and named output. Scalar outputs render as metric cards, records/groups as tables, and date/number series as charts. Validate compatible columns and units when saving a presentation. Removing a card does not delete its saved calculation. Archiving a saved item referenced by a card requires an explicit removal/replacement action; no silent formula substitution.

Relative time parameters such as last month resolve on each execution. Absolute dates remain fixed. Card settings state whether a parameter inherits the dashboard filter or is pinned; default to inheriting compatible dashboard workspace/date filters. Labels display effective filters so differing cards are not assumed comparable.

Saving or editing a formula first validates it and provides a preview result when the source is available. A validated definition may be saved with a clearly labeled unavailable preview; source absence is not proof that the formula is invalid. Editing produces a revision. Cards remain pinned until the user's edit explicitly updates their bindings, with old revisions preserved for referenced answers.

PostgreSQL stores definitions, revisions, card bindings, executions/results, and source-revision/readiness state. Follow existing UUIDv7, user/workspace ownership, transactional writes, and deletion/export conventions. Add final SeaORM entities and immutable migrations; regenerate the schema contract through the established exporter. Saved customizations are server-owned and available to both web and desktop. Offline clients can display labeled previously loaded data; they cannot claim to execute against the current server database while offline.

## 11. Existing analytics migration contract

All currently displayed trading analytics move to engine definitions. Compatibility endpoints can retain names while delegating execution, but payload types and UI labels must change where old semantics were misleading.

| Existing family | Engine definition behavior |
| --- | --- |
| Dashboard totals, wins/leaks, calendar | Canonical combined trade source, recorded-cost P&L, common timezone, explicit counts and coverage |
| Journal summary | Same canonical financial population by default; a journaled-only filter is explicit |
| Advanced expectancy and distributions | Shared money and R definitions, valid denominators, typed buckets |
| Advanced drawdown/curve | Cumulative realized money curve and consistent duration; percentage unavailable without historical capital basis |
| Planned/actual R fields | Replace misleading names with explicit planned reward, standard realized R, and execution-risk R where requested |
| Strategy, symbol, day/session, holding, direction, size | Generic grouping definitions; size labels distinguish quantity from monetary notional |
| Discipline, mistake cost, tag categories | Context-aware canonical trades, unknown cohort visible; comparisons do not claim causal cost |
| Playbook/principle financial summaries | Engine grouping over the same canonical outcomes and context links |

The mistake-cost expression remains available as the difference between flawed-trade results and the reviewed-clean cohort's average applied to that count. Name it a comparison estimate, return null without a usable clean cohort, and do not state that tagging a mistake proves a causal dollar cost.

Frontend query keys and invalidation include saved revision, workspace, effective parameters, and source revision where available. Journal mutations alone are not sufficient invalidation: brokerage sync, manual/broker linkage, plan confirmation, tag/violation edits, and saved-definition changes must refresh affected views. Desktop `RemoteAnalytics`, shared GraphQL fetchers, MCP, and AI must migrate in the same release contract.

Shadow comparison uses frozen fixtures and sampled authorized requests without changing visible output. Every difference is classified as an intentional semantic correction or an engine defect. Do not demand equality with known incorrect legacy results. Cutover of built-in consumers occurs only after required definitions and consumer tests pass; mixed old/new formulas must not remain active under identical labels.

## 12. Verification and acceptance

### Numerical and domain correctness

- Independently hand-calculated fixtures cover long/short trades, scaling in/out, fees, option multipliers, manual trades, linked journals, multiple context records, ambiguous reversals, missing stops, invalid risk, breakevens, and currency conflicts.
- Check membership as well as totals. Partial exits do not inflate trade count; journal publication does not add another outcome; tag joins do not multiply money.
- Verify planned versus actual risk bases, frozen versus retrospective plan evidence, unknown fees, empty denominators, and the absence of genuine planned reward targets.
- Check New York midnight, DST, date-only ranges, ordered ties, overlapping positions, history outside the output window, and consistent drawdown amount/duration.

### Language and execution correctness

- Run accepted graphs against real PostgreSQL and compare output/coverage to independent small-data calculations.
- Test malformed graphs, type/unit errors, cyclic definitions, post-expansion limits, null semantics, illegal aggregation/window placement, and grain violations.
- Attempt cross-user/workspace references through scans, nested joins, unions, saved dependencies, result IDs, and pagination. Each must be rejected or scoped without leakage.
- Verify transaction snapshot consistency during concurrent imports/edits; source readiness cannot falsely report current data after a failed rebuild.
- Verify cache invalidation for every dependency mutation, cancellation, timeouts, bounded concurrency, result expiry, and no successful partial output.

### Product and consumer correctness

- One definition with the same scope/snapshot produces the same values through generic API, compatibility GraphQL, MCP, AI, and dashboard.
- Saving, revision editing, pinning a card, relative-date refresh, fixed-date execution, archived definitions, and web/desktop reloads preserve the intended definition.
- AI correctly forms the motivating requests, handles missing R and ambiguity, corrects validation errors within budget, cites retained results, and never manufactures missing numbers.
- A new custom definition combining existing operators runs and can be added to a dashboard without adding Rust metric code, SQL templates for that metric, a new endpoint, or a new UI component.
- Existing analytics surfaces render null/coverage states and deliberately corrected semantics instead of silently displaying old estimates.

Performance checks use representative larger workspaces and instrument/tag distributions. Record query latency, rows processed/returned, generation lag, cancellation behavior, and limit failures. A valid request can exceed an operational budget; it must fail clearly rather than weaken its definition. No universal response-time guarantee is assumed before measurement.

The written spec is complete when the user approves the chosen semantics and scope. Implementation planning follows that review. This document does not implement the engine, change live data, or validate production results.

## 13. Technical references

- [PostgreSQL query composition](https://www.postgresql.org/docs/current/queries.html): table expressions, grouping, unions, and common table expressions.
- [PostgreSQL window functions](https://www.postgresql.org/docs/current/tutorial-window.html): ordered calculations and the significance of filter/window stage order.
- [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html): database policy mechanisms and owner/bypass considerations; database enforcement must not rely on an unrestricted owner connection.

These document execution capabilities. The request language, product scope, and financial semantics above are Tradstry design decisions.
