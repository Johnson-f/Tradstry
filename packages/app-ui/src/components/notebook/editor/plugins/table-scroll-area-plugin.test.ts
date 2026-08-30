import { expect, test } from "bun:test";
import { withDOM } from "@lexical/headless/dom";
import { isDOMUnmanaged } from "lexical";
import { attachTableScrollArea } from "./table-scroll-area-plugin";

function fixture(document: Document) {
  const wrapper = document.createElement("div");
  const table = document.createElement("table");
  const cell = table.insertRow().insertCell();
  cell.textContent = "Saved note";
  wrapper.append(table);
  const container = document.createElement("div");
  const slot = document.createElement("div");
  container.append(slot);
  return { mount: { key: "table", wrapper, table, container }, slot, cell };
}

test("scroll shell preserves the exact editor-owned table and cells", () => {
  withDOM(({ document }) => {
    const { mount, slot, cell } = fixture(document);
    const detach = attachTableScrollArea(mount, slot);
    expect(mount.wrapper.querySelector("table")).toBe(mount.table);
    expect(mount.table.rows[0].cells[0]).toBe(cell);
    expect(isDOMUnmanaged(mount.wrapper)).toBe(true);
    expect(isDOMUnmanaged(cell)).toBe(false);
    detach();
    expect(mount.table.parentElement).toBe(mount.wrapper);
    expect(mount.container.parentElement).toBeNull();
    expect(cell.textContent).toBe("Saved note");
  });
});

test("scroll shell survives setup-cleanup-setup without losing the table", () => {
  withDOM(({ document }) => {
    const { mount, slot } = fixture(document);
    attachTableScrollArea(mount, slot)();
    const detach = attachTableScrollArea(mount, slot);
    expect(mount.wrapper.querySelectorAll("table").length).toBe(1);
    expect(mount.table.parentElement).toBe(slot);
    detach();
    expect(mount.wrapper.querySelector("table")).toBe(mount.table);
  });
});

test("stale shell cleanup cannot pull the table out of its new scroll area", () => {
  withDOM(({ document }) => {
    const { mount, slot } = fixture(document);
    const detachOld = attachTableScrollArea(mount, slot);
    const nextContainer = document.createElement("div");
    const nextSlot = document.createElement("div");
    nextContainer.append(nextSlot);
    const detachNew = attachTableScrollArea(
      { ...mount, container: nextContainer },
      nextSlot,
    );
    detachOld();
    expect(mount.table.parentElement).toBe(nextSlot);
    expect(mount.wrapper.querySelectorAll("table").length).toBe(1);
    detachNew();
    expect(mount.table.parentElement).toBe(mount.wrapper);
  });
});
