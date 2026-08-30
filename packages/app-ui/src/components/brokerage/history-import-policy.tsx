"use client";

import {
	ArrowRight01Icon,
	BankIcon,
	Calendar01Icon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@tradstry/app-ui/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@tradstry/app-ui/components/ui/empty";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import { Separator } from "@tradstry/app-ui/components/ui/separator";
import type {
	BrokerageAccountImportInput,
	BrokerageConnectionAccount,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { Fragment, useId, useMemo, useState } from "react";
import {
	buildAccountImports,
	policyIsComplete,
} from "./history-import-policy-model";
import { ImportAccountRow } from "./import-account-row";
import { DefaultHistoryField } from "./import-history-fields";

export function BrokerageHistorySetup({
	accounts,
	workspaceName,
	onSubmit,
	isSubmitting,
	onBack,
}: {
	accounts: BrokerageConnectionAccount[];
	workspaceName: string;
	onSubmit: (value: {
		primarySnaptradeAccountId: string;
		accounts: BrokerageAccountImportInput[];
	}) => void;
	isSubmitting: boolean;
	onBack?: () => void;
}) {
	const id = useId();
	const [selectedIds, setSelectedIds] = useState(
		() => new Set(accounts.map((account) => account.id)),
	);
	const [primaryId, setPrimaryId] = useState(
		() =>
			accounts.find((account) => account.current)?.id ?? accounts[0]?.id ?? "",
	);
	const [defaultPolicy, setDefaultPolicy] =
		useState<TransactionImportPolicyInput>({ mode: "one_year" });
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
	const extraAccounts = Math.max(0, imports.length - 1);
	const allSelected = selectedIds.size === accounts.length;

	function updateSelected(accountId: string, checked: boolean) {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(accountId);
			else if (accountId !== primaryId) next.delete(accountId);
			return next;
		});
	}

	return (
		<section
			aria-labelledby={`${id}-title`}
			className="@container/import w-full min-w-0 max-w-5xl text-foreground"
		>
			<header className="mb-6 space-y-3">
				<Badge
					variant="outline"
					className="h-6 gap-1.5 bg-background px-2.5 text-xs font-normal"
				>
					<HugeiconsIcon icon={BankIcon} /> Brokerage import setup
				</Badge>
				<div className="space-y-2">
					<h1
						id={`${id}-title`}
						className="text-2xl font-semibold tracking-tight sm:text-3xl"
					>
						Choose accounts and history
					</h1>
					<p className="max-w-2xl text-sm leading-6 text-muted-foreground">
						Choose what to bring into Tradstry. Each account keeps its own
						trades and history in a separate workspace.
					</p>
				</div>
			</header>

			{accounts.length === 0 ? (
				<Card>
					<CardContent>
						<Empty className="py-12">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<HugeiconsIcon icon={BankIcon} />
								</EmptyMedia>
								<EmptyTitle>No accounts available yet</EmptyTitle>
								<EmptyDescription>
									Your brokerage has not returned any accounts. Return to
									Brokerage and try connecting again.
								</EmptyDescription>
							</EmptyHeader>
							{onBack && (
								<Button type="button" variant="outline" onClick={onBack}>
									Back to Brokerage
								</Button>
							)}
						</Empty>
					</CardContent>
				</Card>
			) : (
				<form
					aria-busy={isSubmitting}
					onSubmit={(event) => {
						event.preventDefault();
						if (valid && !isSubmitting)
							onSubmit({
								primarySnaptradeAccountId: primaryId,
								accounts: imports,
							});
					}}
				>
					<div className="grid items-start gap-5 @3xl/import:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
						<Card className="min-w-0 gap-0 py-0">
							<CardHeader className="gap-2 p-5">
								<div className="flex items-center justify-between gap-3">
									<CardTitle>
										<h2 className="text-base font-semibold">
											Brokerage accounts
										</h2>
									</CardTitle>
									<Badge variant="secondary" className="text-xs tabular-nums">
										{selectedIds.size} of {accounts.length}
									</Badge>
								</div>
								<CardDescription className="text-sm">
									Choose one account for {workspaceName}.
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-2 px-5 pb-5">
								<Label
									htmlFor={`${id}-primary`}
									className="text-xs font-medium"
								>
									Account for this workspace
								</Label>
								<Select
									value={primaryId}
									disabled={isSubmitting}
									onValueChange={(value) => {
										setPrimaryId(value);
										setSelectedIds((current) => new Set(current).add(value));
									}}
								>
									<SelectTrigger
										id={`${id}-primary`}
										className="h-10 w-full bg-background px-3 text-sm"
										aria-describedby={`${id}-primary-help`}
									>
										<SelectValue />
									</SelectTrigger>
									<SelectContent
										position="popper"
										align="start"
										className="max-w-[calc(100vw-2rem)] p-1 motion-reduce:animate-none"
									>
										{accounts.map((account) => (
											<SelectItem
												key={account.id}
												value={account.id}
												className="min-h-10 pr-8 text-sm"
											>
												{account.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<p
									id={`${id}-primary-help`}
									className="text-xs leading-5 text-muted-foreground"
								>
									This account is always included. Other selected accounts use
									separate workspaces.
								</p>
							</CardContent>
							<Separator />
							<div className="flex items-center justify-between gap-2 bg-muted/30 px-5 py-2">
								<p className="text-xs font-medium text-muted-foreground">
									Accounts to import
								</p>
								{accounts.length > 1 && (
									<Button
										type="button"
										variant="ghost"
										className="h-8 px-2 text-xs"
										disabled={isSubmitting}
										onClick={() =>
											setSelectedIds(
												allSelected
													? new Set([primaryId])
													: new Set(accounts.map((account) => account.id)),
											)
										}
									>
										{allSelected ? "Only this workspace" : "Select all"}
									</Button>
								)}
							</div>
							<div>
								{accounts.map((account, index) => (
									<Fragment key={account.id}>
										{index > 0 && <Separator />}
										<ImportAccountRow
											account={account}
											selected={selectedIds.has(account.id)}
											primary={primaryId === account.id}
											workspaceName={workspaceName}
											policy={overrides.get(account.id)}
											defaultPolicy={defaultPolicy}
											disabled={isSubmitting}
											onSelectedChange={(checked) =>
												updateSelected(account.id, checked)
											}
											onPolicyChange={(policy) =>
												setOverrides((current) => {
													const next = new Map(current);
													if (policy) next.set(account.id, policy);
													else next.delete(account.id);
													return next;
												})
											}
										/>
									</Fragment>
								))}
							</div>
						</Card>

						<Card className="min-w-0 gap-4 py-5">
							<CardHeader className="gap-2 px-5">
								<CardTitle className="flex items-center gap-2">
									<HugeiconsIcon
										icon={Calendar01Icon}
										className="size-4 text-muted-foreground"
									/>
									<h2 className="text-base font-semibold">Default history</h2>
								</CardTitle>
								<CardDescription className="text-sm">
									Apply a range to every selected account. You can adjust
									individual accounts below their names.
								</CardDescription>
							</CardHeader>
							<CardContent className="px-5">
								<DefaultHistoryField
									policy={defaultPolicy}
									disabled={isSubmitting}
									onChange={setDefaultPolicy}
								/>
							</CardContent>
							<Separator />
							<CardContent className="px-5">
								<p className="text-xs leading-5 text-muted-foreground">
									This controls what Tradstry imports. Your brokerage provider
									may still prepare all available history.
								</p>
							</CardContent>
						</Card>
					</div>

					<footer className="mt-6 flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
						<div role="status" className="min-w-0 space-y-1">
							<p className="text-sm font-medium">
								{isSubmitting
									? "Setting up your import…"
									: `${imports.length} account${imports.length === 1 ? "" : "s"} selected`}
							</p>
							<p className="text-xs leading-5 text-muted-foreground">
								{isSubmitting
									? "Keep this page open while we prepare your accounts."
									: !valid
										? "Choose a start date for each custom history range to continue."
										: extraAccounts > 0
											? `1 in ${workspaceName} · ${extraAccounts} in separate workspaces`
											: `Imports into ${workspaceName}`}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							{onBack && (
								<Button
									type="button"
									variant="ghost"
									className="h-10 px-4 text-sm"
									disabled={isSubmitting}
									onClick={onBack}
								>
									Back
								</Button>
							)}
							<Button
								type="submit"
								disabled={!valid || isSubmitting}
								className="h-10 flex-1 gap-2 px-5 text-sm sm:flex-none"
							>
								{isSubmitting ? (
									<>
										<HugeiconsIcon
											icon={Loading03Icon}
											className="size-4 animate-spin motion-reduce:animate-none"
										/>
										Starting import…
									</>
								) : (
									<>
										Start import
										<HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
									</>
								)}
							</Button>
						</div>
					</footer>
				</form>
			)}
		</section>
	);
}
