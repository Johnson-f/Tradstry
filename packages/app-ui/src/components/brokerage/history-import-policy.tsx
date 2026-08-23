"use client";

import {
	buildAccountImports,
	HISTORY_OPTIONS,
	policyIsComplete,
	policyLabel,
} from "@tradstry/app-ui/components/brokerage/history-import-policy-model";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import type {
	BrokerageAccountImportInput,
	BrokerageConnectionAccount,
	TransactionImportMode,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { useMemo, useState } from "react";

export function BrokerageHistorySetup({
	accounts,
	workspaceName,
	onSubmit,
	isSubmitting,
}: {
	accounts: BrokerageConnectionAccount[];
	workspaceName: string;
	onSubmit: (value: {
		primarySnaptradeAccountId: string;
		accounts: BrokerageAccountImportInput[];
	}) => void;
	isSubmitting: boolean;
}) {
	const [selectedIds, setSelectedIds] = useState(
		() => new Set(accounts.map((account) => account.id)),
	);
	const [primaryId, setPrimaryId] = useState(accounts[0]?.id ?? "");
	const [defaultPolicy, setDefaultPolicy] =
		useState<TransactionImportPolicyInput>({
			mode: "one_year",
		});
	const [overrides, setOverrides] = useState(
		() => new Map<string, TransactionImportPolicyInput>(),
	);

	const imports = useMemo(
		() => buildAccountImports(selectedIds, defaultPolicy, overrides),
		[selectedIds, defaultPolicy, overrides],
	);
	const valid =
		selectedIds.size > 0 &&
		selectedIds.has(primaryId) &&
		policyIsComplete(defaultPolicy) &&
		imports.every((item) => policyIsComplete(item.policy));

	function updateSelected(id: string, checked: boolean) {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else if (id !== primaryId) next.delete(id);
			return next;
		});
	}

	function updateOverride(id: string, mode: "default" | TransactionImportMode) {
		setOverrides((current) => {
			const next = new Map(current);
			if (mode === "default") next.delete(id);
			else next.set(id, { mode });
			return next;
		});
	}

	return (
		<section className="w-full max-w-4xl rounded-2xl border bg-background p-5 shadow-xl sm:p-7">
			<p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
				Brokerage import setup
			</p>
			<h1 className="mt-2 text-2xl font-semibold tracking-tight">
				Choose accounts and history
			</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Map the account for {workspaceName}, then choose what Tradstry should
				import.
			</p>

			<div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
				<div>
					<h2 className="text-sm font-semibold">Brokerage accounts</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						The primary account uses this workspace. Other selections get
						separate workspaces.
					</p>
					<div className="mt-3 space-y-2">
						{accounts.map((account) => {
							const selected = selectedIds.has(account.id);
							const override = overrides.get(account.id);
							return (
								<div key={account.id} className="rounded-lg border p-3">
									<div className="flex items-start gap-3">
										<Checkbox
											checked={selected}
											onCheckedChange={(checked) =>
												updateSelected(account.id, checked === true)
											}
											aria-label={`Import ${account.name}`}
										/>
										<div className="min-w-0 flex-1">
											<p className="truncate text-sm font-medium">
												{account.name}
											</p>
											<p className="text-xs text-muted-foreground">
												{account.institutionName ?? "Brokerage account"}
											</p>
										</div>
										<label className="flex items-center gap-1.5 text-xs">
											<input
												type="radio"
												name="primary-account"
												checked={primaryId === account.id}
												onChange={() => {
													setPrimaryId(account.id);
													setSelectedIds((current) =>
														new Set(current).add(account.id),
													);
												}}
											/>
											{workspaceName}
										</label>
									</div>
									{selected ? (
										<div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
											<label
												className="text-xs text-muted-foreground"
												htmlFor={`history-${account.id}`}
											>
												History
											</label>
											<select
												id={`history-${account.id}`}
												className="h-8 rounded-md border bg-background px-2 text-xs"
												value={override?.mode ?? "default"}
												onChange={(event) =>
													updateOverride(
														account.id,
														event.target.value as
															| "default"
															| TransactionImportMode,
													)
												}
											>
												<option value="default">
													Use default · {policyLabel(defaultPolicy)}
												</option>
												{HISTORY_OPTIONS.map((option) => (
													<option key={option.mode} value={option.mode}>
														{option.label}
													</option>
												))}
											</select>
											{override?.mode === "custom" ? (
												<input
													type="date"
													max={new Date().toISOString().slice(0, 10)}
													className="h-8 rounded-md border bg-background px-2 text-xs"
													value={override.customStartDate ?? ""}
													onChange={(event) =>
														setOverrides((current) =>
															new Map(current).set(account.id, {
																mode: "custom",
																customStartDate: event.target.value,
															}),
														)
													}
												/>
											) : null}
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				</div>

				<div>
					<h2 className="text-sm font-semibold">Default history</h2>
					<div className="mt-3 space-y-2">
						{HISTORY_OPTIONS.map((option) => (
							<label
								key={option.mode}
								className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[:checked]:border-foreground"
							>
								<input
									type="radio"
									name="default-history"
									checked={defaultPolicy.mode === option.mode}
									onChange={() => setDefaultPolicy({ mode: option.mode })}
								/>
								<span>
									<span className="block text-sm font-medium">
										{option.label}
										{option.mode === "one_year" ? " · Recommended" : ""}
									</span>
									<span className="mt-0.5 block text-xs text-muted-foreground">
										{option.description}
									</span>
								</span>
							</label>
						))}
					</div>
					{defaultPolicy.mode === "custom" ? (
						<input
							type="date"
							aria-label="Default custom start date"
							max={new Date().toISOString().slice(0, 10)}
							className="mt-3 h-9 w-full rounded-md border bg-background px-3 text-sm"
							value={defaultPolicy.customStartDate ?? ""}
							onChange={(event) =>
								setDefaultPolicy({
									mode: "custom",
									customStartDate: event.target.value,
								})
							}
						/>
					) : null}
				</div>
			</div>

			<div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
				<p className="max-w-xl text-xs leading-5 text-muted-foreground">
					This controls what Tradstry imports. Your brokerage provider may still
					prepare all available history.
				</p>
				<Button
					size="lg"
					disabled={!valid || isSubmitting}
					onClick={() =>
						onSubmit({
							primarySnaptradeAccountId: primaryId,
							accounts: imports,
						})
					}
				>
					{isSubmitting
						? "Starting import…"
						: `Start import for ${imports.length} account${imports.length === 1 ? "" : "s"}`}
				</Button>
			</div>
		</section>
	);
}
