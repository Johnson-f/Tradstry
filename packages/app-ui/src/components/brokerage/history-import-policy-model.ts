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
		return policy.customStartDate
			? `Since ${policy.customStartDate}`
			: "Custom start date";
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
	today?: string,
): boolean {
	if (policy.mode !== "custom") return true;
	const value = policy.customStartDate;
	if (
		!value ||
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		value > (today ?? latestImportDate())
	)
		return false;
	const date = new Date(`${value}T00:00:00Z`);
	return (
		!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	);
}

export function latestImportDate(now = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(now);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((item) => item.type === type)?.value;
	return `${part("year")}-${part("month")}-${part("day")}`;
}
