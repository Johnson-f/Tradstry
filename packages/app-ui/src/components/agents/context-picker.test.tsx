import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ContextPicker } from "./context-picker";

test("context search options render with stable keys", () => {
  const errors: string[] = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    renderToStaticMarkup(
      <ContextPicker
        query=""
        results={[
          {
            key: "note:1",
            kind: "NOTE",
            id: "1",
            title: "Journal",
            subtitle: "Notebook note",
            metadataJson: "{}",
          },
        ]}
        loading={false}
        error={null}
        activeIndex={0}
        selectedKeys={new Set()}
        customRangeOpen={false}
        onActiveIndexChange={() => {}}
        onSelect={() => {}}
        onOpenCustomRange={() => {}}
        onCloseCustomRange={() => {}}
      />,
    );
  } finally {
    console.error = original;
  }
  expect(errors.join("\n")).not.toContain('unique "key" prop');
});
