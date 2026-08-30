"use client";

import { Badge } from "@tradstry/app-ui/components/ui/badge";
import { Checkbox } from "@tradstry/app-ui/components/ui/checkbox";
import { Label } from "@tradstry/app-ui/components/ui/label";
import type {
	BrokerageConnectionAccount,
	TransactionImportPolicyInput,
} from "@tradstry/app-ui/lib/types/brokerage";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useId } from "react";
import { AccountHistorySelect } from "./import-history-fields";

export function ImportAccountRow({
	account,
	selected,
	primary,
	workspaceName,
	policy,
	defaultPolicy,
	disabled,
	onSelectedChange,
	onPolicyChange,
}: {
	account: BrokerageConnectionAccount;
	selected: boolean;
	primary: boolean;
	workspaceName: string;
	policy?: TransactionImportPolicyInput;
	defaultPolicy: TransactionImportPolicyInput;
	disabled: boolean;
	onSelectedChange: (checked: boolean) => void;
	onPolicyChange: (policy: TransactionImportPolicyInput | undefined) => void;
}) {
	const id = useId();
	return (
		<div
			className={cn(
				"space-y-3 p-4 transition-colors motion-reduce:transition-none sm:px-5",
				!selected && "bg-muted/30",
			)}
		>
			<div className="flex items-start gap-3">
				<Checkbox
					id={id}
					checked={selected}
					disabled={disabled || primary}
					onCheckedChange={(checked) => onSelectedChange(checked === true)}
					aria-label={`Import ${account.name}`}
					aria-describedby={`${id}-destination`}
					className="mt-0.5 size-4"
				/>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
						<Label
							htmlFor={id}
							className="min-w-0 break-words text-sm leading-5 font-medium"
						>
							{account.name}
						</Label>
						{primary && (
							<Badge variant="secondary" className="text-[10px]">
								This workspace
							</Badge>
						)}
					</div>
					<p className="mt-1 break-words text-xs text-muted-foreground">
						{account.institutionName ?? "Brokerage account"}
					</p>
					<p
						id={`${id}-destination`}
						className="mt-1 break-words text-xs leading-5 text-muted-foreground"
					>
						{selected
							? primary
								? `Required for ${workspaceName}`
								: account.linkedWorkspaceName
									? `Imports into ${account.linkedWorkspaceName}`
									: "Imports into a separate workspace"
							: "Not included in this import"}
					</p>
				</div>
			</div>
			{selected && (
				<div className="pl-7">
					<AccountHistorySelect
						id={`${id}-history`}
						accountName={account.name}
						policy={policy}
						defaultPolicy={defaultPolicy}
						disabled={disabled}
						onChange={onPolicyChange}
					/>
				</div>
			)}
		</div>
	);
}
