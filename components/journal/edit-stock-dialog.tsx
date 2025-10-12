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
import { Stock } from "@/lib/drizzle/journal";

interface EditStockDialogProps {
  stock: Stock;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: number, data: Partial<Omit<Stock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
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
  const [formData, setFormData] = useState<Partial<Omit<Stock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>>({
    exitPrice: stock.exitPrice,
    exitDate: stock.exitDate,
    // notes: stock.notes || "", // Remove notes field as it's not in the new schema
    // status: stock.status || "open" // Remove status field as it's not in the new schema
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stock.id) {
      toast.error('Invalid stock trade');
      return;
    }
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
                ${stock.entryPrice ? stock.entryPrice.toFixed(2) : 'N/A'}
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right font-medium">Entry Date</Label>
              <div className="col-span-3 py-2 text-sm">
                {stock.entryDate ? format(new Date(stock.entryDate), "PPP") : 'N/A'}
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
                value={formData.exitPrice || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    exitPrice: e.target.value ? parseFloat(e.target.value) : undefined,
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
                    {formData.exitDate ? (
                      format(new Date(formData.exitDate), "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.exitDate ? new Date(formData.exitDate) : undefined}
                    onSelect={(date) =>
                      setFormData({
                        ...formData,
                        exitDate: date ? date.toISOString() : undefined,
                      })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
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
