import type {
	BrokerageAccountImportInput,
	TransactionImportMode,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";

export const HISTORY_OPTIONS: ReadonlyArray<{
	mode: TransactionImportMode;
	label: string;
	description: string;
}> = [
	{
		mode: "one_year",
		label: "Past year",
		description: "Recommended for a fast, useful first import.",
	},
	{
		mode: "two_years",
		label: "Past 2 years",
		description: "More context for longer-term comparisons.",
	},
	{
		mode: "all",
		label: "All available history",
		description: "Import every activity your brokerage exposes.",
	},
	{
		mode: "custom",
		label: "Custom start date",
		description: "Choose the earliest date Tradstry should import.",
	},
] as const;

export function policyLabel(policy: TransactionImportPolicyInput): string {
	if (policy.mode === "custom")
		return `Since ${policy.customStartDate ?? "custom date"}`;
	return (
		HISTORY_OPTIONS.find((option) => option.mode === policy.mode)?.label ??
		policy.mode
	);
}

export function buildAccountImports(
	selectedIds: Set<string>,
	defaultPolicy: TransactionImportPolicyInput,
	overrides: Map<string, TransactionImportPolicyInput>,
): BrokerageAccountImportInput[] {
	return [...selectedIds].map((snaptradeAccountId) => ({
		snaptradeAccountId,
		policy: overrides.get(snaptradeAccountId) ?? defaultPolicy,
	}));
}

export function policyIsComplete(
	policy: TransactionImportPolicyInput,
): boolean {
	return policy.mode !== "custom" || Boolean(policy.customStartDate);
}
