import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityNeuralNetwork } from "./activity-neural-network";

describe("activity neural network rendering", () => {
	test("renders an accessible, static loading state without fabricating activity", () => {
		const html = renderToStaticMarkup(
			<ActivityNeuralNetwork entries={[]} runStatus="COMPLETED" loading />,
		);
		expect(html).toContain(
			'aria-label="Response activity network: Loading saved activity"',
		);
		expect(html).not.toContain("iframe");
		expect(html).not.toContain("<path");
		expect(html).not.toContain("source connected");
	});

	test("renders a queued request immediately without loading the decorative scene on the server", () => {
		const html = renderToStaticMarkup(
			<ActivityNeuralNetwork entries={[]} runStatus="QUEUED" />,
		);
		expect(html).toContain("Waiting to start");
		expect(html).toContain("<path");
		expect(html).not.toContain("iframe");
	});

	test("keeps cancellation, failure, and connection loss distinct", () => {
		for (const [runStatus, label] of [
			["CANCELLED", "Response cancelled"],
			["FAILED", "Response failed"],
			["WAITING_FOR_APPROVAL", "Waiting for approval"],
		] as const) {
			const html = renderToStaticMarkup(
				<ActivityNeuralNetwork entries={[]} runStatus={runStatus} />,
			);
			expect(html).toContain(label);
			expect(html).not.toContain("iframe");
		}
		const reconnecting = renderToStaticMarkup(
			<ActivityNeuralNetwork entries={[]} runStatus="RUNNING" reconnecting />,
		);
		expect(reconnecting).toContain("Reconnecting to activity");
		expect(reconnecting).not.toContain("Response failed");
	});
});
