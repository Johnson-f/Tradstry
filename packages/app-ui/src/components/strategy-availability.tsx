"use client";

import {
	Add01Icon,
	Cancel01Icon,
	Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import { Input } from "@tradstry/app-ui/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@tradstry/app-ui/components/ui/popover";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useMemo, useState } from "react";

export type StrategyAvailability = "all" | "selected";

export function validateStrategyApplicability(
	availability: StrategyAvailability,
	workspaceIds: string[],
) {
	return availability === "selected" && workspaceIds.length === 0
		? "Choose at least one account."
		: null;
}

export function StrategyAvailabilityFields({
	workspaces,
	availability,
	workspaceIds,
	onChange,
	disabled = false,
}: {
	workspaces: Array<{ id: string; name: string }>;
	availability: StrategyAvailability;
	workspaceIds: string[];
	onChange: (value: {
		availability: StrategyAvailability;
		workspaceIds: string[];
	}) => void;
	disabled?: boolean;
}) {
	const [search, setSearch] = useState("");
	const selected = useMemo(() => new Set(workspaceIds), [workspaceIds]);
	const selectedWorkspaces = workspaces.filter((workspace) =>
		selected.has(workspace.id),
	);
	const filtered = workspaces.filter((workspace) =>
		workspace.name.toLowerCase().includes(search.trim().toLowerCase()),
	);

	function toggle(workspaceId: string, checked: boolean) {
		const next = new Set(selected);
		if (checked) next.add(workspaceId);
		else next.delete(workspaceId);
		onChange({ availability: "selected", workspaceIds: [...next] });
	}

	return (
		<div className="grid gap-2.5 rounded-xl border bg-muted/10 p-3">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<p className="text-xs font-semibold">Account availability</p>
					<p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
						Choose where this definition can be used.
					</p>
				</div>
				<fieldset className="grid grid-cols-2 rounded-lg border bg-muted/30 p-0.5">
					<legend className="sr-only">Account availability</legend>
					{(["all", "selected"] as const).map((value) => (
						<button
							key={value}
							type="button"
							aria-pressed={availability === value}
							disabled={disabled}
							onClick={() =>
								onChange({
									availability: value,
									workspaceIds: value === "all" ? [] : workspaceIds,
								})
							}
							className={cn(
								"h-7 rounded-md px-3 text-[0.6875rem] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50",
								availability === value &&
									"bg-background text-foreground shadow-sm",
							)}
						>
							{value === "all" ? "All accounts" : "Selected accounts"}
						</button>
					))}
				</fieldset>
			</div>

			{availability === "all" ? (
				<p className="rounded-lg bg-background px-3 py-2 text-[0.6875rem] text-muted-foreground">
					Available automatically in every current and future account.
				</p>
			) : (
				<div className="flex flex-wrap items-center gap-1.5 border-t pt-2.5">
					{selectedWorkspaces.map((workspace) => (
						<span
							key={workspace.id}
							className="inline-flex h-7 max-w-52 items-center gap-1 rounded-full border bg-background pl-2.5 pr-1 text-[0.6875rem] font-medium"
						>
							<span className="truncate">{workspace.name}</span>
							<button
								type="button"
								aria-label={`Remove ${workspace.name}`}
								disabled={disabled}
								onClick={() => toggle(workspace.id, false)}
								className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<HugeiconsIcon icon={Cancel01Icon} className="size-3" />
							</button>
						</span>
					))}

					<Popover>
						<PopoverTrigger asChild>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={disabled}
							>
								<HugeiconsIcon icon={Add01Icon} className="size-3.5" />
								Add account
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-80 p-2">
							<div className="relative">
								<HugeiconsIcon
									icon={Search01Icon}
									className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
								/>
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search accounts"
									className="h-8 pl-8"
								/>
							</div>
							<div className="mt-2 flex items-center justify-between border-b pb-2">
								<button
									type="button"
									className="text-[0.6875rem] font-medium text-muted-foreground hover:text-foreground"
									onClick={() =>
										onChange({
											availability: "selected",
											workspaceIds: workspaces.map((workspace) => workspace.id),
										})
									}
								>
									Select all
								</button>
								<button
									type="button"
									className="text-[0.6875rem] font-medium text-muted-foreground hover:text-foreground"
									onClick={() =>
										onChange({ availability: "selected", workspaceIds: [] })
									}
								>
									Clear
								</button>
							</div>
							<div className="mt-1 max-h-52 overflow-y-auto">
								{filtered.map((workspace) => (
									<div
										key={workspace.id}
										className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted/60"
									>
										<Checkbox
											id={`strategy-workspace-${workspace.id}`}
											checked={selected.has(workspace.id)}
											onCheckedChange={(checked) =>
												toggle(workspace.id, checked === true)
											}
										/>
										<label
											htmlFor={`strategy-workspace-${workspace.id}`}
											className="min-w-0 flex-1 cursor-pointer truncate"
										>
											{workspace.name}
										</label>
									</div>
								))}
								{filtered.length === 0 ? (
									<p className="px-2 py-5 text-center text-xs text-muted-foreground">
										No matching accounts.
									</p>
								) : null}
							</div>
						</PopoverContent>
					</Popover>

					{selectedWorkspaces.length === 0 ? (
						<p className="w-full text-[0.6875rem] text-destructive">
							Choose at least one account.
						</p>
					) : null}
				</div>
			)}
		</div>
	);
}
