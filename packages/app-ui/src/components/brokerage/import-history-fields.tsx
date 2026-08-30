"use client";

import { Calendar01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Calendar } from "@tradstry/app-ui/components/ui/calendar";
import { Label } from "@tradstry/app-ui/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import {
	RadioGroup,
	RadioGroupItem,
} from "@tradstry/app-ui/components/ui/radio-group";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@tradstry/app-ui/components/ui/select";
import type {
	TransactionImportMode,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { cn } from "@tradstry/app-ui/lib/utils";
import { format, parseISO } from "date-fns";
import { useId, useState } from "react";
import {
	HISTORY_OPTIONS,
	latestImportDate,
	policyLabel,
} from "./history-import-policy-model";

export function ImportStartDatePicker({
	id,
	label,
	value,
	disabled,
	onChange,
}: {
	id: string;
	label: string;
	value?: string;
	disabled: boolean;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = value ? parseISO(value) : undefined;
	const latest = parseISO(latestImportDate());
	return (
		<Popover open={open && !disabled} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					type="button"
					variant="outline"
					disabled={disabled}
					aria-label={label}
					className={cn(
						"h-9 w-full justify-start gap-2 bg-background px-3 text-sm font-normal",
						!selected && "text-muted-foreground",
					)}
				>
					<HugeiconsIcon icon={Calendar01Icon} className="size-4" />
					{selected ? format(selected, "MMM d, yyyy") : "Choose a start date"}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-auto p-0 motion-reduce:animate-none"
			>
				<Calendar
					mode="single"
					captionLayout="dropdown"
					startMonth={new Date(1900, 0, 1)}
					endMonth={latest}
					defaultMonth={selected ?? latest}
					selected={selected}
					disabled={{ after: latest }}
					className="[--cell-size:--spacing(9)]"
					onSelect={(date) => {
						if (!date) return;
						onChange(format(date, "yyyy-MM-dd"));
						setOpen(false);
					}}
					autoFocus
				/>
			</PopoverContent>
		</Popover>
	);
}

export function AccountHistorySelect({
	id,
	accountName,
	policy,
	defaultPolicy,
	disabled,
	onChange,
}: {
	id: string;
	accountName: string;
	policy?: TransactionImportPolicyInput;
	defaultPolicy: TransactionImportPolicyInput;
	disabled: boolean;
	onChange: (policy: TransactionImportPolicyInput | undefined) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<Label htmlFor={id} className="text-xs text-muted-foreground">
					History
				</Label>
				<Select
					value={policy?.mode ?? "default"}
					disabled={disabled}
					onValueChange={(mode) => {
						if (mode === "default") onChange(undefined);
						else if (HISTORY_OPTIONS.some((option) => option.mode === mode))
							onChange({ mode: mode as TransactionImportMode });
					}}
				>
					<SelectTrigger
						id={id}
						aria-label={`History for ${accountName}`}
						className="h-8 w-full min-w-0 bg-background px-2.5 text-xs sm:w-auto sm:max-w-full"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent
						position="popper"
						align="start"
						className="max-w-[calc(100vw-2rem)] p-1 motion-reduce:animate-none"
					>
						<SelectItem value="default" className="min-h-9 pr-8">
							Use default · {policyLabel(defaultPolicy)}
						</SelectItem>
						{HISTORY_OPTIONS.map((option) => (
							<SelectItem
								key={option.mode}
								value={option.mode}
								className="min-h-9 pr-8"
							>
								{option.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			{policy?.mode === "custom" && (
				<div className="max-w-64 space-y-1.5">
					<Label htmlFor={`${id}-date`} className="text-xs">
						Start date
					</Label>
					<ImportStartDatePicker
						id={`${id}-date`}
						label={`Start date for ${accountName}`}
						value={policy.customStartDate}
						disabled={disabled}
						onChange={(customStartDate) =>
							onChange({ mode: "custom", customStartDate })
						}
					/>
					{!policy.customStartDate && (
						<p className="text-xs text-muted-foreground">
							Choose a date to include this account.
						</p>
					)}
				</div>
			)}
		</div>
	);
}

export function DefaultHistoryField({
	policy,
	disabled,
	onChange,
}: {
	policy: TransactionImportPolicyInput;
	disabled: boolean;
	onChange: (policy: TransactionImportPolicyInput) => void;
}) {
	const id = useId();
	return (
		<div className="space-y-4">
			<RadioGroup
				aria-label="Default import history"
				value={policy.mode}
				disabled={disabled}
				className="gap-2"
				onValueChange={(mode) =>
					onChange({ mode: mode as TransactionImportMode })
				}
			>
				{HISTORY_OPTIONS.map((option) => (
					<Label
						key={option.mode}
						htmlFor={`${id}-${option.mode}`}
						className={cn(
							"flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors hover:bg-muted/50 motion-reduce:transition-none",
							policy.mode === option.mode
								? "border-primary/60 bg-muted/60"
								: "border-border bg-background",
							disabled && "pointer-events-none opacity-60",
						)}
					>
						<RadioGroupItem
							id={`${id}-${option.mode}`}
							value={option.mode}
							aria-labelledby={`${id}-${option.mode}-label`}
							aria-describedby={`${id}-${option.mode}-description`}
							className="mt-0.5"
						/>
						<span className="min-w-0 flex-1 space-y-1">
							<span
								id={`${id}-${option.mode}-label`}
								className="flex flex-wrap items-center gap-2 text-sm font-medium"
							>
								{option.label}
								{option.mode === "one_year" && (
									<Badge
										variant="secondary"
										className="h-5 border-border bg-background px-1.5 text-[10px]"
									>
										Recommended
									</Badge>
								)}
							</span>
							<span
								id={`${id}-${option.mode}-description`}
								className="block text-xs leading-5 font-normal text-muted-foreground"
							>
								{option.description}
							</span>
						</span>
					</Label>
				))}
			</RadioGroup>
			{policy.mode === "custom" && (
				<div className="space-y-2">
					<Label htmlFor={`${id}-date`} className="text-xs">
						Start date
					</Label>
					<ImportStartDatePicker
						id={`${id}-date`}
						label="Default custom start date"
						value={policy.customStartDate}
						disabled={disabled}
						onChange={(customStartDate) =>
							onChange({ mode: "custom", customStartDate })
						}
					/>
					<p className="text-xs leading-5 text-muted-foreground">
						Import activity from this date onward.
					</p>
				</div>
			)}
		</div>
	);
}
