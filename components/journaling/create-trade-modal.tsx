"use client";

import React from "react";
import { z } from "zod";
import { useCreateStock, useUpdateStock } from "@/lib/hooks/use-stocks";
import { useCreateOption, useUpdateOption } from "@/lib/hooks/use-options";
import type { CreateStockRequest } from "@/lib/types/stocks";
import type { CreateOptionRequest, OptionType, TradeDirection } from "@/lib/types/options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

type CreateTradeModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const stockSchema = z.object({
  symbol: z.string().min(1),
  tradeType: z.enum(["BUY", "SELL"]),
  orderType: z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]).default("MARKET"),
  entryPrice: z.coerce.number().positive(),
  stopLoss: z.coerce.number().nonnegative().optional().default(0),
  commissions: z.coerce.number().nonnegative().optional().default(0),
  numberShares: z.coerce.number().int().positive(),
  entryDate: z.string().min(1),
  exitDate: z.string().optional(),
  takeProfit: z.coerce.number().nonnegative().optional(),
  initialTarget: z.coerce.number().nonnegative().optional(),
  profitTarget: z.coerce.number().nonnegative().optional(),
  tradeRatings: z.coerce.number().int().min(1).max(5).optional(),
  mistakes: z.string().optional(),
});

const optionSchema = z.object({
  symbol: z.string().min(1),
  strategyType: z.string().min(1),
  tradeDirection: z.enum(["Bullish", "Bearish", "Neutral"]).default("Bullish"),
  numberOfContracts: z.coerce.number().int().positive(),
  optionType: z.enum(["Call", "Put"]).default("Call"),
  strikePrice: z.coerce.number().positive(),
  expirationDate: z.string().min(1),
  entryPrice: z.coerce.number().positive(),
  totalPremium: z.coerce.number().nonnegative().optional().default(0),
  commissions: z.coerce.number().nonnegative().optional().default(0),
  impliedVolatility: z.coerce.number().nonnegative().optional().default(0),
  entryDate: z.string().min(1),
  exitDate: z.string().optional(),
  initialTarget: z.coerce.number().nonnegative().optional(),
  profitTarget: z.coerce.number().nonnegative().optional(),
  tradeRatings: z.coerce.number().int().min(1).max(5).optional(),
  mistakes: z.string().optional(),
});

export default function CreateTradeModal({ open, onOpenChange }: CreateTradeModalProps) {
  const createStock = useCreateStock();
  const updateStock = useUpdateStock();
  const createOption = useCreateOption();
  const updateOption = useUpdateOption();
  const [tab, setTab] = React.useState<"stocks" | "options">("stocks");
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const toTimeString = (iso: string | ""): string => {
    if (!iso) return "";
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  };

  const combineDateAndTime = (date: Date, timeHHMM?: string, fallbackFrom?: string): string => {
    const base = new Date(date);
    if (timeHHMM && /^\d{2}:\d{2}$/.test(timeHHMM)) {
      const [hh, mm] = timeHHMM.split(":").map((v) => parseInt(v, 10));
      base.setHours(hh, mm, 0, 0);
    } else if (fallbackFrom) {
      const ref = new Date(fallbackFrom);
      base.setHours(ref.getHours(), ref.getMinutes(), ref.getSeconds(), ref.getMilliseconds());
    } else {
      const now = new Date();
      base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }
    return base.toISOString();
  };

  // Stock form state
  const [stockForm, setStockForm] = React.useState({
    symbol: "",
    tradeType: "BUY" as "BUY" | "SELL",
    orderType: "MARKET" as "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT",
    entryPrice: "",
    stopLoss: "0",
    commissions: "0",
    numberShares: "",
    entryDate: new Date().toISOString(),
    exitDate: "",
    takeProfit: "",
    initialTarget: "",
    profitTarget: "",
    tradeRatings: "",
    mistakes: "",
  });

  // Option form state
  const [optionForm, setOptionForm] = React.useState({
    symbol: "",
    strategyType: "Single",
    tradeDirection: "Bullish" as TradeDirection,
    numberOfContracts: "",
    optionType: "Call" as OptionType,
    strikePrice: "",
    expirationDate: new Date().toISOString(),
    entryPrice: "",
    totalPremium: "0",
    commissions: "0",
    impliedVolatility: "0",
    entryDate: new Date().toISOString(),
    exitDate: "",
    initialTarget: "",
    profitTarget: "",
    tradeRatings: "",
    mistakes: "",
  });

  const reset = () => {
    setStockForm({
      symbol: "",
      tradeType: "BUY",
      orderType: "MARKET",
      entryPrice: "",
      stopLoss: "0",
      commissions: "0",
      numberShares: "",
      entryDate: new Date().toISOString(),
      exitDate: "",
      takeProfit: "",
      initialTarget: "",
      profitTarget: "",
      tradeRatings: "",
      mistakes: "",
    });
    setOptionForm({
      symbol: "",
      strategyType: "Single",
      tradeDirection: "Bullish",
      numberOfContracts: "",
      optionType: "Call",
      strikePrice: "",
      expirationDate: new Date().toISOString(),
      entryPrice: "",
      totalPremium: "0",
      commissions: "0",
      impliedVolatility: "0",
      entryDate: new Date().toISOString(),
      exitDate: "",
      initialTarget: "",
      profitTarget: "",
      tradeRatings: "",
      mistakes: "",
    });
    setErrors({});
  };

  const onSubmitStocks = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const parsed = stockSchema.parse({
        symbol: stockForm.symbol.trim().toUpperCase(),
        tradeType: stockForm.tradeType,
        orderType: stockForm.orderType,
        entryPrice: stockForm.entryPrice,
        stopLoss: stockForm.stopLoss,
        commissions: stockForm.commissions,
        numberShares: stockForm.numberShares,
        entryDate: stockForm.entryDate,
        takeProfit: stockForm.takeProfit || undefined,
        initialTarget: stockForm.initialTarget || undefined,
        profitTarget: stockForm.profitTarget || undefined,
        tradeRatings: stockForm.tradeRatings || undefined,
        mistakes: stockForm.mistakes || undefined,
      });

      const payload: CreateStockRequest = {
        ...parsed,
        reviewed: false,
      };

      const created = await createStock.mutateAsync(payload);
      const createdId: number | undefined = (created as { data?: { id: number } })?.data?.id;
      if (createdId && stockForm.exitDate) {
        try {
          await updateStock.mutateAsync({ id: createdId, updates: { exitDate: stockForm.exitDate } });
        } catch {
          // ignore optional exitDate update failure
        }
      }
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) {
        const map: Record<string, string> = {};
        e.issues.forEach((iss) => { map[iss.path.join(".")] = iss.message; });
        setErrors(map);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitOptions = async () => {
    setSubmitting(true);
    setErrors({});
    try {
      const parsed = optionSchema.parse({
        symbol: optionForm.symbol.trim().toUpperCase(),
        strategyType: optionForm.strategyType,
        tradeDirection: optionForm.tradeDirection,
        numberOfContracts: optionForm.numberOfContracts,
        optionType: optionForm.optionType,
        strikePrice: optionForm.strikePrice,
        expirationDate: optionForm.expirationDate,
        entryPrice: optionForm.entryPrice,
        totalPremium: optionForm.totalPremium,
        commissions: optionForm.commissions,
        impliedVolatility: optionForm.impliedVolatility,
        entryDate: optionForm.entryDate,
        initialTarget: optionForm.initialTarget || undefined,
        profitTarget: optionForm.profitTarget || undefined,
        tradeRatings: optionForm.tradeRatings || undefined,
        mistakes: optionForm.mistakes || undefined,
      });

      const payload: CreateOptionRequest = {
        ...parsed,
        reviewed: false,
      };

      const created = await createOption.mutateAsync(payload);
      const createdId: number | undefined = (created as { data?: { id: number } })?.data?.id;
      if (createdId && optionForm.exitDate) {
        try {
          await updateOption.mutateAsync({ id: createdId, updates: { exitDate: optionForm.exitDate } });
        } catch {
          // ignore optional exitDate update failure
        }
      }
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof z.ZodError) {
        const map: Record<string, string> = {};
        e.issues.forEach((iss) => { map[iss.path.join(".")] = iss.message; });
        setErrors(map);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Add Trade</DialogTitle>
          <DialogDescription>Add a new Stock or Option trade.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh] pr-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "stocks" | "options") }>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="stocks">Stocks</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
            </TabsList>
            <TabsContent value="stocks" className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="stock-symbol">Symbol</Label>
                <Input id="stock-symbol" value={stockForm.symbol} onChange={(e) => setStockForm(s => ({...s, symbol: e.target.value}))} placeholder="AAPL" />
                {errors.symbol && <p className="text-xs text-red-600 mt-1">{errors.symbol}</p>}
              </div>
              <div>
                <Label htmlFor="stock-tradeType">Trade Type</Label>
                <Select value={stockForm.tradeType} onValueChange={(v) => setStockForm(s => ({ ...s, tradeType: v as "BUY" | "SELL" }))}>
                  <SelectTrigger id="stock-tradeType" className="w-full h-9">
                    <SelectValue placeholder="Select trade type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BUY">BUY</SelectItem>
                    <SelectItem value="SELL">SELL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="stock-entryPrice">Entry Price</Label>
                <Input id="stock-entryPrice" value={stockForm.entryPrice} onChange={(e) => setStockForm(s => ({...s, entryPrice: e.target.value}))} placeholder="150.25" />
                {errors.entryPrice && <p className="text-xs text-red-600 mt-1">{errors.entryPrice}</p>}
              </div>
              <div>
                <Label htmlFor="stock-orderType">Order Type</Label>
                <select id="stock-orderType" className="w-full h-9 rounded-md border px-2" value={stockForm.orderType} onChange={(e) => setStockForm(s => ({...s, orderType: e.target.value as "MARKET" | "LIMIT" | "STOP" | "STOP_LIMIT"}))}>
                  <option value="MARKET">MARKET</option>
                  <option value="LIMIT">LIMIT</option>
                  <option value="STOP">STOP</option>
                  <option value="STOP_LIMIT">STOP_LIMIT</option>
                </select>
              </div>
              <div>
                <Label htmlFor="stock-numberShares">Shares</Label>
                <Input id="stock-numberShares" value={stockForm.numberShares} onChange={(e) => setStockForm(s => ({...s, numberShares: e.target.value}))} placeholder="100" />
                {errors.numberShares && <p className="text-xs text-red-600 mt-1">{errors.numberShares}</p>}
              </div>
              <div>
                <Label htmlFor="stock-stopLoss">Stop Loss</Label>
                <Input id="stock-stopLoss" value={stockForm.stopLoss} onChange={(e) => setStockForm(s => ({...s, stopLoss: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="stock-commissions">Commissions</Label>
                <Input id="stock-commissions" value={stockForm.commissions} onChange={(e) => setStockForm(s => ({...s, commissions: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="stock-entryDate">Entry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" id="stock-entryDate">
                      {stockForm.entryDate ? format(new Date(stockForm.entryDate), "PPP p") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={stockForm.entryDate ? new Date(stockForm.entryDate) : undefined}
                      onSelect={(date) => setStockForm(s => ({ ...s, entryDate: date ? combineDateAndTime(date, toTimeString(s.entryDate), s.entryDate) : s.entryDate }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="mt-2"
                  value={toTimeString(stockForm.entryDate)}
                  onChange={(e) => setStockForm(s => ({ ...s, entryDate: s.entryDate ? combineDateAndTime(new Date(s.entryDate), e.target.value, s.entryDate) : combineDateAndTime(new Date(), e.target.value) }))}
                />
                {errors.entryDate && <p className="text-xs text-red-600 mt-1">{errors.entryDate}</p>}
              </div>
              <div>
                <Label htmlFor="stock-exitDate">Exit Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" id="stock-exitDate">
                      {stockForm.exitDate ? format(new Date(stockForm.exitDate), "PPP p") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={stockForm.exitDate ? new Date(stockForm.exitDate) : undefined}
                      onSelect={(date) => setStockForm(s => ({ ...s, exitDate: date ? combineDateAndTime(date, toTimeString(s.exitDate || ""), s.entryDate) : "" }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="mt-2"
                  value={toTimeString(stockForm.exitDate || "")}
                  onChange={(e) => setStockForm(s => ({ ...s, exitDate: s.exitDate ? combineDateAndTime(new Date(s.exitDate), e.target.value, s.entryDate) : (s.entryDate ? combineDateAndTime(new Date(s.entryDate), e.target.value) : combineDateAndTime(new Date(), e.target.value)) }))}
                />
              </div>
              <div>
                <Label htmlFor="stock-takeProfit">Take Profit</Label>
                <Input id="stock-takeProfit" value={stockForm.takeProfit} onChange={(e) => setStockForm(s => ({...s, takeProfit: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="stock-initialTarget">Initial Target</Label>
                <Input id="stock-initialTarget" value={stockForm.initialTarget} onChange={(e) => setStockForm(s => ({...s, initialTarget: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="stock-profitTarget">Profit Target</Label>
                <Input id="stock-profitTarget" value={stockForm.profitTarget} onChange={(e) => setStockForm(s => ({...s, profitTarget: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="stock-tradeRatings">Trade Rating (1-5)</Label>
                <Input id="stock-tradeRatings" value={stockForm.tradeRatings} onChange={(e) => setStockForm(s => ({...s, tradeRatings: e.target.value}))} placeholder="3" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="stock-mistakes">Mistakes</Label>
                <Input id="stock-mistakes" value={stockForm.mistakes} onChange={(e) => setStockForm(s => ({...s, mistakes: e.target.value}))} placeholder="comma-separated or JSON" />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={submitting} onClick={onSubmitStocks}>{submitting ? "Saving..." : "Save Stock Trade"}</Button>
            </DialogFooter>
            </TabsContent>

            <TabsContent value="options" className="pt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="opt-symbol">Symbol</Label>
                <Input id="opt-symbol" value={optionForm.symbol} onChange={(e) => setOptionForm(s => ({...s, symbol: e.target.value}))} placeholder="AAPL" />
                {errors.symbol && <p className="text-xs text-red-600 mt-1">{errors.symbol}</p>}
              </div>
              <div>
                <Label htmlFor="opt-strategy">Strategy</Label>
                <Input id="opt-strategy" value={optionForm.strategyType} onChange={(e) => setOptionForm(s => ({...s, strategyType: e.target.value}))} placeholder="Single" />
              </div>
              <div>
                <Label htmlFor="opt-direction">Direction</Label>
                <Select value={optionForm.tradeDirection} onValueChange={(v) => setOptionForm(s => ({ ...s, tradeDirection: v as TradeDirection }))}>
                  <SelectTrigger id="opt-direction" className="w-full h-9">
                    <SelectValue placeholder="Select direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Bullish">Bullish</SelectItem>
                    <SelectItem value="Bearish">Bearish</SelectItem>
                    <SelectItem value="Neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="opt-type">Type</Label>
                <Select value={optionForm.optionType} onValueChange={(v) => setOptionForm(s => ({ ...s, optionType: v as OptionType }))}>
                  <SelectTrigger id="opt-type" className="w-full h-9">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Call">Call</SelectItem>
                    <SelectItem value="Put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="opt-contracts">Contracts</Label>
                <Input id="opt-contracts" value={optionForm.numberOfContracts} onChange={(e) => setOptionForm(s => ({...s, numberOfContracts: e.target.value}))} placeholder="1" />
                {errors.numberOfContracts && <p className="text-xs text-red-600 mt-1">{errors.numberOfContracts}</p>}
              </div>
              <div>
                <Label htmlFor="opt-entryPrice">Entry Price</Label>
                <Input id="opt-entryPrice" value={optionForm.entryPrice} onChange={(e) => setOptionForm(s => ({...s, entryPrice: e.target.value}))} placeholder="1.25" />
                {errors.entryPrice && <p className="text-xs text-red-600 mt-1">{errors.entryPrice}</p>}
              </div>
              <div>
                <Label htmlFor="opt-strike">Strike</Label>
                <Input id="opt-strike" value={optionForm.strikePrice} onChange={(e) => setOptionForm(s => ({...s, strikePrice: e.target.value}))} placeholder="200" />
                {errors.strikePrice && <p className="text-xs text-red-600 mt-1">{errors.strikePrice}</p>}
              </div>
              <div>
                <Label htmlFor="opt-expiry">Expiration Date</Label>
                <Input id="opt-expiry" value={optionForm.expirationDate} onChange={(e) => setOptionForm(s => ({...s, expirationDate: e.target.value}))} />
                {errors.expirationDate && <p className="text-xs text-red-600 mt-1">{errors.expirationDate}</p>}
              </div>
              <div>
                <Label htmlFor="opt-premium">Total Premium</Label>
                <Input id="opt-premium" value={optionForm.totalPremium} onChange={(e) => setOptionForm(s => ({...s, totalPremium: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="opt-commissions">Commissions</Label>
                <Input id="opt-commissions" value={optionForm.commissions} onChange={(e) => setOptionForm(s => ({...s, commissions: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="opt-entryDate">Entry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" id="opt-entryDate">
                      {optionForm.entryDate ? format(new Date(optionForm.entryDate), "PPP p") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={optionForm.entryDate ? new Date(optionForm.entryDate) : undefined}
                      onSelect={(date) => setOptionForm(s => ({ ...s, entryDate: date ? combineDateAndTime(date, toTimeString(s.entryDate), s.entryDate) : s.entryDate }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="mt-2"
                  value={toTimeString(optionForm.entryDate)}
                  onChange={(e) => setOptionForm(s => ({ ...s, entryDate: s.entryDate ? combineDateAndTime(new Date(s.entryDate), e.target.value, s.entryDate) : combineDateAndTime(new Date(), e.target.value) }))}
                />
                {errors.entryDate && <p className="text-xs text-red-600 mt-1">{errors.entryDate}</p>}
              </div>
              <div>
                <Label htmlFor="opt-exitDate">Exit Date (optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal" id="opt-exitDate">
                      {optionForm.exitDate ? format(new Date(optionForm.exitDate), "PPP p") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={optionForm.exitDate ? new Date(optionForm.exitDate) : undefined}
                      onSelect={(date) => setOptionForm(s => ({ ...s, exitDate: date ? combineDateAndTime(date, toTimeString(s.exitDate || ""), s.entryDate) : "" }))}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Input
                  type="time"
                  className="mt-2"
                  value={toTimeString(optionForm.exitDate || "")}
                  onChange={(e) => setOptionForm(s => ({ ...s, exitDate: s.exitDate ? combineDateAndTime(new Date(s.exitDate), e.target.value, s.entryDate) : (s.entryDate ? combineDateAndTime(new Date(s.entryDate), e.target.value) : combineDateAndTime(new Date(), e.target.value)) }))}
                />
              </div>
              <div>
                <Label htmlFor="opt-initialTarget">Initial Target</Label>
                <Input id="opt-initialTarget" value={optionForm.initialTarget} onChange={(e) => setOptionForm(s => ({...s, initialTarget: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="opt-profitTarget">Profit Target</Label>
                <Input id="opt-profitTarget" value={optionForm.profitTarget} onChange={(e) => setOptionForm(s => ({...s, profitTarget: e.target.value}))} placeholder="0" />
              </div>
              <div>
                <Label htmlFor="opt-tradeRatings">Trade Rating (1-5)</Label>
                <Input id="opt-tradeRatings" value={optionForm.tradeRatings} onChange={(e) => setOptionForm(s => ({...s, tradeRatings: e.target.value}))} placeholder="3" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="opt-mistakes">Mistakes</Label>
                <Input id="opt-mistakes" value={optionForm.mistakes} onChange={(e) => setOptionForm(s => ({...s, mistakes: e.target.value}))} placeholder="comma-separated or JSON" />
              </div>
            </div>
            <DialogFooter>
              <Button disabled={submitting} onClick={onSubmitOptions}>{submitting ? "Saving..." : "Save Option Trade"}</Button>
            </DialogFooter>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


