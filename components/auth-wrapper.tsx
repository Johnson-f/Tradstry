"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { ReplicacheProvider } from "@/lib/replicache";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { loading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);

  // Only run client-side logic after hydration
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Don't render anything during SSR
  if (!isClient) {
    return <>{children}</>;
  }

  // Define public routes that don't require authentication
  const publicRoutes = [
    "/",
    "/auth/login",
    "/auth/sign-up",
    "/auth/forgot-password",
    "/auth/update-password",
    "/auth/confirm",
    "/auth/error",
    "/auth/sign-up-success",
  ];

  const isPublicRoute = publicRoutes.includes(pathname);
  const isAuthPage = pathname.startsWith("/auth");
  const isAppRoute = pathname.startsWith("/app");

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Redirect unauthenticated users trying to access protected routes
  if (!isAuthenticated && !isPublicRoute) {
    router.push("/auth/login");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Redirecting to login...</span>
        </div>
      </div>
    );
  }

  // Redirect authenticated users away from auth pages (except error pages)
  if (isAuthenticated && isAuthPage && !pathname.includes("/auth/error")) {
    router.push("/app");
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Redirecting to dashboard...</span>
        </div>
      </div>
    );
  }

  // For authenticated users in app routes, wrap with ReplicacheProvider
  if (isAuthenticated && isAppRoute) {
    return (
      <ReplicacheProvider>
        {children}
      </ReplicacheProvider>
    );
  }

  // For public routes or authenticated users on landing page, render without ReplicacheProvider
  return <>{children}</>;
}
