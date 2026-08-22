import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	StrategyAvailabilityFields,
	validateStrategyApplicability,
} from "./strategy-availability";

const workspaces = [
	{ id: "cash", name: "Webull Individual Cash" },
	{ id: "margin", name: "Webull Individual Margin" },
];

test("universal availability explains automatic access for future accounts", () => {
	const html = renderToStaticMarkup(
		<StrategyAvailabilityFields
			workspaces={workspaces}
			availability="all"
			workspaceIds={[]}
			onChange={() => {}}
		/>,
	);

	expect(html).toContain("All accounts");
	expect(html).toContain('aria-pressed="true"');
	expect(html).toContain(
		"Available automatically in every current and future account.",
	);
	expect(html).not.toContain("Webull Individual Cash");
});

test("selected availability stays compact and exposes chosen accounts", () => {
	const html = renderToStaticMarkup(
		<StrategyAvailabilityFields
			workspaces={workspaces}
			availability="selected"
			workspaceIds={["cash"]}
			onChange={() => {}}
		/>,
	);

	expect(html).toContain("Selected accounts");
	expect(html).toContain('aria-pressed="true"');
	expect(html).toContain("Webull Individual Cash");
	expect(html).not.toContain("Webull Individual Margin");
	expect(html).toContain("Add account");
	expect(html).toContain('aria-label="Remove Webull Individual Cash"');
	expect(validateStrategyApplicability("selected", [])).toBe(
		"Choose at least one account.",
	);
	expect(validateStrategyApplicability("all", [])).toBeNull();
});
