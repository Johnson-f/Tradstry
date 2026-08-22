import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	DashboardCardError,
	dashboardErrorCategory,
	dashboardErrorDescription,
} from "./card-error";

test("network failures use helpful copy without exposing transport details", () => {
	const error = new Error("Failed to fetch https://backend.internal/graphql");
	const html = renderToStaticMarkup(
		<DashboardCardError
			title="Trading Calendar"
			error={error}
			onRetry={() => {}}
		/>,
	);

	expect(dashboardErrorCategory(error)).toBe("network");
	expect(dashboardErrorDescription(error)).toBe(
		"We couldn’t reach Tradstry. Check your connection and try again.",
	);
	expect(html).toContain("Trading Calendar couldn’t load");
	expect(html).toContain("Try again");
	expect(html).not.toContain("Failed to fetch");
	expect(html).not.toContain("backend.internal");
});

test("session failures explain the recovery without exposing authentication errors", () => {
	const error = new Error("401 Unauthorized: JWT expired");
	const html = renderToStaticMarkup(
		<DashboardCardError
			title="Dashboard metrics"
			error={error}
			onRetry={() => {}}
		/>,
	);

	expect(dashboardErrorCategory(error)).toBe("session");
	expect(html).toContain(
		"Your session may have expired. Refresh the page or sign in again.",
	);
	expect(html).not.toContain("JWT");
});

test("unknown failures remain actionable and generic", () => {
	const error = new Error("database relation trade_episodes does not exist");
	expect(dashboardErrorCategory(error)).toBe("unknown");
	expect(dashboardErrorDescription(error)).toBe(
		"Something interrupted this view. Try again in a moment.",
	);
});
