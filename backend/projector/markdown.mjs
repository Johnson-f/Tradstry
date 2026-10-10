import { createHeadlessEditor } from "@lexical/headless";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { MARKDOWN_TRANSFORMERS, NAMESPACE, NODES } from "./nodes.mjs";

function editor() {
  return createHeadlessEditor({
    namespace: NAMESPACE,
    nodes: NODES,
    onError: (e) => {
      throw e;
    },
  });
}

/** Markdown -> Lexical `document_json`, for a note that does not exist yet. */
export function markdownToJson(markdown) {
  const ed = editor();
  ed.update(
    () => {
      $convertFromMarkdownString(markdown, MARKDOWN_TRANSFORMERS);
    },
    { discrete: true },
  );
  return JSON.stringify(ed.getEditorState().toJSON());
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));

  if (input.op === "toJson") {
    process.stdout.write(
      JSON.stringify({ documentJson: markdownToJson(input.markdown) }),
    );
    return;
  }

  throw new Error(`markdown.mjs: unknown op ${input.op}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    process.stderr.write(String(e?.stack ?? e) + "\n");
    process.exit(1);
  });
}
