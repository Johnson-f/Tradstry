"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Watchlist } from "./wahclist";

interface WatchlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WatchlistModal({ open, onOpenChange }: WatchlistModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>My Watchlists</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[70vh] pr-2">
          <Watchlist />
        </div>
      </DialogContent>
    </Dialog>
  );
}
