"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  NotebookPen,
  ChartCandlestick,
  GraduationCap,
  Settings,
  Library,
  PieChart,
  ChartNoAxesColumnIncreasing,
  BrainCog,
  Wallet,
  LogOut,
  Moon,
  Sun,
  Notebook,
  LayoutDashboard,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { SettingsDialog } from "./settings-dialog";

const navItems = [
  { label: "Home", icon: Home, href: "/app" },
  { label: "Dashboard", icon: LayoutDashboard, href: "/app/dashboard" },
  { label: "Journaling", icon: NotebookPen, href: "/app/journaling" },
  { label: "Playbook", icon: Library, href: "/app/playbook" },
  { label: "Notebook", icon: Notebook, href: "/app/notebook" },
  { label: "Analytics", icon: PieChart, href: "/app/analytics" },
  {
    label: "AI Reports",
    icon: ChartNoAxesColumnIncreasing,
    href: "/app/ai-reports",
  },
  { label: "Mindset Lab", icon: BrainCog, href: "/app/mindset" },
  { label: "Markets", icon: ChartCandlestick, href: "/app/markets" },
  { label: "Brokerage", icon: Wallet, href: "/app/brokerage" },
  { label: "Education", icon: GraduationCap, href: "/app/education" },
];

export default function Sidebar({
  collapsed: externalCollapsed,
}: {
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Initialize collapsed state from localStorage immediately
  const [collapsed, setCollapsed] = useState(() => {
    // Check if we're in the browser (not SSR)
    if (typeof window !== 'undefined') {
      const savedCollapsed = localStorage.getItem('sidebar-collapsed');
      if (savedCollapsed !== null) {
        return JSON.parse(savedCollapsed);
      }
    }
    return false; // Default to uncollapsed
  });

  // Handle external collapsed prop changes
  useEffect(() => {
    setMounted(true);

    // If external collapsed prop is provided, use it and save to localStorage
    if (externalCollapsed !== undefined) {
      setCollapsed(externalCollapsed);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sidebar-collapsed', JSON.stringify(externalCollapsed));
      }
    }
  }, [externalCollapsed]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  };
  const handleThemeToggle = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };
  return (
    <>
      <aside
        className={cn(
          "fixed top-0 left-0 h-screen shadow-xl flex flex-col justify-between transition-all duration-300 z-50",
          collapsed ? "w-16" : "w-64"
        )}
        style={{ backgroundColor: "hsl(0 0% 10.5%)" }}
      >
        {/* Top Section */}
        <div>
          {/* Profile */}
          <div className="flex items-center px-4 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">T</span>
              </div>
              {!collapsed && (
                <div>
                  <div className="text-white font-bold text-base leading-tight">
                    Tradistry
                  </div>
                  <div className="text-xs text-slate-400 leading-tight">
                    Journal & Analytics
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Navigation */}
          <nav className="mt-6 flex flex-col gap-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href} tabIndex={0}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors px-3 py-2",
                      isActive ? "bg-[#353a45] text-white" : "",
                      collapsed ? "justify-center gap-0" : ""
                    )}
                  >
                    <item.icon className="w-5 h-5" />
                    {!collapsed && (
                      <span className="text-sm flex-1">{item.label}</span>
                    )}
                  </div>
                </Link>
              );
            })}
            {/* Settings Button */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                "flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors px-3 py-2 w-full",
                collapsed ? "justify-center gap-0" : ""
              )}
            >
              <Settings className="w-5 h-5" />
              {!collapsed && <span className="text-sm flex-1">Settings</span>}
            </button>
          </nav>
        </div>
        {/* Bottom Section */}
        <div className="px-4 pb-6 flex flex-col gap-3">
          <button
            onClick={handleThemeToggle}
            className={cn(
              "flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors w-full px-3 py-2 mb-2",
              collapsed ? "justify-center gap-0 w-10 h-10 p-0" : ""
            )}
          >
            {mounted &&
              (theme === "dark" ? (
                <Sun className="w-5 h-5" />
              ) : (
                <Moon className="w-5 h-5" />
              ))}
            {!collapsed && mounted && (
              <span className="text-sm">
                {theme === "dark" ? "Light Mode" : "Dark Mode"}
              </span>
            )}
          </button>
          <button
            className={cn(
              "flex items-center gap-3 rounded-lg cursor-pointer text-slate-300 hover:bg-[#353a45] hover:text-white transition-colors w-full px-3 py-2",
              collapsed ? "justify-center gap-0 w-10 h-10 p-0" : ""
            )}
            onClick={handleLogout}
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="text-sm">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
