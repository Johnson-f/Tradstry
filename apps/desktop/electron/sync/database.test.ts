import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openDesktopDatabase, transaction } from "./database.ts";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

test("database initialization is idempotent and persists one client id", () => {
  const first = openDesktopDatabase(":memory:", schema);
  assert.ok(first.clientId);
  assert.equal(first.db.prepare("SELECT count(*) AS count FROM client").get()?.count, 1);
  first.close();
});

test("transaction rolls back failed operations", () => {
  const store = openDesktopDatabase(":memory:", schema);
  assert.throws(() =>
    transaction(store.db, () => {
      store.db.prepare("INSERT INTO client (id) VALUES (?)").run("second");
      throw new Error("stop");
    }),
  );
  assert.equal(store.db.prepare("SELECT count(*) AS count FROM client").get()?.count, 1);
  store.close();
});

test("legacy media rows migrate into one blob and one note reference", () => {
  const directory = mkdtempSync(join(tmpdir(), "tradstry-media-migration-"));
  const path = join(directory, "desktop.sqlite");
  try {
    const legacy = new DatabaseSync(path);
    legacy.exec(`
      CREATE TABLE notebook_media (
        hash TEXT PRIMARY KEY,note_id TEXT NOT NULL,account_id TEXT NOT NULL,
        mime TEXT NOT NULL,media_type TEXT NOT NULL,width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,duration_seconds REAL NOT NULL DEFAULT 0,
        bytes INTEGER NOT NULL DEFAULT 0,original_filename TEXT NOT NULL DEFAULT '',
        local_path TEXT,thumb_path TEXT,upload_state TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO notebook_media
        (hash,note_id,account_id,mime,media_type,bytes,original_filename,local_path)
      VALUES ('hash','note','account','image/png','image',5,'chart.png','/tmp/chart');
    `);
    legacy.close();

    const store = openDesktopDatabase(path, schema);
    assert.equal(
      store.db.prepare("SELECT count(*) AS count FROM local_media_blobs").get()
        ?.count,
      1,
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM local_note_media_references")
        .get()?.count,
      1,
    );
    assert.equal(
      store.db
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='notebook_media'",
        )
        .get()?.count,
      0,
    );
    assert.equal(
      store.db.prepare("PRAGMA user_version").get()?.user_version,
      1,
    );
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
