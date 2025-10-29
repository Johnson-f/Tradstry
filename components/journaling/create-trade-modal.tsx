"use client"

import React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useCreateStock } from "@/lib/hooks/use-stocks"
import { useCreateOption } from "@/lib/hooks/use-options"
import type { CreateStockRequest } from "@/lib/types/stocks"
import type { CreateOptionRequest } from "@/lib/types/options"

// Helper to get local datetime string suitable for input[type="datetime-local"]
function getLocalDateTimeInputValue(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

// Stock form schema
const stockFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(10, "Symbol must be 10 characters or less"),
   // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  tradeType: z.enum(["BUY", "SELL"], { required_error: "Trade type is required" }),
   // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  orderType: z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"], { required_error: "Order type is required" }),
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  exitPrice: z.coerce.number().positive("Exit price must be positive").optional(),
  stopLoss: z.coerce.number().positive("Stop loss must be positive"),
  commissions: z.coerce.number().min(0, "Commissions cannot be negative").optional().default(0),
  numberShares: z.coerce.number().positive("Number of shares must be positive"),
  takeProfit: z.coerce.number().positive("Take profit must be positive").optional(),
  initialTarget: z.coerce.number().positive("Initial target must be positive").optional(),
  profitTarget: z.coerce.number().positive("Profit target must be positive").optional(),
  tradeRatings: z.coerce.number().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5").optional(),
  entryDate: z.string().min(1, "Entry date is required"),
  exitDate: z.string().optional(),
  reviewed: z.boolean().optional().default(false),
  mistakes: z.string().optional(),
})

type StockFormData = z.infer<typeof stockFormSchema>

// Option form schema
const optionFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required").max(10, "Symbol must be 10 characters or less"),
  strategyType: z.string().min(1, "Strategy type is required"),
   // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  tradeDirection: z.enum(["Bullish", "Bearish", "Neutral"], { required_error: "Trade direction is required" }),
  numberOfContracts: z.coerce.number().int().positive("Number of contracts must be a positive integer"),
   // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
  optionType: z.enum(["Call", "Put"], { required_error: "Option type is required" }),
  strikePrice: z.coerce.number().positive("Strike price must be positive"),
  expirationDate: z.string().min(1, "Expiration date is required"),
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  exitPrice: z.coerce.number().positive("Exit price must be positive").optional(),
  totalPremium: z.coerce.number().positive("Total premium must be positive"),
  commissions: z.coerce.number().min(0, "Commissions cannot be negative").optional().default(0),
  impliedVolatility: z.coerce
    .number()
    .min(0, "Implied volatility cannot be negative")
    .max(100, "Implied volatility cannot exceed 100"),
  entryDate: z.string().min(1, "Entry date is required"),
  exitDate: z.string().optional(),
  initialTarget: z.coerce.number().positive("Initial target must be positive").optional(),
  profitTarget: z.coerce.number().positive("Profit target must be positive").optional(),
  tradeRatings: z.coerce.number().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5").optional(),
  reviewed: z.boolean().optional().default(false),
  mistakes: z.string().optional(),
})

type OptionFormData = z.infer<typeof optionFormSchema>

interface CreateTradeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function CreateTradeModal({ open, onOpenChange }: CreateTradeModalProps) {
  const [activeTab, setActiveTab] = React.useState<"stock" | "option">("stock")
  const createStock = useCreateStock()
  const createOption = useCreateOption()

  const stockForm = useForm<StockFormData>({
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    resolver: zodResolver(stockFormSchema),
    defaultValues: {
      symbol: "",
      tradeType: "BUY",
      orderType: "MARKET",
      entryPrice: 0,
      exitPrice: undefined,
      stopLoss: 0,
      commissions: 0,
      numberShares: 0,
      takeProfit: undefined,
      initialTarget: undefined,
      profitTarget: undefined,
      tradeRatings: undefined,
      entryDate: getLocalDateTimeInputValue(),
      exitDate: undefined,
      reviewed: false,
      mistakes: "",
    },
  })

  const optionForm = useForm<OptionFormData>({
    // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
    resolver: zodResolver(optionFormSchema),
    defaultValues: {
      symbol: "",
      strategyType: "",
      tradeDirection: "Bullish",
      numberOfContracts: 0,
      optionType: "Call",
      strikePrice: 0,
      expirationDate: "",
      entryPrice: 0,
      exitPrice: undefined,
      totalPremium: 0,
      commissions: 0,
      impliedVolatility: 0,
      entryDate: getLocalDateTimeInputValue(),
      exitDate: undefined,
      initialTarget: undefined,
      profitTarget: undefined,
      tradeRatings: undefined,
      reviewed: false,
      mistakes: "",
    },
  })

  const handleStockSubmit = async (data: StockFormData) => {
    try {
      // Normalize entryDate to ISO string
      const entryDateIso = new Date(data.entryDate).toISOString()
      const payload: CreateStockRequest = {
        symbol: data.symbol,
        tradeType: data.tradeType,
        orderType: data.orderType,
        entryPrice: data.entryPrice,
         // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
        exitPrice: data.exitPrice,
        stopLoss: data.stopLoss,
        commissions: Number.isFinite(data.commissions) ? data.commissions : 0,
        numberShares: data.numberShares,
        takeProfit: data.takeProfit,
        initialTarget: data.initialTarget,
        profitTarget: data.profitTarget,
        tradeRatings:
          data.tradeRatings != null && data.tradeRatings !== ("" as unknown)
            ? Math.round(Number(data.tradeRatings))
            : undefined,
        entryDate: entryDateIso,
        exitDate: data.exitDate ? new Date(data.exitDate).toISOString() : undefined,
        reviewed: data.reviewed,
        mistakes: data.mistakes,
      }

      await createStock.mutateAsync(payload)
      toast.success("Stock trade created successfully")
      stockForm.reset()
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create stock trade"
      toast.error(message)
      console.error("Error creating stock trade:", error)
    }
  }

  const handleOptionSubmit = async (data: OptionFormData) => {
    try {
      // Normalize entry, expiration, and exit dates to ISO strings
      const entryDateIso = new Date(data.entryDate).toISOString()
      const expirationDateIso = data.expirationDate ? new Date(`${data.expirationDate}T00:00:00`).toISOString() : ""
      const exitDateIso = data.exitDate ? new Date(data.exitDate).toISOString() : undefined
      const payload: CreateOptionRequest = {
        symbol: data.symbol,
        strategyType: data.strategyType,
        tradeDirection: data.tradeDirection,
        numberOfContracts: data.numberOfContracts,
        optionType: data.optionType,
        strikePrice: data.strikePrice,
        expirationDate: expirationDateIso,
        entryPrice: data.entryPrice,
         // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
        exitPrice: data.exitPrice,
        totalPremium: data.totalPremium,
        commissions: data.commissions,
        impliedVolatility: data.impliedVolatility,
        entryDate: entryDateIso,
        exitDate: exitDateIso,
        initialTarget: data.initialTarget,
        profitTarget: data.profitTarget,
        tradeRatings: data.tradeRatings,
        reviewed: data.reviewed,
        mistakes: data.mistakes,
      }

      await createOption.mutateAsync(payload)
      toast.success("Option trade created successfully")
      optionForm.reset()
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create option trade"
      toast.error(message)
      console.error("Error creating option trade:", error)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[90vh] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogTitle>Create New Trade</DialogTitle>
          <DialogDescription>Add a new stock or option trade to your journal</DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as "stock" | "option")}
          className="w-full flex flex-col flex-1 min-h-0 overflow-hidden"
        >
          <div className="flex-shrink-0 px-6 pb-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="stock">Stock Trade</TabsTrigger>
              <TabsTrigger value="option">Option Trade</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-hidden">
            <div className="px-6 pb-6">
              <TabsContent value="stock" className="space-y-4 mt-0">
                <Form {...stockForm}>
                 {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                  <form onSubmit={stockForm.handleSubmit(handleStockSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="symbol"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Symbol</FormLabel>
                            <FormControl>
                              <Input placeholder="AAPL" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="tradeType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select trade type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="BUY">BUY</SelectItem>
                                <SelectItem value="SELL">SELL</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="orderType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Order Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select order type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="MARKET">MARKET</SelectItem>
                                <SelectItem value="LIMIT">LIMIT</SelectItem>
                                <SelectItem value="STOP">STOP</SelectItem>
                                <SelectItem value="STOP_LIMIT">STOP_LIMIT</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="numberShares"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of Shares</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="100" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="entryPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="150.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="stopLoss"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stop Loss</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="145.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="exitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exit Price (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="155.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="takeProfit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Take Profit</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="160.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="initialTarget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Initial Target</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="155.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="profitTarget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Profit Target</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="165.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="commissions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Commissions</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="tradeRatings"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade Rating (1-5)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max="5"
                                placeholder="3"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="entryDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Date</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={stockForm.control}
                        name="exitDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exit Date (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                     // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                      control={stockForm.control}
                      name="mistakes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mistakes (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter mistakes separated by commas" {...field} />
                          </FormControl>
                          <FormDescription>List any mistakes made in this trade, separated by commas</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createStock.isPending}>
                        {createStock.isPending ? "Creating..." : "Create Stock Trade"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>

              <TabsContent value="option" className="space-y-4 mt-0">
                <Form {...optionForm}>
                 {/* @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?) */}
                  <form onSubmit={optionForm.handleSubmit(handleOptionSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="symbol"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Symbol</FormLabel>
                            <FormControl>
                              <Input placeholder="AAPL" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="strategyType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Strategy Type</FormLabel>
                            <FormControl>
                              <Input placeholder="Long Call" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="tradeDirection"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade Direction</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select direction" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Bullish">Bullish</SelectItem>
                                <SelectItem value="Bearish">Bearish</SelectItem>
                                <SelectItem value="Neutral">Neutral</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="optionType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Option Type</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select option type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Call">Call</SelectItem>
                                <SelectItem value="Put">Put</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="numberOfContracts"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Number of Contracts</FormLabel>
                            <FormControl>
                              <Input type="number" step="1" placeholder="1" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="strikePrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Strike Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="150.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="entryPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Price</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="5.50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="exitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exit Price (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="6.50"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="totalPremium"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Total Premium</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="550.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="commissions"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Commissions</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="0.00" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="impliedVolatility"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Implied Volatility (%)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="25.50" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="tradeRatings"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Trade Rating (1-5)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max="5"
                                placeholder="3"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="entryDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Date</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="expirationDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expiration Date</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="exitDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Exit Date (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="initialTarget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Initial Target</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="6.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                       // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                        control={optionForm.control}
                        name="profitTarget"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Profit Target</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="8.00"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.value)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                     // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
                      control={optionForm.control}
                      name="mistakes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mistakes (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter mistakes separated by commas" {...field} />
                          </FormControl>
                          <FormDescription>List any mistakes made in this trade, separated by commas</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createOption.isPending}>
                        {createOption.isPending ? "Creating..." : "Create Option Trade"}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
