"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Calendar, FileText, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  {
    name: "Home",
    href: "/protected/notebook",
    icon: Home,
  },
  {
    name: "Search",
    href: "#search",
    icon: Search,
  },
  {
    name: "Calendar",
    href: "#calendar",
    icon: Calendar,
  },
  {
    name: "Notes",
    href: "#notes",
    icon: FileText,
  },
  {
    name: "Settings",
    href: "#settings",
    icon: Settings,
  },
];

export function NotebookNavigation() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <div className="flex h-screen w-16 flex-col items-center border-r bg-background py-4">
      <Button variant="ghost" size="icon" className="mb-8">
        <Menu className="h-5 w-5" />
      </Button>
      
      <nav className="flex flex-1 flex-col items-center space-y-4">
        {navItems.map((item) => (
          <Button
            key={item.name}
            asChild
            variant="ghost"
            size="icon"
            className={cn(
              "h-12 w-12 rounded-lg transition-colors",
              isActive(item.href)
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted/50"
            )}
          >
            <Link href={item.href}>
              <item.icon className="h-5 w-5" />
              <span className="sr-only">{item.name}</span>
            </Link>
          </Button>
        ))}
      </nav>
      
      <div className="mt-auto">
        <div className="h-10 w-10 rounded-full bg-muted"></div>
      </div>
    </div>
  );
}
