"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Stock, useJournalDatabase } from "@/lib/drizzle/journal";
import { useAuth } from "@/lib/hooks/use-auth";
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
  className?: string;
}

const ITEMS_PER_PAGE = 20;

export function StocksTable({ className }: StocksTableProps) {
  const { user } = useAuth();
  const { 
    getAllStocks, 
    updateStock, 
    deleteStock, 
    isInitialized, 
    isInitializing, 
    error: dbError 
  } = useJournalDatabase(user?.id || '');
  
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingStock, setEditingStock] = useState<Stock | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [selectedTradeForNotes, setSelectedTradeForNotes] = useState<Stock | null>(null);

  // Function to refresh stocks data
  const refreshStocks = async () => {
    if (!user?.id || !isInitialized) return;
    
    try {
      setIsLoading(true);
      const data = await getAllStocks();
      setStocks(data);
    } catch (error) {
      console.error('Error refreshing stocks:', error);
      toast.error('Failed to refresh stocks');
    } finally {
      setIsLoading(false);
    }
  };

  // Load stocks on component mount
  useEffect(() => {
    const loadStocks = async () => {
      if (!user?.id || !isInitialized) return;
      
      try {
        setIsLoading(true);
        const data = await getAllStocks();
        setStocks(data);
      } catch (error) {
        console.error('Error loading stocks:', error);
        toast.error('Failed to load stocks');
      } finally {
        setIsLoading(false);
      }
    };

    loadStocks();
  }, [user?.id, getAllStocks, isInitialized]);
  
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

  const handleEdit = (stock: Stock) => {
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

  const handleSave = async (id: number, data: Partial<Omit<Stock, 'id' | 'userId' | 'createdAt' | 'updatedAt'>>) => {
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

  const handleAddNote = (stock: Stock) => {
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

  // Show loading state while database is initializing
  if (isInitializing) {
    return (
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Stock Trades</h3>
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
          <h3 className="text-lg font-semibold">Stock Trades</h3>
        </div>
        <div className="p-8">
          <div className="flex items-center justify-center">
            <div className="text-sm text-destructive">Database initialization failed: {dbError.message}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Stock Trades</h3>
          <AddTradeDialog onTradeAdded={refreshStocks} />
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
                    {stock.tradeType}
                  </TableCell>
                  <TableCell className="text-right">
                    ${stock.entryPrice?.toFixed(2) || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.exitPrice
                      ? `$${stock.exitPrice.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.numberShares || "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.commissions
                      ? `$${stock.commissions.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.stopLoss
                      ? `$${stock.stopLoss.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {stock.takeProfit
                      ? `$${stock.takeProfit.toFixed(2)}`
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.entryDate
                      ? new Date(stock.entryDate).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    {stock.exitDate
                      ? new Date(stock.exitDate).toLocaleDateString()
                      : "N/A"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={stock.exitPrice ? "secondary" : "outline"}
                      className={
                        stock.exitPrice
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-green-50 text-green-700 border-green-200"
                      }
                    >
                      {stock.exitPrice ? "Closed" : "Open"}
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
          userId={user?.id || ''}
          tradeId={selectedTradeForNotes.id}
          tradeType="stock"
          tradeSymbol={selectedTradeForNotes.symbol}
        />
      )}
    </>
  );
}
