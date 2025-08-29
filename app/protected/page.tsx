"use client";

import { ChatInterface } from "@/components/chat";

export default function DashboardPage() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header - Fixed */}
      <div className="w-full border-b bg-background px-8 py-4 flex-shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">AI Assistant</h1>
      </div>

      {/* Main content - Full-bleed chat interface */}
      <div className="flex-1 overflow-y-auto p-4">
        <ChatInterface />
      </div>
    </div>
  );
}
