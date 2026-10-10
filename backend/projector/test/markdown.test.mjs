import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToJson } from "../markdown.mjs";

/** Flatten a document_json's text so assertions read against content, not structure. */
function textOf(documentJson) {
  const out = [];
  const walk = (node) => {
    if (typeof node.text === "string") out.push(node.text);
    for (const child of node.children ?? []) walk(child);
  };
  walk(JSON.parse(documentJson).root);
  return out.join("\n");
}

function headings(documentJson) {
  const out = [];
  const walk = (node) => {
    if (node.type === "heading") {
      const text = (node.children ?? []).map((c) => c.text ?? "").join("");
      out.push(`${node.tag}:${text}`);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(JSON.parse(documentJson).root);
  return out;
}

test("markdown becomes real Lexical structure, not a wall of text", () => {
  const json = markdownToJson(
    "# Weekly Report\n\nYou traded **well**.\n\n## Mistakes\n\n- chased AEHR\n- chased INOD\n",
  );
  assert.deepEqual(headings(json), ["h1:Weekly Report", "h2:Mistakes"]);
  const text = textOf(json);
  assert.match(text, /chased AEHR/);
  assert.match(text, /chased INOD/);
});
