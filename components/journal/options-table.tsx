"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { Option, useJournalDatabase } from "@/lib/drizzle/journal";
import { useAuth } from "@/lib/hooks/use-auth";

import { AddTradeDialog } from "./add-trade-dialog";
import { TradeNotesModal } from "./trade-notes-modal";
import { ActionsDropdown } from "@/components/ui/actions-dropdown";
import { SetupTradeAssociationCompact } from "@/components/setups/setup-trade-association-compact";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { toast, Toaster } from "sonner";
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
  option: Option | null;
  onSave: (id: number, data: Partial<Omit<Option, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
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
  const [formData, setFormData] = useState<Partial<Omit<Option, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>>({
    exitPrice: option?.exitPrice,
    exitDate: option?.exitDate,
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
                {option.entryDate
                  ? format(new Date(option.entryDate), "PPP")
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
                value={formData.exitPrice || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    exitPrice: e.target.value
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
                    {formData.exitDate ? (
                      format(new Date(formData.exitDate), "PPP")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button2>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={
                      formData.exitDate
                        ? new Date(formData.exitDate)
                        : undefined
                    }
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

const ITEMS_PER_PAGE = 20;

export function OptionsTable({ className }: OptionsTableProps) {
  const { user } = useAuth();
  const { 
    getAllOptions, 
    updateOption, 
    deleteOption, 
    isInitialized, 
    isInitializing, 
    error: dbError 
  } = useJournalDatabase(user?.id || '');
  
  const [options, setOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [editingOption, setEditingOption] = useState<Option | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedTradeForNotes, setSelectedTradeForNotes] = useState<Option | null>(null);

  // Function to refresh options data
  const refreshOptions = async () => {
    if (!user?.id || !isInitialized) return;
    
    try {
      console.log('Refreshing options data...');
      setIsLoading(true);
      const data = await getAllOptions();
      console.log('Options data received:', data);
      setOptions(data);
    } catch (error) {
      console.error('Error refreshing options:', error);
      setError(error as Error);
      toast.error('Failed to refresh options');
    } finally {
      setIsLoading(false);
    }
  };

  // Load options on component mount
  useEffect(() => {
    const loadOptions = async () => {
      if (!user?.id || !isInitialized) return;
      
      try {
        setIsLoading(true);
        const data = await getAllOptions();
        setOptions(data);
      } catch (error) {
        console.error('Error loading options:', error);
        setError(error as Error);
        toast.error('Failed to load options');
      } finally {
        setIsLoading(false);
      }
    };

    loadOptions();
  }, [user?.id, getAllOptions, isInitialized]);

  // Calculate pagination
  const totalPages = Math.ceil(options.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedOptions = options.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Optional: Scroll to top of table when changing pages
    const tableElement = document.getElementById('options-table');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleEdit = (option: Option) => {
    setEditingOption(option);
    setIsEditDialogOpen(true);
  };

  const handleSave = async (id: number, data: Partial<Omit<Option, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => {
    const toastId = toast.loading("Updating option trade...");
    try {
      setIsUpdating(true);
      await updateOption(id, data);
      toast.success("Option trade updated successfully", { id: toastId });
      
      // Reload options
      const updatedOptions = await getAllOptions();
      setOptions(updatedOptions);
    } catch (error) {
      console.error("Error updating option:", error);
      toast.error("Failed to update option trade. Please try again.", { id: toastId });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!id || id === undefined || isNaN(id)) {
      console.error("Cannot delete option: Invalid ID provided", {
        id,
        type: typeof id,
      });
      toast.error("Error: Invalid option trade ID. Please try again.");
      return;
    }

    toast.dismiss(); // Dismiss any existing toasts

    const confirmed = await new Promise<boolean>((resolve) => {
      toast(
        <div className="flex flex-col space-y-2">
          <p className="font-medium">Delete Option Trade</p>
          <p>Are you sure you want to delete this option trade?</p>
          <div className="flex justify-end space-x-2 mt-2">
            <button
              onClick={() => resolve(false)}
              className="px-3 py-1 text-sm rounded-md border hover:bg-muted"
            >
              Cancel
            </button>
            <button
              onClick={() => resolve(true)}
              className="px-3 py-1 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </button>
          </div>
        </div>,
        {
          duration: 10000, // 10 seconds
          id: 'delete-confirmation',
        }
      );
    });

    if (confirmed) {
      const toastId = toast.loading("Deleting option trade...");
      try {
        setIsDeleting(true);
        await deleteOption(id);
        toast.success("Option trade deleted successfully", { id: toastId });
        
        // Reload options
        const updatedOptions = await getAllOptions();
        setOptions(updatedOptions);
      } catch (error) {
        console.error("Error deleting option:", error);
        toast.error("Failed to delete option trade. Please try again.", { id: toastId });
      } finally {
        setIsDeleting(false);
      }
    }
  };

  const handleAddNote = (option: Option) => {
    setSelectedTradeForNotes(option);
    setNotesModalOpen(true);
  };

  // Show loading state while database is initializing
  if (isInitializing) {
    return (
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Options Trades</h3>
        </div>
        <div className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-sm text-muted-foreground">Initializing database...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if database initialization failed
  if (dbError) {
    return (
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Options Trades</h3>
        </div>
        <div className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-sm text-destructive">Database initialization failed: {dbError.message}</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">
        Error loading options: {error.message}
      </div>
    );
  }

  return (
    <div className={className}>
      <Toaster position="top-right" richColors expand={true} />
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Options Trades</h3>
          <AddTradeDialog onTradeAdded={refreshOptions} />
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
        <Table id="options-table">
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
            <TableHead>Setups</TableHead>
            <TableHead>Notes</TableHead>
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
                <TableCell>
                  <Skeleton className="h-4 w-20" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-8" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-8" />
                </TableCell>
              </TableRow>
            ))
          ) : paginatedOptions && paginatedOptions.length > 0 ? (
            paginatedOptions.map((option) => {
              const isCall = option.optionType === "Call";
              const isOpen = option.status === "open";

              return (
                <TableRow key={option.id}>
                  <TableCell className="font-medium">{option.symbol}</TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {option.strategyType || "N/A"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        option.tradeDirection === "Bullish"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : option.tradeDirection === "Bearish"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }
                    >
                      {option.tradeDirection || "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {option.numberOfContracts || "N/A"}
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
                      {option.optionType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {option.entryPrice
                      ? `$${option.entryPrice.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.exitPrice
                      ? `$${option.exitPrice.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {option.commissions
                      ? `$${option.commissions.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.entryDate
                        ? new Date(option.entryDate).toLocaleDateString()
                        : "N/A"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {option.exitDate
                        ? new Date(option.exitDate).toLocaleDateString()
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
                    <SetupTradeAssociationCompact
                      tradeId={option.id}
                      tradeType="option"
                      onSetupAdded={() => {
                        // Optionally refresh data or show success message
                        toast.success("Setup added successfully");
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddNote(option)}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
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
                colSpan={13}
                className="h-24 text-center text-muted-foreground"
              >
                No options trades found. Add your first option trade to get
                started!
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Pagination */}
      {!isLoading && options.length > ITEMS_PER_PAGE && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                // Show pages around current page
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNum)}
                      isActive={currentPage === pageNum}
                      className="cursor-pointer"
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}

              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>

          <div className="text-sm text-muted-foreground">
            {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, options.length)} of {options.length} trades
          </div>
        </div>
      )}

      {selectedTradeForNotes && (
        <TradeNotesModal
          open={notesModalOpen}
          onOpenChange={setNotesModalOpen}
          tradeId={selectedTradeForNotes.id}
          tradeType="option"
          tradeSymbol={selectedTradeForNotes.symbol}
        />
      )}
    </div>
    </div>
  );
}