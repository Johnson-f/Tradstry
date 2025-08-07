"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useStocks, useOpenStockPositions, useStockMutations } from '@/lib/hooks/use-stocks';
import { StockCreate, StockInDB, TradeType, OrderType } from '@/lib/types/trading';

export function StockTradingExample() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<StockCreate>>({
    symbol: '',
    trade_type: 'BUY',
    order_type: 'MARKET',
    entry_price: 0,
    stop_loss: 0,
    number_shares: 0,
    commissions: 0,
    entry_date: new Date().toISOString().split('T')[0],
    take_profit: undefined,
    notes: '',
  });

  // Using our custom hooks
  const { stocks, isLoading, error } = useStocks();
  const { openPositions, isLoading: openLoading } = useOpenStockPositions();
  const { createStock, closePosition, isCreating, isUpdating } = useStockMutations();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createStock({
        symbol: formData.symbol!.toUpperCase(),
        trade_type: formData.trade_type as TradeType,
        order_type: formData.order_type as OrderType,
        entry_price: formData.entry_price!,
        stop_loss: formData.stop_loss!,
        number_shares: formData.number_shares!,
        commissions: formData.commissions || 0,
        entry_date: formData.entry_date!,
        take_profit: formData.take_profit,
        notes: formData.notes,
      });

      // Reset form
      setFormData({
        symbol: '',
        trade_type: 'BUY',
        order_type: 'MARKET',
        entry_price: 0,
        stop_loss: 0,
        number_shares: 0,
        commissions: 0,
        entry_date: new Date().toISOString().split('T')[0],
        take_profit: undefined,
        notes: '',
      });
      setIsFormOpen(false);
    } catch (error) {
      console.error('Error creating stock trade:', error);
    }
  };

  const handleClosePosition = async (stock: StockInDB, exitPrice: number) => {
    try {
      await closePosition(stock.id, exitPrice);
    } catch (error) {
      console.error('Error closing position:', error);
    }
  };

  const calculateUnrealizedPL = (stock: StockInDB, currentPrice: number) => {
    const entryTotal = stock.entry_price * stock.number_shares;
    const currentTotal = currentPrice * stock.number_shares;

    if (stock.trade_type === 'BUY') {
      return currentTotal - entryTotal - stock.commissions;
    } else {
      return entryTotal - currentTotal - stock.commissions;
    }
  };

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Error loading stock data: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Stock Trading</h2>
          <p className="text-muted-foreground">Manage your stock positions</p>
        </div>
        <Button onClick={() => setIsFormOpen(!isFormOpen)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Trade
        </Button>
      </div>

      {/* Add New Trade Form */}
      {isFormOpen && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Stock Trade</CardTitle>
            <CardDescription>Enter the details of your stock trade</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="symbol">Symbol</Label>
                  <Input
                    id="symbol"
                    value={formData.symbol}
                    onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                    placeholder="AAPL"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="trade_type">Trade Type</Label>
                  <Select
                    value={formData.trade_type}
                    onValueChange={(value: TradeType) => setFormData({ ...formData, trade_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY">Buy</SelectItem>
                      <SelectItem value="SELL">Sell</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="order_type">Order Type</Label>
                  <Select
                    value={formData.order_type}
                    onValueChange={(value: OrderType) => setFormData({ ...formData, order_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MARKET">Market</SelectItem>
                      <SelectItem value="LIMIT">Limit</SelectItem>
                      <SelectItem value="STOP">Stop</SelectItem>
                      <SelectItem value="STOP_LIMIT">Stop Limit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="entry_price">Entry Price</Label>
                  <Input
                    id="entry_price"
                    type="number"
                    step="0.01"
                    value={formData.entry_price}
                    onChange={(e) => setFormData({ ...formData, entry_price: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="number_shares">Number of Shares</Label>
                  <Input
                    id="number_shares"
                    type="number"
                    value={formData.number_shares}
                    onChange={(e) => setFormData({ ...formData, number_shares: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="stop_loss">Stop Loss</Label>
                  <Input
                    id="stop_loss"
                    type="number"
                    step="0.01"
                    value={formData.stop_loss}
                    onChange={(e) => setFormData({ ...formData, stop_loss: parseFloat(e.target.value) })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="take_profit">Take Profit (Optional)</Label>
                  <Input
                    id="take_profit"
                    type="number"
                    step="0.01"
                    value={formData.take_profit || ''}
                    onChange={(e) => setFormData({ ...formData, take_profit: e.target.value ? parseFloat(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <Label htmlFor="commissions">Commissions</Label>
                  <Input
                    id="commissions"
                    type="number"
                    step="0.01"
                    value={formData.commissions}
                    onChange={(e) => setFormData({ ...formData, commissions: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="entry_date">Entry Date</Label>
                <Input
                  id="entry_date"
                  type="date"
                  value={formData.entry_date}
                  onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any notes about this trade..."
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Creating...' : 'Add Trade'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Open Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
          <CardDescription>Your current open stock positions</CardDescription>
        </CardHeader>
        <CardContent>
          {openLoading ? (
            <p>Loading open positions...</p>
          ) : openPositions && openPositions.length > 0 ? (
            <div className="space-y-4">
              {openPositions.map((stock) => (
                <div key={stock.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{stock.symbol}</span>
                        <Badge variant={stock.trade_type === 'BUY' ? 'default' : 'secondary'}>
                          {stock.trade_type}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stock.number_shares} shares @ ${stock.entry_price}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm">
                        Entry: ${(stock.entry_price * stock.number_shares).toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(stock.entry_date).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <QuickCloseButton stock={stock} onClose={handleClosePosition} isUpdating={isUpdating} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No open positions</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Trades</CardTitle>
          <CardDescription>Your latest stock trades</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Loading trades...</p>
          ) : stocks && stocks.length > 0 ? (
            <div className="space-y-4">
              {stocks.slice(0, 10).map((stock) => (
                <div key={stock.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{stock.symbol}</span>
                        <Badge variant={stock.trade_type === 'BUY' ? 'default' : 'secondary'}>
                          {stock.trade_type}
                        </Badge>
                        <Badge variant={stock.status === 'open' ? 'outline' : 'secondary'}>
                          {stock.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {stock.number_shares} shares @ ${stock.entry_price}
                        {stock.exit_price && ` → $${stock.exit_price}`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {stock.status === 'closed' && stock.exit_price && (
                      <div className="flex items-center gap-1">
                        {calculatePL(stock) >= 0 ? (
                          <TrendingUp className="h-4 w-4 text-green-500" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-500" />
                        )}
                        <span className={calculatePL(stock) >= 0 ? 'text-green-500' : 'text-red-500'}>
                          ${calculatePL(stock).toFixed(2)}
                        </span>
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {new Date(stock.entry_date).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No trades found</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Helper component for quick closing positions
function QuickCloseButton({
  stock,
  onClose,
  isUpdating
}: {
  stock: StockInDB;
  onClose: (stock: StockInDB, exitPrice: number) => void;
  isUpdating: boolean;
}) {
  const [showInput, setShowInput] = useState(false);
  const [exitPrice, setExitPrice] = useState(stock.entry_price);

  const handleClose = () => {
    onClose(stock, exitPrice);
    setShowInput(false);
  };

  if (showInput) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          value={exitPrice}
          onChange={(e) => setExitPrice(parseFloat(e.target.value))}
          className="w-24"
        />
        <Button size="sm" onClick={handleClose} disabled={isUpdating}>
          {isUpdating ? '...' : 'Close'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowInput(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="outline" onClick={() => setShowInput(true)}>
      Close Position
    </Button>
  );
}

// Helper function to calculate P&L
function calculatePL(stock: StockInDB): number {
  if (!stock.exit_price) return 0;

  const entryTotal = stock.entry_price * stock.number_shares;
  const exitTotal = stock.exit_price * stock.number_shares;

  if (stock.trade_type === 'BUY') {
    return exitTotal - entryTotal - stock.commissions;
  } else {
    return entryTotal - exitTotal - stock.commissions;
  }
}
