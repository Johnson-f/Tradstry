"use client";

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { TradstryMark } from "@tradstry/app-ui/components/logo";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/#journal", label: "Product" },
  { href: "/#ai", label: "Tradstry AI" },
  { href: "/#mcp", label: "MCP server" },
  { href: "/#pricing", label: "Pricing" },
] as const;

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 32);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-5">
      <div
        className={cn(
          "pointer-events-auto flex w-fit max-w-full items-center rounded-2xl border border-zinc-200 bg-white/90 text-zinc-950 shadow-[0_14px_40px_rgba(24,24,27,0.12)] backdrop-blur-2xl transition-[padding,gap,background-color,border-color] duration-300",
          scrolled
            ? "gap-2 border-zinc-200 bg-white/95 px-2 py-1.5 md:gap-5 md:px-3"
            : "gap-3 px-2.5 py-2 md:gap-8 md:px-4",
        )}
      >
        <a
          href="/"
          aria-label="Tradstry home"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-2 text-zinc-950 outline-none transition-colors hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-zinc-950 text-white">
            <TradstryMark className="size-[18px]" />
          </span>
          <span className="hidden text-[15px] font-semibold tracking-[-0.025em] sm:block">
            Tradstry
          </span>
        </a>

        <nav aria-label="Website" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex min-h-11 items-center rounded-xl px-3 text-[13px] text-zinc-500 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <span
          aria-hidden="true"
          className="hidden h-6 w-px bg-zinc-200 lg:block"
        />

        <div className="flex shrink-0 items-center gap-1.5">
          <SignInButton>
            <Button
              variant="ghost"
              className="hidden h-11 rounded-xl px-3 text-[13px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 sm:inline-flex"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton>
            <Button className="h-11 rounded-xl bg-zinc-950 px-4 text-[13px] font-semibold text-white hover:bg-zinc-800 active:scale-[0.98]">
              Start free
            </Button>
          </SignUpButton>
          <details className="group relative lg:hidden">
            <summary className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-zinc-600 outline-none transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50">
              <span className="sr-only">Open navigation</span>
              <span className="grid gap-1.5" aria-hidden="true">
                <span className="h-px w-5 bg-current" />
                <span className="h-px w-5 bg-current" />
              </span>
            </summary>
            <nav className="absolute right-0 top-[calc(100%+0.65rem)] grid min-w-52 gap-1 rounded-2xl border border-zinc-200 bg-white/95 p-2 shadow-2xl backdrop-blur-2xl">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(event) =>
                    event.currentTarget
                      .closest("details")
                      ?.removeAttribute("open")
                  }
                  className="flex min-h-11 items-center rounded-xl px-3 text-sm text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50"
                >
                  {item.label}
                </a>
              ))}
              <SignInButton>
                <button
                  type="button"
                  className="flex min-h-11 items-center rounded-xl px-3 text-left text-sm text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50 sm:hidden"
                >
                  Sign in
                </button>
              </SignInButton>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
