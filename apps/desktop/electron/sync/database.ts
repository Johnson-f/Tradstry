import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hlc } from "./hlc.ts";

const ALTERATIONS = [
	"ALTER TABLE tag_categories_cache ADD COLUMN color TEXT",
	"ALTER TABLE tag_categories_cache ADD COLUMN hlc TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE tag_categories_cache ADD COLUMN deleted_at TEXT",
	"ALTER TABLE tag_categories_cache ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'",
	"ALTER TABLE tag_categories_cache ADD COLUMN availability TEXT NOT NULL DEFAULT 'all'",
	"ALTER TABLE tag_categories_cache ADD COLUMN workspace_ids TEXT NOT NULL DEFAULT '[]'",
	"ALTER TABLE tags_cache ADD COLUMN hlc TEXT NOT NULL DEFAULT ''",
	"ALTER TABLE tags_cache ADD COLUMN deleted_at TEXT",
	"ALTER TABLE tags_cache ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'",
	"ALTER TABLE playbooks ADD COLUMN availability TEXT NOT NULL DEFAULT 'all'",
	"ALTER TABLE playbooks ADD COLUMN workspace_ids TEXT NOT NULL DEFAULT '[]'",
	"ALTER TABLE folders ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0",
];

export type DesktopDatabase = {
	db: DatabaseSync;
	hlc: Hlc;
	clientId: string;
	close(): void;
};

export function openDesktopDatabase(
	path: string,
	schema: string,
): DesktopDatabase {
	mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec(
		"PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;",
	);
	db.exec(schema);
	migrateMediaSchema(db);

	for (const sql of ALTERATIONS) {
		try {
			db.exec(sql);
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!error.message.includes("duplicate column name")
			)
				throw error;
		}
	}

	let row = db.prepare("SELECT id FROM client LIMIT 1").get() as
		| { id: string }
		| undefined;
	if (!row) {
		const id = randomUUID();
		db.prepare("INSERT INTO client (id) VALUES (?)").run(id);
		row = { id };
	}

	const clientId = row.id;
	return { db, clientId, hlc: new Hlc(clientId), close: () => db.close() };
}

function migrateMediaSchema(db: DatabaseSync): void {
	const version = Number(
		(db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined)
			?.user_version ?? 0,
	);
	if (version >= 1) return;
	const legacy = db
		.prepare(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='notebook_media') AS present",
		)
		.get() as { present: number };
	db.exec("BEGIN IMMEDIATE");
	try {
		if (legacy.present) {
			db.exec(`
        INSERT OR IGNORE INTO local_media_blobs
          (hash,mime,media_type,width,height,duration_seconds,bytes,
           original_filename,local_path,thumb_path,upload_state,created_at)
        SELECT hash,mime,media_type,width,height,duration_seconds,bytes,
               original_filename,local_path,thumb_path,upload_state,created_at
        FROM notebook_media;
        INSERT OR IGNORE INTO local_note_media_references
          (note_id,account_id,hash,original_filename,sync_state,created_at)
        SELECT note_id,account_id,hash,original_filename,upload_state,created_at
        FROM notebook_media;
        DROP TABLE notebook_media;
      `);
		}
		db.exec("PRAGMA user_version = 1; COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}

export function transaction<T>(db: DatabaseSync, operation: () => T): T {
	db.exec("BEGIN IMMEDIATE");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
}
