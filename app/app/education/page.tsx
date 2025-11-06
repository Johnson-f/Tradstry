"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useWebPush } from "@/lib/hooks/use-web-push";
import { createClient } from "@/lib/supabase/client";
import { apiClient } from "@/lib/services/api-client";
import { apiConfig } from "@/lib/config/api";


export default function EducationPage() {
  const { requestPermission, subscribe, unsubscribe } = useWebPush();

  const getToken = useCallback(async () => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("No session");
    return session.access_token as string;
  }, []);

  const handleSubscribe = useCallback(async () => {
    await requestPermission();
    const token = await getToken();
    await subscribe(token);
  }, [requestPermission, getToken, subscribe]);

  const handleTest = useCallback(async () => {
    try {
      await apiClient.post(apiConfig.endpoints.push.test);
    } catch (error) {
      console.error("Failed to send test push:", error);
      throw error;
    }
  }, []);

  const handleUnsubscribe = useCallback(async () => {
    const token = await getToken();
    await unsubscribe(token);
  }, [getToken, unsubscribe]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">Education</h1>
      </div>
      
      {/* Main content - Scrollable area with native overflow */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="p-8">
            <div className="mb-6">COMING SOON</div>
            <div className="flex items-center gap-2">
              <Button onClick={handleSubscribe} variant="default">Subscribe to Push</Button>
              <Button onClick={handleTest} variant="secondary">Send Test Push</Button>
              <Button onClick={handleUnsubscribe} variant="destructive">Unsubscribe</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}