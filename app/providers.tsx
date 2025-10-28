"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ReactNode, useState } from "react";
import { Toaster } from "sonner";

// Create a stable QueryClient instance that works in both SSR and client
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
        gcTime: 10 * 60 * 1000, // 10 minutes - how long to keep in cache
        refetchOnWindowFocus: false, // Don't refetch when window gains focus
        refetchOnMount: false, // Don't refetch when component mounts if data exists
        refetchOnReconnect: false, // Don't refetch when reconnecting
        refetchInterval: false, // No automatic polling
        retry: 1, // Only retry once on failure
        retryDelay: (attemptIndex) =>
          Math.min(1000 * 2 ** attemptIndex, 30000),
        // Network mode to prevent requests when offline
        networkMode: "online",
      },
    },
  });
}

function getQueryClient() {
  // Always create a new instance to prevent SSR/client mismatch issues
  return makeQueryClient();
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
        <Toaster position="top-right" duration={5000} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
