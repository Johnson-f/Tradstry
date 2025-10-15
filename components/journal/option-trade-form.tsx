"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { OptionFormData, NewOption } from "@/lib/replicache/schemas";
import { useAuth } from "@/lib/hooks/use-auth";
import { useOptions } from "@/lib/replicache/hooks/use-options";
import { toast } from "sonner";

const optionFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  strategy_type: z.string().min(1, "Strategy type is required"),
  trade_direction: z.enum(["Bullish", "Bearish", "Neutral"]),
  number_of_contracts: z.number().min(1, "Must be at least 1"),
  option_type: z.enum(["Call", "Put"]),
  strike_price: z.number().min(0.01, "Must be greater than 0"),
  expiration_date: z.date(),
  entry_price: z.number().min(0.01, "Must be greater than 0"),
  exit_price: z.number().optional(),
  total_premium: z.number().min(0, "Cannot be negative"),
  commissions: z.number().min(0, "Cannot be negative").default(0),
  implied_volatility: z.number().min(0, "Cannot be negative").optional(),
  entry_date: z.date(),
  exit_date: z.date().optional(),
  notes: z.string().optional(),
});

type OptionFormValues = z.infer<typeof optionFormSchema>;

interface OptionTradeFormProps {
  onSuccess?: () => void;
}

export function OptionTradeForm({ onSuccess }: OptionTradeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading: authLoading } = useAuth();
  
  // Use Replicache hook instead of direct database operations
  const { createOption, isInitialized } = useOptions(user?.id || '');

  const form = useForm<OptionFormValues>({
    resolver: zodResolver(optionFormSchema),
    defaultValues: {
      symbol: "",
      strategy_type: "",
      trade_direction: "Bullish",
      number_of_contracts: 1,
      option_type: "Call",
      strike_price: 0,
      expiration_date: new Date(),
      entry_price: 0,
      exit_price: undefined,
      total_premium: 0,
      commissions: 0,
      implied_volatility: undefined,
      entry_date: new Date(),
      exit_date: undefined,
      notes: "",
    },
  });

  const onSubmit = async (data: OptionFormValues) => {
    if (authLoading) {
      toast.info("Please wait while we verify your session...");
      return;
    }

    if (!user) {
      toast.error("You must be logged in to create a trade");
      return;
    }

    if (!isInitialized) {
      toast.info("Please wait while we initialize the database...");
      return;
    }

    try {
      setIsSubmitting(true);
      
      const payload: Omit<NewOption, 'id' | 'createdAt' | 'updatedAt'> = {
        userId: user.id,
        symbol: data.symbol,
        strategyType: data.strategy_type,
        tradeDirection: data.trade_direction,
        numberOfContracts: data.number_of_contracts,
        optionType: data.option_type,
        strikePrice: data.strike_price,
        expirationDate: data.expiration_date.toISOString(),
        entryPrice: data.entry_price,
        exitPrice: data.exit_price,
        totalPremium: data.total_premium,
        commissions: data.commissions,
        impliedVolatility: data.implied_volatility || 0,
        entryDate: data.entry_date.toISOString(),
        exitDate: data.exit_date ? data.exit_date.toISOString() : undefined,
        status: data.exit_price ? 'closed' : 'open',
      };

      console.log("Sending option payload to Replicache:", payload);
      
      const response = await createOption(payload);
      console.log("Replicache Response:", response);
      
      toast.success("Options trade added successfully!");
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error("Error adding options trade:", error);
      toast.error("Failed to add options trade. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="symbol"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Symbol</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., AAPL" {...field} className="uppercase" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="strategy_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Strategy Type</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Covered Call, Iron Condor" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="trade_direction"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Trade Direction</FormLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...field}
                >
                  <option value="Bullish">Bullish</option>
                  <option value="Bearish">Bearish</option>
                  <option value="Neutral">Neutral</option>
                </select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="option_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Option Type</FormLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...field}
                >
                  <option value="Call">Call</option>
                  <option value="Put">Put</option>
                </select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="strike_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Strike Price ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiration_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>Expiration Date</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
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
                      disabled={(date) => date < new Date()}
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
            name="entry_price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Entry Price ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                <FormLabel>Exit Price ($) - Optional</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Leave empty if still open"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="number_of_contracts"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Contracts</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="total_premium"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Total Premium ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
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
                <FormLabel>Commissions ($)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="implied_volatility"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Implied Volatility (%) - Optional</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 25.5"
                    {...field}
                    onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
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
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
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
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
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
                <FormLabel>Exit Date - Optional</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "pl-3 text-left font-normal",
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
                      disabled={(date) =>
                        date > new Date() || date < new Date("1900-01-01")
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

      {/* <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes - Optional</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes about this trade"
                  className="resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        /> */}

        <div className="flex justify-end pt-4">
          <Button type="submit" disabled={isSubmitting || authLoading || !isInitialized}>
            {isSubmitting ? "Adding..." : !isInitialized ? "Initializing..." : "Add Options Trade"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
