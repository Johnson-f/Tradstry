import { describe, expect, test } from "bun:test";
import { BrokerageHistorySetup } from "@tradstry/app-ui/components/brokerage/history-import-policy";
import {
	buildAccountImports,
	latestImportDate,
	policyIsComplete,
} from "@tradstry/app-ui/components/brokerage/history-import-policy-model";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("brokerage history import policy", () => {
	test("applies one default with sparse account overrides", () => {
		const imports = buildAccountImports(
			new Set(["cash", "margin"]),
			{ mode: "one_year" },
			new Map([["margin", { mode: "all" }]]),
		);
		expect(imports).toEqual([
			{ snaptradeAccountId: "cash", policy: { mode: "one_year" } },
			{ snaptradeAccountId: "margin", policy: { mode: "all" } },
		]);
	});

	test("requires a date only for a custom boundary", () => {
		expect(policyIsComplete({ mode: "one_year" })).toBe(true);
		expect(policyIsComplete({ mode: "custom" })).toBe(false);
		expect(
			policyIsComplete({ mode: "custom", customStartDate: "2025-01-01" }),
		).toBe(true);
	});

	test("custom history rejects impossible dates and dates after the brokerage day", () => {
		for (const customStartDate of [
			"",
			"not-a-date",
			"2025-02-29",
			"2026-04-31",
			"2026-08-31",
		]) {
			expect(
				policyIsComplete({ mode: "custom", customStartDate }, "2026-08-30"),
			).toBe(false);
		}
		expect(
			policyIsComplete(
				{ mode: "custom", customStartDate: "2024-02-29" },
				"2026-08-30",
			),
		).toBe(true);
		expect(
			policyIsComplete(
				{ mode: "custom", customStartDate: "2026-08-30" },
				"2026-08-30",
			),
		).toBe(true);
	});

	test("the date picker follows the server's Eastern date across midnight and daylight saving", () => {
		expect(latestImportDate(new Date("2026-08-31T02:00:00Z"))).toBe(
			"2026-08-30",
		);
		expect(latestImportDate(new Date("2026-01-01T04:30:00Z"))).toBe(
			"2025-12-31",
		);
	});

	test("deselected accounts and their custom overrides are excluded from submission", () => {
		expect(
			buildAccountImports(
				new Set(["cash"]),
				{ mode: "two_years" },
				new Map([["margin", { mode: "custom" }]]),
			),
		).toEqual([{ snaptradeAccountId: "cash", policy: { mode: "two_years" } }]);
	});

	test("renders account mapping, the recommended range, and provider scope", () => {
		const html = renderToStaticMarkup(
			createElement(BrokerageHistorySetup, {
				accounts: [
					{
						id: "cash",
						name: "Webull Individual Cash",
						institutionName: "Webull",
						linkedWorkspaceId: null,
						linkedWorkspaceName: null,
						current: false,
					},
				],
				workspaceName: "Main Workspace",
				onSubmit: () => undefined,
				isSubmitting: false,
			}),
		);
		expect(html).toContain("Choose accounts and history");
		expect(html).toContain("Past year");
		expect(html).toContain("Recommended");
		expect(html).toContain("provider may still prepare all available history");
	});
});
