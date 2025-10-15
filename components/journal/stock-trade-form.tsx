"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/lib/hooks/use-auth";
import { useStocks } from "@/lib/replicache/hooks/use-stocks";

const stockFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  trade_type: z.enum(["BUY", "SELL"]),
  order_type: z.enum(["MARKET", "LIMIT", "STOP", "STOP_LIMIT"]),
  entry_price: z.number().min(0.0001, "Must be greater than 0"),
  exit_price: z.number().optional(),
  number_shares: z.number().min(0.0001, "Must be greater than 0"),
  commissions: z.number().min(0, "Cannot be negative"),
  stop_loss: z.number().min(0.0001, "Must be greater than 0"),
  take_profit: z.number().optional(),
  entry_date: z.date(),
  exit_date: z.date().optional(),
});

type StockFormValues = z.infer<typeof stockFormSchema>;

interface StockTradeFormProps {
  onSuccess?: () => void;
}

export function StockTradeForm({ onSuccess }: StockTradeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading: authLoading } = useAuth();
  
  // Use Replicache hook instead of direct database operations
  const { createStock, isInitialized } = useStocks(user?.id || '');

  const form = useForm<StockFormValues>({
    resolver: zodResolver(stockFormSchema),
    defaultValues: {
      symbol: "",
      trade_type: "BUY",
      order_type: "MARKET",
      entry_price: 0.0001,
      exit_price: undefined,
      number_shares: 0.0001,
      commissions: 0,
      stop_loss: 0.0001,
      take_profit: undefined,
      entry_date: new Date(),
      exit_date: undefined,
    },
  });

  const onSubmit = async (data: StockFormValues) => {
    console.log("=== FORM SUBMISSION STARTED ===");
    console.log("Form submitted with data:", data);
    console.log("Form errors:", form.formState.errors);
    console.log("Form is valid:", form.formState.isValid);

    // Trigger validation manually to get current errors
    const isValid = await form.trigger();
    console.log("Manual validation result:", isValid);
    console.log("Current form errors after trigger:", form.formState.errors);

    // Check if form has validation errors
    if (!isValid) {
      console.error("Form has validation errors:", form.formState.errors);
      toast.error("Please fix the form errors before submitting");
      return;
    }

    if (authLoading) {
      console.log("Auth still loading...");
      toast.info("Please wait while we verify your session...");
      return;
    }

    if (!user) {
      console.error("No user found when submitting form");
      toast.error("You must be logged in to create a trade");
      return;
    }

    if (!isInitialized) {
      console.log("Replicache not initialized...");
      toast.info("Please wait while we initialize the database...");
      return;
    }

    console.log("User authenticated, submitting form...");
    console.log("User object:", user);
    setIsSubmitting(true);

    try {
      const payload = {
        symbol: data.symbol,
        tradeType: data.trade_type,
        orderType: data.order_type,
        entryPrice: data.entry_price,
        exitPrice: data.exit_price ?? null,
        stopLoss: data.stop_loss,
        takeProfit: data.take_profit ?? null,
        commissions: data.commissions,
        numberShares: data.number_shares,
        entryDate: data.entry_date.toISOString(),
        exitDate: data.exit_date ? data.exit_date.toISOString() : null,
        userId: user.id,
      };

      console.log("Sending payload to Replicache:", payload);

      const response = await createStock(payload);
      console.log("Replicache Response:", response);

      toast.success("Stock trade created successfully!");
      onSuccess?.();
      form.reset({
        symbol: "",
        trade_type: "BUY",
        order_type: "MARKET",
        entry_price: 0.0001,
        exit_price: undefined,
        number_shares: 0.0001,
        commissions: 0,
        stop_loss: 0.0001,
        take_profit: undefined,
        entry_date: new Date(),
        exit_date: undefined,
      });
    } catch (error) {
      console.error("=== ERROR CREATING STOCK TRADE ===");
      console.error("Full error object:", error);
      console.error(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack"
      );

      let errorMessage = "Failed to create stock trade";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      } else if (error && typeof error === "object" && "message" in error) {
        errorMessage = String(error.message);
      }

      console.error("Displaying error message:", errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
      console.log("=== FORM SUBMISSION ENDED ===");
    }
  };

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          console.log("Form submit event triggered");
          e.preventDefault();
          form.handleSubmit(onSubmit)(e);
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="symbol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Symbol</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. AAPL"
                    {...field}
                    className="uppercase"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="trade_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trade Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trade type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="BUY">Buy</SelectItem>
                    <SelectItem value="SELL">Sell</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="order_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Type</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select order type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="MARKET">Market</SelectItem>
                    <SelectItem value="LIMIT">Limit</SelectItem>
                    <SelectItem value="STOP">Stop</SelectItem>
                    <SelectItem value="STOP_LIMIT">Stop Limit</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="entry_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Price</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={field.value || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseFloat(value) : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exit_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exit Price (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={field.value || ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="number_shares"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Shares</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={field.value || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseFloat(value) : 0.0001);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="commissions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Commissions</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={field.value || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseFloat(value) : 0);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stop_loss"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stop Loss</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={field.value || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value ? parseFloat(value) : 0.0001);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="take_profit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Take Profit (Optional)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={field.value || ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value ? parseFloat(e.target.value) : undefined
                      )
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="entry_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Entry Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value}
                      onSelect={field.onChange}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="exit_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Exit Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !field.value && "text-muted-foreground"
                        )}
                      >
                        {field.value ? (
                          format(field.value, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) => date > new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || authLoading || !isInitialized}
            className="w-full sm:w-auto"
            onClick={() => {
              console.log("Save Trade button clicked");
              console.log("isSubmitting:", isSubmitting);
              console.log("authLoading:", authLoading);
              console.log("isInitialized:", isInitialized);
              console.log("Form state:", form.formState);
            }}
          >
            {isSubmitting ? "Saving..." : !isInitialized ? "Initializing..." : "Save Trade"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
