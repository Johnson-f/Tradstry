import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { BrokerageTransaction } from "@tradstry/app-ui/lib/types/brokerage";
import { BrokerageTable, updateBrokerageSelection } from "./brokerage-table";

test("selecting a visible group excludes linked fills and keeps selections from other pages", () => {
  const previous = new Set(["other-page"]);
  const next = updateBrokerageSelection(
    previous,
    ["buy", "sell", "linked"],
    new Set(["linked"]),
    true,
  );
  expect([...next]).toEqual(["other-page", "buy", "sell"]);
  expect([...previous]).toEqual(["other-page"]);
});

test("deselecting the current page preserves off-page selections", () => {
  expect([
    ...updateBrokerageSelection(
      new Set(["other-page", "buy", "sell"]),
      ["buy", "sell"],
      new Set(),
      false,
    ),
  ]).toEqual(["other-page"]);
});

const transaction: BrokerageTransaction = {
  id: "buy",
  userId: "user",
  workspaceId: "workspace",
  snaptradeId: "broker-fill",
  symbol: "XPON",
  symbolDescription: "Expion360",
  rawSymbol: "XPON",
  currency: "USD",
  transactionType: "BUY",
  optionType: null,
  price: 8.61,
  units: 2,
  amount: -17.22,
  fee: 0,
  fxRate: null,
  description: null,
  tradeDate: "2026-08-26",
  settlementDate: "2026-08-27",
  institution: "Webull",
  externalReferenceId: null,
  contractMultiplier: 1,
  underlyingSymbol: null,
  optionKind: null,
  strikePrice: null,
  optionExpiration: null,
  createdAt: "2026-08-26",
  updatedAt: "2026-08-26",
};

function renderTable(
  transactions: BrokerageTransaction[],
  linkedTransactionIds = new Set<string>(),
  dateRange: "ALL" | "CUSTOM" = "ALL",
) {
  return renderToStaticMarkup(
    <BrokerageTable
      transactions={transactions}
      total={transactions.length}
      offset={0}
      page={0}
      pageSize={100}
      hasNextPage={false}
      hasPrevPage={false}
      onNextPage={() => {}}
      onPrevPage={() => {}}
      onPageSizeChange={() => {}}
      isLoading={false}
      selectedIds={new Set()}
      onSelectedIdsChange={() => {}}
      linkedTransactionIds={linkedTransactionIds}
      dateRange={dateRange}
      onDateRangeChange={() => {}}
    />,
  );
}

test("fills start collapsed under their month and security without presenting cash as profit", () => {
  const html = renderTable([transaction]);
  expect(html).toContain("August 2026");
  expect(html).toContain("XPON");
  expect(html).toContain("Expion360");
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain("Expand all");
  expect(html).toContain("Cash amount");
  expect(html).not.toContain("17.22");
  expect(html).not.toContain("Execution ledger");
});

test("an entirely journalled group disables all selection controls", () => {
  const html = renderTable([transaction], new Set([transaction.id]));
  const controls = html.match(/<button[^>]+role="checkbox"[^>]*>/g) ?? [];
  expect(controls).toHaveLength(3);
  expect(controls.every((control) => control.includes("disabled"))).toBe(true);
  expect(html).toContain("In journal");
});

test("exact-date links keep a custom-date label and missing symbols remain accessible", () => {
  const html = renderTable(
    [
      {
        ...transaction,
        symbol: null,
        symbolDescription: null,
        tradeDate: null,
      },
    ],
    new Set(),
    "CUSTOM",
  );
  expect(html).toContain("Custom dates");
  expect(html).toContain("Unknown date");
  expect(html).toContain("Other activity");
});
