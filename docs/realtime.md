# Real-time updates

Every change a user can see reaches their open apps as it happens, whether it came from this device, another one, a brokerage import or a trade rebuild.

## How a change travels

1. **Database.** Statement-level triggers on every user-visible table call `pg_notify('tradstry_changes', …)` with `{"u": user, "w": workspace or null, "t": topic}` (migration `0016_realtime_changes.sql`).
   - Each trigger reads its statement's transition table, so a bulk write sends one message per user and workspace, not one per row.
   - Postgres sends notifications on commit and drops identical ones within a transaction. A rebuild that rewrites thousands of trades therefore sends one `trades` message per workspace, and a rolled-back write sends nothing.
2. **Backend.** `realtime::Hub` holds one `LISTEN` connection, opened when the first subscriber arrives, and broadcasts each change in-process.
   - If that connection drops, or a subscriber falls more than 1,024 changes behind, subscribers are told to `resync`.
3. **API.** The `changes` subscription (`graphql/changes.rs`) streams `{ topic, workspaceId, resync }` to the signed-in user, filtered to their own changes. It runs over the existing authenticated WebSocket, which closes when the session ends.
4. **Website.** `useRealtimeUpdates` (in `lib/client/realtime.ts`) is mounted once in the signed-in layout.
   - It batches changes for 120 ms and invalidates the queries each topic can make stale. Only queries on screen refetch.
   - After a reconnect it refetches everything, because changes may have been missed.
   - The socket retries forever (backing off to 30 s) and pings every 15 s.

## Topics

| Topic | Written by | Refreshes |
| --- | --- | --- |
| `TRADES` | trades, engine state, decisions, manual fills, opening positions, aliases | everything under `['trades']` (lists, detail, statistics, attention, tax) |
| `JOURNAL` | journal entries | `['trades']` |
| `LABELS` | journal labels | `['trades']` |
| `PLANS` | trade plans | `['plans']`, `['trades']` |
| `SETTINGS` | user settings | `['settings']`, `['trades']` |
| `WORKSPACES` | workspaces (including the calculator rule) | `['workspaces']`, `['planning-rule']`, `['workspace']` |
| `BROKERAGE` | connections, accounts, sync jobs, activities, orders, holdings | `['brokerage']`, `['workspace']`, `['planning-rule']`, `['workspaces']` |

A new table that users can see needs a row in the migration's trigger list and, if it gets a new topic, a line in `TOPIC_KEYS`.

## Journal entries

When another device saves a journal entry that is open here:

- **No local edits:** the editor shows the new version at once.
- **Unsaved edits:** autosave pauses and the editor offers **Load latest version**, so neither side's text is overwritten silently.

Versions older than the one already saved are ignored.

## What still polls

Only the SnapTrade sign-in window, which checks its OAuth attempt every second while it is open.
