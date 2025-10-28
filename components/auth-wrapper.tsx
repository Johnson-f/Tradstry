"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/hooks/use-auth";
import { Loader2 } from "lucide-react";

interface AuthWrapperProps {
  children: ReactNode;
}

export function AuthWrapper({ children }: AuthWrapperProps) {
  const { loading, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isClient, setIsClient] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  // const isAppRoute = pathname.startsWith("/app");

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || loading) return;

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

    if (!isAuthenticated && !isPublicRoute) {
      setIsRedirecting(true);
      router.replace("/auth/login");
      return;
    }

    if (isAuthenticated && isAuthPage && !pathname.includes("/auth/error")) {
      setIsRedirecting(true);
      router.replace("/app");
      return;
    }

    if (isRedirecting) {
      setIsRedirecting(false);
    }
  }, [isClient, loading, isAuthenticated, pathname, router, isRedirecting]);

  if (!isClient) {
    return <>{children}</>;
  }

  if (loading || isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{isRedirecting ? "Redirecting..." : "Loading..."}</span>
        </div>
      </div>
    );
  }

  // Remove WebSocketProvider from here - it will be added in ProtectedLayout
  return <>{children}</>;
}