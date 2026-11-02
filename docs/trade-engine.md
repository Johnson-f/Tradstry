# Trade engine

The trade engine turns fills into **trades**, the unit Tradstry journals and measures. It lives in `services/backend/src/trades/`.

## How it runs

`trades::compute(EngineInput) → EngineOutput` is a pure function. Its inputs are:
- imported activities;
- manual fills;
- opening positions;
- confirmed and rejected aliases;
- decisions.

`trades::rebuild::rebuild` runs it for one user, then replaces that user's `trades`, `trade_fills`, `trade_lots` and `lot_closures`. It does this in one transaction, under a per-user advisory lock.

A rebuild happens:
- after a brokerage sync job, once per user however many of their jobs ran;
- before any trade-changing API mutation returns;
- on startup, for users built by an older `ENGINE_VERSION`.

**Bump `ENGINE_VERSION` whenever a rule changes,** so every user is rebuilt.

## Definitions

- **Trade:** a flat-to-flat round trip in one workspace on one instrument. Scale-ins and partial exits stay inside the trade.
- **Lots:** each entry fill opens a lot. Exits close the oldest lots first (FIFO). A closed trade's P&L is cash out minus cash in under any matching method; FIFO decides the realised-to-date P&L of open trades and the tax lots.
- **Instrument key:**
  - `stock:TICKER` for stocks and ETFs;
  - `crypto:SYMBOL` for crypto;
  - `option:UNDERLYING:YYYY-MM-DD:C|P:strike:multiplier` for options.
  
  Keys use tickers, not provider IDs, so manual and imported fills match and wash sales work across accounts.
- **Net P&L:** gross minus fees. Dividends are kept beside it as `income`.
- **Trade IDs:** a hash of the workspace, instrument and first fill, so a trade keeps its ID as fills are appended. Decisions mint IDs from the decision.

## Ordering

Fills are sorted by time, then by kind: splits first, then transfers in, fills, transfers out, and finally option expiry, assignment and exercise.

When several fills share the same instant, the engine picks one at a time:
1. Never open a position the account cannot hold. Cash accounts and IRAs cannot short.
2. Prefer a fill that reduces the open position.
3. Prefer an option's close intent over its open intent.
4. Then fall back to the fill key, so the result is deterministic.

## Special cases

| Case | Handling |
|---|---|
| A fill crosses zero (a flip) | Split into a closing part and an opening part; the fee is shared by quantity |
| A close with nothing open | An `incomplete` trade with `missing_opening_history`; fix it with an opening position |
| A dust remainder under 0.0001 | Closed at the fill price, with an info issue |
| A split | Lot quantities and costs rescale, using the description's ratio or the reported units |
| A stock dividend | A zero-cost lot that keeps the original holding period |
| Dividend reinvestment (REI) | A buy |
| A transfer in | Opens lots at the reported cost. With no cost, the trade is `incomplete` |
| A transfer out | Closes lots at value, or at cost if none is given; the trade is flagged non-economic |
| An option expires | Closes at 0 |
| An option is assigned or exercised | Closes at 0; the stock fill is linked (same underlying, quantity × multiplier, at the strike, within 1 day before to 5 days after) or created as `derived:`; the premium moves into the stock's tax basis or proceeds |
| A ticker change | An alias such as IRBTQ → IRBT, applied from its effective date. Suggested when an orphaned sale matches an open position of the same size with a similar ticker or company name |
| Missing history | `position_mismatch` when engine positions differ from the latest holdings snapshot |

## User decisions

Decisions never edit fills. They are replayed on every rebuild, merges and splits first, then strategies:

- **Merge:** same instrument and direction.
- **Split:** at an `add` fill. Lots opened before the fill stay in the first part.
- **Combine legs:** a strategy parent over at least two trades on one underlying.

Each decision ends up `applied`, `stale` (a trade it names is gone) or `conflict` (with a code). The API previews a decision before saving it, and refuses one that would not apply.

## Journal

Annotations are keyed by trade ID, plus an anchor fill. After a rebuild, an annotation whose trade vanished moves to the trade that now holds its anchor fill. If no trade holds it, the annotation is kept as orphaned. Updates check `record_version`, so two devices cannot overwrite each other.

**Labels.** Each user has one catalog of labels (`journal_labels`), shared by all their workspaces. A trade can carry any number of each of the four kinds, all linked through `trade_annotation_labels`:

- **edge:** what gave the trade an advantage;
- **entry tactic:** what triggered the entry;
- **tag:** context worth comparing;
- **mistake:** what went wrong in execution.

The setup a trade follows, with its rules, is a separate future feature (a playbook), not a label.

The rules for labels:

- **Names:** unique per kind among active labels, ignoring case and extra spaces.
- **Kinds:** a composite foreign key on `(id, kind)` stops a label being linked as the wrong kind.
- **Archiving:** hides a label from pickers, but entries that already carry it keep it.
- **Deleting:** only allowed for a label no entry uses (`LABEL_IN_USE` otherwise).
- **Merging:** moves every use of one label onto another of the same kind, then deletes the first.

Labels hang off the annotation, so they follow it through rebuilds.

**Behavior.** An entry can also record how the trade was taken. Every field is optional, and null means "not recorded", which is different from "no":

- conviction before entry, 1 to 5;
- market regime: trending, choppy, ranging or volatile;
- whether it was planned before the open;
- whether it was a revenge trade;
- whether it broke the trader's 30-minute rule;
- rule adherence, 1 to 5.

Statistics break results down by each field. A trade without that field recorded is left out of its breakdown.

**Risk.** The risk on a trade is the `planned_risk` dollar amount when set. Otherwise it is |avg entry − `initial_stop`| × max size × multiplier. R-multiple = net ÷ risk.

**Plans.** A trade plan (`trade_plans`) records what the trader means to do before a trade: symbol, long or short, entry, stop, an optional target, and the dollars they will risk. A plan can split its risk across up to ten entries (tranches), each taking a percent of the risk; the percents add up to 100. Each entry's size is its share of the risk ÷ (|entry − stop| × multiplier), rounded down to whole shares or contracts. Plans cover stocks and options only. The trader can round up instead, which never leaves an entry at zero but can risk a little more than chosen. The plan's `entry` is the size-weighted average of its entries. Percent risk is converted to dollars in the app before saving. It uses the workspace's balance: the latest brokerage snapshot (dollar cash plus position value) for a linked workspace, otherwise the balance the trader typed in. Each workspace also has a calculator rule: a default percent risked per trade, and a maximum stop distance (percent of the entry) past which the calculator warns.

A plan is open until the trader links it to a trade or skips it. Linking is always manual: the journal suggests open or skipped plans with the same symbol and direction, and linking copies the plan's stop and risk onto the trade's journal entry. A trade carries at most one plan. Like an annotation, a linked plan keeps the trade's anchor fill and follows it through rebuilds; if no trade holds that fill, the plan goes back to open. Unlinking reopens the plan and leaves the copied stop and risk on the trade.

Statistics compare trades from a plan with trades without one, and count the skipped plans made in the period.

**Suggested stop.** When a brokerage trade has no initial stop, the API suggests the trigger price of the earliest protective stop order that matches:

- same account and symbol;
- a sell for a long, or a buy for a short;
- order type stop, stop-limit, trailing stop or stop-loss;
- placed while the trade was open;
- any status, cancelled included.

The suggestion is only a hint: it is never saved unless the user accepts it.

**Statistics** break results down by edge, entry tactic, tag and mistake, each with expectancy in dollars and in R. A trade counts under each of its labels, so these breakdowns can add up to more than the total. Trades with no edge or no entry tactic fall in a "None" bucket. Statistics also give:

- an edge × entry-tactic matrix, where a trade counts in every pair it has;
- the net with and without each mistake;
- how many closed trades have no edge.

Statistics live in their own backend module, `services/backend/src/analytics/`, and are served by the `tradeStats` query. They count closed, economic, top-level trades closed in the requested window. Times are New York time:

- **Sessions** are by when a trade opened: pre-market 4:00–9:30, first hour 9:30–10:30, midday 10:30–15:00, last hour 15:00–16:00, after hours 16:00–20:00, and overnight otherwise.
- **Months and days** are by when a trade closed.
- **After a win or a loss** looks at the last trade that closed earlier the same day, before this one opened.
- **Position size** is what the entries cost; trades with an unknown cost are grouped as "Unknown".
- **R ranges** include their lower bound, and trades without a risk are left out.

## Wash sales and tax lots

An estimate, not tax advice.

- **What counts:** a loss closure in a taxable workspace is washed by purchases of the same instrument key, in the same direction, within 30 days either side of it, in any workspace.
- **Before the sale:** a purchase made before the sale counts only while it is still held at the sale.
- **Matching:** each purchased share replaces at most one washed share.
- **Where the loss goes:** the disallowed loss joins the replacement lot's basis, along with the washed lot's holding period.
- **IRAs:** if the replacement is in an IRA, the loss is lost permanently.
- **Not taxed:** tax-advantaged workspaces report nothing, and option premium that moved into a stock leg is not reported on its own.
- **Holding period:** long-term means held for more than a year. Short sales are always short-term.
- **Options near a stock loss:** flagged as information only, because "substantially identical" is a legal judgement.

## Issue codes

| Code | Meaning |
|---|---|
| `missing_opening_history` | A close with nothing open before it |
| `position_mismatch` | Engine and brokerage positions differ |
| `transfer_in_without_cost` | Shares arrived without a cost |
| `fills_before_opening_ignored` | Fills before an opening position's date were left out |
| `amount_mismatch` | The broker's amount differs from quantity × price (± fee) |
| `zero_quantity`, `missing_price`, `missing_date` | The activity was not usable |
| `unknown_activity_type` | An activity type the engine does not apply |
| `split_without_position`, `split_ratio_unknown` | A split could not be applied |
| `option_event_without_position` | An expiry, assignment or exercise with no contracts open |
| `assignment_stock_leg_derived` | The engine added the stock fill for an assignment |
| `dust_residual` | A leftover fraction was closed |
| `possible_option_wash_sale` | Options were opened near a stock loss |
| `transfer_into_short`, `transfer_out_without_position`, `transfer_out_exceeds_position`, `transfer_out_at_cost`, `stock_dividend_without_position` | A transfer or stock dividend that did not fit the position |

## Tests

- `tests/trade_engine.rs`: the pure engine on fixtures modelled on real fills, plus property tests:
  - it matches a reference FIFO ledger;
  - quantity is conserved;
  - input order does not matter;
  - closed trades net their cash flows.
- `tests/trade_rebuild.rs`: rebuilds in Postgres, reconciliation, annotation reattachment, and engine version upgrades.
- `tests/trade_api.rs`: GraphQL, ownership and session rules.
- `tests/journal_labels.rs`: the label catalog, label integrity, risk and R, merges across rebuilds, label filters, and suggested stops from imported orders.
