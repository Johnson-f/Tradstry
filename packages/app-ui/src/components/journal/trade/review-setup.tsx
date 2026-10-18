"use client";

import * as React from "react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Input } from "@tradstry/app-ui/components/ui/input";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@tradstry/app-ui/components/ui/toggle-group";
import { usePlaybooks } from "@tradstry/app-ui/hooks/playbook";
import { usePrinciples } from "@tradstry/app-ui/hooks/principle";
import { useAllTags, useTagCategories } from "@tradstry/app-ui/hooks/tags";
import type { JournalTrade } from "@tradstry/app-ui/lib/service/journal-flow";
import { money } from "../journal-format";
import { PrinciplePicker } from "../principle-picker";
import { TagPicker } from "../tag-picker";
import type { DetailData } from "./trade-types";
import type { TradeReview } from "./use-trade-review";

const STOP_OPTIONS = [
	["unknown", "Not recorded"],
	["none", "No stop"],
	["price", "Set price"],
] as const;

function DetailRow({
	label,
	htmlFor,
	children,
}: {
	label: string;
	htmlFor?: string;
	children: React.ReactNode;
}) {
	const id = React.useId();
	return (
		<div className="grid min-w-0 gap-2 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-6">
			<div className="flex min-h-8 items-center text-xs text-muted-foreground">
				{htmlFor ? (
					<Label htmlFor={htmlFor} className="font-normal">
						{label}
					</Label>
				) : (
					<span id={id}>{label}</span>
				)}
			</div>
			<div
				className="min-w-0"
				role={htmlFor ? undefined : "group"}
				aria-labelledby={htmlFor ? undefined : id}
			>
				{children}
			</div>
		</div>
	);
}

export function ReviewSetup({
	workspaceId,
	trade,
	data,
	review,
	disabled,
}: {
	workspaceId: string;
	trade: JournalTrade;
	data: DetailData;
	review: TradeReview;
	disabled: boolean;
}) {
	const { context, stopTouched, setStopTouched, stopError, stopInputRef } =
		review;
	const id = React.useId();
	const playbooks = usePlaybooks();
	const principles = usePrinciples(workspaceId);
	const tagCategories = useTagCategories();
	const allTags = useAllTags();
	const selectedTags = context.value.tagIds ?? [];
	const selectedPrinciples = context.value.violatedPrincipleIds ?? [];
	const stopErrorId = `${id}-stop-error`;
	const stopHelpId = `${id}-stop-help`;
	const retrospective =
		data.journalContextV2.phase === "retrospective" ||
		trade.lifecycleState === "closed";
	return (
		<div className="divide-y divide-border/60">
			<section
				aria-labelledby={`${id}-tags-heading`}
				className="space-y-3 pb-5"
			>
				<h4 id={`${id}-tags-heading`} className="text-xs font-medium">
					Tags
				</h4>
				<div className="space-y-3">
					{(tagCategories.data ?? []).map((category) => {
						const categoryIds = new Set(
							(allTags.data ?? [])
								.filter((tag) => tag.categoryId === category.id)
								.map((tag) => tag.id),
						);
						return (
							<DetailRow key={category.id} label={category.name}>
								<fieldset
									className="min-w-0"
									disabled={disabled || allTags.isLoading || allTags.isError}
								>
									<TagPicker
										category={category}
										selectedTagIds={selectedTags.filter((tagId) =>
											categoryIds.has(tagId),
										)}
										className="w-full [&>button]:border-transparent [&>button]:px-2 [&>button]:hover:bg-muted"
										onChange={(ids) => {
											if (!disabled)
												context.update({
													...context.value,
													tagIds: [
														...selectedTags.filter(
															(tagId) => !categoryIds.has(tagId),
														),
														...ids,
													],
												});
										}}
									/>
								</fieldset>
							</DetailRow>
						);
					})}
				</div>
				{(tagCategories.isError || allTags.isError) && (
					<Button
						size="sm"
						variant="outline"
						onClick={() => {
							void tagCategories.refetch();
							void allTags.refetch();
						}}
					>
						Retry loading tags
					</Button>
				)}
			</section>
			<section
				aria-labelledby={`${id}-strategy-heading`}
				className="space-y-3 py-5"
			>
				<h4 id={`${id}-strategy-heading`} className="text-xs font-medium">
					Strategy
				</h4>
				<DetailRow label="Playbook" htmlFor={`${id}-playbook`}>
					<Select
						disabled={disabled || playbooks.isLoading}
						value={context.value.playbookId ?? "__none__"}
						onValueChange={(value) => {
							const playbookId = value === "__none__" ? null : value;
							context.update({
								...context.value,
								playbookId,
								violatedPrincipleIds: selectedPrinciples.filter(
									(principleId) => {
										const principle = principles.data?.find(
											(item) => item.id === principleId,
										);
										return (
											!principle ||
											principle.playbookId === null ||
											principle.playbookId === playbookId
										);
									},
								),
							});
						}}
					>
						<SelectTrigger
							id={`${id}-playbook`}
							aria-label="Playbook"
							className="w-full max-w-sm data-[size=default]:h-8"
						>
							<SelectValue placeholder="No playbook" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__none__">No playbook</SelectItem>
							{playbooks.data?.map((playbook) => (
								<SelectItem key={playbook.id} value={playbook.id}>
									{playbook.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</DetailRow>
				<DetailRow label="Principles broken">
					<fieldset disabled={disabled}>
						<PrinciplePicker
							workspaceId={workspaceId}
							selectedPlaybookId={context.value.playbookId}
							value={selectedPrinciples}
							emptyState="compact"
							className="h-8 w-full max-w-sm"
							onChange={(violatedPrincipleIds) => {
								if (!disabled)
									context.update({ ...context.value, violatedPrincipleIds });
							}}
						/>
					</fieldset>
				</DetailRow>
			</section>
			<section
				aria-labelledby={`${id}-risk-heading`}
				className="space-y-3 py-5"
			>
				<h4 id={`${id}-risk-heading`} className="text-xs font-medium">
					Risk
				</h4>
				<DetailRow label="Stop loss">
					<ToggleGroup
						type="single"
						spacing={1}
						disabled={disabled}
						value={context.value.stopState}
						aria-label="Stop loss status"
						aria-describedby={stopHelpId}
						className="w-full flex-wrap rounded-lg bg-muted/60 p-1 sm:w-fit"
						onValueChange={(value) => {
							if (!value) return;
							const stopState = value as "unknown" | "none" | "price";
							setStopTouched(false);
							context.update({
								...context.value,
								stopState,
								stopPrice:
									stopState === "price" ? context.value.stopPrice : null,
							});
						}}
					>
						{STOP_OPTIONS.map(([value, label]) => (
							<ToggleGroupItem
								key={value}
								value={value}
								className="h-8 grow px-2.5 font-normal text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
							>
								{label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</DetailRow>
				{context.value.stopState === "price" && (
					<DetailRow label="Stop price" htmlFor={`${id}-stop`}>
						<div className="relative w-full max-w-56">
							<Input
								id={`${id}-stop`}
								ref={stopInputRef}
								disabled={disabled}
								inputMode="decimal"
								placeholder="Price"
								aria-invalid={stopTouched && !!stopError}
								aria-describedby={`${stopHelpId}${stopTouched && stopError ? ` ${stopErrorId}` : ""}`}
								className="h-9 pr-14 tabular-nums"
								value={context.value.stopPrice ?? ""}
								onChange={(event) =>
									context.update({
										...context.value,
										stopPrice: event.target.value || null,
									})
								}
								onBlur={() => {
									setStopTouched(true);
									void context.flush().catch(() => {});
								}}
							/>
							<span
								aria-hidden="true"
								className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[11px] text-muted-foreground"
							>
								{trade.currency}
							</span>
						</div>
						{stopTouched && stopError && (
							<p
								id={stopErrorId}
								role="alert"
								className="mt-2 text-xs text-destructive"
							>
								{stopError}
							</p>
						)}
					</DetailRow>
				)}
				<div className="space-y-2 sm:pl-[8.5rem]">
					<p
						id={stopHelpId}
						className="text-[11px] leading-relaxed text-muted-foreground"
					>
						Journal only; no order is placed.{" "}
						{retrospective
							? "Changes here stay separate from your original entry plan."
							: "Changes are timestamped when saved."}
					</p>
					{data.journalContextV2.legacyStopPrice &&
						!data.journalContextV2.recordedAt && (
							<p className="text-xs text-muted-foreground">
								Historical stop:{" "}
								{money(data.journalContextV2.legacyStopPrice, trade.currency)}.
								Its recording time is unknown.
							</p>
						)}
				</div>
			</section>
			<div className="pt-5">
				<DetailRow label="Context" htmlFor={`${id}-notes`}>
					<textarea
						id={`${id}-notes`}
						disabled={disabled}
						value={context.value.notes ?? ""}
						onChange={(event) =>
							context.update({ ...context.value, notes: event.target.value })
						}
						onBlur={() => void context.flush().catch(() => {})}
						placeholder="Anything else that influenced this trade…"
						rows={2}
						className="min-h-20 w-full resize-none rounded-lg border border-input bg-muted/15 px-3 py-2.5 text-xs leading-relaxed outline-none placeholder:text-muted-foreground/75 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
					/>
				</DetailRow>
			</div>
		</div>
	);
}
