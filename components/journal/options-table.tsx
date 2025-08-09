"use client";

import { useOptions, useOptionMutations } from "@/lib/hooks/use-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { OptionInDB, OptionUpdate } from "@/lib/types/trading";

import { AddTradeDialog } from "./add-trade-dialog";
import { ActionsDropdown } from "@/components/ui/actions-dropdown";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { Button as Button2 } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface OptionsTableProps {
  className?: string;
}

interface EditOptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: OptionInDB | null;
  onSave: (id: number, data: OptionUpdate) => Promise<void>;
  isSaving: boolean;
}

function EditOptionDialog({
  open,
  onOpenChange,
  option,
  onSave,
  isSaving,
}: EditOptionDialogProps) {
  // Initialize form data with only updateable fields from the option
  const [formData, setFormData] = useState<OptionUpdate>({
    exit_price: option?.exit_price,
    exit_date: option?.exit_date,
    notes: option?.notes || "",
    status: option?.status || "open",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (option) {
      await onSave(option.id, formData);
      onOpenChange(false);
    }
  };

  if (!option) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Option Trade</DialogTitle>
            <DialogDescription>
              Update the details of this option trade.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Symbol</Label>
              <div className="col-span-3 py-2 text-sm">{option.symbol}</div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as "open" | "closed",
                  })
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Entry Date</Label>
              <div className="col-span-3 py-2 text-sm">
                {option.entry_date
                  ? format(new Date(option.entry_date), "PPP")
                  : "N/A"}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="exit_price" className="text-right">
                Exit Price
              </Label>
              <Input
                id="exit_price"
                type="number"
                step="0.01"
                value={formData.exit_price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    exit_price: e.target.value
                      ? parseFloat(e.target.value)
                      : undefined,
                  })
                }
                className="col-span-3"
                placeholder="Enter exit price"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="exit_date" className="text-right">
                Exit Date
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button2
                    variant="outline"
                    className="col-span-3 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.exit_date ? (
                      format(new Date(formData.exit_date), "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button2>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={
                      formData.exit_date
                        ? new Date(formData.exit_date)
                        : undefined
                    }
                    onSelect={(date) =>
                      setFormData({
                        ...formData,
                        exit_date: date ? date.toISOString() : undefined,
                      })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">
                Notes
              </Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="col-span-3"
                placeholder="Add any notes about this trade"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OptionsTable({ className }: OptionsTableProps) {
  const { options, isLoading, error, mutate } = useOptions();
  const { updateOption, deleteOption, isUpdating, isDeleting } =
    useOptionMutations();
  const [editingOption, setEditingOption] = useState<OptionInDB | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleEdit = (option: OptionInDB) => {
    setEditingOption(option);
    setIsEditDialogOpen(true);
  };

  const handleSave = async (id: number, data: OptionUpdate) => {
    try {
      await updateOption(id, data);
      toast.success("Option trade updated successfully.");
      mutate();
    } catch (error) {
      console.error("Error updating option:", error);
      toast.error("Failed to update option trade. Please try again.");
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this option trade?")) {
      try {
        await deleteOption(id);
        toast.success("Option trade deleted successfully.");
        mutate();
      } catch (error) {
        console.error("Error deleting option:", error);
        toast.error("Failed to delete option trade. Please try again.");
      }
    }
  };

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
        Error loading options: {error.message}
      </div>
    );
  }

  return (
    <div className={`rounded-md border ${className}`}>
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Options Trades</h3>
        <AddTradeDialog />
      </div>

      {editingOption && (
        <EditOptionDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          option={editingOption}
          onSave={handleSave}
          isSaving={isUpdating}
        />
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Strategy</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead className="text-right">Contracts</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Entry Price</TableHead>
            <TableHead className="text-right">Exit Price</TableHead>
            <TableHead className="text-right">Commissions</TableHead>
            <TableHead>Entry Date</TableHead>
            <TableHead>Exit Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // Loading skeleton
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={`skeleton-${i}`}>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12 ml-auto" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16 ml-auto" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16 ml-auto" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16 ml-auto" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              </TableRow>
            ))
          ) : options && options.length > 0 ? (
            options.map((option) => {
              const isCall = option.option_type === "Call";
              const isOpen = option.status === "open";

              return (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.symbol}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {option.strategy_type || "N/A"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        option.trade_direction === "Bullish"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : option.trade_direction === "Bearish"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }
                    >
                      {option.trade_direction || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {option.number_of_contracts || "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isCall ? "outline" : "secondary"}
                      className={
                        isCall
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }
                    >
                      {option.option_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {option.entry_price
                      ? `$${option.entry_price.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.exit_price
                      ? `$${option.exit_price.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.commissions
                      ? `$${option.commissions.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.entry_date
                        ? new Date(option.entry_date).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.exit_date
                        ? new Date(option.exit_date).toLocaleDateString()
                        : "-"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isOpen ? "outline" : "secondary"}
                      className={
                        isOpen
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {option.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionsDropdown
                      onEdit={() => handleEdit(option)}
                      onDelete={() => handleDelete(option.id)}
                      isDisabled={isUpdating || isDeleting}
                    />
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={11}
                className="h-24 text-center text-muted-foreground"
              >
                No options trades found. Add your first option trade to get
                started!
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
