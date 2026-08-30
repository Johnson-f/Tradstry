import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openAsBlob,
  unlinkSync,
} from "node:fs";
import { copyFile, mkdir, open, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, parse } from "node:path";
import type { DatabaseSync } from "node:sqlite";

export const MEDIA_FLUSH_BATCH = 20;
export const MEDIA_PROGRESS_STEP = 64 * 1024;

export type MediaProgress = { hash: string; loaded: number; total: number };

export type MediaRow = {
  hash: string;
  noteId: string;
  accountId: string;
  mime: string;
  mediaType: string;
  width: number;
  height: number;
  durationSeconds: number;
  bytes: number;
  originalFilename: string;
  localPath: string | null;
  thumbPath: string | null;
  uploadState: string;
};

type StoredMediaRow = {
  hash: string;
  note_id: string;
  account_id: string;
  mime: string;
  media_type: string;
  width: number;
  height: number;
  duration_seconds: number;
  bytes: number;
  original_filename: string;
  local_path: string | null;
  thumb_path: string | null;
  upload_state: string;
};

export type MediaSyncOptions = {
  db: DatabaseSync;
  backendUrl: string;
  getAccessToken: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  onProgress?: (progress: MediaProgress) => void;
  logger?: Pick<Console, "error">;
};

export type MediaResolved = {
  state: "local" | "remote" | "missing";
  fullPath: string | null;
  thumbPath: string | null;
};

export class MediaRepository {
  readonly #db: DatabaseSync;
  readonly #media: MediaSync;
  readonly #mediaDirectory: string;
  readonly #downloadsDirectory: string;

  constructor(options: {
    db: DatabaseSync;
    media: MediaSync;
    dataDirectory: string;
    downloadsDirectory: string;
  }) {
    this.#db = options.db;
    this.#media = options.media;
    this.#mediaDirectory = join(options.dataDirectory, "media");
    this.#downloadsDirectory = options.downloadsDirectory;
  }

  async store(input: {
    noteId: string;
    accountId: string;
    hash: string;
    mime: string;
    mediaType: string;
    width: number;
    height: number;
    durationSeconds: number;
    originalFilename: string;
    sourcePath: string;
    thumb: Uint8Array | number[];
  }): Promise<MediaResolved> {
    await verifyMediaFile(input.sourcePath, input.hash);
    const size = (await stat(input.sourcePath)).size;
    const thumbDirectory = join(this.#mediaDirectory, "thumb");
    await mkdir(thumbDirectory, { recursive: true });
    const fullPath = join(this.#mediaDirectory, input.hash);
    const thumbPath = join(thumbDirectory, `${input.hash}.jpg`);
    await copyFile(input.sourcePath, fullPath);
    const thumb = new Uint8Array(input.thumb);
    if (thumb.byteLength > 0) await writeFile(thumbPath, thumb);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db
        .prepare(
          `INSERT INTO local_media_blobs
           (hash,mime,media_type,width,height,duration_seconds,bytes,
            original_filename,local_path,thumb_path,upload_state)
           VALUES (?,?,?,?,?,?,?,?,?,?,'pending')
           ON CONFLICT(hash) DO UPDATE SET
             mime=excluded.mime,media_type=excluded.media_type,width=excluded.width,
             height=excluded.height,duration_seconds=excluded.duration_seconds,
             bytes=excluded.bytes,original_filename=excluded.original_filename,
             local_path=excluded.local_path,thumb_path=excluded.thumb_path,
             upload_state=CASE WHEN local_media_blobs.upload_state='uploaded'
                               THEN 'uploaded' ELSE 'pending' END`,
        )
        .run(input.hash, input.mime, input.mediaType, input.width, input.height, input.durationSeconds, size, input.originalFilename, fullPath, thumb.byteLength > 0 ? thumbPath : null);
      this.#db
        .prepare(
          `INSERT INTO local_note_media_references
           (note_id,account_id,hash,original_filename,sync_state,deleted_at)
           VALUES (?,?,?,?,'pending',NULL)
           ON CONFLICT(note_id,hash) DO UPDATE SET
             account_id=excluded.account_id,original_filename=excluded.original_filename,
             sync_state='pending',deleted_at=NULL`,
        )
        .run(input.noteId, input.accountId, input.hash, input.originalFilename);
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
    return {
      state: "local",
      fullPath,
      thumbPath: thumb.byteLength > 0 ? thumbPath : null,
    };
  }

  resolve(hash: string): MediaResolved {
    const row = this.#find(hash);
    if (!row) return { state: "missing", fullPath: null, thumbPath: null };
    if (row.localPath && existsSync(row.localPath)) {
      return { state: "local", fullPath: row.localPath, thumbPath: row.thumbPath };
    }
    return { state: "remote", fullPath: null, thumbPath: null };
  }

  async ensure(noteId: string, hash: string): Promise<MediaResolved> {
    const resolved = this.resolve(hash);
    if (resolved.state === "local") return resolved;
    const thumbDirectory = join(this.#mediaDirectory, "thumb");
    mkdirSync(thumbDirectory, { recursive: true });
    const fullPath = join(this.#mediaDirectory, hash);
    const requestedThumbPath = join(thumbDirectory, `${hash}.jpg`);
    let download: Awaited<ReturnType<MediaSync["download"]>>;
    try {
      download = await this.#media.download(hash, fullPath, requestedThumbPath);
    } catch {
      return { state: "missing", fullPath: null, thumbPath: null };
    }
    const thumbPath = download.hasThumbnail ? requestedThumbPath : null;
    const current = this.#find(hash);
    if (current) {
      this.#db
        .prepare("UPDATE local_media_blobs SET local_path=?,thumb_path=?,upload_state='uploaded' WHERE hash=?")
        .run(fullPath, thumbPath, hash);
    } else {
      this.#db
        .prepare(
          `INSERT INTO local_media_blobs
           (hash,mime,media_type,bytes,original_filename,local_path,thumb_path,upload_state)
           VALUES (?,?,?,?,?,?,?,'uploaded')`,
        )
        .run(hash, download.mime, download.mime.startsWith("video/") ? "video" : "image", download.bytes, "", fullPath, thumbPath);
    }
    this.#db
      .prepare(
        `INSERT INTO local_note_media_references(note_id,account_id,hash,sync_state)
         VALUES (?,'',?,'synced')
         ON CONFLICT(note_id,hash) DO UPDATE SET deleted_at=NULL`,
      )
      .run(noteId, hash);
    return { state: "local", fullPath, thumbPath };
  }

  delete(noteId: string, hash: string): void {
    const row = this.#find(hash);
    this.#db
      .prepare("DELETE FROM local_note_media_references WHERE note_id=? AND hash=?")
      .run(noteId, hash);
    const references = Number(
      (this.#db
        .prepare("SELECT count(*) AS count FROM local_note_media_references WHERE hash=?")
        .get(hash) as { count: number }).count,
    );
    if (references > 0) return;
    for (const path of [row?.localPath, row?.thumbPath]) {
      if (!path) continue;
      try {
        unlinkSync(path);
      } catch {}
    }
    this.#db.prepare("DELETE FROM local_media_blobs WHERE hash=?").run(hash);
  }

  save(hash: string, filename: string): string {
    const row = this.#find(hash);
    if (!row) throw new Error("media not found");
    if (!row.localPath) throw new Error("media has no local copy yet");
    if (!existsSync(row.localPath)) throw new Error("media file is not on disk");
    const extension = row.mime.split("/").at(-1) || "bin";
    const requestedStem = parse(basename(filename.trim())).name || "notebook-media";
    mkdirSync(this.#downloadsDirectory, { recursive: true });
    let target = join(this.#downloadsDirectory, `${requestedStem}.${extension}`);
    let suffix = 1;
    while (existsSync(target)) {
      target = join(this.#downloadsDirectory, `${requestedStem} (${suffix}).${extension}`);
      suffix += 1;
    }
    copyFileSync(row.localPath, target);
    return target;
  }

  #find(hash: string): MediaRow | null {
    const row = this.#db
      .prepare(
        `SELECT blob.hash,reference.note_id,reference.account_id,blob.mime,blob.media_type,
                blob.width,blob.height,blob.duration_seconds,blob.bytes,
                COALESCE(reference.original_filename,blob.original_filename) AS original_filename,
                blob.local_path,blob.thumb_path,blob.upload_state
         FROM local_media_blobs blob
         LEFT JOIN local_note_media_references reference ON reference.hash=blob.hash
         WHERE blob.hash=? ORDER BY reference.created_at LIMIT 1`,
      )
      .get(hash) as StoredMediaRow | undefined;
    return row ? toMediaRow(row) : null;
  }
}

export class MediaSync {
  readonly #db: DatabaseSync;
  readonly #origin: string;
  readonly #getAccessToken: () => Promise<string | null>;
  readonly #fetch: typeof globalThis.fetch;
  readonly #onProgress: ((progress: MediaProgress) => void) | undefined;
  readonly #logger: Pick<Console, "error">;

  constructor(options: MediaSyncOptions) {
    this.#db = options.db;
    this.#origin = backendOrigin(options.backendUrl);
    this.#getAccessToken = options.getAccessToken;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#onProgress = options.onProgress;
    this.#logger = options.logger ?? console;
  }

  async flush(accountId: string): Promise<number> {
    const rows = this.#db
      .prepare(
        `SELECT blob.hash,reference.note_id,reference.account_id,blob.mime,blob.media_type,
                blob.width,blob.height,blob.duration_seconds,blob.bytes,
                reference.original_filename,blob.local_path,blob.thumb_path,blob.upload_state
         FROM local_note_media_references reference
         JOIN local_media_blobs blob ON blob.hash=reference.hash
         WHERE reference.sync_state='pending' AND reference.deleted_at IS NULL
           AND reference.account_id=?
         ORDER BY reference.created_at ASC LIMIT ?`,
      )
      .all(accountId, MEDIA_FLUSH_BATCH) as StoredMediaRow[];
    let uploaded = 0;
    for (const stored of rows) {
      const row = toMediaRow(stored);
      if (!row.localPath || !existsSync(row.localPath)) {
        this.#logger.error(`media sync: ${row.hash} has no readable local path, skipping`);
        continue;
      }
      const filename = row.originalFilename || row.hash;
      try {
        await this.upload(row.hash, row.noteId, row.mime, filename, row.localPath);
        this.#db
          .prepare("UPDATE local_note_media_references SET sync_state='synced' WHERE note_id=? AND hash=?")
          .run(row.noteId, row.hash);
        this.#db.prepare("UPDATE local_media_blobs SET upload_state='uploaded' WHERE hash=?").run(row.hash);
        uploaded += 1;
      } catch (error) {
        this.#logger.error(`media sync: upload ${row.hash} failed:`, error);
      }
    }
    return uploaded;
  }

  async upload(hash: string, noteId: string, mime: string, filename: string, path: string): Promise<void> {
    const token = await this.#accessToken();
    const form = new FormData();
    form.set("noteId", noteId);
    form.set("hash", hash);
    form.set("idempotencyKey", `desktop:${noteId}:${hash}`);
    form.set("file", await openAsBlob(path, { type: mime }), filename || hash);
    const response = await this.#fetch(`${this.#origin}/notebook/media/upload`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    });
    if (!response.ok) throw new Error(`media upload failed (${response.status}): ${await response.text()}`);
  }

  async download(
    hash: string,
    fullPath: string,
    thumbPath: string,
  ): Promise<{ bytes: number; hasThumbnail: boolean; mime: string }> {
    const token = await this.#accessToken();
    const headers = { authorization: `Bearer ${token}` };
    const response = await this.#fetch(`${this.#origin}/notebook/media/${hash}`, { headers });
    if (!response.ok) throw new Error(`media download failed (${response.status}) for ${hash}`);
    const mime = response.headers.get("content-type") ?? "application/octet-stream";
    const total = Number(response.headers.get("content-length") ?? 0) || 0;
    const bytes = await streamVerifiedResponse(
      response,
      fullPath,
      hash,
      (loaded) => this.#onProgress?.({ hash, loaded, total }),
      total,
    );

    const thumbResponse = await this.#fetch(`${this.#origin}/notebook/media/${hash}/thumb`, { headers });
    if (thumbResponse.ok) {
      await writeFile(thumbPath, new Uint8Array(await thumbResponse.arrayBuffer()));
    }
    return { bytes, hasThumbnail: thumbResponse.ok, mime };
  }

  async #accessToken(): Promise<string> {
    const token = await this.#getAccessToken();
    if (!token) throw new Error("Not signed in");
    return token;
  }
}

export function backendOrigin(backendUrl: string): string {
  const trimmed = backendUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/graphql") ? trimmed.slice(0, -"/graphql".length) : trimmed;
}

export function verifyMediaBytes(bytes: Uint8Array, expectedHash: string): void {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedHash) throw new Error(`media hash mismatch: expected ${expectedHash}, got ${actual}`);
}

async function verifyMediaFile(path: string, expectedHash: string): Promise<void> {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  const actual = digest.digest("hex");
  if (actual !== expectedHash) {
    throw new Error(`media hash mismatch: expected ${expectedHash}, got ${actual}`);
  }
}

async function streamVerifiedResponse(
  response: Response,
  targetPath: string,
  expectedHash: string,
  progress: (loaded: number) => void,
  total: number,
): Promise<number> {
  if (!response.body) throw new Error("media response has no body");
  const temporaryPath = `${targetPath}.partial-${randomUUID()}`;
  const file = await open(temporaryPath, "w");
  const reader = response.body.getReader();
  const digest = createHash("sha256");
  let loaded = 0;
  let lastEmit = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value);
      digest.update(value);
      loaded += value.byteLength;
      if (loaded - lastEmit >= MEDIA_PROGRESS_STEP || loaded === total) {
        lastEmit = loaded;
        progress(loaded);
      }
    }
    await file.sync();
    await file.close();
    const actualHash = digest.digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(
        `media hash mismatch: expected ${expectedHash}, got ${actualHash}`,
      );
    }
    await rename(temporaryPath, targetPath);
    return loaded;
  } catch (error) {
    await file.close().catch(() => {});
    await rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

function toMediaRow(row: StoredMediaRow): MediaRow {
  return {
    hash: row.hash,
    noteId: row.note_id,
    accountId: row.account_id,
    mime: row.mime,
    mediaType: row.media_type,
    width: row.width,
    height: row.height,
    durationSeconds: row.duration_seconds,
    bytes: row.bytes,
    originalFilename: row.original_filename,
    localPath: row.local_path,
    thumbPath: row.thumb_path,
    uploadState: row.upload_state,
  };
}
