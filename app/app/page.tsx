import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardContent from "./dashboard-content";

export const dynamic = 'force-dynamic';
export const revalidate = false; // Disable revalidation for this page

export default async function HomePage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return <DashboardContent />;
}
