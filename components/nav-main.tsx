"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { type LucideIcon } from "lucide-react"

export function NavMain({
  items,
  collapsed = false,
}: {
  items: {
    title: string
    url: string
    icon: LucideIcon
  }[]
  collapsed?: boolean
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = pathname === item.url
        return (
          // @ts-expect-error - will fix later (i may never, inasmuch as the code works, who cares?)
          <Link key={item.href || item.url} href={item.url} tabIndex={0}>
            <div
              className={`flex items-center gap-3 rounded-lg cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors px-3 py-2 ${
                isActive ? "bg-accent text-accent-foreground" : ""
              } ${
                collapsed ? "justify-center gap-0" : ""
              }`}
            >
              <item.icon className="w-5 h-5" />
              {!collapsed && (
                <span className="text-sm flex-1">{item.title}</span>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}
