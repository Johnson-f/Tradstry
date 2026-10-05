"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { WebsiteDashboard } from "@/components/website-dashboard";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Brokerage handoffs have standalone screens, outside the dashboard frame.
  if (
    pathname === "/dashboard/brokerage/callback" ||
    pathname === "/dashboard/brokerage/oauth/callback"
  ) {
    return children;
  }

  // Keep the sidebar, workspace state, and query cache across page changes.
  return (
    <>
      <WebsiteDashboard />
      {children}
    </>
  );
}
