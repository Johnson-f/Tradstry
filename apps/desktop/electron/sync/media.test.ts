import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDesktopDatabase } from "./database.ts";
import { backendOrigin, MediaRepository, MediaSync, verifyMediaBytes } from "./media.ts";

const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

test("media routes are derived from the GraphQL backend origin", () => {
  assert.equal(backendOrigin("https://api.example/graphql"), "https://api.example");
  assert.equal(backendOrigin("https://api.example/"), "https://api.example");
});

test("media hash verification rejects corrupt bytes", () => {
  const bytes = Buffer.from("valid");
  const hash = createHash("sha256").update(bytes).digest("hex");
  assert.doesNotThrow(() => verifyMediaBytes(bytes, hash));
  assert.throws(() => verifyMediaBytes(Buffer.from("bad"), hash), /media hash mismatch/);
});

test("repository stores media from file paths", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tradstry-media-store-"));
  try {
    const sourcePath = join(directory, "source.png");
    const bytes = Buffer.from("streamed source");
    writeFileSync(sourcePath, bytes);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const store = openDesktopDatabase(":memory:", schema);
    const sync = new MediaSync({
      db: store.db,
      backendUrl: "https://api.example/graphql",
      getAccessToken: async () => null,
    });
    const repository = new MediaRepository({
      db: store.db,
      media: sync,
      dataDirectory: join(directory, "data"),
      downloadsDirectory: join(directory, "downloads"),
    });
    await repository.store({
      noteId: "note",
      accountId: "account",
      hash,
      mime: "image/png",
      mediaType: "image",
      width: 10,
      height: 10,
      durationSeconds: 0,
      originalFilename: "source.png",
      sourcePath,
      thumb: Buffer.from("thumb"),
    });
    assert.deepEqual(readFileSync(repository.resolve(hash).fullPath!), bytes);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("flush uploads pending media and marks only successful rows", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tradstry-media-"));
  try {
    const path = join(directory, "hash");
    writeFileSync(path, "bytes");
    const store = openDesktopDatabase(":memory:", schema);
    store.db
      .prepare(
        `INSERT INTO local_media_blobs
         (hash,mime,media_type,bytes,original_filename,local_path,upload_state)
         VALUES (?,?,?,?,?,?,'pending')`,
      )
      .run("hash", "image/png", "image", 5, "image.png", path);
    store.db
      .prepare(
        `INSERT INTO local_note_media_references
         (note_id,account_id,hash,original_filename,sync_state)
         VALUES (?,?,?,?,'pending')`,
      )
      .run("note", "account", "hash", "image.png");
    const requests: string[] = [];
    const media = new MediaSync({
      db: store.db,
      backendUrl: "https://api.example/graphql",
      getAccessToken: async () => "token",
      fetch: async (input) => {
        requests.push(String(input));
        return new Response(null, { status: 204 });
      },
    });
    assert.equal(await media.flush("account"), 1);
    assert.deepEqual(requests, ["https://api.example/notebook/media/upload"]);
    assert.equal(
      store.db
        .prepare(
          "SELECT sync_state FROM local_note_media_references WHERE note_id=? AND hash=?",
        )
        .get("note", "hash")?.sync_state,
      "synced",
    );
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("download streams to disk and verifies the content hash", async () => {
  const directory = mkdtempSync(join(tmpdir(), "tradstry-media-download-"));
  try {
    const bytes = Buffer.from("streamed bytes");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const fullPath = join(directory, hash);
    const thumbPath = join(directory, `${hash}.jpg`);
    const store = openDesktopDatabase(":memory:", schema);
    const media = new MediaSync({
      db: store.db,
      backendUrl: "https://api.example/graphql",
      getAccessToken: async () => "token",
      fetch: async (input) =>
        String(input).endsWith("/thumb")
          ? new Response(null, { status: 404 })
          : new Response(bytes, {
              status: 200,
              headers: {
                "content-type": "image/png",
                "content-length": String(bytes.byteLength),
              },
            }),
    });

    const result = await media.download(hash, fullPath, thumbPath);
    assert.equal(result.bytes, bytes.byteLength);
    assert.equal(result.hasThumbnail, false);
    assert.deepEqual(readFileSync(fullPath), bytes);
    store.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
