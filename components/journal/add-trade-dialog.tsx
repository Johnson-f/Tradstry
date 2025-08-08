"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { StockTradeForm } from "./stock-trade-form";
import { OptionTradeForm } from "./option-trade-form";

type TradeType = "stock" | "option";

export function AddTradeDialog() {
  const [open, setOpen] = useState(false);
  const [tradeType, setTradeType] = useState<TradeType>("stock");

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      // Reset to stock tab when closing
      setTradeType("stock");
    }
  };

  const handleTradeAdded = () => {
    setOpen(false);
    // You might want to add a callback here to refresh the parent component
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="ml-auto h-8">
          <Plus className="mr-2 h-4 w-4" />
          Add Trade
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Trade</DialogTitle>
          <DialogDescription>
            Add a new stock or options trade to your journal.
          </DialogDescription>
        </DialogHeader>
        
        <Tabs 
          value={tradeType} 
          onValueChange={(value) => setTradeType(value as TradeType)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="stock">Stock Trade</TabsTrigger>
            <TabsTrigger value="option">Options Trade</TabsTrigger>
          </TabsList>
          
          <TabsContent value="stock" className="mt-4">
            <StockTradeForm onSuccess={handleTradeAdded} />
          </TabsContent>
          
          <TabsContent value="option" className="mt-4">
            <OptionTradeForm onSuccess={handleTradeAdded} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
