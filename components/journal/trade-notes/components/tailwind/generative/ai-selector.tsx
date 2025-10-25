"use client";

import { Command, CommandInput } from "@/components/ui/command";
import { ArrowUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Magic from "../ui/icons/magic";

interface AISelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AISelector({}: AISelectorProps) {
  const [inputValue, setInputValue] = useState("");

  const handleAIRequest = () => {
    toast.info("AI features are currently disabled. Please use the editor manually.");
    setInputValue("");
  };

  return (
    <Command className="w-[350px]">
      <div className="relative">
        <CommandInput
          value={inputValue}
          onValueChange={setInputValue}
          autoFocus
          placeholder="AI features are disabled..."
          disabled
        />
        <Button
          size="icon"
          className="absolute right-2 top-1/2 h-6 w-6 -translate-y-1/2 rounded-full bg-gray-500 hover:bg-gray-600"
          onClick={handleAIRequest}
          disabled
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="p-4 text-center text-sm text-muted-foreground">
        <Magic className="h-6 w-6 mx-auto mb-2 opacity-50" />
        <p>AI features are currently disabled.</p>
        <p className="text-xs mt-1">Use the editor tools above to format your text.</p>
      </div>
    </Command>
  );
}
