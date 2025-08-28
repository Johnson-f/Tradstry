"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { StockInDB, StockUpdate } from "@/lib/types/trading";
import { useStockMutations } from "@/lib/hooks/use-stocks";
import { Toaster } from "sonner";
import { EditStockDialog } from "./edit-stock-dialog";
import { TradeNotesModal } from "./trade-notes-modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddTradeDialog } from "./add-trade-dialog";
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

interface StocksTableProps {
  stocks: StockInDB[];
  isLoading?: boolean;
}

const ITEMS_PER_PAGE = 20;

export function StocksTable({ stocks = [], isLoading = false }: StocksTableProps) {
  const { updateStock, deleteStock, isUpdating, isDeleting } =
    useStockMutations();
  const [editingStock, setEditingStock] = useState<StockInDB | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedTradeForNotes, setSelectedTradeForNotes] = useState<StockInDB | null>(null);
  
  // Calculate pagination
  const totalPages = Math.ceil(stocks.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedStocks = stocks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Optional: Scroll to top of table when changing pages
    const tableElement = document.getElementById('stocks-table');
    if (tableElement) {
      tableElement.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleEdit = (stock: StockInDB) => {
    console.log("handleEdit called with stock:", stock);
    console.log("Stock ID:", stock?.id);
    if (!stock?.id) {
      console.error("Cannot edit stock: Stock ID is undefined", stock);
      toast.error("Error: Cannot edit stock - missing ID");
      return;
    }
    setEditingStock(stock);
    setIsEditDialogOpen(true);
  };

  const handleSave = async (id: number, data: StockUpdate) => {
    const toastId = toast.loading("Updating stock trade...");
    try {
      await updateStock(id, data);
      toast.success("Stock trade updated successfully", { id: toastId });
    } catch (error) {
      console.error("Error updating stock:", error);
      toast.error("Failed to update stock trade. Please try again.", { id: toastId });
    }
  };

  const handleDelete = async (id: number) => {
    if (!id || id === undefined || isNaN(id)) {
      console.error("Cannot delete stock: Invalid ID provided", {
        id,
        type: typeof id,
      });
      toast.error("Error: Invalid stock trade ID. Please try again.");
      return;
    }

    toast.dismiss(); // Dismiss any existing toasts
    
    const confirmed = await new Promise<boolean>((resolve) => {
      toast(
        <div className="flex flex-col space-y-2">
          <p className="font-medium">Delete Stock Trade</p>
          <p>Are you sure you want to delete this stock trade?</p>
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
      const toastId = toast.loading("Deleting stock trade...");
      try {
        await deleteStock(id);
        toast.success("Stock trade deleted successfully", { id: toastId });
      } catch (error) {
        console.error("Error deleting stock:", error);
        toast.error("Failed to delete stock trade. Please try again.", { id: toastId });
      }
    }
  };

  const handleAddNote = (stock: StockInDB) => {
    setSelectedTradeForNotes(stock);
    setNotesModalOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Toaster position="top-right" richColors expand={true} />
        {Array(5).fill(0).map((_, i) => (
          <div
            key={i}
            className="flex items-center space-x-4 p-4 border rounded-lg"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  const hasData = stocks && stocks.length > 0;

  return (
    <>
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Stock Trades</h3>
          <AddTradeDialog />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Entry Price</TableHead>
              <TableHead className="text-right">Exit Price</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Commissions</TableHead>
              <TableHead className="text-right">Stop Loss</TableHead>
              <TableHead className="text-right">Take Profit</TableHead>
              <TableHead>Entry Date</TableHead>
              <TableHead>Exit Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">P/L</TableHead>
              <TableHead>Setups</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Skeleton loading state
              Array(5).fill(0).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                </TableRow>
              ))
            ) : (
              paginatedStocks.map((stock) => (
                <TableRow key={stock.id}>
                  <TableCell className="font-medium">
                    {stock.symbol}
                  </TableCell>
                  <TableCell className="capitalize">
                    {stock.trade_type}
                  </TableCell>
                  <TableCell className="text-right">
                    ${stock.entry_price?.toFixed(2) || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.exit_price
                      ? `$${stock.exit_price.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.number_shares || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.commissions
                      ? `$${stock.commissions.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.stop_loss
                      ? `$${stock.stop_loss.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.take_profit
                      ? `$${stock.take_profit.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.entry_date
                      ? new Date(stock.entry_date).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.exit_date
                      ? new Date(stock.exit_date).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        stock.status === "open" ? "outline" : "secondary"
                      }
                      className={
                        stock.status === "open"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }
                    >
                      {stock.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {/* P/L calculation would go here */}
                    N/A
                  </TableCell>
                  <TableCell>
                    <SetupTradeAssociationCompact 
                      tradeId={stock.id} 
                      tradeType="stock" 
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
                      onClick={() => handleAddNote(stock)}
                      className="h-8 w-8 p-0"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </TableCell>
                  <TableCell>
                    <ActionsDropdown
                      onEdit={() => {
                        console.log("Edit button clicked for stock:", stock);
                        handleEdit(stock);
                      }}
                      onDelete={() => {
                        console.log(
                          "Delete button clicked for stock ID:",
                          stock?.id
                        );
                        handleDelete(stock.id);
                      }}
                      isDisabled={isUpdating || isDeleting}
                      className="h-8 w-8 p-0"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        {/* Pagination */}
        {!isLoading && stocks.length > ITEMS_PER_PAGE && (
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
              {startIndex + 1}-{Math.min(startIndex + ITEMS_PER_PAGE, stocks.length)} of {stocks.length} trades
            </div>
          </div>
        )}
      </div>

      {editingStock && (
        <EditStockDialog
          stock={editingStock}
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setEditingStock(null);
          }}
          onSave={handleSave}
          isSaving={isUpdating}
        />
      )}

      {selectedTradeForNotes && (
        <TradeNotesModal
          open={notesModalOpen}
          onOpenChange={setNotesModalOpen}
          tradeId={selectedTradeForNotes.id}
          tradeType="stock"
          tradeSymbol={selectedTradeForNotes.symbol}
        />
      )}
    </>
  );
}
