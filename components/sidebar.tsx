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
  ChevronLeft,
  ChevronRight,
  Sun,
  Notebook,
  LayoutDashboard,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import { SettingsDialog } from "./settings-dialog";

const navItems = [
  { label: "Home", icon: Home, href: "/protected" },
  { label: "Dashboard", icon: LayoutDashboard, href: "/protected/dashboard" },
  { label: "Journal", icon: NotebookPen, href: "/protected/journal" },
  { label: "Setups", icon: Library, href: "/protected/setups" },
  { label: "Notebook", icon: Notebook, href: "/protected/notebook" },
  { label: "Notebook", icon: Notebook, href: "/protected/notepad" },
  { label: "Analytics", icon: PieChart, href: "/protected/analytics" },
  {
    label: "AI Reports",
    icon: ChartNoAxesColumnIncreasing,
    href: "/protected/ai-reports",
  },
  { label: "Mindset Lab", icon: BrainCog, href: "/protected/mindset" },
  { label: "Markets", icon: ChartCandlestick, href: "/protected/markets" },
  { label: "Brokerage", icon: Wallet, href: "/protected/brokerage" },
  { label: "Education", icon: GraduationCap, href: "/protected/education" },
];

export default function Sidebar({
  collapsed,
  onCollapsedChange,
}: {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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
          collapsed ? "w-16" : "w-68", // Update the sidebar width here
          "bg-[#23272f] bg-slate-900"
        )}
      >
        {/* Top Section */}
        <div>
          {/* Profile & Collapse Button */}
          <div className="flex items-center justify-between px-4 pt-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">CL</span>
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
            <button
              className="ml-2 p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-label="Toggle sidebar"
            >
              {collapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <ChevronLeft className="w-5 h-5" />
              )}
            </button>
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
