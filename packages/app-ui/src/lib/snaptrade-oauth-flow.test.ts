import { describe, expect, test } from "bun:test";
import { snapTradeOAuthPhase } from "./snaptrade-oauth-flow";

describe("SnapTrade OAuth flow", () => {
	test("routes authorized connect and reauthorization attempts differently", () => {
		expect(
			snapTradeOAuthPhase({ status: "authorized", intent: "connect" }),
		).toBe("setup");
		expect(
			snapTradeOAuthPhase({ status: "authorized", intent: "reauthorize" }),
		).toBe("reauthorizing");
	});

	test("keeps polling states separate from terminal failures", () => {
		expect(snapTradeOAuthPhase({ status: "pending", intent: "connect" })).toBe(
			"waiting",
		);
		expect(
			snapTradeOAuthPhase({ status: "processing", intent: "connect" }),
		).toBe("waiting");
		for (const status of ["denied", "failed", "expired"] as const) {
			expect(snapTradeOAuthPhase({ status, intent: "connect" })).toBe("error");
		}
	});
});
