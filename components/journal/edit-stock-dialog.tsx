"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { StockInDB, StockUpdate, TradeStatus } from "@/lib/types/trading";

interface EditStockDialogProps {
  stock: StockInDB;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: StockUpdate) => Promise<void>;
  isSaving: boolean;
}

export function EditStockDialog({
  stock,
  isOpen,
  onClose,
  onSave,
  isSaving,
}: EditStockDialogProps) {
  // Initialize form data with only updateable fields from the stock
  const [formData, setFormData] = useState<StockUpdate>({
    exit_price: stock.exit_price,
    exit_date: stock.exit_date,
    notes: stock.notes || "",
    status: stock.status || "open"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(stock.id, formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Stock Trade</DialogTitle>
            <DialogDescription>
              Update the stock trade details below.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Symbol</Label>
              <div className="col-span-3 py-2 text-sm">
                {stock.symbol}
              </div>
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Entry Price</Label>
              <div className="col-span-3 py-2 text-sm">
                ${stock.entry_price.toFixed(2)}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Entry Date</Label>
              <div className="col-span-3 py-2 text-sm">
                {stock.entry_date ? format(new Date(stock.entry_date), "PPP") : 'N/A'}
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
                value={formData.exit_price || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    exit_price: e.target.value ? parseFloat(e.target.value) : undefined,
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
                  <Button
                    variant="outline"
                    className="col-span-3 justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.exit_date ? (
                      format(new Date(formData.exit_date), "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.exit_date ? new Date(formData.exit_date) : undefined}
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
              <Label htmlFor="status" className="text-right">
                Status
              </Label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    status: e.target.value as TradeStatus,
                  })
                }
                className="col-span-3 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="notes" className="text-right pt-2">
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
              onClick={onClose}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
