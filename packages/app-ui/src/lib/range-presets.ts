import type { AnalyticsRange } from "@tradstry/app-ui/lib/types/analytics";

/** Canonical, ET-anchored range presets shared across dashboard and brokerage. */
export const RANGE_PRESETS: Array<{
  label: string;
  description: string;
  value: AnalyticsRange;
}> = [
  { label: "1D", description: "Today", value: "TODAY" },
  { label: "1W", description: "Past week", value: "LAST_7_DAYS" },
  { label: "1M", description: "Past month", value: "LAST_1_MONTH" },
  { label: "3M", description: "Past 3 months", value: "LAST_3_MONTHS" },
  { label: "6M", description: "Past 6 months", value: "LAST_6_MONTHS" },
  { label: "YTD", description: "Year to date", value: "YEAR_TO_DATE" },
  { label: "1Y", description: "Past year", value: "LAST_1_YEAR" },
  { label: "Max", description: "All history", value: "ALL" },
];
